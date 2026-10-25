<script lang="ts">
  import { onMount } from "svelte";
  import Generate from "./components/Generate.svelte";
  import Gallery from "./components/Gallery.svelte";
  import Settings from "./components/Settings.svelte";
  import Queue from "./components/Queue.svelte";
  import Sidebar from "./components/Sidebar.svelte";
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
  let checking = $state(true);
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
            (m: any) => !m.optional && m.status !== "ready",
          ).length;
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
      await api("/api/comfy/free", { weights: "high" });
      toast.success("GPU memory released");
    } catch (e) {
      toast.error(message(e));
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
    {#if missing > 0}<div
        class="px-4 py-2 text-xs text-amber-400 bg-amber-500/10 border-b border-amber-500/20"
      >
        {missing} required model files need attention.
        <button class="underline" onclick={() => (settings = true)}
          >Open models</button
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
      {/if}
    </div>
    {#if manual}<Queue />{/if}
  </main>
  <Settings bind:open={settings} enabled={manual} />
  <div
    class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm"
    aria-live="polite"
  >
    {#each notices as notice (notice.id)}<div
        class="rounded-lg border border-border bg-[var(--surface-3)] px-4 py-3 shadow-lg text-sm {notice.kind ===
        'error'
          ? 'text-red-400'
          : 'text-foreground'}"
        role={notice.kind === "error" ? "alert" : "status"}
      >
        <strong>{notice.text}</strong>{#if notice.description}<p
            class="text-xs text-muted-foreground mt-1"
          >
            {notice.description}
          </p>{/if}<button
          class="ml-3 text-muted-foreground"
          aria-label="Dismiss notification"
          onclick={() => (notices = notices.filter((n) => n.id !== notice.id))}
          >×</button
        >
      </div>{/each}
  </div>
</div>
