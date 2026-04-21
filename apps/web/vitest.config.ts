import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentMatchGlobs: [
      ["app/**/*.test.ts", "node"],
      ["lib/**/*.test.ts", "node"],
    ],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/tests/**", "**/.next/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@bookiji-inc/stripe-test-harness": path.resolve(
        __dirname,
        "../../packages/stripe-test-harness/src",
      ),
      "@bookiji-inc/auth-test-harness": path.resolve(
        __dirname,
        "../../packages/auth-test-harness/src",
      ),
    },
  },
} as Parameters<typeof defineConfig>[0]);
