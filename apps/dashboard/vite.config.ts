import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const virtualMocks = {
  name: 'virtual-mocks',
  enforce: 'pre' as const,
  resolveId(id: string) {
    const mocks = [
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
      '@hardkas/simulator',
      '@hardkas/bridge-local'
    ];
    if (mocks.includes(id)) {
      return `\0virtual:${id}`;
    }
    return null;
  },
  load(id: string) {
    if (id.startsWith('\0virtual:')) {
      if (id.includes('crypto')) {
        return 'export default {}; export const createHash = () => ({ update: () => ({ digest: () => "mock-hash" }) });';
      }
      return 'export default {}; export const planBridgeEntry = () => {}; export const simulatePrefixMining = () => {};';
    }
    return null;
  }
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), virtualMocks],
  optimizeDeps: {
    exclude: ['@hardkas/react']
  }
})
