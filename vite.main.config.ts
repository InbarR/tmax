import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "node-pty",
        "chokidar",
        "better-sqlite3",
        // Probed at runtime via require('fsevents') in utils/fsevents.ts to
        // decide whether chokidar can safely use a non-polling native watch.
        // Keep it external so the bundler doesn't try to inline the native
        // module (it's darwin-only and absent on Win/Linux build machines).
        "fsevents",
      ],
    },
  },
});
