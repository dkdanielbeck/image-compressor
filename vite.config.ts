import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/image-compressor/',
  plugins: [
    wasm(),
    topLevelAwait(),
    react()
  ],
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['@jsquash/avif', '@jsquash/webp', '@jsquash/jpeg', '@jsquash/resize']
  }
})
