import { defineConfig } from 'vite';

export default defineConfig({
  // The app shell is the default build target. A library build (ESM + IIFE)
  // for embedding components in gsm.kri htmlwidgets is planned once
  // @gilead-biostats/gsm.viz ships as an ESM package (design doc §7).
  server: { open: false },
  test: { environment: 'node' },
});
