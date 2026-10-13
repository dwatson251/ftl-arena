/** What the server app's main process needs, bundled by tools/build-server-app.mjs into dist/server.cjs. */
export { startServer } from "../../server/src/server.ts";
export { cleanConfig, DEFAULTS } from "../../server/src/config.ts";
export { lanAddresses, publicAddress } from "../../server/src/upnp.ts";
