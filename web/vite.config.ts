import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
      deny: [
        '**/.dev.vars',
        '**/.env',
        '**/.env.*',
        '**/*.{crt,pem}',
        '**/.git/**',
        '**/.local-input/**',
        '**/.pipeline-review/**',
        '**/*.fixed.txt',
        '**/*.report.json',
      ],
    },
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
