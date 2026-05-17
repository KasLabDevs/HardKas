import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
        'node:fs/promises'
      ]
    }
  }
})
