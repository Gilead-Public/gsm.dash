import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { documentValidatorsPlugin } from './scripts/document-validators.mjs';

// Reports are single files, so the client code is one chunk: chunk imports can't resolve from file://.
// scripts/package-reports.mjs then inlines it and the styles into each page.
export default defineConfig({
  outDir: './dist/astro',
  integrations: [react()],
  build: { format: 'file', inlineStylesheets: 'always' },
  vite: {
    plugins: [documentValidatorsPlugin()],
    build: { rollupOptions: { output: { manualChunks: () => 'app' } } },
  },
});
