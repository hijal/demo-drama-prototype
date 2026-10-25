import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { mockBackend } from "./helpers/mock-backend";

const tmpDir = fs.existsSync("/private/tmp") ? "/private/tmp" : "/tmp";

test("Svelte navigation preserves and reloads generation parameters", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockBackend(page);
  await page.goto("/");
  await page
    .getByLabel("Prompt", { exact: true })
    .fill("A quiet forest at dawn");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Resolution quality", exact: true })
    .click();
  await page.getByRole("option", { name: "1080p", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Aspect ratio", exact: true })
    .click();
  await page.getByRole("option", { name: "9:16", exact: true }).click();
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Gallery/ })).toBeVisible();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(
    "A quiet forest at dawn",
  );
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Resolution quality", exact: true }),
  ).toHaveText("1080p");
  await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(
    "A quiet forest at dawn",
  );
  expect(errors).toEqual([]);
  await page.screenshot({
    path: path.join(tmpDir, "svelte-studio-desktop.png"),
    fullPage: true,
  });
});

test("submits two tasks and cancels them while Gallery is open", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Prompt", { exact: true }).fill("A cinematic scene");
  await page.getByRole("button", { name: /Generate video/ }).click();
  await expect.poll(() => backend.submissions.length).toBe(1);
  await page.getByRole("button", { name: /Add to queue/ }).click();
  await expect.poll(() => backend.submissions.length).toBe(2);
  expect(backend.submissions[0]).toMatchObject({
    mode: "t2v",
    prompt: "A cinematic scene",
  });
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await page.getByRole("button", { name: /^Queue/ }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Generation queue" })
      .getByText("A cinematic scene", { exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Cancel task", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel task", exact: true }),
  ).toHaveCount(1);
});

test("gallery Repeat submits the exact restored FLF dimensions", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await page
    .getByRole("button", { name: /Repeat/, exact: false })
    .last()
    .click();
  await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(
    "Original frame scene",
  );
  await page.getByRole("button", { name: /Generate video/ }).click();
  await expect.poll(() => backend.submissions.length).toBe(1);
  expect(backend.submissions[0]).toMatchObject({
    mode: "flf",
    targetDimensions: { width: 1620, height: 1080 },
    firstFrame: "frame.png",
    seed: 42,
  });
});

test("settings persist optimization and native dialogs close with Escape", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/, exact: false }).click();
  await page.getByRole("tab", { name: "Optimization", exact: true }).click();
  await page.getByLabel("Reserved VRAM (GB)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save optimization" }).click();
  await expect.poll(() => backend.settings.length).toBe(1);
  expect(backend.settings[0]).toMatchObject({ reserve_gb: 5 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Settings/ }).click();
  await expect(
    page.getByLabel("Reserved VRAM (GB)", { exact: true }),
  ).toHaveValue("5");
});

test("gallery deletion requires confirmation and refreshes results", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete scene.mp4", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete video?", exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(backend.deletions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Delete scene.mp4", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete video?", exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect.poll(() => backend.deletions.length).toBe(1);
  await expect(
    page
      .getByText('No video yet. Generate the first one in the "Generate" tab.')
      .last(),
  ).toBeVisible();
});

test("mobile Generate and Gallery fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBackend(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Parameters", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(tmpDir, "svelte-studio-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Gallery/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reference and frame uploads reach their generation workflows", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("/");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 60;
    canvas.getContext("2d")!.fillRect(0, 0, 80, 60);
    return canvas.toDataURL().split(",")[1];
  });
  const file = {
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  };
  await page.getByLabel("Upload references").setInputFiles(file);
  await expect(page.getByText("reference.png", { exact: true })).toBeVisible();
  await page
    .getByLabel("Prompt", { exact: true })
    .fill("Use <Picture 1> in a cinematic scene");
  await page.getByRole("button", { name: /Generate video/ }).click();
  await expect.poll(() => backend.submissions.length).toBe(1);
  expect(backend.submissions[0]).toMatchObject({
    mode: "ref",
    refImages: ["input.png"],
  });
  await page.getByRole("button", { name: "Frames", exact: true }).click();
  await page.getByLabel("First frame", { exact: true }).setInputFiles(file);
  await expect(
    page.getByRole("button", { name: "Remove first frame" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Add to queue/ }).click();
  await expect.poll(() => backend.submissions.length).toBe(2);
  expect(backend.submissions[1]).toMatchObject({
    mode: "flf",
    firstFrame: "input.png",
    firstFrameWidth: 80,
    firstFrameHeight: 60,
  });
  expect(backend.submissions[1].prompt).not.toContain("<Picture 1>");
});

test("metadata uses the full folder path and playback opens a dialog", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await page
    .getByRole("button", { name: "Metadata for scene.mp4", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Original frame scene", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Play scene.mp4", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("video")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("active queue resumes polling after a page reload", async ({ page }) => {
  const backend = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Prompt", { exact: true }).fill("Resume this scene");
  await page.getByRole("button", { name: /Generate video/ }).click();
  await expect.poll(() => backend.submissions.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("h3-gen-queue") || "{}").state
            ?.items?.[0]?.promptId,
      ),
    )
    .toBe("prompt-1");
  await page.reload();
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await page.getByRole("button", { name: /^Queue/ }).click();
  const response = await page.waitForResponse((r) =>
    r.url().includes("/api/comfy/status?prompt_id=prompt-1"),
  );
  expect(response.ok()).toBe(true);
  await expect(
    page.getByRole("button", { name: "Cancel task", exact: true }),
  ).toHaveCount(1);
  expect(backend.submissions).toHaveLength(1);
});
