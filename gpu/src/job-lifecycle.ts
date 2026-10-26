import { delay } from "./comfy";

type Claim = {
  job: { id: string; claim_token: string };
  abort: AbortController;
};
type Request = (
  path: string,
  payload: unknown,
  signal?: AbortSignal,
) => Promise<unknown>;

export async function renewClaim(
  current: () => Claim | null,
  request: Request,
) {
  const claim = current();
  if (!claim) return;
  try {
    await request(`/api/gpu/jobs/${claim.job.id}/progress`, {
      claim_token: claim.job.claim_token,
    });
  } catch (error) {
    // A reply can arrive after the next job has started. Never cancel that job.
    if (current() === claim && (error as { status?: number }).status === 409)
      claim.abort.abort(new Error("Claim cancelled or expired"));
  }
}

export async function completeJob(
  job: Claim["job"],
  result: unknown,
  request: Request,
  signal: AbortSignal,
  sleep = delay,
) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      return await request(
        `/api/gpu/jobs/${job.id}/done`,
        { claim_token: job.claim_token, result },
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      const status = (error as { status?: number }).status;
      if (
        attempt >= 3 ||
        (status !== undefined &&
          ![408, 429, 500, 502, 503, 504].includes(status))
      )
        throw error;
      await sleep(Math.min(5000, 500 * 2 ** attempt), signal);
    }
  }
}
