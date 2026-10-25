# UI issues — review of 2026-10-25

Checked on the deployed studio (`drama-pipeline.golghor-stream-eb9.workers.dev`, desktop 1440 px and a 390 px phone-width frame) plus a code read of `web/src`. The pipeline screens behind login (Cast, Scenes, Final, Logs) were reviewed from code only, because Cloudflare Access is not configured yet.

## Fixed

| # | Issue | Fix |
|---|---|---|
| 1 | A 401 response showed "Authentication required" with only a **Retry** button that can never succeed. | `api()` turns 401 into a sign-in message; Projects shows a **Sign in** button that reloads the page (Access then shows its login). `web/src/lib/api.ts`, `Pipeline.svelte` |
| 2 | Any non-JSON error body (proxy error page, Access login HTML) crashed `api()` with a JSON parse error instead of the HTTP status. | `response.json()` failures fall back to `Request failed (<status>)`. `web/src/lib/api.ts` |
| 3 | Status wording differed: the sidebar said "Colab offline", the Projects badge said "GPU offline". | Both say "Colab offline". `Pipeline.svelte` |
| 4 | Gallery folder subtitle had mismatched quotes: `Folder "name»`. | `Folder "name"`. `Gallery.svelte` |
| 5 | Duration hint said "manual input: 60–719 frame." | "frames". `Generate.svelte` |

## Open — needs a decision or comes after the video flow

| # | Issue | Where | Suggestion |
|---|---|---|---|
| 6 | **Phone width is unusable.** The sidebar is fixed at 240 px, so it takes about 60 % of a 390 px screen and the Projects text wraps 2–3 words per line. The `@media (max-width: 760px) .sidebar {…}` rules in `pipeline.css` target a `.sidebar` class that the Svelte `Sidebar` no longer has, so they never apply. | `Sidebar.svelte`, `pipeline.css` | Collapse the sidebar to the 68 px icon rail below 760 px (or a bottom bar), and delete the dead `.sidebar` rules. Owner: after the video flow. |
| 7 | On the cloud studio, **Gallery shows grey loading tiles forever**, because `startGallery()` only runs in manual mode. Generate is shown but cannot submit, and Settings opens with "ComfyUI: Not available" and Models 0/0. | `App.svelte`, `Gallery.svelte`, `Settings.svelte` | Keep the original shell (this is intentional, see `tests/browser/pipeline.spec.ts`), but show an empty state such as "Manual generation runs on Colab, open the notebook" instead of skeletons, and hide or disable the ComfyUI-only Settings tabs. |
| 8 | `/api/status` is polled twice: by `App.svelte` every 5 s and by `Pipeline.svelte` every 3 s. | both | Share one status store. |
| 9 | Templates call `JSON.parse` on DB fields (`spec_json`, `files_json`, `qa_json`). One malformed row would break the whole Projects page. | `Pipeline.svelte` | Use a safe-parse helper. |
| 10 | Errors show twice: a toast and the inline red line, with the same text. | `Pipeline.svelte` `action()` | Keep one. |
| 11 | Uploading a `.txt` replaces the "Original script" pane, even when the project already has a stored raw version. Picking an older version from Version history does not update the Original pane. | `Pipeline.svelte` | Decide which version "Original" should show. |
| 12 | The shortcut hint says `Ctrl + Enter` on macOS. | `Generate.svelte` | Show `⌘ + Enter` on Mac. |

## Next.js parity pass (2026-10-26)

Owner request: the Svelte studio must look and behave like the Next.js studio on `main` for everything video generation needs. Ported from the Next.js components, keeping their markup and Tailwind classes:

| Next.js component | Svelte |
|---|---|
| `generation-status` (timer, phase colours, live preview with pass/step, Try again) | `GenerationStatus.svelte` |
| `ui/slider` + `setting-slider` (Radix look, amber out-of-range input, formatValue) | `Slider.svelte`, `SettingSlider.svelte` |
| `mention-textarea` + `mention-preview` (caret `@` popup, hover preview card, resize handle, auto height) | `MentionTextarea.svelte` |
| `prompt-editor-dialog` (toolbar, Insert / History / Examples tabs, scene templates) | `PromptEditor.svelte` |
| `prompt-quality` (rounded chips with ✓ / !) | `PromptQuality.svelte` |
| `ref-viewer-dialog`, reference cards (drag highlight, video thumbnails, arrows) | `References.svelte`, `Modal.svelte` (`kind="reference"`) |
| History / Examples dropdowns, badges, folder menu, Generate button | `Generate.svelte` |
| `meta-dialog` (thumbnails, intent labels, detail, filtered "More") | `Metadata.svelte` |
| `video-gallery-grid` (numbered cards, poster + hover play, generation-time fallback) | `Gallery.svelte` |
| `gallery-view` folder panel (inline rename, drag ring) | `Gallery.svelte` |
| `video-lightbox` (gradient seek bar, auto-hiding controls and hints) | `VideoLightbox.svelte` |
| `system-stats-bar`, health dot ping | `SystemStatsBar.svelte`, `Sidebar.svelte` |
| `queue-indicator` (accent, pulse, indeterminate bar, footer) | `Queue.svelte` |
| `models-panel` rows, ComfyUI tab, manual download panel | `Settings.svelte` |
| `models-warning-banner` | `App.svelte` |
| sonner toasts (incl. Cancel action) | `svelte-sonner` in `App.svelte` |

Cloud studio: the sidebar now shows CPU / RAM / GPU / VRAM from the Colab GPU worker heartbeat (`gpu/src/stats.ts`), since there is no local ComfyUI to poll.

Not verified in a browser against main side by side after the port (the screenshot comparison ran before it, on Colab). Browser tests (`npm run test:ui`) were not run on the owner's low-memory Mac.
