/** The build's version (vite.config's define: the release tag, or the commit's short hash). */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
/** Debug tools (the battle drawer, the lobby's checkbox): only in a dev build (`npm run dev`, Vite's dev server). */
export const DEV_TOOLS: boolean = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
