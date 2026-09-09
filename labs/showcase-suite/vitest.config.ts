import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['json', 'html', 'text', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['../../packages/*/src/**/*.ts'],
      exclude: ['../../packages/*/src/**/*.test.ts']
    }
  }
});
