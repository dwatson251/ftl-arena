import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));
const server = process.env.ARENA_SERVER ?? "http://localhost:8787";
export default defineConfig({
  root: p("."),
  publicDir: p("public"),
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
  // main.ts awaits Pixi at the top level, which needs an ES2022 target.
  // Built code goes under /app/: /assets/ is the player's extracted FTL files.
  // Pixi gets its own chunk: its renderer chunks import shared Pixi code, and if that sat in the entry chunk
  // (which awaits Pixi at the top level) the two would wait on each other forever.
  build: {
    outDir: "dist", emptyOutDir: true, target: "es2022", assetsDir: "app", chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: (id) => (id.includes("node_modules/pixi.js") ? "pixi" : undefined) } },
  },
});
