import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));
const server = process.env.ARENA_SERVER ?? "http://localhost:8787";
/** The build's version: FTL_ARENA_VERSION (CI sets it from the tag), else this commit's tag, else its short hash. */
function version(): string {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { cwd: p("."), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  const v = process.env.FTL_ARENA_VERSION || git("git describe --tags --exact-match") || git("git rev-parse HEAD").slice(-7) || "dev";
  return v.replace(/^v/, "");
}
export default defineConfig({
  root: p("."),
  publicDir: p("public"),
  define: { __APP_VERSION__: JSON.stringify(version()) },
  resolve: {
    alias: {
      "@ftl/sim": p("../../packages/sim/src/index.ts"),
      "@ftl/protocol": p("../../packages/protocol/src/index.ts"),
      "@ftl/data": p("../../packages/data/src/index.ts"),
      "@ftl/content": p("../../packages/content/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { "/ws": { target: server.replace(/^http/, "ws"), ws: true }, "/assets": server, "/api": server },
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
