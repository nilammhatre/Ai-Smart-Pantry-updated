import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 15000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    server: {
      deps: {
        external: ["node:sqlite"],
      },
    },
  },
  ssr: {
    external: ["node:sqlite"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
