import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3107",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:3107",
    env: {
      PORT: "3107",
      COMFY_URL: "http://127.0.0.1:1",
      COMFY_ROOT: resolve("test-results/api-backend"),
      LOCAL_INPUT_DIR: resolve("test-results/api-input"),
    },
    reuseExistingServer: false,
    timeout: 120000,
  },
});
