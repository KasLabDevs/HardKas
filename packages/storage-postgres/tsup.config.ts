import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // ESM only: the manifest (main/module/types) names dist/index.js and dist/index.d.ts, so a CommonJS build was never
  // reachable and only added unreferenced files to the tarball (RC2 · P, UNREFERENCED_FILE).
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['postgres'],
  esbuildOptions(options) {
    options.platform = 'node';
  }
});
