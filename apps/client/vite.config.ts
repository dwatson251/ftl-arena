import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));
const server = process.env.ARENA_SERVER ?? "http://localhost:8787";
export default defineConfig({
  root: p("."),
  publicDir: false,
  resolve: {
    alias: {
      "@ftl/sim": p("../../packages/sim/src/index.ts"),
      "@ftl/protocol": p("../../packages/protocol/src/index.ts"),
      "@ftl/data": p("../../packages/data/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { "/ws": { target: server.replace(/^http/, "ws"), ws: true }, "/assets": server },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
