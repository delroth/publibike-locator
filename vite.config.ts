import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  // Allow hosting on arbitrary subdirectory.
  base: './',
  plugins: [
    solid(),
  ],
  server: { host: '0.0.0.0' },
  worker: { format: 'es' },
})
