import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.TMAX_VITE_PORT) || 5995,
    strictPort: true,
  },
});
