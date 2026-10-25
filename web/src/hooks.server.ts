import type { Handle } from "@sveltejs/kit/hooks";

/** Local pipeline requests keep the same URL as the deployed Worker API. */
export const handle: Handle = async ({ event, resolve }) => {
  const { request, url } = event;
  if (url.pathname.split("/").some((segment) => segment.startsWith("."))) {
    return new Response("Not found", { status: 404 });
  }
  const pipeline =
    process.env.PIPELINE_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:8790" : "");
  if (
    pipeline &&
    /^\/api\/(projects|status|media|gpu)(?:\/|$)/.test(url.pathname)
  ) {
    const target = new URL(url.pathname + url.search, pipeline);
    if (
      target.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(target.hostname)
    ) {
      return Response.json(
        { error: "Local pipeline proxy requires a loopback HTTP endpoint" },
        { status: 503 },
      );
    }
    if (
      !["GET", "HEAD"].includes(request.method) &&
      !url.pathname.startsWith("/api/gpu/") &&
      request.headers.get("origin") !== url.origin
    ) {
      return Response.json(
        { error: "Cross-origin write rejected" },
        { status: 403 },
      );
    }
    const headers = new Headers(request.headers);
    headers.set("origin", target.origin);
    headers.delete("host");
    try {
      return await fetch(target, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : request.body,
        signal: request.signal,
        redirect: "manual",
        duplex: "half",
      } as RequestInit);
    } catch {
      return Response.json(
        {
          error: "Pipeline backend is unavailable. Start npm run dev:pipeline.",
        },
        { status: 502 },
      );
    }
  }
  return resolve(event);
};
