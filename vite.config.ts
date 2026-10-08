import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const API_PORT = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registrierung übernimmt src/components/pwa/UpdatePrompt.tsx (workbox-window, mit Update-Hinweis)
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'icons/icon.svg', 'robots.txt'],
      manifest: {
        id: '/',
        name: 'Getränke Altinger',
        short_name: 'Altinger',
        description: 'Getränke liefern lassen oder im Markt reservieren – mit Live-Tracking der Lieferung. Für Privat- und Geschäftskunden in Garching und Umgebung.',
        lang: 'de',
        dir: 'ltr',
        theme_color: '#194782',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['shopping', 'food', 'business'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          {
            name: 'Sortiment',
            short_name: 'Sortiment',
            description: 'Getränke durchstöbern und bestellen',
            url: '/sortiment',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Meine Bestellungen',
            short_name: 'Bestellungen',
            description: 'Bestellungen ansehen und Lieferung live verfolgen',
            url: '/bestellungen',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Fahrer-App',
            short_name: 'Fahrer',
            description: 'Touren, Stopps und Zustellnachweise',
            url: '/fahrer',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Markt-Dashboard',
            short_name: 'Markt',
            description: 'Bestellungen, Touren und Live-Karte',
            url: '/admin',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/socket\.io(\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Kartenkacheln (OpenStreetMap) offline vorhalten
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // /api und /socket.io werden bewusst NIE gecacht (keine Regel → Netzwerk)
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/socket.io': { target: `http://localhost:${API_PORT}`, ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4173 },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
