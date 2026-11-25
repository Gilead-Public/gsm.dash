import { defineConfig } from 'vite';
import { documentValidatorsPlugin } from './scripts/document-validators.mjs';

// Vitest's configuration. The reports are built by Astro (astro.config.mjs); the tests need the same schema validators.
export default defineConfig({
  plugins: [documentValidatorsPlugin()],
  test: {
    environment: 'node',
    // Playwright owns e2e/*.spec.js; Vitest's default discovery would also collect them.
    include: ['test/**/*.test.js', 'validation/**/*.test.js'],
    exclude: ['e2e/**', 'node_modules/**', 'validation-runs/**'],
  },
});
