import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const API_PORT = Number(process.env.API_PORT ?? 8787);

// PWA-Plugin wird in der Foundation-Phase ergänzt (vite-plugin-pwa).
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
