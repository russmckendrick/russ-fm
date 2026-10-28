import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import type { Plugin } from 'vite'
import { avatarCropFor, photoSourceFile, type PhotoNotes } from './src/lib/artistPhotoSource'

// Image processing plugin
function imageProcessingPlugin(): Plugin {
  return {
    name: 'image-processing',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next()
        
        // Only log image processing, not every request
        
        // Check if this is a request for a processed image (medium, small, avatar)
        const imageMatch = req.url.match(/^\/(?:album|artist)\/([^/]+)\/([^/]+)-(medium|small|avatar)\.jpg$/)
        if (imageMatch) {
          const [, folder, baseName, size] = imageMatch
          const type = req.url.startsWith('/album') ? 'album' : 'artist'
          let hiResPath = path.join(process.cwd(), 'public', type, folder, `${baseName}-hi-res.jpg`)
          // An artist's sizes come from its photo source (a fanart chosen in the scrapper),
          // with the avatar cut round the faces, as the build does (src/lib/imageProcessor.ts).
          let notes: PhotoNotes | null = null
          if (type === 'artist') {
            try {
              notes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'artist', folder, `${folder}-image.json`), 'utf8'))
              const source = path.join(process.cwd(), 'public', 'artist', folder, photoSourceFile(folder, notes))
              if (fs.existsSync(source)) hiResPath = source
            } catch {
              // No notes yet: the hi-res, cut from the middle.
            }
          }
          
          try {
            // Check if hi-res source exists
            if (fs.existsSync(hiResPath)) {
              console.log(`🖼️  Processing image on-demand: ${type}/${folder}/${baseName}-${size}.jpg`)
              
              // Define target dimensions
              const dimensions = {
                'medium': 800,
                'small': 400,
                'avatar': 128
              }
              
              const targetSize = dimensions[size as keyof typeof dimensions]
              if (!targetSize) {
                res.statusCode = 400
                res.end('Invalid image size')
                return
              }
              
              // Process image directly to buffer (no file writing)
              const image = sharp(hiResPath)
              if (size === 'avatar' && notes) {
                const { width = 0, height = 0 } = await image.metadata()
                const crop = avatarCropFor(notes, width, height)
                if (crop) image.extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size })
              }
              const processedBuffer = await image
                .resize(targetSize, targetSize, {
                  fit: 'cover',
                  position: 'center'
                })
                .jpeg({ quality: 85 })
                .toBuffer()
              
              // Serve the processed image directly from memory
              res.setHeader('Content-Type', 'image/jpeg')
              res.setHeader('Content-Length', processedBuffer.length.toString())
              // In development, use shorter cache or no-cache for easier testing
              const isDev = process.env.NODE_ENV === 'development'
              res.setHeader('Cache-Control', isDev ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000')
              res.statusCode = 200
              res.end(processedBuffer)
              return
            } else {
              // Hi-res source doesn't exist, return 404
              console.log(`❌ Hi-res image not found: ${hiResPath}`)
              res.statusCode = 404
              res.end('Image not found')
              return
            }
          } catch (error) {
            console.warn(`Warning: Could not process image ${req.url}:`, error)
            res.statusCode = 500
            res.end('Image processing error')
            return
          }
        }
        
        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), imageProcessingPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Ensure static assets are served correctly
    fs: {
      strict: false
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries into separate chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-separator', '@radix-ui/react-slot', '@radix-ui/react-switch', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-progress'],
          'animation-vendor': ['framer-motion'],
          'chart-vendor': ['recharts'],
          'utils-vendor': ['clsx', 'tailwind-merge', 'class-variance-authority', 'fuse.js', 'use-debounce']
        }
      }
    },
    // Optimize CSS
    cssCodeSplit: true,
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
})
