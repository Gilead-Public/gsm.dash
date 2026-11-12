import { defineConfig } from 'vite';
import { studyValidatorPlugin } from './scripts/study-validator.mjs';

export default defineConfig({
  // The app shell is the default build target. A library build (ESM + IIFE)
  // for embedding components in gsm.kri htmlwidgets is planned once
  // @gilead-biostats/gsm.viz ships as an ESM package (design doc §7).
  server: { open: false },
  plugins: [studyValidatorPlugin()],
  test: {
    environment: 'node',
    // Playwright owns e2e/*.spec.js; Vitest's default discovery would also collect them.
    include: ['test/**/*.test.js', 'validation/**/*.test.js'],
    exclude: ['e2e/**', 'node_modules/**', 'validation-runs/**'],
  },
});
