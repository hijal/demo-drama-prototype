<script lang="ts">
  import {
    Film,
    Video,
    Folder,
    Layers,
    FolderPlus,
    Pencil,
    Trash2,
    Download,
    Info,
    RotateCcw,
    RefreshCcw,
    Check,
    X,
    ChevronLeft,
    ChevronRight,
  } from "lucide-svelte";
  import Modal from "./Modal.svelte";
  import Metadata from "./Metadata.svelte";
  import VideoLightbox from "./VideoLightbox.svelte";
  import { gallery, loadGallery, type GalleryFile } from "../lib/gallery";
  import { api, fileKey, message } from "../lib/api";
  import { restoreFromMeta } from "@/lib/restore-from-meta";
  import { useGenStore } from "@/lib/gen-store";
  import { formatSeconds } from "@/lib/gen-duration-store";
  import { toast } from "@/lib/notifications";
  let {
    embedded = false,
    folder = "",
  }: { embedded?: boolean; folder?: string } = $props();
  let creating = $state(false),
    newName = $state(""),
    renaming = $state(false),
    renameValue = $state("");
  let filter = $state("*"),
    search = $state(""),
    sort = $state("newest");
  let selected = $state<string[]>([]);
  let viewing = $state<GalleryFile | null>(null);
  let viewerOpen = $state(false),
    metaOpen = $state(false);
  let metadata = $state<Record<string, any> | null>(null);
  let metaError = $state("");
  let pendingDelete = $state<GalleryFile | null>(null),
    deleteOpen = $state(false);
  let busy = $state(false);
  let destination = $state("");
  let selectionMode = $state(false);
  const files = $derived(
    $gallery.files
      .filter(
        (f) =>
          (embedded
            ? f.subfolder === folder
            : filter === "*" || f.subfolder === filter) &&
          f.filename.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.filename.localeCompare(b.filename)
          : sort === "oldest"
            ? (a.mtime ?? 0) - (b.mtime ?? 0)
            : (b.mtime ?? 0) - (a.mtime ?? 0),
      ),
  );
  const selectedFiles = $derived(
    $gallery.files.filter((f) => selected.includes(fileKey(f))),
  );
  const download = (f: GalleryFile) =>
    f.url + (f.url.includes("?") ? "&" : "?") + "download=1";
  function open(file: GalleryFile) {
    viewing = file;
    viewerOpen = true;
  }
  async function repeat(file: GalleryFile) {
    busy = true;
    try {
      if (
        await restoreFromMeta(
          file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename,
        )
      ) {
        viewerOpen = false;
        metaOpen = false;
      }
    } catch (e) {
      toast.error(message(e));
    } finally {
      busy = false;
    }
  }
  async function showMeta(file: GalleryFile) {
    viewing = file;
    metadata = null;
    metaError = "";
    metaOpen = true;
    try {
      const data = await api(
        `/api/comfy/meta?${new URLSearchParams({ path: file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename })}`,
      );
      if (viewing && fileKey(viewing) === fileKey(file)) metadata = data;
    } catch (e) {
      metaError = message(e);
    }
  }
  async function remove(items: GalleryFile[]) {
    if (!items.length) return;
    busy = true;
    try {
      for (const file of items)
        await api("/api/comfy/delete", {
          filename: file.filename,
          subfolder: file.subfolder,
        });
      selected = [];
      viewerOpen = false;
      toast.success("Videos deleted");
    } catch (e) {
      toast.error(message(e));
    } finally {
      await loadGallery();
      busy = false;
    }
  }
  async function move(items: GalleryFile[], to: string) {
    if (!items.length) return;
    busy = true;
    try {
      for (const file of items)
        await api("/api/comfy/move", {
          filename: file.filename,
          from: file.subfolder,
          to,
        });
      selected = [];
      viewerOpen = false;
      toast.success("Videos moved");
    } catch (e) {
      toast.error(message(e));
    } finally {
      await loadGallery();
      busy = false;
    }
  }
  async function folderAction(
    action: "create" | "rename" | "delete",
    chosen?: string,
  ) {
    const old = filter === "*" ? "" : filter;
    if (action !== "create" && !old) return;
    const name =
      action === "delete"
        ? old
        : chosen !== undefined
          ? chosen.trim()
          : prompt(
              action === "create" ? "New folder name" : "Rename folder",
              old,
            )?.trim();
    if (
      !name ||
      (action === "delete" && !confirm(`Delete empty folder “${old}”?`))
    )
      return;
    busy = true;
    try {
      const result = await api(
        "/api/comfy/folders",
        action === "rename" ? { from: old, to: name } : { name },
        action === "create" ? "POST" : action === "rename" ? "PATCH" : "DELETE",
      );
      const next = action === "delete" ? "" : result.name || name;
      filter = next;
      if (
        action !== "create" &&
        useGenStore.getState().video.outputFolder === old
      )
        useGenStore.getState().patchVideo({ outputFolder: next });
      toast.success("Folders updated");
    } catch (e) {
      toast.error(message(e));
    } finally {
      await loadGallery();
      busy = false;
    }
  }
  function toggle(file: GalleryFile) {
    const key = fileKey(file);
    selected = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key];
  }
  function adjacent(direction: number) {
    if (!viewing || !files.length) return;
    const index = files.findIndex((f) => fileKey(f) === fileKey(viewing!));
    viewing = files[(index + direction + files.length) % files.length];
  }
  function drop(event: DragEvent, to: string) {
    event.preventDefault();
    const key = event.dataTransfer?.getData("text/x-h3-file");
    const file = $gallery.files.find((f) => fileKey(f) === key);
    if (file) void move([file], to);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (deleteOpen && e.key === "Enter" && !busy) {
      e.preventDefault();
      const file = pendingDelete;
      deleteOpen = false;
      if (file) void remove([file]);
    }
  }}
/>
{#snippet grid()}
  {#if $gallery.error}<p
      class="text-xs text-red-400 p-3 border border-red-500/20 rounded-lg"
      role="alert"
    >
      {$gallery.error}<button class="ml-2 underline" onclick={loadGallery}
        >Retry</button
      >
    </p>
  {:else if $gallery.loading}<div
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
    >
      {#each Array(8) as _}<div
          class="aspect-video rounded-lg bg-[var(--surface-2)] animate-pulse"
        ></div>{/each}
    </div>
  {:else if !files.length}<div
      class="flex flex-col items-center justify-center h-full text-center py-12"
    >
      <Video class="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p class="text-sm text-muted-foreground">
        {embedded
          ? folder
            ? `In the folder "${folder}» no video yet. New generations will fall into it.`
            : "The generated videos will appear here. Describe the scene, add a reference image, and click “Generate Video.”"
          : 'No video yet. Generate the first one in the "Generate" tab.'}
      </p>
    </div>
  {:else}<div class="flex items-center justify-between mb-3">
      <span
        class="inline-flex items-center justify-center rounded-md px-2 py-0.5 bg-secondary text-secondary-foreground text-xs font-medium"
        >{files.length} video</span
      ><button
        class="p-1.5 rounded-lg hover:bg-[var(--surface-3)] text-muted-foreground"
        aria-label="Refresh gallery"
        onclick={loadGallery}><RefreshCcw class="w-3.5 h-3.5" /></button
      >
    </div>
    <div
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
    >
      {#each files as file, index (fileKey(file))}<article
          class="group relative aspect-video rounded-lg overflow-hidden border border-border bg-[var(--surface-2)] cursor-pointer"
          draggable
          ondragstart={(e) => {
            e.dataTransfer?.setData("text/x-h3-file", fileKey(file));
            e.dataTransfer?.setData(
              "application/x-h3-video",
              JSON.stringify({
                filename: file.filename,
                subfolder: file.subfolder,
              }),
            );
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
          }}
        >
          <button
            class="absolute inset-0 w-full h-full"
            aria-label={`Play ${file.filename}`}
            onclick={() => open(file)}
            ><video
              class="w-full h-full object-cover pointer-events-none"
              src={file.url}
              muted
              playsinline
              preload="metadata"><track kind="captions" /></video
            ></button
          >
          <div
            class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-center gap-1 pointer-events-none"
          >
            <a
              class="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white pointer-events-auto"
              title="Download"
              href={download(file)}
              download={file.filename}><Download class="w-3.5 h-3.5" /></a
            ><button
              class="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white pointer-events-auto"
              aria-label={`Metadata for ${file.filename}`}
              onclick={() => showMeta(file)}
              ><Info class="w-3.5 h-3.5" /></button
            ><button
              class="p-1.5 rounded-lg bg-cyan-500/40 hover:bg-cyan-500/60 text-white pointer-events-auto"
              aria-label={`Repeat ${file.filename}`}
              disabled={busy}
              onclick={() => repeat(file)}
              ><RotateCcw class="w-3.5 h-3.5" /></button
            ><button
              class="p-1.5 rounded-lg bg-red-500/40 hover:bg-red-500/60 text-white pointer-events-auto"
              aria-label={`Delete ${file.filename}`}
              disabled={busy}
              onclick={() => {
                pendingDelete = file;
                deleteOpen = true;
              }}><Trash2 class="w-3.5 h-3.5" /></button
            >
          </div>
          <div
            class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pointer-events-none"
          >
            <div class="flex items-center justify-between gap-1">
              <p class="text-[10px] text-white/70 truncate font-mono">
                {file.filename}
              </p>
              {#if file.generationTime}<span
                  class="text-[9px] text-cyan-300/80 font-medium shrink-0"
                  >{formatSeconds(file.generationTime)}</span
                >{/if}
            </div>
          </div>
        </article>{/each}
    </div>
  {/if}
{/snippet}
{#if embedded}{@render grid()}
{:else}<div class="flex-1 flex flex-row min-h-0 bg-[var(--surface-1)]">
    <div class="flex-1 flex flex-col min-h-0 min-w-0">
      <div class="px-6 pt-5 pb-3 shrink-0 aurora-bg">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h1
              class="text-xl font-semibold text-foreground flex items-center gap-2.5"
            >
              <span
                class="w-9 h-9 rounded-xl gradient-creative flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20"
                ><Film class="w-4.5 h-4.5 text-white" /></span
              >Gallery
            </h1>
            <p class="text-xs text-muted-foreground mt-1.5">
              {filter === "*"
                ? "All videos from all folders"
                : filter === ""
                  ? "Shared folder (no projects)"
                  : `Folder "${filter}"`}{#if !$gallery.loading}
                · <span class="text-foreground/80 font-medium"
                  >{files.length}</span
                > pcs.{/if}
            </p>
          </div>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
        {@render grid()}
      </div>
    </div>
    <aside
      class="w-56 border-l border-border flex flex-col bg-[var(--surface-0)]/60 shrink-0"
      aria-label="Gallery folders"
    >
      <div class="p-3 border-b border-border flex items-center gap-2">
        <span class="text-xs font-medium text-foreground flex-1">Folders</span
        ><button
          class="inline-flex items-center justify-center rounded-md border border-border bg-background shadow-xs h-7 px-2"
          aria-label="New folder"
          title="Create Project Folder"
          onclick={() => {
            creating = true;
            newName = "";
          }}><FolderPlus class="w-3.5 h-3.5" /></button
        >
      </div>
      {#if creating}<div class="p-2 border-b border-border/60 space-y-1.5">
          <input
            class="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px]"
            aria-label="Folder name"
            placeholder="Folder name..."
            bind:value={newName}
            onkeydown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                void folderAction("create", newName);
                creating = false;
              }
              if (e.key === "Escape") creating = false;
            }}
          />
          <div class="flex gap-1.5">
            <button
              class="flex-1 h-6 rounded-md text-[10px] bg-primary text-primary-foreground"
              disabled={!newName.trim()}
              onclick={() => {
                void folderAction("create", newName);
                creating = false;
              }}>Create</button
            ><button
              class="border border-border rounded-md h-6 px-2 text-[10px]"
              onclick={() => (creating = false)}>Cancel</button
            >
          </div>
        </div>{/if}
      {#each [{ key: "*", name: "All videos", icon: Layers }, { key: "", name: "General", icon: Film }, ...$gallery.folders.map( (name) => ({ key: name, name, icon: Folder }) )] as item}<div
          class="group flex items-center gap-2 px-3 py-2 border-b border-border/40 transition-colors {filter ===
          item.key
            ? 'bg-violet-500/10'
            : 'hover:bg-white/5'}"
          ondragover={(e) => {
            if (item.key !== "*") e.preventDefault();
          }}
          ondrop={(e) => drop(e, item.key)}
          role="group"
        >
          <button
            class="flex items-center gap-2 flex-1 min-w-0 text-left"
            onclick={() => (filter = item.key)}
            ><item.icon
              class="w-3.5 h-3.5 shrink-0 {filter === item.key
                ? 'text-violet-400'
                : 'text-muted-foreground/60'}"
            /><span
              class="flex-1 min-w-0 truncate text-[11px] text-foreground/80"
              >{item.name}</span
            ><span class="text-[9px] text-muted-foreground/60 tabular-nums"
              >{item.key === "*"
                ? $gallery.files.length
                : $gallery.files.filter((file) => file.subfolder === item.key)
                    .length}</span
            ></button
          >{#if item.key && item.key !== "*"}<button
              class="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-foreground"
              aria-label={`Rename folder ${item.key}`}
              onclick={() => {
                filter = item.key;
                renaming = true;
                renameValue = item.key;
              }}><Pencil class="w-3 h-3" /></button
            ><button
              class="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-red-400"
              aria-label={`Delete folder ${item.key}`}
              onclick={() => {
                filter = item.key;
                void folderAction("delete");
              }}><Trash2 class="w-3 h-3" /></button
            >{/if}
        </div>{/each}
      {#if renaming}<div class="p-2 flex gap-1">
          <input
            class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px]"
            aria-label="New folder name"
            bind:value={renameValue}
          /><button
            aria-label="Save folder name"
            onclick={() => {
              void folderAction("rename", renameValue);
              renaming = false;
            }}><Check class="w-3 h-3 text-emerald-400" /></button
          ><button aria-label="Cancel rename" onclick={() => (renaming = false)}
            ><X class="w-3 h-3" /></button
          >
        </div>{/if}
      <div
        class="mt-auto p-3 border-t border-border text-[9px] text-muted-foreground/50 leading-snug"
      >
        Drag the video onto the folder to move it. The folder can be renamed
        (pencil) or deleted (cross, empty only). You can also select a folder on
        the “Generate” tab - new videos will be placed in it.
      </div>
    </aside>
  </div>{/if}
<VideoLightbox
  bind:open={viewerOpen}
  file={viewing}
  {files}
  onprevious={() => adjacent(-1)}
  onnext={() => adjacent(1)}
  ondelete={(file) => remove([file])}
/>
<Modal
  bind:open={metaOpen}
  title={viewing?.filename || "Generation metadata"}
  kind="metadata"
  >{#if metaError}<p class="p-4 text-red-400">
      {metaError}
    </p>{:else if metadata}<div class="flex-1 overflow-y-auto p-4 space-y-4">
      <Metadata
        data={metadata}
        onretry={() => repeat(viewing!)}
        onclose={() => (metaOpen = false)}
      />
    </div>{:else}<p class="p-4 text-muted-foreground">
      Loading metadata…
    </p>{/if}</Modal
>

<Modal
  bind:open={deleteOpen}
  kind="confirm"
  title="Delete video?"
  description={`File "${pendingDelete?.filename || ""}" and its metadata will be deleted irrevocably. This action cannot be undone.`}
>
  {#snippet icon()}<Trash2 class="w-4 h-4 text-red-400" />{/snippet}
  <div class="flex justify-end gap-2 mt-1">
    <button
      class="h-8 px-3 rounded-md border border-border bg-input/30 text-xs"
      onclick={() => (deleteOpen = false)}>Cancel</button
    ><button
      class="h-8 px-3 rounded-md bg-destructive text-white text-xs inline-flex items-center gap-2"
      onclick={() => {
        const file = pendingDelete;
        deleteOpen = false;
        if (file) void remove([file]);
      }}><Trash2 class="w-3.5 h-3.5" />Delete</button
    >
  </div>
  <p class="text-[10px] text-muted-foreground/50 text-right -mt-1">
    Enter - delete Esc - cancel
  </p></Modal
>
