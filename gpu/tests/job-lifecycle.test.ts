import { test } from "node:test";
import assert from "node:assert/strict";
import { renewClaim, completeJob } from "../src/job-lifecycle";

test("a delayed heartbeat for an old claim cannot cancel the next job", async () => {
  const old = {
    job: { id: "old", claim_token: "old-token" },
    abort: new AbortController(),
  };
  const next = {
    job: { id: "new", claim_token: "new-token" },
    abort: new AbortController(),
  };
  let active = old;
  let reject!: (error: unknown) => void;
  const pending = renewClaim(
    () => active,
    async () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  active = next;
  reject(Object.assign(new Error("old claim expired"), { status: 409 }));
  await pending;
  assert.equal(next.abort.signal.aborted, false);
});
test("current cancelled claim aborts, transient heartbeat failures do not", async () => {
  for (const status of [409, 503]) {
    const active = {
      job: { id: "job", claim_token: "token" },
      abort: new AbortController(),
    };
    await renewClaim(
      () => active,
      async () => {
        throw Object.assign(new Error("request failed"), { status });
      },
    );
    assert.equal(active.abort.signal.aborted, status === 409);
  }
});
test("a lost completion response retries the same result instead of recomputing", async () => {
  const calls: unknown[] = [];
  const result = { key: "uploaded.mp4" };
  await completeJob(
    { id: "job", claim_token: "token" },
    result,
    async (path, body) => {
      calls.push({ path, body });
      if (calls.length === 1) throw new Error("response lost after save");
      return { ok: true, idempotent: true };
    },
    new AbortController().signal,
    async () => {},
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});
test("completion does not retry a cancelled claim or ignore shutdown", async () => {
  let calls = 0;
  await assert.rejects(
    completeJob(
      { id: "job", claim_token: "token" },
      {},
      async () => {
        calls++;
        throw Object.assign(new Error("cancelled"), { status: 409 });
      },
      new AbortController().signal,
      async () => {},
    ),
  );
  assert.equal(calls, 1);
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(
    completeJob(
      { id: "job", claim_token: "token" },
      {},
      async () => {
        calls++;
      },
      stop.signal,
      async () => {},
    ),
  );
  assert.equal(calls, 1);
});
