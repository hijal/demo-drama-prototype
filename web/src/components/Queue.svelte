<script lang="ts">
  import {
    Image,
    Music,
    Volume2,
    Video,
    X,
    XCircle,
    Trash2,
    Clock,
    Loader,
    CheckCircle,
    AlertCircle,
    Download,
  } from "lucide-svelte";
  import { readable } from "../lib/store";
  import { useGenQueue, TYPE_ACCENT, TYPE_LABEL, type QueueItem } from "@/lib/gen-queue-store";
  import { useGenProgress } from "@/lib/gen-progress-store";
  import { api, message } from "../lib/api";
  import { toast } from "@/lib/notifications";
  const queue = readable(useGenQueue);
  let expanded = $state(false);
  const TYPE_ICON = { image: Image, music: Music, sound: Volume2, video: Video };
  const STATUS_LABEL: Record<string, string> = {
    submitting: "Submitting…",
    queued: "Queued",
    running: "Generating…",
    done: "Done",
    cancelled: "Canceled",
    error: "Error",
  };
  /** Detect a status message that indicates a model download. */
  const isDownloading = (m: string | null | undefined) => !!m && /download|скачив|загружа/i.test(m);
  const isActive = (s: string) => s === "submitting" || s === "queued" || s === "running";

  const items = $derived($queue.items);
  const activeCount = $derived(items.filter((it) => isActive(it.status)).length);
  const currentRunning = $derived(items.find((it) => isActive(it.status)));
  const accent = $derived(currentRunning ? TYPE_ACCENT[currentRunning.type] : "#8B5CF6");
  const progressPercent = $derived(
    currentRunning && currentRunning.progressMax > 0
      ? Math.round((currentRunning.progressValue / currentRunning.progressMax) * 100)
      : 0,
  );

  async function cancelQueueItem(item: QueueItem) {
    try {
      // A submitting request without a prompt ID is cancelled by the shared controller.
      if (!item.promptId) {
        window.dispatchEvent(new CustomEvent("h3:cancel-all"));
        return;
      }
      await api("/api/comfy/cancel", { prompt_id: item.promptId });
      useGenQueue.getState().setStatus(item.id, "cancelled");
      if (useGenProgress.getState().video.promptId === item.promptId) useGenProgress.getState().resetVideoGen();
    } catch (e) {
      toast.error(message(e));
    }
  }
</script>

{#if items.length}<aside
    aria-label="Generation queue"
    class="fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end gap-2 pointer-events-none"
  >
    <div class="pointer-events-auto">
      <button
        aria-label="Queue"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
        class="flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-xl border backdrop-blur-xl transition-colors bg-[var(--surface-1)]/90 border-border hover:border-border shadow-lg shadow-black/30"
        style:border-color={activeCount > 0 ? `${accent}40` : undefined}
      >
        <div class="relative">
          {#if currentRunning}<div class="absolute inset-0 rounded-full queue-pulse" style:background-color={accent}></div>{/if}
          <div class="relative w-2 h-2 rounded-full" style:background-color={activeCount > 0 ? accent : "#555"}></div>
        </div>
        <div class="flex flex-col items-start min-w-0">
          <span class="text-xs font-medium text-foreground leading-tight"
            >{activeCount > 0
              ? currentRunning
                ? `${TYPE_LABEL[currentRunning.type]}: ${STATUS_LABEL[currentRunning.status]}`
                : `${activeCount} queued`
              : "The queue is empty"}</span
          >
          {#if currentRunning?.message}<span class="text-[10px] text-blue-400 leading-tight max-w-[180px] truncate"
              >{currentRunning.message}</span
            >{/if}
          {#if currentRunning && currentRunning.progressMax > 0}<span
              class="text-[10px] text-muted-foreground font-mono leading-tight"
              >{progressPercent}% · {currentRunning.progressValue}/{currentRunning.progressMax}</span
            >{/if}
        </div>
        {#if activeCount > 0}<div
            class="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[10px] font-bold text-white"
            style:background-color={accent}
          >
            {activeCount}
          </div>{/if}
        <svg
          class="w-3.5 h-3.5 text-muted-foreground transition-transform {expanded ? '' : 'rotate-180'}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
        >
      </button>
    </div>

    {#if expanded}<div
        class="pointer-events-auto w-[300px] max-h-[400px] flex flex-col rounded-xl border bg-[var(--surface-1)]/95 backdrop-blur-xl border-border shadow-xl shadow-black/40 overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span class="text-xs font-semibold text-foreground">Generation queue</span>
          <div class="flex items-center gap-1">
            {#if items.some((it) => it.status === "done" || it.status === "error" || it.status === "cancelled")}<button
                onclick={() => useGenQueue.getState().clearFinished()}
                class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] transition-colors"
                title="Clear completed"
                aria-label="Clear completed"><Trash2 class="w-3 h-3" /></button
              >{/if}
            <button
              onclick={() => (expanded = false)}
              class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] transition-colors"
              aria-label="Close queue"><X class="w-3 h-3" /></button
            >
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          {#each [...items].reverse() as item (item.id)}
            {@const Icon = TYPE_ICON[item.type]}
            {@const itemAccent = TYPE_ACCENT[item.type]}
            {@const active = isActive(item.status)}
            {@const itemProgress = item.progressMax > 0 ? Math.round((item.progressValue / item.progressMax) * 100) : 0}
            <div
              class="flex items-center gap-2 p-2 rounded-lg transition-colors group {active
                ? 'bg-[var(--surface-3)]'
                : 'bg-[var(--surface-2)]/60'}"
            >
              <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style:background-color={`${itemAccent}15`}>
                <Icon class="w-3.5 h-3.5" style={`color:${itemAccent}`} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  {#if item.status === "submitting" || item.status === "queued"}<Clock class="w-3 h-3" style={`color:${itemAccent}`} />{:else if item.status === "running"}{#if isDownloading(item.message)}<Download
                        class="w-3 h-3 animate-pulse"
                        style={`color:${itemAccent}`}
                      />{:else}<Loader class="w-3 h-3 animate-spin" style={`color:${itemAccent}`} />{/if}{:else if item.status === "done"}<CheckCircle
                      class="w-3 h-3 text-emerald-400"
                    />{:else if item.status === "cancelled"}<X class="w-3 h-3 text-muted-foreground" />{:else if item.status === "error"}<AlertCircle
                      class="w-3 h-3 text-red-400"
                    />{/if}
                  <span class="text-[11px] font-medium text-foreground truncate">{item.label}</span>
                </div>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-[10px] text-muted-foreground"
                    >{isDownloading(item.message) ? "Downloading the model..." : STATUS_LABEL[item.status]}</span
                  >
                  {#if active && item.progressMax > 0}<span class="text-[10px] text-muted-foreground font-mono">{itemProgress}%</span>{/if}
                </div>
                {#if item.message && active}<p
                    class="text-[10px] mt-0.5 truncate {isDownloading(item.message) ? 'text-cyan-400' : 'text-blue-400'}"
                  >
                    {item.message}
                  </p>{/if}
                {#if item.error && !active}<p class="text-[10px] mt-0.5 truncate text-red-400" title={item.error}>
                    {item.error}
                  </p>{/if}
                {#if active}<div class="mt-1 h-1 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    {#if item.progressMax > 0}<div
                        class="h-full rounded-full"
                        style:background-color={itemAccent}
                        style:width={`${itemProgress}%`}
                        style:transition="width 0.3s"
                      ></div>{:else}<div class="h-full rounded-full queue-indeterminate" style:background-color={itemAccent}></div>{/if}
                  </div>{/if}
              </div>
              {#if active}<button
                  onclick={() => cancelQueueItem(item)}
                  class="p-1 rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                  title="Cancel"
                  aria-label="Cancel task"><XCircle class="w-3.5 h-3.5" /></button
                >{:else}<button
                  onclick={() => useGenQueue.getState().remove(item.id)}
                  class="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-[var(--surface-3)] transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Remove task"><X class="w-3 h-3" /></button
                >{/if}
            </div>
          {/each}
        </div>
        {#if activeCount > 0}<div class="px-3 py-2 border-t border-border">
            <p class="text-[10px] text-muted-foreground text-center">
              {activeCount} {activeCount === 1 ? "task" : "tasks"} queued
            </p>
          </div>{/if}
      </div>{/if}
  </aside>{/if}

<style>
  /* framer-motion animations of the Next.js queue indicator */
  .queue-pulse {
    animation: queue-pulse 2s ease-in-out infinite;
  }
  @keyframes queue-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.4;
    }
    50% {
      transform: scale(1.6);
      opacity: 0;
    }
  }
  .queue-indeterminate {
    animation: queue-indeterminate 3s ease-in-out infinite;
  }
  @keyframes queue-indeterminate {
    0% {
      width: 0%;
    }
    33% {
      width: 60%;
    }
    66% {
      width: 40%;
    }
    100% {
      width: 70%;
    }
  }
</style>
