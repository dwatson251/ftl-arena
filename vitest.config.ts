import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@ftl/sim": p("packages/sim/src/index.ts"),
      "@ftl/protocol": p("packages/protocol/src/index.ts"),
      "@ftl/data": p("packages/data/src/index.ts"),
      "@ftl/extract": p("packages/extract/src/index.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
