import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
process.env.STUDIO_ROOT = root;
process.chdir(resolve(root, "web"));
const { createServer } = await import("vite");
const server = await createServer({
  server: {
    host: process.env.BIND_HOST || "127.0.0.1",
    port: Number(process.env.PORT || 3000),
    strictPort: true,
  },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
