import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../web", import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));
const targets = process.argv.includes("--cloud")
  ? ["cloud"]
  : process.argv.includes("--node")
    ? ["node"]
    : ["node", "cloud"];
for (const target of targets) {
  const result = spawnSync("npm", ["exec", "--", "vite", "build"], {
    cwd: web,
    env: { ...process.env, BUILD_TARGET: target, STUDIO_ROOT: root },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
