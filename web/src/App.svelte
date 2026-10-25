<script lang="ts">
  import { onMount } from "svelte";
  import Generate from "./components/Generate.svelte";
  import Gallery from "./components/Gallery.svelte";
  import Settings from "./components/Settings.svelte";
  import Queue from "./components/Queue.svelte";
  import Pipeline from "./components/Pipeline.svelte";
  import { createVideoGeneration } from "@/lib/video-generation";
  import type { Notice } from "@/lib/notifications";
  import { startGallery } from "./lib/gallery";
  import { api, message } from "./lib/api";
  import { toast } from "@/lib/notifications";
  let tab = $state<"generate" | "gallery" | "pipeline">("generate");
  let manual = $state(true);
  let capabilitiesReady = $state(false);
  let settings = $state(false);
  let connected = $state(false);
  let stats = $state<any>(null);
  let missing = $state(0);
  let notices = $state<Notice[]>([]);
  let controller = $state<ReturnType<typeof createVideoGeneration>>();
  onMount(() => {
    let stopGallery = () => {};
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const notice = (event: Event) => {
      const item = (event as CustomEvent<Notice>).detail;
      notices = [...notices.slice(-3), item];
      const t = setTimeout(() => {
        notices = notices.filter((n) => n.id !== item.id);
        timers.delete(t);
      }, item.duration ?? 7000);
      timers.add(t);
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
          if (!disposed) connected = !!status.gpu?.length;
        } catch {}
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
            (m: any) => !m.optional && m.status !== "ready",
          ).length;
      }
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
          tab = "pipeline";
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
      timers.forEach(clearTimeout);
      stopGallery();
      controller?.dispose();
      window.removeEventListener("h3:notice", notice);
      window.removeEventListener("h3:goto-generate", navigate);
      window.removeEventListener("h3:cancel-all", cancel);
    };
  });
  async function freeMemory() {
    try {
      await api("/api/comfy/free", {});
      toast.success("GPU memory released");
    } catch (e) {
      toast.error(message(e));
    }
  }
</script>

<div class="studio">
  <aside class="sidebar">
    <a
      class="brand"
      href="#generate"
      onclick={() => (tab = manual ? "generate" : "pipeline")}
      ><span class="brand-mark">M</span><span
        >MiniMax <strong>H3</strong><small>CREATIVE STUDIO</small></span
      ></a
    >
    <div class="nav-caption">WORKSPACE</div>
    <nav aria-label="Main navigation">
      <button
        aria-label="Projects"
        class:active={tab === "pipeline"}
        onclick={() => (tab = "pipeline")}
        ><span>▤</span><span class="pipeline-nav-label">Projects</span></button
      >
      {#if capabilitiesReady && manual}<button
          aria-label="Generate"
          class:active={tab === "generate"}
          onclick={() => (tab = "generate")}><span>✧</span> Generate</button
        ><button
          aria-label="Gallery"
          class:active={tab === "gallery"}
          onclick={() => (tab = "gallery")}><span>▦</span> Gallery</button
        >
      {/if}
    </nav>
    <div class="sidebar-bottom">
      <div class="connection">
        <span class:online={connected} class="status-dot"></span>{connected
          ? manual
            ? "ComfyUI connected"
            : "Colab online"
          : manual
            ? "ComfyUI offline"
            : "Colab offline"}
      </div>
      {#if stats}<div class="system-stats">
          <small>CPU {Number(stats.cpu?.percent ?? 0).toFixed(0)}%</small><small
            >RAM {Number(stats.ram?.used_gb ?? 0).toFixed(1)} / {Number(
              stats.ram?.total_gb ?? 0,
            ).toFixed(0)} GB</small
          ><small
            >VRAM {Number(stats.gpu?.vram_used_gb ?? 0).toFixed(1)} / {Number(
              stats.gpu?.vram_total_gb ?? 0,
            ).toFixed(0)} GB</small
          ><button onclick={freeMemory}>Free GPU memory</button>
        </div>{/if}
      {#if capabilitiesReady && manual}<button
          aria-label="Settings"
          class="settings-nav"
          onclick={() => (settings = true)}>⚙ Settings</button
        >{/if}<small class="version">MiniMax H3 · Video + Audio</small>
    </div>
  </aside>
  <main>
    {#if missing > 0}<div class="warning-banner">
        {missing} required model files need attention.
        <button onclick={() => (settings = true)}>Open models</button>
      </div>{/if}
    {#if tab === "pipeline"}<div class="view"><Pipeline /></div>{/if}
    {#if capabilitiesReady && manual}<div
        class="view"
        hidden={tab !== "generate"}
      >
        <Generate {controller} />
      </div>
      <div class="view" hidden={tab !== "gallery"}><Gallery /></div>{/if}
  </main>
  {#if capabilitiesReady && manual}<Queue /><Settings
      bind:open={settings}
    />{/if}
  <div class="notices" aria-live="polite">
    {#each notices as notice (notice.id)}<div
        class="notice"
        class:error={notice.kind === "error"}
        role={notice.kind === "error" ? "alert" : "status"}
      >
        <strong>{notice.text}</strong>{#if notice.description}<p>
            {notice.description}
          </p>{/if}<button
          aria-label="Dismiss notification"
          onclick={() => (notices = notices.filter((n) => n.id !== notice.id))}
          >✕</button
        >
      </div>{/each}
  </div>
</div>
