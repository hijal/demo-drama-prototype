import { parseScript } from "./script/parse";
import { validateScript } from "./script/validate";
import {
  all,
  one,
  query,
  getProject,
  assert,
  id,
  now,
  json,
  enqueue,
  invalidateRendersSQL,
  invalidateDependentClipsSQL,
} from "./db";
import type { Scene, Script } from "./script/types";
export function semanticJSON(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .filter(
                ([key]) =>
                  ![
                    "line",
                    "fieldLines",
                    "headerLines",
                    "issues",
                    "inferred",
                    "format",
                  ].includes(key),
              )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, val]) => [key, normalize(val)]),
          )
        : item;
  return JSON.stringify(normalize(value));
}
export function references(scene: Scene) {
  return [
    ...new Set(
      JSON.stringify(scene)
        .match(/@[a-z][a-z0-9_]*/gi)
        ?.map((ref) => ref.slice(1)) ?? [],
    ),
  ];
}
export async function approveScript(
  env: Env,
  projectId: string,
  versionId: string,
  revision: number,
) {
  const p = await getProject(env, projectId);
  assert(
    p.revision === revision,
    409,
    "Project changed; reload before approving",
  );
  const version = await one(
    env,
    "SELECT * FROM script_versions WHERE id=? AND project_id=?",
    versionId,
    projectId,
  );
  assert(version, 404, "Script version not found");
  const ast = parseScript(version.body),
    issues = validateScript(ast);
  assert(
    !issues.some((i) => i.severity === "error"),
    422,
    "Script has validation errors; repair before approving",
  );
  const guard =
    "EXISTS (SELECT 1 FROM projects WHERE id=? AND revision=? AND approved_script_id=?)";
  const args: [string, number, string] = [projectId, revision + 1, versionId];
  const statements = [
    query(
      env,
      "UPDATE projects SET approved_script_id=?,revision=revision+1,title=?,aspect=?,status='approved',auto_episode=NULL WHERE id=? AND revision=?",
      versionId,
      ast.header.TITLE,
      ast.header.ASPECT,
      projectId,
      revision,
    ),
  ];
  const assets = [...ast.characters, ...ast.props, ...ast.locations];
  const existingAssets = await all(
    env,
    "SELECT ref,spec_json FROM assets WHERE project_id=?",
    projectId,
  );
  for (const asset of assets) {
    const before = existingAssets.find((a) => a.ref === asset.id);
    const unchanged =
      before &&
      semanticJSON(JSON.parse(before.spec_json)) === semanticJSON(asset)
        ? 1
        : 0;
    statements.push(
      query(
        env,
        `INSERT INTO assets (id,project_id,ref,kind,name,spec_json) SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(project_id,ref) DO UPDATE SET name=excluded.name,spec_json=excluded.spec_json,status=CASE WHEN ? THEN assets.status ELSE 'draft' END,approved_version=CASE WHEN ? THEN assets.approved_version ELSE NULL END`,
        `${projectId}:${asset.id}`,
        projectId,
        asset.id,
        asset.kind,
        asset.name,
        json(asset),
        ...args,
        unchanged,
        unchanged,
      ),
    );
  }
  for (const episode of ast.episodes) {
    const episodeId = `${projectId}:ep${episode.number}`;
    statements.push(
      query(
        env,
        `INSERT INTO episodes (id,project_id,number,title) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET title=excluded.title`,
        episodeId,
        projectId,
        episode.number,
        episode.title,
        ...args,
      ),
    );
    let previousLocation = "",
      previousTransition = "cut",
      chain = 0,
      chainLength = 0;
    for (const scene of episode.scenes) {
      const sceneId = `${episodeId}:s${scene.number}`,
        content = semanticJSON(scene);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(content),
          ),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const location = scene.fields.AT?.match(/@[\w]+/)?.[0] || "";
      if (
        location !== previousLocation ||
        !location ||
        previousTransition !== "cut" ||
        chainLength >= 4
      ) {
        chain = scene.number;
        chainLength = 0;
      }
      chainLength++;
      previousTransition = scene.fields.TRANSITION || "cut";
      const chainGroup = location ? `${episodeId}:${location}:${chain}` : null;
      previousLocation = location;
      statements.push(
        query(
          env,
          `UPDATE clips SET status='stale' WHERE scene_id=? AND EXISTS (SELECT 1 FROM scenes WHERE id=? AND content_hash!=?) AND ${guard}`,
          sceneId,
          sceneId,
          hash,
          ...args,
        ),
      );
      statements.push(
        query(
          env,
          `INSERT INTO scenes (id,episode_id,number,duration,spec_json,content_hash,script_version_id,chain_group) SELECT ?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET duration=excluded.duration,spec_json=excluded.spec_json,approved_clip_id=CASE WHEN scenes.content_hash=excluded.content_hash THEN scenes.approved_clip_id ELSE NULL END,content_hash=excluded.content_hash,script_version_id=excluded.script_version_id,chain_group=excluded.chain_group`,
          sceneId,
          episodeId,
          scene.number,
          scene.duration,
          content,
          hash,
          versionId,
          chainGroup,
          ...args,
        ),
      );
    }
  }
  statements.push(
    query(
      env,
      `UPDATE clips SET status='stale' WHERE scene_id IN (SELECT s.id FROM scenes s JOIN episodes e ON e.id=s.episode_id WHERE e.project_id=? AND s.script_version_id!=?) AND ${guard}`,
      projectId,
      versionId,
      ...args,
    ),
  );
  // A changed description invalidates every take that pinned that asset.
  statements.push(
    query(
      env,
      `UPDATE clips SET status='stale' WHERE EXISTS (SELECT 1 FROM json_each(clips.asset_versions_json) pins JOIN assets a ON a.id=pins.key WHERE a.project_id=? AND a.approved_version IS NOT pins.value) AND ${guard}`,
      projectId,
      ...args,
    ),
  );
  statements.push(query(env, invalidateDependentClipsSQL));
  statements.push(query(env, invalidateRendersSQL));
  const result = await env.DB.batch(statements);
  assert(result[0].meta.changes === 1, 409, "Project changed during approval");
  return { issues };
}
export async function queueClip(
  env: Env,
  projectId: string,
  sceneId: string,
  note = "",
  hint = "",
  retake = 0,
) {
  const p = await getProject(env, projectId);
  assert(p.approved_script_id, 409, "Approve a script before rendering");
  const s = await one(
    env,
    "SELECT s.*,e.number episode_number FROM scenes s JOIN episodes e ON e.id=s.episode_id WHERE s.id=? AND e.project_id=?",
    sceneId,
    projectId,
  );
  assert(
    s && s.script_version_id === p.approved_script_id,
    409,
    "Scene is not part of the current approved script",
  );
  const scene = JSON.parse(s.spec_json) as Scene;
  const assets = await all(
    env,
    "SELECT a.*,v.files_json FROM assets a LEFT JOIN asset_versions v ON v.asset_id=a.id AND v.version=a.approved_version WHERE a.project_id=?",
    projectId,
  );
  const refs = references(scene);
  const selected = assets.filter(
    (a) => refs.includes(a.ref) || refs.includes(a.ref + "s"),
  );
  assert(
    selected.every((a) => a.approved_version !== null && a.files_json),
    409,
    "Approve all referenced assets before rendering",
  );
  const pins = Object.fromEntries(
    selected.map((a) => [a.id, a.approved_version]),
  );
  const previous = await one(
    env,
    "SELECT s.approved_clip_id,c.r2_key,c.status,c.params_json FROM scenes s LEFT JOIN clips c ON c.id=s.approved_clip_id WHERE s.episode_id=? AND s.number=? AND s.chain_group=?",
    s.episode_id,
    s.number - 1,
    s.chain_group,
  );
  const take = (await one(
    env,
    "SELECT COALESCE(MAX(take),0)+1 next FROM clips WHERE scene_id=?",
    sceneId,
  ))!.next;
  const clipId = id(),
    jobId = id(),
    time = now();
  const payload = {
    clipId,
    sceneId,
    scene,
    sceneHash: s.content_hash,
    assets: selected.map((a) => ({
      ...a,
      spec: JSON.parse(a.spec_json),
      files: JSON.parse(a.files_json),
    })),
    assetVersions: pins,
    scriptVersion: p.approved_script_id,
    aspect: p.aspect,
    note,
    hint,
    retake,
    context: previous?.status === "ready" ? previous : null,
  };
  // UNIQUE(scene_id,take) is the concurrency guard; no duplicate active take is silently accepted.
  await env.DB.batch([
    query(
      env,
      "INSERT INTO clips (id,scene_id,take,asset_versions_json,context_clip_id,script_version_id,owner_note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      clipId,
      sceneId,
      take,
      json(pins),
      payload.context?.approved_clip_id || null,
      p.approved_script_id,
      note,
      time,
    ),
    query(
      env,
      "INSERT INTO jobs (id,project_id,type,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      jobId,
      projectId,
      "clip",
      json(payload),
      time,
      time,
    ),
  ]);
  return { clipId, jobId };
}
export async function scheduleNext(env: Env, projectId: string) {
  const p = await getProject(env, projectId);
  if (p.auto_episode === null) return;
  const active = await one(
    env,
    "SELECT id FROM jobs WHERE project_id=? AND type IN ('clip','qa') AND status IN ('queued','claimed','running') LIMIT 1",
    projectId,
  );
  if (active) return;
  const next = await one(
    env,
    "SELECT s.id FROM scenes s JOIN episodes e ON e.id=s.episode_id LEFT JOIN clips c ON c.id=s.approved_clip_id WHERE e.project_id=? AND e.number=? AND s.script_version_id=? AND (s.approved_clip_id IS NULL OR c.status!='ready') ORDER BY s.number LIMIT 1",
    projectId,
    p.auto_episode,
    p.approved_script_id,
  );
  if (next) await queueClip(env, projectId, next.id);
  else
    await query(
      env,
      "UPDATE projects SET auto_episode=NULL WHERE id=?",
      projectId,
    ).run();
}
