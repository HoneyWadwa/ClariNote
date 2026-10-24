import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The preview hostname is allowed explicitly (never allowedHosts: true).
const PREVIEW_HOSTS = [
  'pv-1bb7503b778d-f1610af1-ee8f-4646-97f5-b841da18b52b.style.dev',
]

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: PREVIEW_HOSTS,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: false,
      },
    },
  },
})
