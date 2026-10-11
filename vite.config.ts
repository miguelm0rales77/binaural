import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

/** Ruta base de despliegue (BASE_PATH): '/' en la raíz de un dominio, '/nombre-repo/' en GitHub Pages. */
const base = `/${(process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    // Sin PWA bajo Vitest: no hace falta y solo añade ruido.
    ...(process.env.VITEST
      ? []
      : [
          VitePWA({
            // 'prompt' sin aviso: el service worker nuevo espera a que se cierre la app, así una
            // actualización nunca recarga la página (ni corta el audio) en mitad de una sesión.
            registerType: 'prompt',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'Binaural',
              short_name: 'Binaural',
              description: 'Generador de tonos con pulso (binaural, monaural e isocrónico) y sonidos de fondo.',
              lang: 'es',
              start_url: base,
              scope: base,
              display: 'standalone',
              background_color: '#0f1218',
              theme_color: '#0f1218',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // Todo lo necesario para funcionar sin conexión, incluidos el worklet y el worker de exportación.
              globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
              navigateFallback: 'index.html',
              cleanupOutdatedCaches: true,
            },
          }),
        ]),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los tests de DSP renderizan minutos de audio: margen para máquinas cargadas.
    testTimeout: 120_000,
  },
})
