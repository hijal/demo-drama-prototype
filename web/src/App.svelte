<script lang="ts">
  import { onMount } from "svelte";
  import Generate from "./components/Generate.svelte";
  import Gallery from "./components/Gallery.svelte";
  import Settings from "./components/Settings.svelte";
  import Queue from "./components/Queue.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import Pipeline from "./components/Pipeline.svelte";
  import FormatScript from "./components/FormatScript.svelte";
  import { createVideoGeneration } from "@/lib/video-generation";
  import type { Notice } from "@/lib/notifications";
  import { startGallery } from "./lib/gallery";
  import { api, message } from "./lib/api";
  import { toast } from "@/lib/notifications";
  import { Toaster, toast as sonner } from "svelte-sonner";
  import { AlertTriangle, Download, X } from "lucide-svelte";
  let tab = $state<"generate" | "gallery" | "pipeline" | "format">("generate");
  let manual = $state(true);
  let capabilitiesReady = $state(false);
  let settings = $state(false);
  let connected = $state(false);
  let checking = $state(true);
  let stats = $state<any>(null);
  let missing = $state<{ label: string }[]>([]);
  let bannerDismissed = $state(false);
  let controller = $state<ReturnType<typeof createVideoGeneration>>();
  onMount(() => {
    let stopGallery = () => {};
    const notice = (event: Event) => {
      const item = (event as CustomEvent<Notice>).detail;
      const show =
        item.kind === "error" || item.kind === "warning" || item.kind === "info" || item.kind === "success"
          ? sonner[item.kind]
          : sonner;
      show(item.text, {
        description: item.description,
        duration: item.duration,
        action: item.action,
      });
    };
    const navigate = () => (tab = "generate");
    const cancel = () => void controller?.interrupt();
    let disposed = false;
    let polling = false;
    async function poll() {
      if (polling || !capabilitiesReady) return;
      polling = true;
      if (!manual) {
        try {
          const status = await api("/api/status");
          if (!disposed) {
            connected = !!status.gpu?.length;
            // The Colab GPU worker reports system stats with its heartbeat.
            stats = status.gpu?.[0]?.info?.stats ?? null;
          }
        } catch {}
        checking = false;
        polling = false;
        return;
      }
      const results = await Promise.allSettled([
        api("/api/comfy/health"),
        api("/api/comfy/system-stats"),
        api("/api/models/status"),
      ]);
      if (!disposed) {
        connected = results[0].status === "fulfilled";
        if (results[1].status === "fulfilled") stats = results[1].value;
        if (results[2].status === "fulfilled")
          missing = (results[2].value.models ?? []).filter(
            (m: any) => !m.optional && m.status !== "ready" && m.status !== "downloading",
          );
      }
      checking = false;
      polling = false;
    }
    window.addEventListener("h3:notice", notice);
    window.addEventListener("h3:goto-generate", navigate);
    window.addEventListener("h3:cancel-all", cancel);
    void api("/api/capabilities")
      .catch(() => ({ manual: true }))
      .then((capabilities) => {
        if (disposed) return;
        if (capabilities.manual === false) {
          manual = false;
        } else {
          controller = createVideoGeneration();
          stopGallery = startGallery();
        }
        capabilitiesReady = true;
        void poll();
      });
    const interval = setInterval(poll, 5000);
    return () => {
      disposed = true;
      clearInterval(interval);
      stopGallery();
      controller?.dispose();
      window.removeEventListener("h3:notice", notice);
      window.removeEventListener("h3:goto-generate", navigate);
      window.removeEventListener("h3:cancel-all", cancel);
    };
  });
  async function freeMemory() {
    try {
      await api("/api/comfy/free", { weights: "high" });
      toast.success("VRAM cache unloaded");
    } catch (e) {
      toast.error(message(e) || "Failed to unload cache");
    }
  }
</script>

<div class="h-screen w-screen flex overflow-hidden">
  <Sidebar
    {tab}
    onnavigate={(next) => (tab = next)}
    onfree={freeMemory}
    onsettings={() => (settings = true)}
    {connected}
    {checking}
    {manual}
    {stats}
  />
  <main class="flex-1 min-w-0 relative flex flex-col">
    {#if missing.length > 0 && !bannerDismissed}{@const label =
        missing.length === 1
          ? `Model not downloaded: ${missing[0].label}`
          : missing.length === 2
            ? `Models not downloaded: ${missing.map((m) => m.label).join(", ")}`
            : `No models downloaded: ${missing.length}. Generation will not work correctly.`}<div
        class="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0"
      >
        <AlertTriangle class="w-4 h-4 text-amber-400 shrink-0" />
        <span class="text-xs text-amber-300 flex-1 min-w-0 truncate" title={label}>{label}</span>
        <button
          class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all border shadow-xs bg-background dark:bg-input/30 h-7 px-3 text-[11px] text-amber-300 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-200 shrink-0"
          onclick={() => (settings = true)}
          ><Download class="w-3 h-3" />Download in settings</button
        >
        <button
          type="button"
          onclick={() => (bannerDismissed = true)}
          class="p-1 rounded hover:bg-amber-500/20 text-amber-400/70 hover:text-amber-300 shrink-0"
          title="Hide"><X class="w-3.5 h-3.5" /></button
        >
      </div>{/if}
    <div class="flex-1 min-h-0 relative">
      {#if capabilitiesReady}
        <div
          class="h-full flex"
          style:display={tab === "generate" ? "flex" : "none"}
        >
          <Generate
            {controller}
            enabled={manual}
            visible={tab === "generate"}
          />
        </div>
        <div
          class="h-full flex"
          style:display={tab === "gallery" ? "flex" : "none"}
        >
          <Gallery />
        </div>
        {#if tab === "pipeline"}<div
            class="h-full overflow-auto pipeline-shell"
          >
            <Pipeline />
          </div>{/if}
        {#if tab === "format"}<FormatScript />{/if}
      {/if}
    </div>
    {#if manual}<Queue />{/if}
  </main>
  <Settings bind:open={settings} enabled={manual} />
  <Toaster
    position="bottom-right"
    theme="dark"
    class="toaster group"
    style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border);"
  />
</div>
