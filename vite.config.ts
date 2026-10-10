import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los tests de DSP renderizan minutos de audio: margen para máquinas cargadas.
    testTimeout: 120_000,
  },
})
