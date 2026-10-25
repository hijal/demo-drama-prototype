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
