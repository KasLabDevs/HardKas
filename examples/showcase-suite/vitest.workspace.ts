import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/*/vite.config.ts',
  'vitest.config.ts'
]);
