import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),

    // ─── Progressive Web App ───────────────────────────────────────────────
    VitePWA({
      registerType: 'autoUpdate', // Auto-registers SW; new versions wait until user navigates

      // Assets to include in the precache manifest
      includeAssets: ['icon.svg', 'favicon.svg'],

      // ─── Web App Manifest ───────────────────────────────────────────────
      manifest: {
        name: 'Exu — Plataforma de Exámenes',
        short_name: 'Exu',
        description:
          'Plataforma educativa offline-first para exámenes seguros con entrega QR encriptada.',
        theme_color: '#4f46e5',
        background_color: '#020817',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'es',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Unirse a Examen',
            short_name: 'Examen',
            description: 'Ingresa un código de examen',
            url: '/?action=join',
            icons: [{ src: 'icon.svg', sizes: 'any' }],
          },
        ],
        // Display override for iOS Safari
        display_override: ['standalone', 'minimal-ui', 'browser'],
      },

      // ─── Workbox Caching Strategies ─────────────────────────────────────
      workbox: {
        // Files to precache (app shell)
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff,ttf}'],

        // skipWaiting: false → new SW waits for existing tabs to close
        // This is CRITICAL for exam integrity: never auto-reload mid-exam.
        skipWaiting: false,
        clientsClaim: true,

        // Runtime caching rules (in priority order)
        runtimeCaching: [
          {
            // Supabase Edge Functions / API — NetworkFirst with 10s fallback
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/functions\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'exu-api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              // Only cache GET requests
              matchOptions: {
                ignoreVary: true,
              },
            },
          },
          {
            // Supabase Auth — NetworkOnly (NEVER cache auth tokens)
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/auth\//,
            handler: 'NetworkOnly',
          },
          {
            // Supabase Storage (signed URLs) — NetworkFirst short TTL
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'exu-storage-cache',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 30, // 30 min
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts stylesheets — StaleWhileRevalidate
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Google Fonts webfonts — CacheFirst (immutable)
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // CDN / unpkg assets — CacheFirst
            urlPattern: /^https:\/\/(cdn|unpkg|cdnjs)\./,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],

        // Offline fallback: serve index.html for navigation requests
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          // Don't cache API routes
          /^\/api\//,
          // Don't cache Supabase routes
          /^https:\/\/[a-z0-9]+\.supabase\.co\//,
        ],
      },

      // ─── Dev mode (enabled for SW testing in development) ───────────────
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],

  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})