import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import node from "@sveltejs/adapter-node";
import staticAdapter from "@sveltejs/adapter-static";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter:
        process.env.BUILD_TARGET === "cloud"
          ? staticAdapter({
              pages: "dist",
              assets: "dist",
              fallback: "index.html",
              strict: false,
            })
          : node({ out: "build" }),
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL("..", import.meta.url))],
      deny: [
        "**/.dev.vars",
        "**/.env",
        "**/.env.*",
        "**/*.{crt,pem}",
        "**/.git/**",
        "**/.local-input/**",
        "**/.pipeline-review/**",
        "**/*.fixed.txt",
        "**/*.report.json",
      ],
    },
  },
});
