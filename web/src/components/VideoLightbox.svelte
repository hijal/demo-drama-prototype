<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    X,
    Download,
    Trash2,
    Play,
    Pause,
    Volume2,
    VolumeX,
    ChevronLeft,
    ChevronRight,
  } from "lucide-svelte";
  import type { GalleryFile } from "../lib/gallery";
  let {
    open = $bindable(false),
    file,
    files,
    onprevious,
    onnext,
    ondelete,
  }: {
    open?: boolean;
    file: GalleryFile | null;
    files: GalleryFile[];
    onprevious: () => void;
    onnext: () => void;
    ondelete: (file: GalleryFile) => Promise<void>;
  } = $props();
  let dialog = $state<HTMLDialogElement>(),
    video = $state<HTMLVideoElement>(),
    playing = $state(false),
    muted = $state(false),
    volume = $state(0.7),
    time = $state(0),
    duration = $state(0),
    controls = $state(true),
    failed = $state(false),
    retry = $state(0),
    confirmDelete = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
  $effect(() => {
    if (video) video.volume = volume;
  });
  $effect(() => {
    file?.url;
    retry;
    failed = false;
    confirmDelete = false;
    time = 0;
    duration = 0;
  });
  onDestroy(() => clearTimeout(timer));
  function reveal() {
    controls = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (playing) controls = false;
    }, 3000);
  }
  function toggle() {
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }
  function key(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowLeft") onprevious();
    if (e.key === "ArrowRight") onnext();
    if (e.key === " ") {
      e.preventDefault();
      toggle();
    }
    if (e.key.toLowerCase() === "m") muted = !muted;
  }
  const clock = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
</script>

<svelte:window onkeydown={key} />
<dialog
  bind:this={dialog}
  aria-label={file?.filename || "Video preview"}
  onclose={() => (open = false)}
  oncancel={() => (open = false)}
  class="fixed inset-0 m-0 p-0 w-screen h-screen max-w-none max-h-none border-0 bg-black text-white backdrop:bg-black z-[9999]"
>
  {#if open && file}<div
      class="w-full h-full flex flex-col"
      onpointermove={reveal}
      role="presentation"
    >
      <div
        class="flex-1 relative flex items-center justify-center min-h-0 min-w-0"
      >
        {#key file.url + retry}<video
            bind:this={video}
            src={file.url}
            class="max-w-full max-h-full object-contain"
            autoplay
            playsinline
            bind:muted
            onplay={() => (playing = true)}
            onpause={() => (playing = false)}
            ontimeupdate={() => (time = video?.currentTime || 0)}
            onloadedmetadata={() => (duration = video?.duration || 0)}
            onerror={() => (failed = true)}
            onclick={toggle}><track kind="captions" /></video
          >{/key}
        {#if failed}<div
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60"
          >
            <p class="text-sm text-white/80">Failed to load video</p>
            <button
              class="px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium"
              onclick={() => retry++}>Retry</button
            >
          </div>{:else if !playing}<div
            class="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <Play class="w-20 h-20 text-white fill-white/50" />
          </div>{/if}
        <div
          class="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 transition-opacity duration-300 {controls
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none'}"
          style="background:linear-gradient(to bottom,rgba(0,0,0,.7),transparent)"
        >
          <div class="flex items-center gap-3 min-w-0">
            <h3 class="text-sm text-white/90 font-medium truncate">
              {file.filename}
            </h3>
            <span class="text-xs text-white/40 font-mono"
              >{files.findIndex((f) => f.url === file.url) + 1} / {files.length}</span
            >
          </div>
          <div class="flex items-center gap-1.5">
            <a
              title="Download"
              class="p-2 rounded-lg bg-white/10 hover:bg-white/20"
              href={`${file.url}${file.url.includes("?") ? "&" : "?"}download=1`}
              download={file.filename}><Download class="w-4 h-4" /></a
            >{#if confirmDelete}<button
                class="px-3 py-1.5 rounded-lg bg-red-500/80 text-xs"
                onclick={() => ondelete(file!)}>Delete</button
              ><button
                class="px-3 py-1.5 rounded-lg bg-white/10 text-xs"
                onclick={() => (confirmDelete = false)}>Cancel</button
              >{:else}<button
                aria-label="Delete video"
                class="p-2 rounded-lg bg-white/10 hover:bg-red-500/40"
                onclick={() => (confirmDelete = true)}
                ><Trash2 class="w-4 h-4" /></button
              >{/if}<button
              aria-label="Close preview"
              class="p-2 rounded-lg bg-white/10 hover:bg-white/20 ml-1"
              onclick={() => (open = false)}><X class="w-4 h-4" /></button
            >
          </div>
        </div>
        <div
          class="absolute bottom-0 left-0 right-0 transition-opacity duration-300 {controls
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none'}"
          style="background:linear-gradient(to top,rgba(0,0,0,.8),transparent)"
        >
          <input
            class="block w-[calc(100%-2rem)] mx-4 mb-2 h-1 accent-cyan-500 cursor-pointer"
            aria-label="Seek video"
            type="range"
            min="0"
            max={Number.isFinite(duration) ? duration : 0}
            step="0.01"
            value={time}
            oninput={(e) => {
              if (video) video.currentTime = Number(e.currentTarget.value);
            }}
          />
          <div class="flex items-center justify-between px-4 pb-3">
            <div class="flex items-center gap-2">
              <button
                class="p-1.5 text-white/90 hover:text-white"
                aria-label="Play/Pause (Space)"
                onclick={toggle}
                >{#if playing}<Pause class="w-5 h-5 fill-current" />{:else}<Play
                    class="w-5 h-5 fill-current"
                  />{/if}</button
              ><button
                class="p-1.5 text-white/70 hover:text-white"
                aria-label="Mute (M)"
                onclick={() => (muted = !muted)}
                >{#if muted}<VolumeX class="w-4 h-4" />{:else}<Volume2
                    class="w-4 h-4"
                  />{/if}</button
              ><input
                aria-label="Volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                class="w-20 h-1 accent-cyan-500"
                value={volume}
                oninput={(e) => {
                  volume = Number(e.currentTarget.value);
                  muted = volume === 0;
                }}
              /><span class="text-xs text-white/60 font-mono ml-1"
                >{clock(time)} / {clock(
                  Number.isFinite(duration) ? duration : 0,
                )}</span
              >
            </div>
            {#if files.length > 1}<div class="flex items-center gap-1.5">
                <button
                  aria-label="Previous"
                  class="p-1.5 text-white/70"
                  onclick={onprevious}><ChevronLeft class="w-4 h-4" /></button
                ><button
                  aria-label="Next"
                  class="p-1.5 text-white/70"
                  onclick={onnext}><ChevronRight class="w-4 h-4" /></button
                >
              </div>{/if}
          </div>
        </div>
        {#if files.length > 1}{#each [{ label: "Previous", icon: ChevronLeft, action: onprevious, side: "left-4" }, { label: "Next", icon: ChevronRight, action: onnext, side: "right-4" }] as item}<button
              class="absolute {item.side} top-1/2 -translate-y-1/2 p-3 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 backdrop-blur-sm"
              aria-label={`${item.label} video`}
              onclick={item.action}><item.icon class="w-5 h-5" /></button
            >{/each}{/if}
      </div>
      <div
        class="absolute bottom-[80px] left-1/2 -translate-x-1/2 flex items-center gap-4 text-[10px] text-white/30 pointer-events-none"
      >
        Space — play/pause · ← → — navigation · M — mute · Esc — close
      </div>
    </div>{/if}
</dialog>
