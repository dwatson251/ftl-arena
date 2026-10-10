/**
 * FTL Arena server, from the command line:
 *   npm run server -- [--port 8787] [--assets assets-local]
 * Serves apps/client/dist too once it's been built (npm run build).
 */
import { resolve } from "node:path";
import { startServer } from "./server.ts";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
await startServer({
  // This is the player's own server (development): offer their FTL save to "Load from FTL".
  ftlSave: true,
  port: Number(arg("--port", process.env.PORT ?? "8787")),
  assets: arg("--assets", "assets-local"),
  client: resolve("apps/client/dist"),
});
