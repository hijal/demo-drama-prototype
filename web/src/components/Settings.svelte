<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "./Modal.svelte";
  import SettingSlider from "./SettingSlider.svelte";
  import {
    Server,
    Settings,
    Palette,
    SlidersHorizontal,
    Link,
    RotateCcw,
    Package,
    RefreshCw,
    Cpu,
    Plus,
    ChevronDown,
    Sun,
    Moon,
    CheckCircle,
    Download,
    Trash2,
    AlertTriangle,
  } from "lucide-svelte";
  import { MODELS } from "@/lib/models-config";
  import { api, message } from "../lib/api";
  import { readable } from "../lib/store";
  import { uploadModel } from "../lib/model-upload";
  import { useGenStore, DEFAULT_VIDEO_STATE } from "@/lib/gen-store";
  import { usePromptHistory } from "@/lib/prompt-history-store";
  import { useGenDurations } from "@/lib/gen-duration-store";
  import { useModelUploadStore } from "@/lib/model-upload-store";
  import { loadGallery } from "../lib/gallery";
  import { toast } from "@/lib/notifications";
  let {
    open = $bindable(false),
    enabled = true,
  }: { open?: boolean; enabled?: boolean } = $props();
  const store = readable(useGenStore),
    uploads = readable(useModelUploadStore);
  const video = $derived($store.video);
  let tab = $state("General");
  let diffusionOpen = $state(false);
  const outline =
    "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-input/30 shadow-xs hover:bg-input/50 hover:text-accent-foreground h-8 px-3 text-xs font-medium disabled:opacity-50";
  const inputClass =
    "w-full rounded-md border border-border bg-[var(--surface-2)] px-3 py-2 text-xs";
  let config = $state({
    reserve_gb: 3,
    dynamic_vram: true,
    comfy_dir: "",
    diffusion_model: "",
    sound_on: true,
  });
  let theme = $state("dark-gray");
  let stats = $state<any>(null),
    models = $state<any[]>([]),
    loras = $state<any[]>([]);
  let diffusion = $state<{
    models: string[];
    default?: string;
    current?: string;
  }>({ models: [] });
  let busy = $state(false),
    error = $state(""),
    loaded = $state(false);
  let confirmation = $state(""),
    confirmOpen = $state(false);
  let requestVersion = 0;
  onMount(() => {
    try {
      theme = localStorage.getItem("theme") || "dark-gray";
    } catch {}
  });
  async function refresh() {
    const version = ++requestVersion;
    const results = await Promise.allSettled([
      api("/api/config"),
      api("/api/comfy/health"),
      api("/api/models/status"),
      api("/api/loras"),
      api("/api/comfy/diffusion-models"),
    ]);
    if (version !== requestVersion) return;
    if (results[0].status === "fulfilled") {
      config = { ...config, ...results[0].value };
      error = "";
    } else error = message(results[0].reason);
    stats = results[1].status === "fulfilled" ? results[1].value : null;
    if (results[2].status === "fulfilled")
      models = results[2].value.models ?? [];
    if (results[3].status === "fulfilled") loras = results[3].value.loras ?? [];
    if (results[4].status === "fulfilled")
      diffusion = results[4].value as typeof diffusion;
    loaded = true;
  }
  $effect(() => {
    if (open && enabled) {
      void refresh();
      return () => {
        requestVersion++;
      };
    }
  });
  $effect(() => {
    if (!open || !models.some((m) => m.status === "downloading")) return;
    let disposed = false,
      inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api("/api/models/status");
        if (!disposed) models = data.models ?? [];
      } catch {
      } finally {
        inFlight = false;
      }
    }, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  });
  async function save(patch: Partial<typeof config>) {
    busy = true;
    error = "";
    try {
      const result = await api("/api/config", patch);
      config = { ...config, ...result };
      toast.success("Settings saved");
    } catch (e) {
      error = message(e);
      toast.error(error);
    } finally {
      busy = false;
    }
  }
  function changeTheme(value: string) {
    theme = value;
    document.documentElement.className = value;
    try {
      localStorage.setItem("theme", value);
    } catch {}
  }
  async function modelAction(
    action: "download" | "cancel" | "delete",
    id: string,
  ) {
    if (
      action === "delete" &&
      !confirm("Delete this model from disk? You can download it again later.")
    )
      return;
    busy = true;
    try {
      await api(`/api/models/${action}`, { modelId: id });
      const data = await api("/api/models/status");
      models = data.models ?? [];
      toast.success(
        action === "download"
          ? "Download started"
          : action === "cancel"
            ? "Download cancelled"
            : "Model deleted",
      );
    } catch (e) {
      toast.error(message(e));
    } finally {
      busy = false;
    }
  }
  async function downloadAll() {
    for (const model of models.filter(
      (m) => !m.optional && ["missing", "error"].includes(m.status),
    ))
      await modelAction("download", model.id);
  }
  async function upload(file: File | undefined, target: "diffusion" | "lora") {
    if (!file) return;
    try {
      await uploadModel(file, target);
      await refresh();
      toast.success("Model uploaded");
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function updateLora(name: string, patch: Record<string, unknown>) {
    busy = true;
    try {
      const result = await api("/api/loras", { name, ...patch }, "PUT");
      if (result.warning) toast.warning(result.warning);
      const data = await api("/api/loras");
      loras = data.loras ?? [];
    } catch (e) {
      toast.error(message(e));
    } finally {
      busy = false;
    }
  }
  async function deleteLora(name: string) {
    if (!confirm(`Delete LoRA “${name}” and its file?`)) return;
    busy = true;
    try {
      await api("/api/loras", { name, deleteFile: true }, "DELETE");
      const data = await api("/api/loras");
      loras = data.loras ?? [];
    } catch (e) {
      toast.error(message(e));
    } finally {
      busy = false;
    }
  }
  function ask(action: string) {
    confirmation = action;
    confirmOpen = true;
  }
  async function reset() {
    const action = confirmation;
    busy = true;
    error = "";
    try {
      if (action === "Reset settings" || action === "Factory reset") {
        await api("/api/config", {
          reserve_gb: 3,
          dynamic_vram: true,
          sound_on: true,
          diffusion_model: "",
        });
        useGenStore.getState().patchVideo({ ...DEFAULT_VIDEO_STATE, refs: [] });
      }
      if (action === "Factory reset") await api("/api/loras/reset", {});
      if (action === "Clear input cache" || action === "Factory reset") {
        await api("/api/comfy/clean", { target: "input" });
        useGenStore.getState().clearVideoRefs();
        useGenStore.getState().setVideoStartFrame(null);
        useGenStore.getState().setVideoEndFrame(null);
      }
      if (action === "Delete generated content" || action === "Factory reset") {
        await api("/api/comfy/clean", { target: "output" });
        usePromptHistory.getState().clear();
        useGenDurations.getState().clear();
        useGenStore.getState().setVideoPrompt("");
        await loadGallery();
      }
      if (action === "Factory reset") changeTheme("dark-gray");
      await refresh();
      confirmOpen = false;
      toast.success(`${action} complete`);
    } catch (e) {
      error = `${message(e)}. Some earlier steps may already have completed.`;
      toast.error(error);
    } finally {
      busy = false;
    }
  }
  const size = (bytes: number) =>
    bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
      : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
</script>

{#snippet switchControl(
  label: string,
  checked: boolean,
  action: () => void,
)}<button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    onclick={action}
    class="relative w-10 h-5.5 rounded-full transition-colors shrink-0 {checked
      ? 'bg-emerald-500/70'
      : 'bg-[var(--surface-4)]'}"
    ><span
      class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform {checked
        ? 'translate-x-[18px]'
        : ''}"
    ></span></button
  >{/snippet}
<Modal
  bind:open
  title="Settings"
  kind="settings"
  description="Connection, models, GPU memory, ComfyUI and manual download links"
>
  {#snippet icon()}<Server class="w-5 h-5" />{/snippet}
  <div class="px-6 shrink-0">
    <div
      class="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-2)]/60 border border-border mb-2"
      role="tablist"
      aria-label="Settings sections"
    >
      {#each [{ name: "General", icon: Package }, { name: "Appearance", icon: Palette }, { name: "Optimization", icon: SlidersHorizontal }, { name: "ComfyUI", icon: Server }, { name: "Links", icon: Link }, { name: "Reset", icon: AlertTriangle }] as item}<button
          role="tab"
          aria-selected={tab === item.name}
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors {tab ===
          item.name
            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
            : 'text-muted-foreground border border-transparent hover:text-foreground'}"
          onclick={() => (tab = item.name)}
          ><item.icon class="w-4 h-4" />{item.name}</button
        >{/each}
    </div>
  </div>
  <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-5">
    {#if error}<p class="text-xs text-red-400" role="alert">{error}</p>{/if}
    {#if tab === "General"}<div class="space-y-4 py-2">
        <div class="flex items-center justify-between">
          <span class="text-sm text-muted-foreground">ComfyUI:</span><span
            class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium {stats
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'text-red-400 border-red-500/30'}"
            ><CheckCircle class="w-3 h-3" />{!loaded && enabled
              ? "Checking..."
              : stats
                ? "Connected"
                : "Not available"}</span
          >
        </div>
        <div class="space-y-2 pt-2 border-t border-border">
          <div class="flex items-center gap-2">
            <Package class="w-4 h-4 text-cyan-400" /><span
              class="text-sm font-medium">Models</span
            ><span
              class="text-[10px] bg-emerald-500/15 text-emerald-400 rounded-md px-1.5 py-0.5"
              >{models.filter((m) => m.status === "ready")
                .length}/{models.length}</span
            ><button
              class="ml-auto p-2"
              aria-label="Refresh model status"
              onclick={refresh}
              ><RefreshCw class="w-3.5 h-3.5 text-muted-foreground" /></button
            >
          </div>
          <div
            class="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider pt-3 pb-1 pl-1"
          >
            <Cpu class="w-3 h-3 text-cyan-400" />MiniMax H3 (generation)
          </div>
          {#if models.some((m) => m.status !== "ready" && !m.optional)}<button
              class={outline}
              disabled={busy}
              onclick={downloadAll}
              ><Download class="w-3 h-3" />Download all</button
            >{/if}
          <div class="space-y-1.5">
            {#each models as model (model.id)}<div
                class="flex items-center gap-3 px-3 py-2 rounded-lg border {model.status ===
                'ready'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : model.status === 'downloading'
                    ? 'border-cyan-500/30 bg-cyan-500/5'
                    : model.status === 'error'
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-border'}"
              >
                <CheckCircle
                  class="w-4 h-4 shrink-0 {model.status === 'ready'
                    ? 'text-emerald-400'
                    : 'text-muted-foreground'}"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium truncate">{model.label}</p>
                  <p class="text-[10px] text-muted-foreground">
                    {model.sizeLabel}
                    {model.optional ? "· optional" : ""}
                  </p>
                  {#if model.status === "downloading"}<progress
                      class="w-full h-1.5"
                      value={model.bytesReceived ?? 0}
                      max={model.totalBytes || 1}
                    ></progress>
                    <p class="text-[10px] text-muted-foreground">
                      {size(model.bytesReceived ?? 0)} / {size(
                        model.totalBytes || 0,
                      )} · {size(model.speed ?? 0)}/s
                    </p>{/if}{#if model.error}<p class="text-xs text-red-400">
                      {model.error}
                    </p>{/if}
                </div>
                {#if model.status === "downloading"}<button
                    class={outline}
                    disabled={busy}
                    onclick={() => modelAction("cancel", model.id)}
                    >Cancel</button
                  >{:else if model.status === "ready"}<button
                    aria-label={`Delete ${model.label}`}
                    class="p-1.5 text-muted-foreground hover:text-red-400"
                    disabled={busy}
                    onclick={() => modelAction("delete", model.id)}
                    ><Trash2 class="w-3.5 h-3.5" /></button
                  >{:else}<button
                    class={outline}
                    disabled={busy}
                    onclick={() => modelAction("download", model.id)}
                    ><Download class="w-3 h-3" />Download</button
                  >{/if}
              </div>{/each}
          </div>
        </div>
        <div class="pt-2 border-t border-border space-y-2">
          <div class="flex items-center gap-2">
            <Package class="w-4 h-4 text-muted-foreground ml-3" /><button
              class="flex-1 flex items-center justify-between text-left px-0 py-2"
              onclick={() => (diffusionOpen = !diffusionOpen)}
              ><span
                ><span class="block text-xs font-medium"
                  >{config.diffusion_model ||
                    diffusion.current ||
                    diffusion.default ||
                    "Diffusion model"}</span
                ><span class="block text-[10px] text-muted-foreground"
                  >Base model</span
                ></span
              ><ChevronDown class="w-4 h-4 text-muted-foreground" /></button
            ><label class={outline}
              ><Plus class="w-3.5 h-3.5" />Add<input
                class="sr-only"
                type="file"
                accept=".safetensors"
                aria-label="Upload diffusion model"
                disabled={$uploads.active}
                onchange={(e) => {
                  void upload(e.currentTarget.files?.[0], "diffusion");
                  e.currentTarget.value = "";
                }}
              /></label
            >
          </div>
          {#if diffusionOpen}<select
              class={inputClass}
              aria-label="Active diffusion model"
              value={config.diffusion_model ||
                diffusion.current ||
                diffusion.default ||
                ""}
              onchange={(e) => save({ diffusion_model: e.currentTarget.value })}
              >{#each [...new Set([diffusion.default, ...diffusion.models, config.diffusion_model].filter(Boolean))] as name}<option
                  value={name}>{name}</option
                >{/each}</select
            >{/if}
        </div>
        <button class="{outline} w-full" onclick={refresh}
          ><RefreshCw class="w-3.5 h-3.5" />Check again</button
        >
      </div>
    {:else if tab === "Appearance"}<div class="space-y-4 py-2">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <Sun class="w-4 h-4 text-amber-400" /><span
              class="text-sm font-medium">Theme</span
            >
          </div>
          <div class="grid grid-cols-2 gap-2">
            {#each [{ id: "dark-gray", name: "Gray" }, { id: "dark", name: "Black" }] as choice}<button
                class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all {theme ===
                choice.id
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border/80'}"
                onclick={() => changeTheme(choice.id)}
                ><Moon class="w-4 h-4" />{choice.name}</button
              >{/each}
          </div>
        </div>
        <div
          class="flex items-center justify-between pt-2 border-t border-border"
        >
          <div>
            <span class="text-xs text-muted-foreground">Completion sound</span>
            <p class="text-[10px] text-muted-foreground/60">
              Short signal at the end of generation
            </p>
          </div>
          {@render switchControl("Completion sound", config.sound_on, () =>
            save({ sound_on: !config.sound_on }),
          )}
        </div>
      </div>
    {:else if tab === "Optimization"}<div class="space-y-5 py-2">
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Cpu class="w-4 h-4 text-amber-400" />GPU memory (ComfyUI)
          </div>
          <p class="text-[11px] text-muted-foreground/70 -mt-1.5">
            Reserve and dynamic management of VRAM ComfyUI. Applies on restart.
          </p>
          <div class="space-y-1.5 pt-2 border-t border-border">
            <div class="flex justify-between text-xs">
              <label class="text-muted-foreground" for="vram-reserve"
                >VRAM Reserve</label
              ><span class="font-mono">{config.reserve_gb} GB</span>
            </div>
            <input
              id="vram-reserve"
              aria-label="Reserved VRAM (GB)"
              type="range"
              min="1"
              max="8"
              step="0.5"
              bind:value={config.reserve_gb}
              class="w-full h-2 cursor-pointer accent-amber-400"
            />
            <div class="relative h-3 text-[9px] text-muted-foreground/50">
              <span class="absolute left-0">1 GB</span><span
                class="absolute left-[43%]">4 GB</span
              ><span class="absolute right-0">8 GB</span>
            </div>
          </div>
          <div
            class="flex items-center justify-between pt-2 border-t border-border"
          >
            <div>
              <span class="text-xs text-muted-foreground">Dynamic VRAM</span>
              <p class="text-[10px] text-muted-foreground/60">
                Dynamic VRAM management ComfyUI
              </p>
            </div>
            {@render switchControl(
              "Dynamic VRAM",
              config.dynamic_vram,
              () => (config.dynamic_vram = !config.dynamic_vram),
            )}
          </div>
          <p class="text-[10px] text-muted-foreground/60">
            Applies when ComfyUI is restarted (Colab: rerun Step 7).
          </p>
        </div>
        <div class="space-y-3 pt-4 border-t border-border">
          <div class="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal class="w-4 h-4 text-emerald-400" />Generation
            Optimization (VRAM)
          </div>
          <p class="text-[11px] text-muted-foreground/70 -mt-1.5">
            Memory saving modes for generation nodes. Applies to all new
            generations immediately - without restarting ComfyUI.
          </p>
          {#each [{ key: "lowVramAttention" as const, label: "Low VRAM Attention", hint: "Attention in chunks of 4 heads - saves video memory" }, { key: "chunkFeedForward" as const, label: "Chunk FeedForward", hint: "FeedForward in chunks on long sequences - saves VRAM" }] as item}<div
              class="space-y-1.5 pt-2 border-t border-border"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-xs text-muted-foreground">{item.label}</span
                  >
                  <p class="text-[10px] text-muted-foreground/60">
                    {item.hint}
                  </p>
                </div>
                {@render switchControl(item.label, video[item.key], () =>
                  useGenStore
                    .getState()
                    .patchVideo({ [item.key]: !video[item.key] }),
                )}
              </div>
            </div>{/each}{#if video.chunkFeedForward}<div
              class="space-y-3 pl-3 border-l border-border/60"
            >
              <SettingSlider
                label="Chunk FF: number of chunks"
                value={video.chunkFFChunks}
                min={1}
                max={8}
                onchange={(n) =>
                  useGenStore.getState().patchVideo({ chunkFFChunks: n })}
              /><SettingSlider
                label="Chunk FF: length threshold"
                value={video.chunkFFThreshold}
                min={1024}
                max={16384}
                step={512}
                onchange={(n) =>
                  useGenStore.getState().patchVideo({ chunkFFThreshold: n })}
              />
            </div>{/if}
        </div>
        <button
          class="{outline} w-full"
          aria-label="Save optimization"
          disabled={busy}
          onclick={() =>
            save({
              reserve_gb: config.reserve_gb,
              dynamic_vram: config.dynamic_vram,
            })}>{busy ? "Saving..." : "Save"}</button
        >
      </div>
    {:else if tab === "ComfyUI"}<div class="space-y-4 py-2">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Server class="w-4 h-4" />ComfyUI
        </div>
        <p class="text-[11px] text-muted-foreground/70 -mt-2">
          Information about running ComfyUI and devices.
        </p>
        <div class="space-y-2 pt-2 border-t border-border text-sm">
          {#each [{ label: "Status:", value: stats ? "Connected" : "Not available" }, { label: "ComfyUI version:", value: stats?.system?.comfyui_version || "—" }, { label: "Python:", value: stats?.system?.python_version || "—" }, { label: "Built-in Python:", value: stats?.system?.embedded_python ? "yes" : "no" }, { label: "GPU:", value: stats?.devices?.[0]?.name || "—" }] as row}<div
              class="flex justify-between"
            >
              <span class="text-muted-foreground">{row.label}</span><span
                >{row.value}</span
              >
            </div>{/each}
        </div>
        <button class="{outline} w-full" onclick={refresh}
          ><RefreshCw class="w-3.5 h-3.5" />Check again</button
        >
        <div class="space-y-2 pt-3 border-t border-border">
          <label class="block text-xs text-muted-foreground" for="comfy-dir"
            >ComfyUI installation folder</label
          ><input
            id="comfy-dir"
            class={inputClass}
            bind:value={config.comfy_dir}
          /><button
            class={outline}
            disabled={busy}
            onclick={() => save({ comfy_dir: config.comfy_dir })}
            >Save folder</button
          >
        </div>
      </div>
    {:else if tab === "Links"}<div class="space-y-4 py-2">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Link class="w-4 h-4" />Manual download links
        </div>
        <p class="text-[11px] text-muted-foreground/70">
          ComfyUI: {config.comfy_dir || "ComfyUI"}/models
        </p>
        {#each MODELS as model}<div
            class="space-y-1.5 border-t border-border pt-3"
          >
            <div class="flex justify-between text-xs">
              <span class="font-medium">{model.label}</span><span
                class="text-muted-foreground">{model.sizeLabel}</span
              >
            </div>
            <p class="font-mono text-[10px] break-all text-muted-foreground">
              {config.comfy_dir || "ComfyUI"}/models/{model.relPath}
            </p>
            <div class="flex gap-2">
              <a
                class={outline}
                href={model.url}
                target="_blank"
                rel="noreferrer"><Download class="w-3.5 h-3.5" />Download</a
              ><button
                class={outline}
                onclick={async () => {
                  await navigator.clipboard.writeText(model.url);
                  toast.success("Link copied");
                }}>Copy link</button
              ><button
                class={outline}
                onclick={async () => {
                  await navigator.clipboard.writeText(
                    `${config.comfy_dir || "ComfyUI"}/models/${model.relPath}`,
                  );
                  toast.success("Path copied");
                }}>Copy path</button
              >
            </div>
          </div>{/each}
      </div>
    {:else if tab === "Reset"}<div class="space-y-4 py-2">
        <div class="flex items-center gap-2 text-sm font-medium text-red-400">
          <AlertTriangle class="w-4 h-4" />Danger zone
        </div>
        <p class="text-[11px] text-muted-foreground/70 -mt-2">
          Irreversible operations. Proceed with caution.
        </p>
        {#each [{ name: "Reset settings", action: "Reset settings", desc: "All parameters (VRAM, model selection, generation, resolution, steps, sound) will return to default values." }, { name: "Clear cache", action: "Clear input cache", desc: "Delete uploaded references and input files." }, { name: "Delete content", action: "Delete generated content", desc: "Delete generated videos, prompt history and duration records." }, { name: "Factory reset (all)", action: "Factory reset", desc: "Reset settings and LoRAs, delete input/output files and clear prompt history." }] as item}<div
            class="space-y-1.5"
          >
            <button
              class="{outline} w-full text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              disabled={busy}
              onclick={() => ask(item.action)}
              ><RotateCcw class="w-3.5 h-3.5" />{item.name}</button
            >
            <p class="text-[11px] text-muted-foreground/60 pl-1">{item.desc}</p>
          </div>{/each}
      </div>{/if}
    {#if $uploads.active}<div
        class="space-y-2 border-t border-border pt-3 text-xs"
      >
        <strong>Uploading {$uploads.fileName}</strong><progress
          class="w-full"
          max="100"
          value={$uploads.progress}
        ></progress><span>{$uploads.progress}%</span>
      </div>{/if}
  </div>
</Modal>
<Modal bind:open={confirmOpen} title={`${confirmation}?`}
  ><p class="text-sm text-muted-foreground">
    This action changes saved settings or permanently deletes files. It cannot
    be undone.
  </p>
  <div class="flex justify-end gap-2">
    <button
      class={outline}
      disabled={busy}
      onclick={() => (confirmOpen = false)}>Cancel</button
    ><button class="{outline} text-red-400" disabled={busy} onclick={reset}
      >{confirmation}</button
    >
  </div></Modal
>
