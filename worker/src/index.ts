import { authorized } from "./auth";
import { LogHub } from "./loghub";
import { describeJob, projectLog } from "./activity";
import {
  all,
  one,
  query,
  getProject,
  enqueue,
  expireLeases,
  releaseDeadWorkers,
  cleanupUploads,
  reconcileTerminalJobs,
  assert,
  HttpError,
  id,
  now,
  json,
  approveClip,
  invalidateRendersSQL,
  invalidateDependentClipsSQL,
} from "./db";
import {
  approveScript,
  queueClip,
  scheduleNext,
  resumeRendering,
  approveAssetVersion,
  healQueues,
  scriptStyle,
} from "./planning";
import { faithfulness } from "./llm/fixer";
import { serializeScript } from "./script/serialize";
import { parseScript } from "./script/parse";
import { validateScript } from "./script/validate";
import type { Issue, Script } from "./script/types";
export { LogHub };
const ok = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function body(request: Request) {
  const limit = 1_500_000,
    reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    assert(
      value && typeof value === "object" && !Array.isArray(value),
      400,
      "Expected a JSON object",
    );
    return value as Record<string, any>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON");
  }
}
const MAX_AUTO_RETAKES = 3;
function mediaKey(
  projectId: string,
  jobId: string,
  attempt: number,
  name: string,
) {
  assert(
    /^[a-zA-Z0-9_-]+\.(mp4|png|jpg|wav|mp3|srt|json|safetensors)$/.test(name),
    400,
    "Invalid output file name",
  );
  return `projects/${projectId}/jobs/${jobId}/a${attempt}/${name}`;
}
async function activeJob(env: Env, jobId: string, token: string) {
  const job = await one(env, "SELECT * FROM jobs WHERE id=?", jobId);
  assert(
    job &&
      job.claim_token === token &&
      job.lease_until > now() &&
      ["claimed", "running"].includes(job.status),
    409,
    "Claim expired, cancelled or replaced",
  );
  return job;
}
async function gpu(request: Request, env: Env, parts: string[]) {
  assert(
    request.method ===
      (parts[2] === "files" ||
      (parts[2] === "multipart" && /^\d+$/.test(parts[5] || ""))
        ? "PUT"
        : "POST"),
    405,
    "Method not allowed",
  );
  const data = request.method === "PUT" ? {} : await body(request);
  if (parts[0] === "health")
    return ok({ ok: true, protocol: 2, maxPartBytes: 16 * 1024 * 1024 });
  if (parts[0] === "heartbeat") {
    assert(
      typeof data.workerId === "string" && data.workerId.length < 120,
      400,
      "Worker ID required",
    );
    await query(
      env,
      "INSERT INTO gpu_workers VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,info_json=excluded.info_json",
      data.workerId,
      now(),
      json(data.info || {}),
    ).run();
    // Known active jobs renew through their claim-token progress heartbeat.
    // A worker ID alone must not keep a lost claim alive indefinitely.
    return ok({ ok: true });
  }
  if (parts[0] === "claim") {
    assert(
      typeof data.workerId === "string" && data.workerId.length < 120,
      400,
      "Worker ID required",
    );
    for (const lost of await releaseDeadWorkers(env, data.workerId))
      await projectLog(
        env,
        lost.project_id,
        `↻ ${describeJob(lost.type, JSON.parse(lost.payload_json))}: the previous Colab stopped during it; starting again on this one`,
        lost.id,
      );
    await expireLeases(env);
    await cleanupUploads(env);
    await healQueues(env);
    const job = await query(
      env,
      "UPDATE jobs SET status='claimed',error=NULL,claimed_by=?,claimed_at=?,claim_token=?,lease_until=?,attempt=attempt+1,updated_at=? WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY priority DESC,created_at,id LIMIT 1) AND status='queued' RETURNING *",
      data.workerId,
      now(),
      id(),
      now() + 600000,
      now(),
    ).first();
    if (job)
      await projectLog(
        env,
        String(job.project_id),
        `▶ ${describeJob(String(job.type), JSON.parse(String(job.payload_json)))} started on Colab${Number(job.attempt) > 1 ? ` (attempt ${job.attempt})` : ""}`,
        String(job.id),
      );
    return ok({
      job: job
        ? { ...job, payload: JSON.parse(String(job.payload_json)) }
        : null,
    });
  }
  assert(parts[0] === "jobs" && parts[1], 404, "GPU route not found");
  const jobId = parts[1],
    token = String(
      data.claim_token || request.headers.get("X-Claim-Token") || "",
    );
  if (parts[2] === "done") {
    const existing = await one(
      env,
      "SELECT status,claim_token FROM jobs WHERE id=?",
      jobId,
    );
    if (existing?.status === "done" && existing.claim_token === token)
      return ok({ ok: true, idempotent: true });
  }
  const job = await activeJob(env, jobId, token),
    payload = JSON.parse(job.payload_json);
  if (parts[2] === "multipart") {
    const key = mediaKey(job.project_id, jobId, job.attempt, parts[3] || "");
    if (!parts[4]) {
      const upload = await env.MEDIA.createMultipartUpload(key, {
        httpMetadata: {
          contentType: String(data.contentType || "application/octet-stream"),
        },
      });
      try {
        await query(
          env,
          "INSERT INTO job_uploads (object_key,upload_id,job_id,attempt,created_at) VALUES (?,?,?,?,?)",
          key,
          upload.uploadId,
          jobId,
          job.attempt,
          now(),
        ).run();
      } catch (error) {
        await upload.abort();
        throw error;
      }
      return ok({ uploadId: upload.uploadId, key });
    }
    const record = await one(
      env,
      "SELECT * FROM job_uploads WHERE object_key=? AND upload_id=? AND job_id=? AND attempt=?",
      key,
      parts[4],
      jobId,
      job.attempt,
    );
    assert(record, 404, "Upload not found for this claim");
    const upload = env.MEDIA.resumeMultipartUpload(key, parts[4]);
    if (parts[5] === "complete") {
      if (record.status === "done") return ok({ key });
      assert(
        Array.isArray(data.parts) &&
          data.parts.length > 0 &&
          data.parts.length <= 10000 &&
          data.parts.every(
            (part: any, index: number) =>
              part.partNumber === index + 1 &&
              typeof part.etag === "string" &&
              part.etag.length <= 256,
          ),
        400,
        "Ordered upload parts required",
      );
      await upload.complete(data.parts);
      await query(
        env,
        "UPDATE job_uploads SET status='done' WHERE object_key=? AND upload_id=?",
        key,
        parts[4],
      ).run();
      return ok({ key });
    }
    if (parts[5] === "abort") {
      if (record.status === "active") await upload.abort();
      await query(
        env,
        "DELETE FROM job_uploads WHERE object_key=? AND upload_id=?",
        key,
        parts[4],
      ).run();
      return ok({ ok: true });
    }
    const number = Number(parts[5]),
      length = Number(request.headers.get("Content-Length"));
    assert(record.status === "active", 409, "Upload already completed");
    assert(
      Number.isInteger(number) && number >= 1 && number <= 10000,
      400,
      "Invalid part number",
    );
    assert(
      request.body && length > 0 && length <= 16 * 1024 * 1024,
      413,
      "Upload parts must be 1 byte to 16 MiB with Content-Length",
    );
    return ok(await upload.uploadPart(number, request.body));
  }
  if (parts[2] === "files") {
    const key = mediaKey(job.project_id, jobId, job.attempt, parts[3] || "");
    assert(request.method === "PUT" && request.body, 405, "PUT body required");
    const result = await env.MEDIA.put(key, request.body, {
      httpMetadata: {
        contentType:
          request.headers.get("Content-Type") || "application/octet-stream",
      },
    });
    assert(result, 500, "Upload failed");
    return ok({ key });
  }
  if (parts[2] === "progress") {
    await query(
      env,
      "UPDATE jobs SET status='running',pct=COALESCE(?,pct),stage=COALESCE(?,stage),lease_until=?,updated_at=? WHERE id=? AND claim_token=? AND status IN ('claimed','running')",
      data.pct === undefined
        ? null
        : Math.max(0, Math.min(100, Number(data.pct) || 0)),
      data.stage === undefined ? null : String(data.stage).slice(0, 200),
      now() + 600000,
      now(),
      jobId,
      token,
    ).run();
    return ok({ ok: true });
  }
  if (parts[2] === "log") {
    assert(
      Array.isArray(data.lines) &&
        data.lines.every((line: unknown) => typeof line === "string"),
      400,
      "Log lines required",
    );
    const name = describeJob(job.type, JSON.parse(job.payload_json));
    await env.LOGHUB.getByName(job.project_id).append(
      jobId,
      data.lines.map((line: string) => `${name} · ${line}`),
    );
    return ok({ ok: true });
  }
  if (parts[2] === "fail") {
    await query(
      env,
      "UPDATE jobs SET status=CASE WHEN attempt<3 THEN 'queued' ELSE 'failed' END,error=?,claim_token=NULL,claimed_by=NULL,lease_until=NULL,updated_at=? WHERE id=? AND claim_token=? AND status IN ('claimed','running')",
      String(data.error || "GPU operation failed").slice(0, 2000),
      now(),
      jobId,
      token,
    ).run();
    await projectLog(
      env,
      job.project_id,
      `✗ ${describeJob(job.type, JSON.parse(job.payload_json))} failed${job.attempt < 3 ? `, retrying (attempt ${job.attempt} of 3)` : " 3 times; automatic rendering stopped"}: ${String(data.error || "GPU operation failed").slice(0, 300)}`,
      jobId,
    );
    await reconcileTerminalJobs(env);
    await cleanupUploads(env);
    if (job.attempt >= 3 && ["clip", "qa"].includes(job.type))
      await query(
        env,
        "UPDATE projects SET auto_episode=NULL WHERE id=?",
        job.project_id,
      ).run();
    return ok({ ok: true });
  }
  assert(parts[2] === "done", 404, "GPU action not found");
  const result = data.result;
  assert(result && typeof result === "object", 400, "Result required");
  const keys: string[] = Object.values(result.files || {}).filter(
    (key): key is string => typeof key === "string",
  );
  if (result.key) keys.push(result.key);
  for (const key of keys) {
    assert(
      key.startsWith(
        `projects/${job.project_id}/jobs/${jobId}/a${job.attempt}/`,
      ),
      400,
      "Output does not belong to this claim",
    );
    assert(
      await env.MEDIA.head(key),
      422,
      "Upload output before completing the job",
    );
  }
  const guard =
      "EXISTS (SELECT 1 FROM jobs WHERE id=? AND claim_token=? AND status='finishing')",
    args: [string, string] = [jobId, token];
  const statements = [
    query(
      env,
      "UPDATE jobs SET status='finishing',result_json=?,updated_at=? WHERE id=? AND claim_token=? AND lease_until>? AND status IN ('claimed','running')",
      json(result),
      now(),
      jobId,
      token,
      now(),
    ),
  ];
  if (job.type === "fix_script") {
    assert(
      typeof result.script === "string" && result.script.length < 1_000_000,
      422,
      "Fixed script required",
    );
    const originalVersion = await one(
      env,
      "SELECT body FROM script_versions WHERE id=? AND project_id=?",
      payload.rawVersion,
      job.project_id,
    );
    assert(originalVersion, 409, "Original script no longer exists");
    const original = parseScript(originalVersion.body),
      candidate = parseScript(result.script);
    const source = payload.episode
      ? {
          ...original,
          episodes: original.episodes.filter(
            (ep) => ep.number === payload.episode,
          ),
        }
      : original;
    assert(
      !faithfulness(source, candidate).length,
      422,
      "Fixed script changed original dialogue or scene/episode structure",
    );
    if (payload.episode)
      result.script = serializeScript({
        ...candidate,
        episodes: original.episodes.map((ep) =>
          ep.number === payload.episode ? candidate.episodes[0] : ep,
        ),
      });
    const issues = validateScript(parseScript(result.script));
    statements.push(
      query(
        env,
        `INSERT OR IGNORE INTO script_versions (id,project_id,kind,body,report_json,created_at) SELECT ?,?,'fixed',?,?,? WHERE ${guard}`,
        `fixed:${jobId}`,
        job.project_id,
        result.script,
        json({ ...result.report, issues, requiresApproval: true }),
        now(),
        ...args,
      ),
    );
  } else if (job.type === "asset") {
    const spec = payload.spec;
    assert(spec && result.files, 422, "Asset files required");
    if (spec.characterType !== "voice_only")
      assert(
        result.files.front && result.files.sheet,
        422,
        "Asset portrait and sheet required",
      );
    if (spec.kind === "character")
      assert(result.files.voice, 422, "Character voice sample required");
    for (let i = 0; i < (spec.variants?.length || 0); i++)
      assert(
        result.files[`variant_${i}`],
        422,
        "Every asset variant requires an image",
      );
    assert(
      result.files && (result.files.sheet || result.files.voice),
      422,
      "Asset sheet or voice required",
    );
    statements.push(
      query(
        env,
        `INSERT OR IGNORE INTO asset_versions (id,asset_id,version,files_json,instruction,script_version_id,created_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        jobId,
        payload.assetId,
        payload.version,
        json(
          result.qa && typeof result.qa === "object"
            ? { ...result.files, qa: result.qa }
            : result.files,
        ),
        payload.instruction || "",
        payload.scriptVersion,
        now(),
        ...args,
      ),
    );
    statements.push(
      query(
        env,
        `UPDATE assets SET status='review' WHERE id=? AND ${guard}`,
        payload.assetId,
        ...args,
      ),
    );
  } else if (job.type === "clip") {
    assert(
      !!result.files?.contextLow === !!result.files?.contextHigh,
      422,
      "Both context latents are required",
    );
    assert(typeof result.key === "string", 422, "Clip video output required");
    statements.push(
      query(
        env,
        `UPDATE clips SET r2_key=?,prompt=?,params_json=?,status=CASE WHEN script_version_id=(SELECT approved_script_id FROM projects WHERE id=?) THEN 'qa' ELSE 'stale' END WHERE id=? AND ${guard}`,
        result.key,
        String(result.prompt || ""),
        json({
          ...result.params,
          sceneHash: payload.sceneHash,
          retake: payload.retake || 0,
          appliedChanges: payload.hint || "",
          contextLatents:
            result.files?.contextLow && result.files?.contextHigh
              ? { low: result.files.contextLow, high: result.files.contextHigh }
              : null,
        }),
        job.project_id,
        payload.clipId,
        ...args,
      ),
    );
    statements.push(
      query(
        env,
        `INSERT OR IGNORE INTO jobs (id,project_id,type,payload_json,priority,created_at,updated_at) SELECT ?,?,'qa',?,10,?,? WHERE ${guard}`,
        `qa:${jobId}`,
        job.project_id,
        json({ ...payload, key: result.key, prompt: result.prompt }),
        now(),
        now(),
        ...args,
      ),
    );
  } else if (job.type === "qa") {
    assert(
      typeof result.pass === "boolean" &&
        Array.isArray(result.issues) &&
        Array.isArray(result.words),
      422,
      "Structured visual/audio QA result required",
    );
    statements.push(
      query(
        env,
        `UPDATE clips SET qa_json=?,status=CASE WHEN status='stale' THEN 'stale' WHEN ? THEN 'ready' ELSE 'review' END WHERE id=? AND ${guard}`,
        json(result),
        result.pass ? 1 : 0,
        payload.clipId,
        ...args,
      ),
    );
  } else if (job.type === "assemble") {
    assert(
      result.files?.video && result.files?.subtitles,
      422,
      "Final video and subtitles required",
    );
    statements.push(
      query(
        env,
        `UPDATE renders SET r2_key=?,srt_r2_key=?,status='ready' WHERE id=? AND ${guard}`,
        result.files.video,
        result.files.subtitles,
        payload.renderId,
        ...args,
      ),
    );
    statements.push(query(env, invalidateRendersSQL));
  } else throw new HttpError(422, "Unknown job type");
  statements.push(
    query(
      env,
      "UPDATE jobs SET status='done',pct=100,stage='Complete',updated_at=? WHERE id=? AND claim_token=? AND status='finishing'",
      now(),
      jobId,
      token,
    ),
  );
  const completed = await env.DB.batch(statements);
  assert(
    completed[0].meta.changes === 1,
    409,
    "Claim expired before completion",
  );
  // The result is saved. What follows (approvals, queueing the next step, log
  // lines) must not turn a saved result into a failed request: an error here is
  // logged, and the queue healer picks the project up again.
  try {
    await afterCompletion(env, job, jobId, payload, result);
  } catch (error) {
    console.error("Follow-up after job completion failed", error);
    await projectLog(
      env,
      job.project_id,
      `! The next step after ${describeJob(job.type, payload)} failed (${error instanceof Error ? error.message : "unknown error"}); the studio retries it automatically within a few minutes`,
      jobId,
    );
  }
  return ok({ ok: true });
}
async function afterCompletion(
  env: Env,
  job: Record<string, any>,
  jobId: string,
  payload: any,
  result: any,
) {
  const name = describeJob(job.type, payload),
    log = (line: string) => projectLog(env, job.project_id, line, jobId);
  if (job.type === "fix_script") {
    const left = validateScript(parseScript(result.script)).filter(
      (i) => i.severity === "error",
    ).length;
    await log(
      `✓ ${name} done · ${left ? `${left} error${left === 1 ? "" : "s"} left` : "no errors left"}${payload.remaining?.length ? ` · next: Episode ${payload.remaining[0]}` : ""}`,
    );
  } else if (job.type === "asset") {
    const qa = result.qa;
    await log(
      `✓ ${name} ready${qa ? ` · QA ${qa.score}%${qa.score < qa.threshold ? ` (below ${qa.threshold}% after the retries; best image kept)` : ""}` : ""}`,
    );
  } else if (job.type === "clip") await log(`✓ ${name} done · QA next`);
  else if (job.type === "assemble") await log(`✓ ${name} ready to watch in Final`);
  if (job.type === "fix_script" && payload.remaining?.length)
    await queueRepair(
      env,
      job.project_id,
      result.script,
      `fixed:${jobId}`,
      payload.remaining,
      !!payload.autoApprove,
    );
  if (job.type === "fix_script" && !payload.remaining?.length && payload.autoApprove)
    if (await autoApproveScript(env, job.project_id, `fixed:${jobId}`))
      await log("✓ Script approved automatically; references are queued");
    else await log("! Script still has errors; it waits for you in the Script tab");
  if (job.type === "asset" && payload.autoApprove) {
    try {
      await approveAssetVersion(
        env,
        job.project_id,
        payload.assetId,
        payload.version,
      );
      await log(`✓ ${name} approved automatically`);
      if (await resumeRendering(env, job.project_id))
        await log("▶ All references for the next episode are approved; rendering starts");
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 409)) throw error;
    }
  }
  if (job.type === "qa") {
    // Owner request: QA decides. A take at or above the score threshold is
    // selected; below it, a new take with QA's prompt changes, up to three
    // times; then the best-scoring take is selected and rendering moves on.
    const retake = payload.retake || 0;
    try {
      const score =
        typeof result.score === "number" ? `QA ${result.score}%` : "QA";
      if (result.pass) {
        await approveClip(env, job.project_id, payload.clipId);
        await log(`✓ ${name.replace(/ QA$/, "")} · ${score} · selected`);
      } else if (retake < MAX_AUTO_RETAKES) {
        await log(
          `↻ ${name.replace(/ QA$/, "")} · ${score}, below ${result.threshold ?? 75}% · retake ${retake + 1} of ${MAX_AUTO_RETAKES}${result.fix_hint ? ` with changes: ${String(result.fix_hint).slice(0, 240)}` : ""}`,
        );
        await queueClip(
          env,
          job.project_id,
          payload.sceneId,
          payload.note || "",
          String(result.fix_hint || ""),
          retake + 1,
        );
        return;
      } else {
        const best = await one(
          env,
          "SELECT c.id FROM clips c JOIN projects p ON p.id=? WHERE c.scene_id=? AND c.script_version_id=p.approved_script_id AND c.r2_key IS NOT NULL AND c.status IN ('ready','review') ORDER BY COALESCE(json_extract(c.qa_json,'$.score'),0) DESC,c.take DESC LIMIT 1",
          job.project_id,
          payload.sceneId,
        );
        if (best) {
          await approveClip(env, job.project_id, best.id);
          const chosen = await one(
            env,
            "SELECT take,json_extract(qa_json,'$.score') score FROM clips WHERE id=?",
            best.id,
          );
          await log(
            `! ${name.replace(/ · take \d+ QA$/, "")} · ${score} · after ${MAX_AUTO_RETAKES} retakes the best take ${chosen?.take} (${chosen?.score ?? "?"}%) is selected; worth a look`,
          );
        }
      }
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 409)) throw error;
    }
    await scheduleNext(env, job.project_id);
  }
}
async function queueAsset(
  env: Env,
  project: Record<string, any>,
  asset: Record<string, any>,
  instruction: string,
  autoApprove = false,
) {
  const projectId = project.id;
  const active = await one(
    env,
    "SELECT id FROM jobs WHERE project_id=? AND type='asset' AND json_extract(payload_json,'$.assetId')=? AND status IN ('queued','claimed','running')",
    projectId,
    asset.id,
  );
  assert(!active, 409, "Asset generation already queued");
  const version = (await one(
    env,
    "SELECT COALESCE(MAX(version),0)+1 next FROM asset_versions WHERE asset_id=?",
    asset.id,
  ))!.next;
  // A change edits the approved image, or the newest one when nothing is approved yet.
  const previous = instruction
    ? await one(
        env,
        "SELECT files_json FROM asset_versions WHERE asset_id=? AND script_version_id=? ORDER BY version=? DESC,version DESC LIMIT 1",
        asset.id,
        project.approved_script_id,
        asset.approved_version,
      )
    : null;
  const jobId = await enqueue(env, projectId, "asset", {
    assetId: asset.id,
    spec: JSON.parse(asset.spec_json),
    version,
    instruction: instruction.slice(0, 2000),
    previous: previous ? JSON.parse(previous.files_json) : null,
    scriptVersion: project.approved_script_id,
    style: await scriptStyle(env, project.approved_script_id),
    autoApprove,
  });
  await query(
    env,
    "UPDATE assets SET status='generating' WHERE id=?",
    asset.id,
  ).run();
  return jobId;
}
async function queueRepair(
  env: Env,
  projectId: string,
  body: string,
  rawVersion: string,
  episodes: Array<number | null>,
  autoApprove = false,
) {
  const [episode, ...remaining] = episodes;
  let input = body;
  if (episode !== null) {
    const ast = parseScript(body);
    input = serializeScript({
      ...ast,
      episodes: ast.episodes.filter((ep) => ep.number === episode),
    });
  }
  return enqueue(env, projectId, "fix_script", {
    body: input,
    rawVersion,
    episode,
    remaining,
    autoApprove,
  });
}
/** Queue a reference for every asset with no version for the approved script. */
async function queueMissingAssets(
  env: Env,
  projectId: string,
  autoApprove: boolean,
) {
  const project = await getProject(env, projectId);
  const missing = await all(
    env,
    "SELECT * FROM assets a WHERE project_id=? AND approved_version IS NULL AND status!='generating' AND NOT EXISTS (SELECT 1 FROM asset_versions v WHERE v.asset_id=a.id AND v.script_version_id=?) ORDER BY kind,name",
    projectId,
    project.approved_script_id,
  );
  for (const asset of missing)
    await queueAsset(env, project, asset, "", autoApprove);
}
/**
 * Owner request: no approval clicks. A script version with no validation
 * errors is approved as soon as it is the newest one, and its references start.
 */
async function autoApproveScript(env: Env, projectId: string, versionId: string) {
  const latest = await one(
    env,
    "SELECT id FROM script_versions WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    projectId,
  );
  if (latest?.id !== versionId) return false;
  const project = await getProject(env, projectId);
  try {
    await approveScript(env, projectId, versionId, project.revision);
  } catch (error) {
    if (error instanceof HttpError) return false;
    throw error;
  }
  await queueMissingAssets(env, projectId, true);
  return true;
}
/** Episodes with an issue inside them; script-wide issues (cast, header) go with the first episode. */
function episodesNeedingRepair(ast: Script, issues: Issue[]) {
  const starts = ast.episodes.map((ep) => ep.line);
  const needed = new Set<number>();
  for (const issue of issues) {
    let index = -1;
    for (let i = 0; i < starts.length; i++) if (issue.line >= starts[i]) index = i;
    needed.add(ast.episodes[Math.max(index, 0)].number);
  }
  return ast.episodes.map((ep) => ep.number).filter((n) => needed.has(n));
}
async function owner(request: Request, env: Env, parts: string[]) {
  const method = request.method,
    data = ["GET", "HEAD"].includes(method) ? {} : await body(request);
  if (parts[0] === "status")
    return ok({
      gpu: (
        await all(
          env,
          "SELECT * FROM gpu_workers WHERE last_seen>?",
          now() - 45000,
        )
      ).map((w) => ({ ...w, info: JSON.parse(w.info_json) })),
    });
  assert(parts[0] === "projects", 404, "API route not found");
  if (!parts[1]) {
    if (method === "GET")
      return ok({
        projects: await all(
          env,
          "SELECT * FROM projects ORDER BY created_at DESC",
        ),
      });
    assert(
      method === "POST" &&
        typeof data.title === "string" &&
        data.title.trim().length > 0 &&
        data.title.length <= 200,
      400,
      "Project title required",
    );
    const projectId = id();
    await query(
      env,
      "INSERT INTO projects (id,title,created_at) VALUES (?,?,?)",
      projectId,
      data.title.trim(),
      now(),
    ).run();
    return ok({ id: projectId }, 201);
  }
  if (parts[2] && parts[2] !== "logs")
    assert(method === "POST", 405, "Method not allowed");
  const projectId = parts[1],
    project = await getProject(env, projectId);
  if (!parts[2]) {
    assert(method === "GET", 405, "Method not allowed");
    return ok({
      project,
      scripts: await all(
        env,
        "SELECT * FROM script_versions WHERE project_id=? ORDER BY created_at DESC,rowid DESC",
        projectId,
      ),
      assets: await all(
        env,
        "SELECT * FROM assets WHERE project_id=? ORDER BY kind,name",
        projectId,
      ),
      assetVersions: await all(
        env,
        "SELECT v.* FROM asset_versions v JOIN assets a ON a.id=v.asset_id WHERE a.project_id=? ORDER BY v.version DESC",
        projectId,
      ),
      episodes: await all(
        env,
        "SELECT * FROM episodes WHERE project_id=? ORDER BY number",
        projectId,
      ),
      scenes: await all(
        env,
        "SELECT s.*,e.number episode_number FROM scenes s JOIN episodes e ON e.id=s.episode_id WHERE e.project_id=? AND s.script_version_id=? ORDER BY e.number,s.number",
        projectId,
        project.approved_script_id,
      ),
      clips: await all(
        env,
        "SELECT c.* FROM clips c JOIN scenes s ON s.id=c.scene_id JOIN episodes e ON e.id=s.episode_id WHERE e.project_id=? ORDER BY c.take DESC",
        projectId,
      ),
      jobs: await all(
        env,
        "SELECT id,type,status,pct,stage,error,attempt,priority,created_at,json_extract(payload_json,'$.assetId') asset_id,json_extract(payload_json,'$.sceneId') scene_id FROM jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 200",
        projectId,
      ),
      renders: await all(
        env,
        "SELECT * FROM renders WHERE project_id=? ORDER BY created_at DESC",
        projectId,
      ),
    });
  }
  if (parts[2] === "logs")
    return env.LOGHUB.getByName(projectId).fetch(request);
  if (parts[2] === "scripts") {
    assert(
      typeof data.body === "string" &&
        data.body.trim().length > 0 &&
        data.body.length <= 1_000_000,
      400,
      "Script text required (up to 1 MB)",
    );
    const ast = parseScript(data.body),
      issues = validateScript(ast),
      versionId = id();
    await query(
      env,
      "INSERT INTO script_versions (id,project_id,kind,body,report_json,created_at) VALUES (?,?,?,?,?,?)",
      versionId,
      projectId,
      "raw",
      data.body,
      json({ issues, requiresApproval: true }),
      now(),
    ).run();
    let jobId: string | undefined;
    if (data.fix) {
      if (ast.episodes.length > 1 && data.episode !== undefined) {
        assert(Number.isInteger(data.episode), 400, "Choose one episode for LLM repair");
        assert(
          ast.episodes.some((ep) => ep.number === data.episode),
          400,
          "Episode not found",
        );
      }
      // A series is repaired one episode per job, chained in order, so the
      // shared cast fixed in one episode carries into the next.
      const episodes =
        ast.episodes.length > 1
          ? data.episode !== undefined
            ? [data.episode as number]
            : episodesNeedingRepair(ast, issues)
          : [null];
      if (episodes.length)
        jobId = await queueRepair(
          env,
          projectId,
          data.body,
          versionId,
          episodes,
          !!data.autoApprove,
        );
    }
    const approved =
      !jobId && data.autoApprove
        ? await autoApproveScript(env, projectId, versionId)
        : false;
    return ok({ versionId, jobId, issues, approved }, 201);
  }
  if (parts[2] === "approve-script") {
    const approved = await approveScript(
      env,
      projectId,
      String(data.versionId || ""),
      Number(data.revision),
    );
    // The studio asks for every missing reference right away; they approve themselves after QA.
    if (data.generateAssets) await queueMissingAssets(env, projectId, true);
    return ok(approved);
  }
  if (parts[2] === "assets") {
    const asset = await one(
      env,
      "SELECT * FROM assets WHERE id=? AND project_id=?",
      parts[3],
      projectId,
    );
    assert(asset, 404, "Asset not found");
    if (parts[4] === "approve") {
      await approveAssetVersion(env, projectId, asset.id, Number(data.version));
      return ok({
        ok: true,
        renderStarted: data.autoRender
          ? await resumeRendering(env, projectId)
          : false,
      });
    }
    assert(
      parts[4] === "generate" && project.approved_script_id,
      409,
      "Approve the script first",
    );
    return ok({
      jobId: await queueAsset(
        env,
        project,
        asset,
        String(data.instruction || ""),
        !!data.auto,
      ),
    });
  }
  if (parts[2] === "scenes") {
    if (parts[4] === "render")
      return ok(
        await queueClip(
          env,
          projectId,
          parts[3],
          String(data.note || "").slice(0, 2000),
        ),
      );
    if (parts[4] === "approve-clip") {
      await approveClip(env, projectId, String(data.clipId));
      return ok({ ok: true });
    }
  }
  if (parts[2] === "render") {
    assert(
      Number.isInteger(data.episode),
      400,
      "Episode number required (0 for a film)",
    );
    await query(
      env,
      "UPDATE projects SET auto_episode=? WHERE id=?",
      data.episode,
      projectId,
    ).run();
    await scheduleNext(env, projectId);
    return ok({ ok: true });
  }
  if (parts[2] === "stop") {
    await query(
      env,
      "UPDATE projects SET auto_episode=NULL WHERE id=?",
      projectId,
    ).run();
    return ok({ ok: true });
  }
  if (parts[2] === "jobs" && parts[4] === "cancel") {
    await query(
      env,
      "UPDATE jobs SET status='cancelled',claim_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND project_id=? AND status IN ('queued','claimed','running')",
      now(),
      parts[3],
      projectId,
    ).run();
    await reconcileTerminalJobs(env);
    await cleanupUploads(env);
    await query(
      env,
      "UPDATE projects SET auto_episode=NULL WHERE id=?",
      projectId,
    ).run();
    return ok({ ok: true });
  }
  if (parts[2] === "assemble") {
    const episode = data.episode;
    assert(
      episode === "all" || Number.isInteger(episode),
      400,
      "Episode number or all required",
    );
    const scenes = await all(
      env,
      `SELECT s.*,c.id clip_id,c.r2_key,c.qa_json,c.status clip_status FROM scenes s JOIN episodes e ON e.id=s.episode_id LEFT JOIN clips c ON c.id=s.approved_clip_id WHERE e.project_id=? AND s.script_version_id=? ${episode === "all" ? "" : "AND e.number=?"} ORDER BY e.number,s.number`,
      projectId,
      project.approved_script_id,
      ...(episode === "all" ? [] : [episode]),
    );
    assert(
      scenes.length > 0 &&
        scenes.every((s) => s.r2_key && s.clip_status === "ready"),
      409,
      "All scenes must have current approved takes before assembly",
    );
    const renderId = id(),
      clipIds = scenes.map((s) => s.clip_id);
    await query(
      env,
      "INSERT INTO renders (id,project_id,scope,clip_ids_json,created_at) VALUES (?,?,?,?,?)",
      renderId,
      projectId,
      String(episode),
      json(clipIds),
      now(),
    ).run();
    const jobId = await enqueue(env, projectId, "assemble", {
      renderId,
      clips: scenes.map((s) => ({
        key: s.r2_key,
        scene: JSON.parse(s.spec_json),
        qa: JSON.parse(s.qa_json || "{}"),
      })),
      music: project.music_key,
      aspect: project.aspect,
      burnSubtitles: !!data.burnSubtitles,
      clipIds,
    });
    return ok({ jobId, renderId });
  }
  throw new HttpError(404, "Route not found");
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (url.pathname === "/api/capabilities")
      return ok({ manual: false, pipeline: true });
    try {
      assert(await authorized(request, env), 401, "Authentication required");
      const isGpu = url.pathname.startsWith("/api/gpu/");
      if (!isGpu && !["GET", "HEAD"].includes(request.method))
        assert(
          request.headers.get("Origin") === url.origin,
          403,
          "Cross-origin write rejected",
        );
      if (url.pathname === "/api/media" || url.pathname === "/api/gpu/media") {
        assert(
          ["GET", "HEAD"].includes(request.method),
          405,
          "Method not allowed",
        );
        const key = url.searchParams.get("key") || "";
        assert(
          /^projects\/[a-f0-9-]+\//.test(key) && !key.includes(".."),
          400,
          "Invalid media key",
        );
        const object = await env.MEDIA.get(key, { range: request.headers });
        assert(object, 404, "Media not found");
        const headers = new Headers({
          "Cache-Control": "private, max-age=120",
          "X-Content-Type-Options": "nosniff",
        });
        object.writeHttpMetadata(headers);
        headers.set("ETag", object.httpEtag);
        headers.set("Accept-Ranges", "bytes");
        let status = 200;
        if (object.range && "offset" in object.range) {
          const start = object.range.offset || 0,
            length = object.range.length || object.size;
          headers.set(
            "Content-Range",
            `bytes ${start}-${start + length - 1}/${object.size}`,
          );
          headers.set("Content-Length", String(length));
          status = 206;
        }
        return new Response(request.method === "HEAD" ? null : object.body, {
          status,
          headers,
        });
      }
      // Browser music upload is streamed; JSON parsing is never used for media.
      const music = url.pathname.match(/^\/api\/projects\/([^/]+)\/music$/);
      if (music && request.method === "PUT") {
        await getProject(env, music[1]);
        assert(request.body, 400, "Audio body required");
        assert(
          [
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/mp4",
            "audio/ogg",
          ].includes((request.headers.get("Content-Type") || "").split(";")[0]),
          415,
          "Upload an audio file",
        );
        const key = `projects/${music[1]}/music/${id()}.mp3`;
        await env.MEDIA.put(key, request.body, {
          httpMetadata: { contentType: request.headers.get("Content-Type")! },
        });
        await query(
          env,
          "UPDATE projects SET music_key=? WHERE id=?",
          key,
          music[1],
        ).run();
        return ok({ key });
      }
      const parts = url.pathname
        .split("/")
        .slice(isGpu ? 3 : 2)
        .map(decodeURIComponent);
      return isGpu
        ? await gpu(request, env, parts)
        : await owner(request, env, parts);
    } catch (error) {
      if (error instanceof HttpError)
        return ok({ error: error.message }, error.status);
      console.error(
        JSON.stringify({ event: "request_failed", path: url.pathname }),
      );
      return ok({ error: "Pipeline request failed; inspect server logs" }, 500);
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await expireLeases(env);
    await cleanupUploads(env);
    await healQueues(env);
  },
} satisfies ExportedHandler<Env>;
