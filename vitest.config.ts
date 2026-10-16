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
  },
});
