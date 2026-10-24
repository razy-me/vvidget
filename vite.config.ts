import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  // Vitest config
  // @ts-expect-error vitest adds test field to user config
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
