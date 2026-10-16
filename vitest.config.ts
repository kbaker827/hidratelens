import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          WRITE_TOKEN: "test-write-token-000000000000000000",
          READ_TOKEN: "test-read-token-0000000000000000000",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/worker/**", "public/lib/**"],
      exclude: ["src/worker/types.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
