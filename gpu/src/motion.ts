import {
  buildMiniMaxH3Workflow,
  type MiniMaxH3Params,
} from "../../src/lib/comfy/minimax-h3-template";

// Integration with the separately installed, pinned GPL-3.0 Motion Context node pack.
// No upstream implementation is vendored. IDs are private to the GPU pipeline graph.
export const MOTION_NODES = {
  saveLow: "pipeline:save-low",
  saveHigh: "pipeline:save-high",
  loadLow: "pipeline:load-low",
  loadHigh: "pipeline:load-high",
  pinLow: "pipeline:pin-low",
  pinHigh: "pipeline:pin-high",
  trim: "pipeline:trim",
} as const;
export function canLatentChain(duration: number) {
  const frames = Math.max(5, Math.round((duration + 22 / 24) * 24));
  return frames + ((5 - (frames % 17) + 17) % 17) <= 719;
}
export interface MotionContext {
  enabled: boolean;
  low?: string;
  high?: string;
}
export function buildMotionWorkflow(
  params: MiniMaxH3Params,
  context?: MotionContext,
) {
  if (!context?.enabled) return buildMiniMaxH3Workflow(params);
  if (params.mode === "flf")
    throw new Error("Latent chaining does not support the manual FLF workflow");
  if (!!context.low !== !!context.high)
    throw new Error("Both low and high context latents are required");
  const chained = !!context.low;
  if (chained && !canLatentChain(params.duration))
    throw new Error("Pinned context would exceed the H3 719-frame limit");
  // The pinned head is discarded, so render an extra 22 frames before H3 grid rounding.
  const graph = buildMiniMaxH3Workflow({
    ...params,
    duration: params.duration + (chained ? 22 / 24 : 0),
  }) as Record<string, { class_type: string; inputs: Record<string, any> }>;
  const prefix = params.outputSubfolder || "pipeline";
  for (const [node, source, name] of [
    [MOTION_NODES.saveLow, ["46:21", 1], "low"],
    [MOTION_NODES.saveHigh, ["46:16", 0], "high"],
  ] as const) {
    graph[node] = {
      class_type: "MiniMaxH3MotionContextSaveLatent",
      inputs: {
        latent: [...source],
        filename_prefix: `${prefix}/context-${name}`,
        clip_index: 1,
      },
    };
  }
  if (!chained) return graph;
  for (const [load, pin, path, latent, guider] of [
    [
      MOTION_NODES.loadLow,
      MOTION_NODES.pinLow,
      context.low,
      ["46:11", 1],
      "46:29",
    ],
    [
      MOTION_NODES.loadHigh,
      MOTION_NODES.pinHigh,
      context.high,
      ["46:10", 0],
      "46:32",
    ],
  ] as const) {
    graph[load] = {
      class_type: "MiniMaxH3MotionContextLoadLatent",
      inputs: {
        latent_path: path,
        clip_index: 1,
        stock_format: false,
        folder: "input",
      },
    };
    graph[pin] = {
      class_type: "MiniMaxH3MotionContext",
      inputs: {
        conditioning: graph[guider].inputs.conditioning,
        vae: ["46:3", 0],
        latent: [...latent],
        context_latent: [load, 0],
        context_length: "22",
        audio_context_length: 18,
      },
    };
    graph[guider].inputs.conditioning = [pin, 0];
  }
  graph[MOTION_NODES.trim] = {
    class_type: "MiniMaxH3MotionContextTrim",
    inputs: {
      images: graph["45"].inputs.images,
      audio: graph["45"].inputs.audio,
      trim_frames: [MOTION_NODES.pinHigh, 1],
      fps: 24,
      match_tail: true,
    },
  };
  graph["45"].inputs.images = [MOTION_NODES.trim, 0];
  graph["45"].inputs.audio = [MOTION_NODES.trim, 1];
  return graph;
}
