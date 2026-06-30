import { defineConfig } from 'vitest/config';
import fs from 'node:fs';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./test/setup.ts']
  }
});
