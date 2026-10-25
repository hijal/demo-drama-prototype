import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { mockBackend } from "./helpers/mock-backend";

const tmpDir = fs.existsSync("/private/tmp") ? "/private/tmp" : "/tmp";
test("original shell, theme and generation panel geometry survive the framework conversion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockBackend(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass("dark-gray");
  await expect(page.getByText("by Evgen Rublev")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Parameters", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Video description", { exact: true }),
  ).toBeVisible();
  const sidebar = page.locator("[data-studio-sidebar]"),
    parameters = page.locator("[data-parameters-panel]"),
    prompt = page.getByLabel("Prompt", { exact: true });
  expect((await sidebar.boundingBox())?.width).toBe(240);
  expect((await parameters.boundingBox())?.width).toBe(400);
  expect((await prompt.boundingBox())!.x).toBeGreaterThanOrEqual(660);
  await expect(sidebar.locator(".gradient-creative")).toBeVisible();
  await page.screenshot({ path: path.join(tmpDir, "svelte-restored-generate.png") });
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  expect(
    (
      await page
        .getByRole("complementary", { name: "Gallery folders" })
        .boundingBox()
    )?.width,
  ).toBe(224);
  await page.screenshot({ path: path.join(tmpDir, "svelte-restored-gallery.png") });
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog.getByText("Connected", { exact: true })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(950);
  expect(bounds?.height).toBe(920);
  await page.screenshot({ path: path.join(tmpDir, "svelte-restored-settings.png") });
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Gray", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Black", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Light", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.width))
    .toBe(68);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.width))
    .toBe(240);
});

test("original prompt editor keeps draft cancel/save, insert tools and anchored history", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("/");
  const prompt = page.getByLabel("Prompt", { exact: true });
  await prompt.fill("Original scene");
  await page.getByRole("button", { name: "Expand prompt editor" }).click();
  const editor = page.getByRole("dialog", {
    name: "Prompt editor",
    exact: true,
  });
  expect(Math.round((await editor.boundingBox())!.width)).toBe(
    Math.round(page.viewportSize()!.width * 0.8),
  );
  await editor.getByLabel("Expanded prompt").fill("Cancelled draft");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(prompt).toHaveValue("Original scene");
  await page.getByRole("button", { name: "Expand prompt editor" }).click();
  await editor.getByLabel("Expanded prompt").fill("Saved scene");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(prompt).toHaveValue("Saved scene");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Prompt history" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Prompt history" }),
  ).toHaveCount(0);
});

test("reference reorder and removal preserve the original prompt tag synchronization", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("/");
  const buffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0RkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.getByLabel("Upload references").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer },
    { name: "second.png", mimeType: "image/png", buffer },
  ]);
  await expect(page.getByText("second.png", { exact: true })).toBeVisible();
  const prompt = page.getByLabel("Prompt", { exact: true });
  await prompt.fill("<Picture 1> talks to <Picture 2>");
  await page
    .getByRole("button", { name: "Move second.png earlier", exact: true })
    .click();
  await expect(prompt).toHaveValue("<Picture 2> talks to <Picture 1>");
  await page
    .getByRole("button", { name: "Remove first.png", exact: true })
    .click();
  await expect(prompt).toHaveValue(" talks to <Picture 1>");
});
