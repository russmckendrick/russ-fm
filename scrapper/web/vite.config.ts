import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, run `scrapper --no-open` (port 7878) and `pnpm dev`; the API, SSE feed and artwork
// are proxied through. Point elsewhere with SCRAPPER_URL=http://127.0.0.1:7899 pnpm dev.
const backend = process.env.SCRAPPER_URL ?? 'http://127.0.0.1:7878'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': backend, '/media': backend },
  },
  // A local tool served from the binary: one bundle is fine.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
})
