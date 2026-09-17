import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// PORT lets a preview runner assign a free port; otherwise Vite picks its own default.
export default defineConfig(({ mode }) => {
  const port = Number(loadEnv(mode, ".", "PORT").PORT) || undefined;
  return {
    plugins: [react()],
    server: { port },
    preview: { port },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      setupFiles: ["src/test/setup.ts"],
    },
  };
});
