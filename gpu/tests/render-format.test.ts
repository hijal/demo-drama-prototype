import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFormat, matchingContextFormat } from "../src/render-format";

test("Colab portrait overrides a landscape script at default Full HD, with optional 720p", () => {
  const savedAspect = process.env.RENDER_ASPECT_RATIO;
  const savedSize = process.env.RENDER_SHORT_SIDE;
  try {
    process.env.RENDER_ASPECT_RATIO = "9:16";
    delete process.env.RENDER_SHORT_SIDE;
    const portrait = renderFormat("16:9");
    assert.deepEqual(portrait, {
      aspectRatio: "9:16",
      targetDimensions: { width: 1080, height: 1920 },
    });
    assert.equal(matchingContextFormat(portrait, portrait), true);
    assert.equal(
      matchingContextFormat(
        {
          aspectRatio: "16:9",
          targetDimensions: { width: 1920, height: 1080 },
        },
        portrait,
      ),
      false,
    );
    process.env.RENDER_SHORT_SIDE = "720";
    const preview = renderFormat("16:9");
    assert.deepEqual(preview.targetDimensions, { width: 720, height: 1280 });
    assert.equal(matchingContextFormat(preview, portrait), false);
    process.env.RENDER_ASPECT_RATIO = "16:9";
    assert.deepEqual(renderFormat("9:16").targetDimensions, {
      width: 1280,
      height: 720,
    });
    delete process.env.RENDER_SHORT_SIDE;
    assert.deepEqual(renderFormat("9:16").targetDimensions, {
      width: 1920,
      height: 1080,
    });
    delete process.env.RENDER_ASPECT_RATIO;
    assert.equal(renderFormat("9:16").aspectRatio, "9:16");
    assert.equal(renderFormat("16:9").aspectRatio, "16:9");
    process.env.RENDER_ASPECT_RATIO = "square";
    assert.throws(() => renderFormat("16:9"), /aspect ratio/);
  } finally {
    if (savedAspect === undefined) delete process.env.RENDER_ASPECT_RATIO;
    else process.env.RENDER_ASPECT_RATIO = savedAspect;
    if (savedSize === undefined) delete process.env.RENDER_SHORT_SIDE;
    else process.env.RENDER_SHORT_SIDE = savedSize;
  }
});
