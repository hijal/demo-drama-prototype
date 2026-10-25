<script lang="ts">
  import SystemStatsBar from "./SystemStatsBar.svelte";
  import {
    Clapperboard,
    FolderOpen,
    Settings,
    ChevronLeft,
    ChevronRight,
    PanelsTopLeft,
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
  <SystemStatsBar data={stats} {collapsed} onfree={manual ? onfree : undefined} />
  <div class="px-2 py-2 border-t border-border space-y-0.5">
    <div
      title={manual ? "ComfyUI connection" : "Colab connection"}
      class="flex items-center gap-2 py-1.5 text-[11px] text-muted-foreground {collapsed
        ? 'justify-center'
        : 'px-3'}"
    >
      <span class="relative flex h-2 w-2 shrink-0"
        >{#if !checking}<span
            class="absolute inline-flex h-full w-full rounded-full opacity-60 {connected
              ? 'animate-ping bg-emerald-400'
              : 'bg-red-400'}"
          ></span>{/if}<span
          class="relative inline-flex h-2 w-2 rounded-full {connected
            ? 'bg-emerald-400'
            : checking
              ? 'bg-muted-foreground'
              : 'bg-red-400'}"
        ></span></span
      >{#if !collapsed}<span
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
