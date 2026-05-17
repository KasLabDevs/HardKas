import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [
        'fs',
        'path',
        'crypto',
        'os',
        'fs/promises',
        'kaspa',
        'node:fs',
        'node:path',
        'node:crypto',
        'node:os',
        'node:fs/promises',
        '@hardkas/accounts',
        '@hardkas/localnet',
        '@hardkas/simulator'
      ]
    }
  },
  optimizeDeps: {
    exclude: ['@hardkas/react']
  }
})
