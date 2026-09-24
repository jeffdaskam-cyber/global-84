import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase/')) {
            return 'firebase'
          }

          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) {
            return 'router'
          }

          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      devOptions: {
        enabled: true
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Gallery thumbnails only. Download fetches (tagged g84dl=1) and
            // full-res originals stay out: this cache stores opaque <img>
            // responses that fetch() can't read, and multi-MB originals would
            // evict the thumbnails.
            urlPattern: ({ url }) =>
              url.hostname === 'firebasestorage.googleapis.com' &&
              !url.searchParams.has('g84dl') &&
              !url.pathname.includes('/o/originals%2F'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage-images',
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Global 84',
        short_name: 'G84',
        start_url: '/',
        display: 'standalone',
        background_color: '#BA0C2F',
        theme_color: '#BA0C2F',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
