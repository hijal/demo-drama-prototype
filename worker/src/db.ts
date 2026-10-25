export type Row = Record<string, any>;
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export const id = () => crypto.randomUUID();
export const now = () => Date.now();
export const json = (value: unknown) => JSON.stringify(value);
export const query = (
  env: Env,
  sql: string,
  ...params: (string | number | null)[]
) => env.DB.prepare(sql).bind(...params);
export async function all(
  env: Env,
  sql: string,
  ...params: (string | number | null)[]
) {
  return (await query(env, sql, ...params).all<Row>()).results;
}
export async function one(
  env: Env,
  sql: string,
  ...params: (string | number | null)[]
) {
  return query(env, sql, ...params).first<Row>();
}
export async function getProject(env: Env, projectId: string) {
  const project = await one(
    env,
    "SELECT * FROM projects WHERE id=?",
    projectId,
  );
  assert(project, 404, "Project not found");
  return project;
}
export async function enqueue(
  env: Env,
  projectId: string,
  type: string,
  payload: unknown,
  priority = 0,
) {
  const jobId = id(),
    time = now();
  await query(
    env,
    "INSERT INTO jobs (id,project_id,type,payload_json,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    jobId,
    projectId,
    type,
    json(payload),
    priority,
    time,
    time,
  ).run();
  return jobId;
}
/**
 * A Colab runtime that stopped (power cut, closed tab, deleted runtime) stops
 * heartbeating. Hand its jobs back as soon as another worker asks for work,
 * instead of waiting for the 10-minute lease. An interruption is not counted
 * as a failure; finished results are already in D1/R2 and are never redone.
 */
export async function releaseDeadWorkers(env: Env, workerId: string) {
  const time = now();
  await query(
    env,
    "UPDATE jobs SET status='queued',error='Colab stopped during this job; resumed on the next runtime',claim_token=NULL,claimed_by=NULL,lease_until=NULL,attempt=MAX(attempt-1,0),updated_at=? WHERE status IN ('claimed','running') AND claimed_by!=? AND claimed_at<? AND NOT EXISTS (SELECT 1 FROM gpu_workers w WHERE w.id=jobs.claimed_by AND w.last_seen>?)",
    time,
    workerId,
    time - 60000,
    time - 60000,
  ).run();
}
export async function expireLeases(env: Env) {
  const time = now();
  await query(
    env,
    "UPDATE jobs SET status=CASE WHEN attempt>=3 THEN 'failed' ELSE 'queued' END, error='GPU lease expired', claim_token=NULL, claimed_by=NULL, lease_until=NULL, updated_at=? WHERE status IN ('claimed','running') AND lease_until<?",
    time,
    time,
  ).run();
  await query(
    env,
    `UPDATE projects SET auto_episode=NULL WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.project_id=projects.id AND j.status='failed' AND j.updated_at=? AND j.type IN ('clip','qa'))`,
    time,
  ).run();
  await reconcileTerminalJobs(env);
}
// Reconcile terminal jobs so cancellation/exhausted retries cannot lock UI controls.
export async function reconcileTerminalJobs(env: Env) {
  await env.DB.batch([
    query(
      env,
      `UPDATE clips SET status='failed' WHERE status IN ('queued','rendering','qa') AND EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('failed','cancelled') AND j.type IN ('clip','qa') AND json_extract(j.payload_json,'$.clipId')=clips.id)`,
    ),
    query(
      env,
      `UPDATE assets SET status=CASE WHEN approved_version IS NULL THEN 'draft' ELSE 'approved' END WHERE status='generating' AND EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('failed','cancelled') AND j.type='asset' AND json_extract(j.payload_json,'$.assetId')=assets.id) AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('queued','claimed','running') AND j.type='asset' AND json_extract(j.payload_json,'$.assetId')=assets.id)`,
    ),
    query(
      env,
      `UPDATE renders SET status='failed' WHERE status='queued' AND EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('failed','cancelled') AND j.type='assemble' AND json_extract(j.payload_json,'$.renderId')=renders.id)`,
    ),
  ]);
}
export const invalidateDependentClipsSQL = `WITH RECURSIVE affected(id) AS (SELECT id FROM clips WHERE status='stale' UNION SELECT c.id FROM clips c JOIN affected a ON c.context_clip_id=a.id) UPDATE clips SET status='stale' WHERE status!='stale' AND id IN (SELECT id FROM affected)`;
export const invalidateRendersSQL = `UPDATE renders SET status='stale' WHERE status='ready' AND EXISTS (SELECT 1 FROM json_each(renders.clip_ids_json) j JOIN clips c ON c.id=j.value JOIN scenes s ON s.id=c.scene_id WHERE c.status='stale' OR s.approved_clip_id IS NOT c.id)`;
export async function approveClip(env: Env, projectId: string, clipId: string) {
  const clip = await one(
    env,
    "SELECT c.*,s.approved_clip_id,s.content_hash FROM clips c JOIN scenes s ON s.id=c.scene_id JOIN episodes e ON e.id=s.episode_id WHERE c.id=? AND e.project_id=?",
    clipId,
    projectId,
  );
  assert(
    clip && clip.r2_key && ["ready", "review"].includes(clip.status),
    409,
    "Only a completed, current take can be approved",
  );
  const p = await getProject(env, projectId);
  assert(
    clip.script_version_id === p.approved_script_id ||
      JSON.parse(clip.params_json || "{}").sceneHash === clip.content_hash,
    409,
    "This take belongs to a changed scene",
  );
  if (clip.approved_clip_id === clipId) return;
  const pins = JSON.parse(clip.asset_versions_json) as Record<string, number>;
  for (const [assetId, version] of Object.entries(pins)) {
    const a = await one(
      env,
      "SELECT approved_version FROM assets WHERE id=?",
      assetId,
    );
    assert(
      a?.approved_version === version,
      409,
      "A reference asset changed; regenerate this take",
    );
  }
  await env.DB.batch([
    query(
      env,
      "WITH RECURSIVE downstream(id) AS (SELECT id FROM clips WHERE context_clip_id=? UNION ALL SELECT c.id FROM clips c JOIN downstream d ON c.context_clip_id=d.id) UPDATE clips SET status='stale' WHERE id IN (SELECT id FROM downstream)",
      clip.approved_clip_id,
    ),
    query(
      env,
      "UPDATE scenes SET approved_clip_id=? WHERE id=?",
      clipId,
      clip.scene_id,
    ),
    query(env, "UPDATE clips SET status='ready' WHERE id=?", clipId),
    query(env, invalidateRendersSQL),
  ]);
}

export async function cleanupUploads(env: Env) {
  const uploads = await all(
    env,
    `SELECT u.* FROM job_uploads u JOIN jobs j ON j.id=u.job_id WHERE j.status NOT IN ('claimed','running') OR u.attempt!=j.attempt OR j.lease_until<? LIMIT 50`,
    now(),
  );
  for (const upload of uploads) {
    if (upload.status === "active") {
      try {
        await env.MEDIA.resumeMultipartUpload(
          upload.object_key,
          upload.upload_id,
        ).abort();
      } catch {
        continue;
      } // Retain the record so a transient R2 failure is retried later.
    }
    await query(
      env,
      "DELETE FROM job_uploads WHERE object_key=? AND upload_id=?",
      upload.object_key,
      upload.upload_id,
    ).run();
  }
}
