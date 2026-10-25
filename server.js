#!/usr/bin/env node
/** SvelteKit adapter-node handler, with local HTTP and Colab tunnel support. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

if (fs.existsSync(path.join(__dirname, ".env"))) {
  process.loadEnvFile(path.join(__dirname, ".env"));
}
process.env.STUDIO_ROOT ||= __dirname;
process.chdir(__dirname);
const host = process.env.HOST || process.env.BIND_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
// Model uploads are streamed to disk and can be many GB in size.
process.env.BODY_SIZE_LIMIT ||= "Infinity";
process.env.PROTOCOL_HEADER ||= "x-forwarded-proto";
process.env.HOST_HEADER ||= "host";

async function start() {
  const { handler } = await import(
    pathToFileURL(path.join(__dirname, "web/build/handler.js")).href
  );
  const server = http.createServer((req, res) => {
    // adapter-node defaults to HTTPS. Direct local requests need their actual
    // protocol; a trusted Colab tunnel supplies its public forwarded protocol.
    const header = process.env.PROTOCOL_HEADER.toLowerCase();
    req.headers[header] ||= req.socket.encrypted ? "https" : "http";
    handler(req, res);
  });
  server.on("error", (error) => {
    console.error("SvelteKit server:", error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.log(`SvelteKit Studio: http://${host}:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
start().catch((error) => {
  console.error(
    "Failed to start SvelteKit Studio. Run npm run build first.",
    error.message,
  );
  process.exitCode = 1;
});
