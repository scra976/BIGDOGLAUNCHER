import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        onstart(args) {
          const extra = process.env.BIGDOG_ROLE === "studio" ? ["--studio"] : [];
          args.startup([".", "--no-sandbox", ...extra]);
        },
      },
      preload: {
        input: "electron/preload.ts",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: process.env.BIGDOG_ROLE === "studio" ? 5174 : 5173,
    strictPort: true,
  },
});
