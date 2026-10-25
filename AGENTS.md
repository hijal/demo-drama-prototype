# SvelteKit studio

- The UI and local API use Svelte 5 and SvelteKit 3. Read the installed package types/source and current official SvelteKit docs before changing framework integration.
- SvelteKit 3 configuration lives in the `sveltekit(...)` plugin in `web/vite.config.ts`; do not add `svelte.config.js` or restore Next.js.
- Local API handlers live in `web/src/routes/api/**/+server.ts`. Shared ComfyUI logic in `src/lib/` is also imported by `gpu/`; preserve those imports.
- Preserve the studio's existing queue/history localStorage keys, streaming uploads, byte-range media playback and generation workflows.
- `npm run build` produces the Node server (`web/build`) and static Cloudflare UI (`web/dist`). The existing `worker/` backend owns cloud pipeline APIs and authentication; Node filesystem endpoints run only locally/Colab.
- Validate with `npm run typecheck`, `npm test`, `npm run test:pipeline`, `npm run test:gpu`, `npm run build` and `npm run test:ui` as appropriate. Actual model/render acceptance requires Colab GPU testing.
