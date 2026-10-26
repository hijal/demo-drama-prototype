/** Use the same Colab aspect and quality for scene generation and final assembly. */
export function renderFormat(scriptAspect: string) {
  const aspectRatio = process.env.RENDER_ASPECT_RATIO || scriptAspect;
  if (aspectRatio !== "9:16" && aspectRatio !== "16:9")
    throw new Error("Render aspect ratio must be 9:16 or 16:9");
  const short = Number(process.env.RENDER_SHORT_SIDE) === 720 ? 720 : 1080;
  const long = (short * 16) / 9;
  return {
    aspectRatio,
    targetDimensions:
      aspectRatio === "9:16"
        ? { width: short, height: long }
        : { width: long, height: short },
  };
}

/** Latents from another orientation or resolution cannot be pinned to this render. */
export function matchingContextFormat(
  previous: any,
  format: ReturnType<typeof renderFormat>,
) {
  return (
    previous?.aspectRatio === format.aspectRatio &&
    previous?.targetDimensions?.width === format.targetDimensions.width &&
    previous?.targetDimensions?.height === format.targetDimensions.height
  );
}
