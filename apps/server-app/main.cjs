/**
 * FTL Arena Server (Electron): the dedicated server with a small window. Settings, Start and Stop, and while
 * it runs the server's own admin page (players, lobbies, logs). It never needs FTL: players' own apps draw
 * the game. The settings live in the app's data folder (ftl-arena-server.json), shared with the admin page.
 */
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const lib = () => require(path.join(__dirname, "dist", "server.cjs"));
const CONFIG = () => path.join(app.getPath("userData"), "ftl-arena-server.json");

function readConfig() {
  const { DEFAULTS, cleanConfig } = lib();
  try {
    return { ...DEFAULTS, ...cleanConfig(JSON.parse(fs.readFileSync(CONFIG(), "utf8"))).cfg };
  } catch {
    return { ...DEFAULTS };
  }
}
function writeConfig(c) {
  fs.mkdirSync(path.dirname(CONFIG()), { recursive: true });
  fs.writeFileSync(CONFIG(), JSON.stringify(c, null, 2) + "\n");
}

let win = null;
let server = null;
/** The settings the running server was started with (a change to these needs a restart). */
let running = null;

/** Save settings (from this window or the admin page); a running server picks up a new admin token at once. */
function save(raw) {
  const { cleanConfig } = lib();
  const c = cleanConfig(raw ?? {});
  if (c.error) return { ok: false, error: c.error };
  const cur = readConfig();
  if (c.cfg.adminToken === "" && raw?.keepToken !== false) delete c.cfg.adminToken;
  const next = { ...cur, ...c.cfg };
  try {
    writeConfig(next);
  } catch (e) {
    return { ok: false, error: `couldn't save: ${e.message}` };
  }
  const restart = !!running && ["port", "host", "upnp", "lan", "client"].some((k) => next[k] !== running[k]);
  if (running) running.adminToken = next.adminToken;
  return { ok: true, restart };
}

function status() {
  return { running: !!server, port: server?.port ?? null, lan: lib().lanAddresses(), config: { ...readConfig(), adminToken: "" }, tokenSet: !!readConfig().adminToken };
}
const tell = () => win?.webContents.send("status", status());

async function start() {
  if (server) return { ok: true, port: server.port };
  const cfg = readConfig();
  try {
    running = { ...cfg };
    server = await lib().startServer({
      port: cfg.port, host: cfg.host, upnp: cfg.upnp, lan: cfg.lan, client: cfg.client || undefined,
      log: (m) => console.log(m),
      admin: { token: () => running?.adminToken ?? "", getConfig: () => ({ ...readConfig(), adminToken: "" }), setConfig: (c) => save(c) },
    });
    tell();
    return { ok: true, port: server.port };
  } catch (e) {
    server = null;
    running = null;
    tell();
    return { ok: false, error: e.code === "EADDRINUSE" ? `Port ${cfg.port} is already in use. Pick another one.` : e.message };
  }
}

async function stop() {
  if (!server) return;
  const s = server;
  server = null;
  running = null;
  await s.close();
  tell();
}

ipcMain.handle("config-get", () => ({ ...readConfig(), adminToken: "" }));
ipcMain.handle("config-save", (_e, c) => {
  const r = save(c);
  tell();
  return r;
});
ipcMain.handle("start", () => start());
ipcMain.handle("stop", () => stop());
ipcMain.handle("status", () => status());
ipcMain.handle("open-external", (_e, url) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : undefined));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1100, height: 800, title: "FTL Arena Server", backgroundColor: "#0b0d12", icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, "control.html"));
  // Links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  // --start: start the server straight away (a shortcut or autostart).
  if (process.argv.includes("--start")) void start();
});

app.on("window-all-closed", async () => {
  await stop();
  app.quit();
});
