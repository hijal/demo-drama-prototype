<script lang="ts">
  import {
    Upload,
    AudioLines,
    Image,
    Video,
    X,
  } from "lucide-svelte";
  import {
    useGenStore,
    type VideoGenState,
    type VideoRefItem,
  } from "@/lib/gen-store";
  import { inputUrl } from "../lib/api";
  import Modal from "./Modal.svelte";
  let {
    video,
    uploading,
    onupload,
    tagFor,
    insertMention,
  }: {
    video: VideoGenState;
    uploading: boolean;
    onupload: (
      files: FileList | File[] | null,
      slot?: "start" | "end",
    ) => Promise<void>;
    tagFor: (ref: VideoRefItem) => string;
    insertMention: (tag: string) => void;
  } = $props();
  let viewing = $state<VideoRefItem | null>(null),
    viewOpen = $state(false),
    dragOver = $state(false);
  const zone = (over: boolean) =>
    over
      ? "border-cyan-400 bg-cyan-500/10"
      : "border-border hover:border-cyan-500/50 hover:bg-[var(--surface-2)]";
  const thumb = (path: string) =>
    `/api/comfy/file?filename=${encodeURIComponent(path)}&type=input&width=200`;
  const visible = $derived(
    video.refs.filter((ref) => video.mode === "ref" || ref.kind === "audio"),
  );
  const counts = $derived({
    image: video.refs.filter((r) => r.kind === "image").length,
    video: video.refs.filter((r) => r.kind === "video").length,
    audio: video.refs.filter((r) => r.kind === "audio").length,
  });
  function tagsForRefs(refs: VideoRefItem[]): Map<string, string> {
    const counters: Record<"image" | "video" | "audio", number> = {
      image: 0,
      video: 0,
      audio: 0,
    };
    const map = new Map<string, string>();
    for (const r of refs)
      map.set(
        r.id,
        `<${{ image: "Picture", video: "Video", audio: "Audio" }[r.kind]} ${++counters[r.kind]}>`,
      );
    return map;
  }

  /**
   * Переписывает теги референсов в промпте под новый порядок списка:
   * теги удалённых референсов вырезаются, остальные перенумеровываются.
   * Промежуточные плейсхолдеры исключают коллизии при перенумерации
   * (например, swap <Video 1> ↔ <Video 2>).
   */
  function rewritePromptTags(
    prompt: string,
    oldTags: Map<string, string>,
    newTags: Map<string, string>,
  ): string {
    let any = false;
    for (const t of oldTags.values()) {
      if (prompt.includes(t)) {
        any = true;
        break;
      }
    }
    if (!any) return prompt;
    let text = prompt;
    for (const [id, oldTag] of oldTags) {
      const next = newTags.get(id);
      // Удалённый референс: его тег вырезается из промпта целиком
      text = text.split(oldTag).join(next ? `\x00${id}\x00` : "");
    }
    for (const [id, tag] of newTags) {
      text = text.split(`\x00${id}\x00`).join(tag);
    }
    return text;
  }

  function editRefs(action: () => void) {
    const before = useGenStore.getState().video;
    const oldTags = tagsForRefs(before.refs);
    action();
    const next = useGenStore.getState().video;
    const prompt = rewritePromptTags(
      before.prompt,
      oldTags,
      tagsForRefs(next.refs),
    );
    if (prompt !== before.prompt) useGenStore.getState().setVideoPrompt(prompt);
  }
</script>

<div class="space-y-2.5">
  {#if video.mode === "flf"}
    <div
      class="text-xs text-muted-foreground flex items-center justify-between"
    >
      <span>Frames and audio</span><span class="text-[10px] font-normal"
        >{counts.audio}/3 aud</span
      >
    </div>
    <div class="grid grid-cols-2 gap-2">
      {#each ["start", "end"] as slot}{@const frame =
          slot === "start" ? video.startFrame : video.endFrame}
        <label
          class="border-2 border-dashed rounded-lg py-3 text-center cursor-pointer transition-all {zone(dragOver)}"
          ondragover={(e) => {
            e.preventDefault();
            dragOver = true;
          }}
          ondragleave={() => (dragOver = false)}
          ondrop={(e) => {
            e.preventDefault();
            dragOver = false;
            void onupload(
              e.dataTransfer?.files || null,
              slot as "start" | "end",
            );
          }}
        >
          <input
            class="hidden"
            type="file"
            accept="image/*"
            aria-label={slot === "start" ? "First frame" : "Last frame"}
            onchange={(e) => {
              void onupload(e.currentTarget.files, slot as "start" | "end");
              e.currentTarget.value = "";
            }}
          />
          {#if frame}<div class="px-2">
              <img
                src={frame.previewUrl || inputUrl(frame.path)}
                alt={frame.name}
                class="w-full h-16 object-cover rounded-md"
              />
              <p class="text-[10px] text-muted-foreground truncate mt-1">
                {frame.name}
              </p>
              <button
                aria-label={slot === "start"
                  ? "Remove first frame"
                  : "Remove last frame"}
                class="text-[10px] text-red-400 hover:text-red-300 mt-0.5"
                onclick={(e) => {
                  e.preventDefault();
                  slot === "start"
                    ? useGenStore.getState().setVideoStartFrame(null)
                    : useGenStore.getState().setVideoEndFrame(null);
                }}>remove</button
              >
            </div>
          {:else}<Image class="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p class="text-[11px] text-muted-foreground font-medium">
              {slot === "start" ? "First frame" : "Last frame"}
            </p>
            <p class="text-[9px] text-muted-foreground/60">
              {slot === "start" ? "mandatory" : "optional"}
            </p>{/if}
        </label>
      {/each}
    </div>
  {/if}
  {#if video.mode === "ref"}<div
      class="text-xs text-muted-foreground flex items-center justify-between"
    >
      <span>References</span><span class="text-[10px] font-normal"
        >{counts.image}/9 img · {counts.video}/3 vid · {counts.audio}/3 aud</span
      >
    </div>{/if}
  <label
    class="block border-2 border-dashed rounded-lg text-center cursor-pointer transition-all {zone(dragOver)} {video.mode ===
    'ref'
      ? 'py-4'
      : 'py-3'}"
    ondragover={(e) => {
      e.preventDefault();
      dragOver = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={(e) => {
      e.preventDefault();
      dragOver = false;
      void onupload(e.dataTransfer?.files || null);
    }}
  >
    <input
      class="hidden"
      type="file"
      multiple
      accept={video.mode === "ref" ? "image/*,video/*,audio/*" : "audio/*"}
      aria-label="Upload references"
      disabled={uploading}
      onchange={(e) => {
        void onupload(e.currentTarget.files);
        e.currentTarget.value = "";
      }}
    />
    {#if uploading}<p class="text-xs text-cyan-400">
        Loading {video.mode === "ref" ? "references" : "audio"}...
      </p>{:else if video.mode === "ref"}<Upload
        class="w-5 h-5 text-muted-foreground mx-auto mb-1.5"
      />
      <p class="text-xs text-muted-foreground">
        Drag, <span class="underline text-cyan-400">select</span> or paste by
        <span class="font-mono text-cyan-400">Ctrl+V</span>
      </p>
      <p class="text-[10px] text-muted-foreground/60 mt-0.5">
        pictures, video and audio - up to 15 pcs.
      </p>{:else}<AudioLines
        class="w-4 h-4 text-muted-foreground mx-auto mb-1"
      />
      <p class="text-xs text-muted-foreground">
        Audio references <span class="text-[10px] text-muted-foreground/60"
          >({counts.audio}/3 aud)</span
        >
      </p>
      <p class="text-[10px] text-muted-foreground/60 mt-0.5">
        {video.mode === "flf"
          ? "audio for voice/voiceover (WAV, MP3…)"
          : "audio for voice and voiceover - pictures/videos are not used in this mode"}
      </p>{/if}
  </label>
  {#each visible as ref (ref.id)}{@const index = video.refs.findIndex(
      (r) => r.id === ref.id,
    )}
    <div
      class="rounded-lg border border-border bg-[var(--surface-2)] p-2.5 space-y-2"
    >
      <div class="flex items-start gap-2.5">
        <div class="flex flex-col gap-0.5 shrink-0">
          <button
            class="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Higher"
            aria-label={`Move ${ref.name} earlier`}
            disabled={index === 0}
            onclick={() =>
              editRefs(() =>
                useGenStore.getState().moveVideoRef(index, index - 1),
              )}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 6L5 3L8 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button
          ><button
            class="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Below"
            aria-label={`Move ${ref.name} later`}
            disabled={index === video.refs.length - 1}
            onclick={() =>
              editRefs(() =>
                useGenStore.getState().moveVideoRef(index, index + 1),
              )}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 4L5 7L8 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button
          >
        </div>
        <button
          onclick={() => {
            viewing = ref;
            viewOpen = true;
          }}
          type="button"
          disabled={!ref.path}
          title="Open reference"
          class="w-14 h-14 rounded-md overflow-hidden bg-black/40 border border-border shrink-0 flex items-center justify-center hover:border-cyan-500/60 transition-colors disabled:cursor-not-allowed"
          aria-label={`Preview ${ref.name}`}
          >{#if ref.kind === "image" && ref.path}<img
              src={thumb(ref.path)}
              alt={ref.name}
              class="w-full h-full object-cover"
            />{/if}{#if ref.kind === "video" && ref.path}<video
              src={inputUrl(ref.path)}
              muted
              playsinline
              class="w-full h-full object-cover"
              preload="metadata"
            ></video>{/if}{#if ref.kind === "audio"}<AudioLines
              class="w-5 h-5 text-emerald-400"
            />{/if}{#if !ref.path}{#if ref.kind === "image"}<Image
                class="w-5 h-5 text-muted-foreground"
              />{:else if ref.kind === "video"}<Video
                class="w-5 h-5 text-muted-foreground"
              />{/if}{/if}</button
        >
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-mono text-muted-foreground"
              >#{index + 1}</span
            ><button
              class="text-[9px] px-1.5 py-0.5 rounded font-medium {ref.kind ===
              'image'
                ? 'text-purple-400 bg-purple-500/15'
                : ref.kind === 'video'
                  ? 'text-cyan-400 bg-cyan-500/15'
                  : 'text-emerald-400 bg-emerald-500/15'}"
              onclick={() => insertMention(tagFor(ref))}
              >{ref.kind === "image"
                ? "Picture"
                : ref.kind === "video"
                  ? "Video"
                  : "Audio"} → {tagFor(ref)}</button
            >
          </div>
          <p class="text-[11px] text-foreground/80 truncate" title={ref.name}>{ref.name}</p>
        </div>
        <button
          class="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
          title="Remove reference"
          aria-label={`Remove ${ref.name}`}
          onclick={() =>
            editRefs(() => useGenStore.getState().removeVideoRef(ref.id))}
          ><X class="w-3.5 h-3.5" /></button
        >
      </div>
      <div class="flex items-center gap-2">
        {#if ref.kind === "video"}<label
            class="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer"
            ><input
              type="checkbox"
              class="accent-cyan-500"
              checked={ref.includeAudio}
              onchange={(e) =>
                useGenStore.getState().updateVideoRef(ref.id, {
                  includeAudio: e.currentTarget.checked,
                })}
            />use video sound</label
          >{:else if ref.kind === "audio"}<select
            class="flex-1 h-7 px-2 bg-[var(--surface-0)] border border-border rounded-md text-[11px] text-foreground focus:outline-none focus:border-cyan-500/50"
            aria-label={`Intent for ${ref.name}`}
            value={ref.audioIntent}
            onchange={(e) =>
              useGenStore.getState().updateVideoRef(ref.id, {
                audioIntent: e.currentTarget
                  .value as VideoRefItem["audioIntent"],
              })}
            ><option value="voice">Voice</option><option value="drive"
              >Tempo/rhythm</option
            ><option value="style">Style</option></select
          >{/if}
      </div>
    </div>
  {/each}
  {#if video.mode === "ref"}<p
      class="text-[10px] text-muted-foreground/60 leading-relaxed"
    >
      To link a reference, enter <span class="font-mono text-foreground/70">@</span> in the prompt - a list will appear.
      Turn the dialogue into <span class="font-mono text-muted-foreground">&lt;d&gt;…&lt;/d&gt;</span>.
    </p>{/if}
</div>
<Modal bind:open={viewOpen} title={viewing?.name || "Reference"} kind="reference"
  >{#snippet icon()}{#if viewing?.kind === "image"}<Image class="w-4 h-4 text-purple-400" />{:else if viewing?.kind === "video"}<Video
        class="w-4 h-4 text-cyan-400"
      />{:else}<AudioLines class="w-4 h-4 text-emerald-400" />{/if}{/snippet}{#if viewing}<div
      class="px-4 pb-4 flex items-center justify-center bg-black/40 rounded-b-lg min-h-[300px] max-h-[80vh] overflow-auto"
    >
      {#if viewing.kind === "image"}<img
          src={inputUrl(viewing.path)}
          alt={viewing.name}
          class="max-w-full max-h-[76vh] object-contain rounded"
          draggable="false"
        />{:else if viewing.kind === "video"}<video
          src={inputUrl(viewing.path)}
          controls
          autoplay
          loop
          playsinline
          class="max-w-full max-h-[76vh] rounded"><track kind="captions" /></video
        >{:else}<div class="w-full flex flex-col items-center gap-6 py-16">
          <AudioLines class="w-20 h-20 text-emerald-400/60" />
          <audio src={inputUrl(viewing.path)} controls autoplay class="w-full max-w-2xl"></audio>
        </div>{/if}
    </div>{/if}</Modal
>
