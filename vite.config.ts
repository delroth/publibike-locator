import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

const allowedHosts = process.env.ALLOWED_HOSTS?.split(',') ?? []

export default defineConfig({
  // Allow hosting on arbitrary subdirectory.
  base: './',
  plugins: [
    solid(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts,
  },
  worker: { format: 'es' },
})
