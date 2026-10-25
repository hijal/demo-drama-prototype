<script lang="ts">
  import { Cpu, MemoryStick, MonitorCog, Trash2 } from "lucide-svelte";
  let {
    data,
    collapsed,
    onfree,
  }: {
    /** Raw /api/comfy/system-stats payload (or the GPU worker heartbeat stats). */
    data: any;
    collapsed: boolean;
    /** Unload ComfyUI models; hidden when the studio has no local ComfyUI. */
    onfree?: () => void;
  } = $props();
  const stats = $derived.by(() => {
    if (!data || typeof data !== "object") return null;
    const cpu = data.cpu?.percent;
    const ram = data.ram;
    const gpu = data.gpu;
    if (typeof cpu !== "number" || !ram || typeof ram.used_gb !== "number" || typeof ram.total_gb !== "number")
      return null;
    return {
      cpu_percent: cpu,
      ram_used_gb: ram.used_gb,
      ram_total_gb: ram.total_gb,
      vram_used_gb: typeof gpu?.vram_used_gb === "number" ? gpu.vram_used_gb : 0,
      vram_total_gb: typeof gpu?.vram_total_gb === "number" ? gpu.vram_total_gb : 0,
      gpu_util_percent: typeof gpu?.utilization_percent === "number" ? gpu.utilization_percent : 0,
      gpu_available: gpu?.available === true,
    };
  });
  const pct = (value: number, max: number) => (max > 0 ? Math.min(100, (value / max) * 100) : 0);
</script>

{#snippet statBar(value: number, max: number, color: string, label: string)}
  <div
    class="flex-1 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden"
    title={`${label}: ${value.toFixed(1)} / ${max.toFixed(1)} GB (${pct(value, max).toFixed(0)}%)`}
  >
    <div
      class="h-full rounded-full transition-all duration-700"
      style:width={`${pct(value, max)}%`}
      style:background-color={color}
    ></div>
  </div>
{/snippet}

{#if stats}
  {#if collapsed}
    <div class="px-2 py-1 space-y-0.5 border-t border-border">
      {#if stats.gpu_available && stats.vram_total_gb > 0}<div
          class="h-1 bg-[var(--surface-3)] rounded-full overflow-hidden"
          title={`VRAM: ${((stats.vram_used_gb / stats.vram_total_gb) * 100).toFixed(0)}%`}
        >
          <div
            class="h-full rounded-full"
            style:width={`${(stats.vram_used_gb / stats.vram_total_gb) * 100}%`}
            style:background-color="#06B6D4"
          ></div>
        </div>{/if}
      {#if stats.gpu_available}<div
          class="h-1 bg-[var(--surface-3)] rounded-full overflow-hidden"
          title={`GPU: ${stats.gpu_util_percent.toFixed(0)}%`}
        >
          <div
            class="h-full rounded-full"
            style:width={`${Math.min(100, stats.gpu_util_percent)}%`}
            style:background-color="#8B5CF6"
          ></div>
        </div>{/if}
      {#if stats.ram_total_gb > 0}<div
          class="h-1 bg-[var(--surface-3)] rounded-full overflow-hidden"
          title={`RAM: ${((stats.ram_used_gb / stats.ram_total_gb) * 100).toFixed(0)}%`}
        >
          <div
            class="h-full rounded-full"
            style:width={`${(stats.ram_used_gb / stats.ram_total_gb) * 100}%`}
            style:background-color="#10B981"
          ></div>
        </div>{/if}
      <div class="h-1 bg-[var(--surface-3)] rounded-full overflow-hidden" title={`CPU: ${stats.cpu_percent.toFixed(0)}%`}>
        <div
          class="h-full rounded-full"
          style:width={`${Math.min(100, stats.cpu_percent)}%`}
          style:background-color="#F59E0B"
        ></div>
      </div>
    </div>
  {:else}
    <div class="px-3 py-2 space-y-1.5 border-t border-border">
      {#if stats.gpu_available && stats.vram_total_gb > 0}<div class="flex items-center gap-1.5">
          <MonitorCog class="w-3 h-3 text-cyan-400 shrink-0" />
          <span class="text-[9px] text-muted-foreground w-7 shrink-0">VRAM</span>
          {@render statBar(stats.vram_used_gb, stats.vram_total_gb, "#06B6D4", "VRAM")}
          <span class="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0"
            >{((stats.vram_used_gb / stats.vram_total_gb) * 100).toFixed(0)}%</span
          >
        </div>{/if}
      {#if stats.gpu_available}<div class="flex items-center gap-1.5">
          <MonitorCog class="w-3 h-3 text-violet-400 shrink-0" />
          <span class="text-[9px] text-muted-foreground w-7 shrink-0">GPU</span>
          <div class="flex-1 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-700"
              style:width={`${Math.min(100, stats.gpu_util_percent)}%`}
              style:background-color="#8B5CF6"
            ></div>
          </div>
          <span class="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0"
            >{stats.gpu_util_percent.toFixed(0)}%</span
          >
        </div>{/if}
      {#if stats.ram_total_gb > 0}<div class="flex items-center gap-1.5">
          <MemoryStick class="w-3 h-3 text-emerald-400 shrink-0" />
          <span class="text-[9px] text-muted-foreground w-7 shrink-0">RAM</span>
          {@render statBar(stats.ram_used_gb, stats.ram_total_gb, "#10B981", "RAM")}
          <span class="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0"
            >{((stats.ram_used_gb / stats.ram_total_gb) * 100).toFixed(0)}%</span
          >
        </div>{/if}
      <div class="flex items-center gap-1.5">
        <Cpu class="w-3 h-3 text-amber-400 shrink-0" />
        <span class="text-[9px] text-muted-foreground w-7 shrink-0">CPU</span>
        <div class="flex-1 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-700"
            style:width={`${Math.min(100, stats.cpu_percent)}%`}
            style:background-color="#F59E0B"
          ></div>
        </div>
        <span class="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0"
          >{stats.cpu_percent.toFixed(0)}%</span
        >
      </div>
      {#if onfree}<div class="flex items-center justify-between pt-1">
          <button
            onclick={onfree}
            class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
            title="Unload ComfyUI models from VRAM"
          >
            <Trash2 class="w-3 h-3" />
            Unload VRAM cache
          </button>
        </div>{/if}
    </div>
  {/if}
{/if}
