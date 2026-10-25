<script lang="ts">
  import {
    Clapperboard,
    FolderOpen,
    Settings,
    ChevronLeft,
    ChevronRight,
    PanelsTopLeft,
    Cpu,
    MemoryStick,
    MonitorCog,
    Trash2,
  } from "lucide-svelte";
  let {
    onfree,
    tab,
    onnavigate,
    onsettings,
    connected,
    checking = false,
    manual = true,
    stats = null,
  }: {
    onfree: () => void;
    tab: string;
    onnavigate: (tab: "generate" | "gallery" | "pipeline") => void;
    onsettings: () => void;
    connected: boolean;
    checking?: boolean;
    manual?: boolean;
    stats?: any;
  } = $props();
  let collapsed = $state(false);
  const rows = $derived(
    stats?.ram && typeof stats.cpu?.percent === "number"
      ? [
          ...(stats.gpu?.available
            ? [
                {
                  label: "VRAM",
                  value: stats.gpu.vram_used_gb,
                  max: stats.gpu.vram_total_gb,
                  color: "#06B6D4",
                  icon: MonitorCog,
                },
                {
                  label: "GPU",
                  value: stats.gpu.utilization_percent,
                  max: 100,
                  color: "#8B5CF6",
                  icon: MonitorCog,
                },
              ]
            : []),
          {
            label: "RAM",
            value: stats.ram.used_gb,
            max: stats.ram.total_gb,
            color: "#10B981",
            icon: MemoryStick,
          },
          {
            label: "CPU",
            value: stats.cpu.percent,
            max: 100,
            color: "#F59E0B",
            icon: Cpu,
          },
        ]
      : [],
  );
</script>

<aside
  data-studio-sidebar
  class="flex flex-col h-full border-r border-border bg-[var(--surface-1)] relative z-20 shrink-0"
  style:width={collapsed ? "68px" : "240px"}
  style:transition="width 0.2s ease-in-out"
>
  <div
    class="flex items-center gap-2.5 px-4 h-14 border-b border-border shrink-0"
  >
    <div
      class="w-8 h-8 rounded-lg gradient-creative flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20"
    >
      <span class="text-[13px] font-bold text-white tracking-tight">H3</span>
    </div>
    {#if !collapsed}<div class="flex flex-col min-w-0">
        <span
          class="text-sm font-semibold text-foreground truncate leading-tight"
          >MiniMax H3 <span class="gradient-creative-text font-bold"
            >Studio</span
          ></span
        ><span class="text-[10px] text-muted-foreground truncate"
          >by Evgen Rublev</span
        >
      </div>{/if}
  </div>
  <nav class="flex-1 py-3 px-2 space-y-1" aria-label="Main navigation">
    {#each [{ id: "generate" as const, label: "Generate", icon: Clapperboard, color: "#06B6D4" }, { id: "gallery" as const, label: "Gallery", icon: FolderOpen, color: "#8B5CF6" }, ...(!manual ? [{ id: "pipeline" as const, label: "Projects", icon: PanelsTopLeft, color: "#06B6D4" }] : [])] as item}
      <button
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
        onclick={() => onnavigate(item.id)}
        class="w-full flex items-center gap-3 rounded-lg transition-all duration-150 group relative {collapsed
          ? 'justify-center px-0 py-2.5'
          : 'px-3 py-2.5'} {tab === item.id
          ? 'bg-[var(--surface-3)] text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface-2)]'}"
      >
        {#if tab === item.id}<span
            class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
            style:background-color={item.color}
          ></span>{/if}
        <item.icon
          class="w-[18px] h-[18px] shrink-0 transition-colors"
          style={tab === item.id ? `color:${item.color}` : undefined}
        />{#if !collapsed}<span class="text-sm font-medium truncate"
            >{item.label}</span
          >{/if}
      </button>
    {/each}
  </nav>
  {#if rows.length}<div
      class="border-t border-border {collapsed
        ? 'px-2 py-1 space-y-0.5'
        : 'px-3 py-2 space-y-1.5'}"
    >
      {#each rows as row}<div
          class="flex items-center gap-1.5"
          title={row.label}
        >
          {#if !collapsed}<row.icon
              class="w-3 h-3 shrink-0"
              style={`color:${row.color}`}
            /><span class="text-[9px] text-muted-foreground w-7 shrink-0"
              >{row.label}</span
            >{/if}
          <div
            class="flex-1 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden"
          >
            <div
              class="h-full rounded-full transition-all duration-700"
              style:width={`${Math.min(100, (row.value / Math.max(1, row.max)) * 100)}%`}
              style:background-color={row.color}
            ></div>
          </div>
          {#if !collapsed}<span
              class="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0"
              >{Math.round((row.value / Math.max(1, row.max)) * 100)}%</span
            >{/if}
        </div>{/each}
    </div>{/if}
  {#if rows.length && !collapsed}<div class="px-3 pb-2">
      <button
        class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
        title="Unload ComfyUI models from VRAM"
        onclick={onfree}><Trash2 class="w-3 h-3" />Unload VRAM cache</button
      >
    </div>{/if}
  <div class="px-2 py-2 border-t border-border space-y-0.5">
    <div
      title={manual ? "ComfyUI connection" : "Colab connection"}
      class="flex items-center gap-2 py-1.5 text-[11px] text-muted-foreground {collapsed
        ? 'justify-center'
        : 'px-3'}"
    >
      <span
        class="w-2 h-2 rounded-full shrink-0 {connected
          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
          : checking
            ? 'bg-yellow-400 animate-pulse'
            : 'bg-red-400'}"
      ></span>{#if !collapsed}<span
          >{checking
            ? "Checking..."
            : manual
              ? connected
                ? "ComfyUI connected"
                : "ComfyUI is not available"
              : connected
                ? "Colab online"
                : "Colab offline"}</span
        >{/if}
    </div>
    <button
      aria-label="Settings"
      title={collapsed ? "Settings" : undefined}
      onclick={onsettings}
      class="w-full flex items-center gap-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--surface-2)] transition-colors {collapsed
        ? 'justify-center px-0 py-2.5'
        : 'px-3 py-2.5'}"
      ><Settings class="w-[18px] h-[18px] shrink-0" />{#if !collapsed}<span
          class="text-sm font-medium">Settings</span
        >{/if}</button
    >
  </div>
  <button
    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    onclick={() => (collapsed = !collapsed)}
    class="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--surface-3)] border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--surface-4)] transition-colors z-30"
    >{#if collapsed}<ChevronRight class="w-3 h-3" />{:else}<ChevronLeft
        class="w-3 h-3"
      />{/if}</button
  >
</aside>
