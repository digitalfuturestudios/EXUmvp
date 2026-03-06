import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg'],

      manifest: {
        name: 'Exu — Plataforma de Exámenes',
        short_name: 'Exu',
        description: 'Plataforma educativa offline-first para exámenes seguros con entrega QR encriptada.',
        theme_color: '#4f46e5',
        background_color: '#020817',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'es',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
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
        display_override: ['standalone', 'minimal-ui', 'browser'],
      },

      workbox: {
        // Solo precachear lo esencial — menos peso inicial
        globPatterns: ['**/*.{js,css,html,svg}'],
        // Excluir fuentes pesadas del precache (se cachean en runtime)
        globIgnores: ['**/*.{woff,woff2,ttf,eot}'],

        skipWaiting: false,
        clientsClaim: true,

        runtimeCaching: [
          {
            // API Supabase — NetworkFirst con timeout CORTO para baja señal
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/functions\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'exu-api-cache',
              networkTimeoutSeconds: 4, // ← 4s en vez de 10s
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: {
                statuses: [200], // ← Solo cachear 200, NO status 0 ni errores
              },
            },
          },
          {
            // Auth — NUNCA cachear
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/auth\//,
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts CSS — StaleWhileRevalidate (sirve caché inmediato)
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts archivos — CacheFirst (inmutables)
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
            // CDN assets — CacheFirst
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

        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^https:\/\/[a-z0-9]+\.supabase\.co\//,
        ],
      },

      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // ─── Build optimizations para baja señal ─────────────────────────────
  build: {
    // Dividir el bundle en chunks más pequeños
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks separados — se cachean independientemente
          'react-vendor': ['react', 'react-dom'],
          'motion': ['motion/react'],
          'query': ['@tanstack/react-query'],
          'supabase': ['@supabase/supabase-js'],
          'i18n': ['i18next', 'react-i18next'],
          'crypto': ['crypto-js'],
          'ui': ['lucide-react', 'sonner'],
        },
      },
    },
    // Comprimir más agresivamente
    minify: 'esbuild',
    // Tamaño de chunk warning a 400kb
    chunkSizeWarningLimit: 400,
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],
})