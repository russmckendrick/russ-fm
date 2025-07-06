import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Ensure static assets are served correctly
    fs: {
      strict: false
    },
    middlewareMode: false,
    // Add middleware to serve static files before React Router
    configureServer(server) {
      server.middlewares.use('/artist', (req, res, next) => {
        // Check if this is a request for a static file (has file extension)
        if (req.url && (req.url.includes('.jpg') || req.url.includes('.json') || req.url.includes('.png'))) {
          // Let the default static file handler serve it
          next()
        } else {
          // This is a route request, let React Router handle it
          next()
        }
      })
    }
  }
})
