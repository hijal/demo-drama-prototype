/** Owner-readable project activity for the live log (studio dock and Logs tab). */

/** Short name for a job, e.g. "Scene 3 · take 2" or "Byang the Frog v1". */
export function describeJob(type: string, payload: any) {
  const p = payload || {};
  const scene = () => {
    const episode = /:ep(\d+):/.exec(String(p.sceneId || ""))?.[1];
    return [
      episode && episode !== "0" ? `Episode ${episode}` : "",
      p.scene?.number ? `Scene ${p.scene.number}` : "Scene",
      p.take ? `take ${p.take}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  switch (type) {
    case "fix_script":
      return p.episode ? `Script repair · Episode ${p.episode}` : "Script repair";
    case "asset":
      return `${p.spec?.name || "Reference"} v${p.version ?? "?"}`;
    case "clip":
      return `${scene()} render`;
    case "qa":
      return `${scene()} QA`;
    case "assemble":
      return "Final video";
    default:
      return type;
  }
}

export async function projectLog(
  env: Env,
  projectId: string,
  line: string,
  jobId: string | null = null,
) {
  try {
    await env.LOGHUB.getByName(projectId).append(jobId ?? "", [line]);
  } catch {
    // The log is informational; never fail a pipeline step because of it.
  }
}
