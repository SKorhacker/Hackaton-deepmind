import { defineConfig } from 'vite';

// Relative base so the build works from any static host path (e.g. Hugging Face Spaces).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
