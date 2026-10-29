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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (normalized.includes("node_modules")) {
            if (
              normalized.includes("node_modules/react") ||
              normalized.includes("node_modules/react-dom") ||
              normalized.includes("node_modules/scheduler")
            ) {
              return "vendor-react";
            }
            if (normalized.includes("node_modules/lucide-react")) {
              return "vendor-icons";
            }
            return "vendor";
          }
          if (normalized.includes("src/widgets/registry")) return "widget-registry";
          if (normalized.includes("src/widgets/resources/")) return "widget-resources";
          if (normalized.includes("src/widgets/spotify/")) return "widget-spotify";
          if (normalized.includes("src/widgets/weather/")) return "widget-weather";
          if (normalized.includes("src/widgets/speedtest/")) return "widget-speedtest";
          if (normalized.includes("src/widgets/launcher/")) return "widget-launcher";
          if (normalized.includes("src/widgets/bluetooth/")) return "widget-bluetooth";
          if (normalized.includes("src/widgets/battery/")) return "widget-battery";
          if (normalized.includes("src/widgets/calendar/")) return "widget-calendar";
          if (normalized.includes("src/widgets/clock/")) return "widget-clock";
          if (normalized.includes("src/widgets/quick-settings/")) return "widget-quick-settings";
          if (normalized.includes("src/pages/settings/")) return "view-settings";
        },
      },
    },
  },
  // Vitest config
  // @ts-expect-error vitest adds test field to user config
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
