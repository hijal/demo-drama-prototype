<script lang="ts">
  import {
    Video,
    ChevronDown,
    X,
    Trash2,
    Clock,
    Loader,
    CheckCircle,
    AlertCircle,
  } from "lucide-svelte";
  import { readable } from "../lib/store";
  import { useGenQueue } from "@/lib/gen-queue-store";
  import { useGenProgress } from "@/lib/gen-progress-store";
  import { api, message } from "../lib/api";
  import { toast } from "@/lib/notifications";
  const queue = readable(useGenQueue);
  let open = $state(false);
  const active = $derived(
    $queue.items.filter((i) =>
      ["submitting", "queued", "running"].includes(i.status),
    ).length,
  );
  async function cancel(id: string, promptId: string | null) {
    try {
      // A submitting request without a prompt ID is cancelled by the shared controller.
      if (!promptId) {
        window.dispatchEvent(new CustomEvent("h3:cancel-all"));
        return;
      }
      await api("/api/comfy/cancel", { prompt_id: promptId });
      useGenQueue.getState().setStatus(id, "cancelled");
      if (useGenProgress.getState().video.promptId === promptId)
        useGenProgress.getState().resetVideoGen();
    } catch (e) {
      toast.error(message(e));
    }
  }

  const current = $derived(
    $queue.items.find((item) =>
      ["submitting", "queued", "running"].includes(item.status),
    ),
  );
  const labels: Record<string, string> = {
    submitting: "Submitting…",
    queued: "Queued",
    running: "Generating…",
    done: "Done",
    cancelled: "Canceled",
    error: "Error",
  };
</script>

{#if $queue.items.length}<aside
    aria-label="Generation queue"
    class="fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end gap-2 pointer-events-none"
  >
    <button
      aria-label="Queue"
      aria-expanded={open}
      onclick={() => (open = !open)}
      class="pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-xl border backdrop-blur-xl transition-colors bg-[var(--surface-1)]/90 border-border shadow-lg shadow-black/30"
      style:border-color={active ? "#06b6d440" : undefined}
      ><span
        class="relative w-2 h-2 rounded-full {active
          ? 'bg-cyan-500'
          : 'bg-[#555]'}"
      ></span><span class="flex flex-col items-start min-w-0"
        ><span class="text-xs font-medium text-foreground leading-tight"
          >{current
            ? `Video: ${labels[current.status]}`
            : "The queue is empty"}</span
        >{#if current?.message}<span
            class="text-[10px] text-blue-400 leading-tight max-w-[180px] truncate"
            >{current.message}</span
          >{/if}{#if current && current.progressMax > 0}<span
            class="text-[10px] text-muted-foreground font-mono leading-tight"
            >{Math.round((current.progressValue / current.progressMax) * 100)}%
            · {current.progressValue}/{current.progressMax}</span
          >{/if}</span
      >{#if active}<span
          class="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[10px] font-bold text-white bg-cyan-500"
          >{active}</span
        >{/if}<ChevronDown
        class="w-3.5 h-3.5 text-muted-foreground transition-transform {open
          ? ''
          : 'rotate-180'}"
      /></button
    >
    {#if open}<div
        class="pointer-events-auto w-[300px] max-h-[400px] flex flex-col rounded-xl border bg-[var(--surface-1)]/95 backdrop-blur-xl border-border shadow-xl shadow-black/40 overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-3 py-2.5 border-b border-border"
        >
          <span class="text-xs font-semibold text-foreground"
            >Generation queue</span
          >
          <div class="flex gap-1">
            <button
              class="p-1 rounded-md text-muted-foreground hover:bg-[var(--surface-3)]"
              aria-label="Clear completed"
              onclick={() => useGenQueue.getState().clearFinished()}
              ><Trash2 class="w-3 h-3" /></button
            ><button
              class="p-1 rounded-md text-muted-foreground"
              aria-label="Close queue"
              onclick={() => (open = false)}><X class="w-3 h-3" /></button
            >
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          {#each [...$queue.items].reverse() as item (item.id)}{@const running =
              ["submitting", "queued", "running"].includes(item.status)}
            <div
              class="flex items-center gap-2 p-2 rounded-lg transition-colors group {running
                ? 'bg-[var(--surface-3)]'
                : 'bg-[var(--surface-2)]/60'}"
            >
              <div
                class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-cyan-500/10"
              >
                <Video class="w-3.5 h-3.5 text-cyan-500" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  {#if item.status === "done"}<CheckCircle
                      class="w-3 h-3 text-emerald-400"
                    />{:else if item.status === "error"}<AlertCircle
                      class="w-3 h-3 text-red-400"
                    />{:else if item.status === "running"}<Loader
                      class="w-3 h-3 text-cyan-500 animate-spin"
                    />{:else}<Clock class="w-3 h-3 text-cyan-500" />{/if}<span
                    class="text-[11px] font-medium text-foreground truncate"
                    >{item.label || "Untitled video"}</span
                  >
                </div>
                <span class="text-[10px] text-muted-foreground"
                  >{labels[item.status]}</span
                >{#if item.message && running}<p
                    class="text-[10px] mt-0.5 truncate text-blue-400"
                  >
                    {item.message}
                  </p>{/if}{#if item.error}<p
                    class="text-[10px] mt-0.5 truncate text-red-400"
                    title={item.error}
                  >
                    {item.error}
                  </p>{/if}{#if running}<div
                    class="mt-1 h-1 bg-[var(--surface-3)] rounded-full overflow-hidden"
                  >
                    <div
                      class="h-full rounded-full bg-cyan-500"
                      style:width={`${item.progressMax > 0 ? (item.progressValue / item.progressMax) * 100 : 25}%`}
                    ></div>
                  </div>{/if}
              </div>
              {#if running}<button
                  aria-label="Cancel task"
                  class="p-1 rounded-md text-muted-foreground hover:text-red-400"
                  onclick={() => cancel(item.id, item.promptId)}
                  ><X class="w-3 h-3" /></button
                >{:else}<button
                  aria-label="Remove task"
                  class="p-1 rounded-md text-muted-foreground hover:text-red-400"
                  onclick={() => useGenQueue.getState().remove(item.id)}
                  ><Trash2 class="w-3 h-3" /></button
                >{/if}
            </div>{/each}
        </div>
      </div>{/if}
  </aside>{/if}
