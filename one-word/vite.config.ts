import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { levelWriterPlugin } from './tools/levelWriterPlugin';

// Relative base so the build works from any static host path (e.g. Hugging Face Spaces).
export default defineConfig({
  base: './',
  plugins: [levelWriterPlugin()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor.html'),
      },
    },
  },
});
