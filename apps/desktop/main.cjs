/**
 * FTL Arena desktop app (Electron). Everything a player needs in one download:
 * - first run: point it at your own FTL install; it unpacks ftl.dat into the app's data folder (nothing from
 *   FTL ships with the app, and nothing is ever sent to other players);
 * - then it runs the game server in-process (hosting matches for anyone who connects) and opens the game.
 * Joining someone else's match is the game's own Server field (their IP:port).
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const upnp = require("./upnp.cjs");

// A separate data folder can be forced (two copies side by side, testing).
if (process.env.FTL_ARENA_DATA) app.setPath("userData", process.env.FTL_ARENA_DATA);

const DATA = () => app.getPath("userData");
const ASSETS = () => path.join(DATA(), "assets");
const SETTINGS = () => path.join(DATA(), "settings.json");
/** The built client: next to the app when packaged, else the repo's build. */
const CLIENT = app.isPackaged ? path.join(process.resourcesPath, "client") : path.join(__dirname, "../client/dist");
const lib = () => require(path.join(__dirname, "dist", "server.cjs"));

function settings() {
  try {
    return { port: 8787, ...JSON.parse(fs.readFileSync(SETTINGS(), "utf8")) };
  } catch {
    return { port: 8787 };
  }
}
function saveSettings(s) {
  fs.mkdirSync(DATA(), { recursive: true });
  fs.writeFileSync(SETTINGS(), JSON.stringify(s, null, 1));
}
const setUp = () => fs.existsSync(path.join(ASSETS(), "manifest.json"));

let win = null;
let server = null;

/** Start the game server on the saved port (or the next free one) and show the game. */
async function startGame() {
  const s = settings();
  if (!server) {
    let lastErr;
    for (let port = s.port; port < s.port + 10 && !server; port++) {
      try {
        server = await lib().startServer({ port, assets: ASSETS(), client: CLIENT, log: (m) => console.log(m) });
      } catch (e) {
        lastErr = e;
      }
    }
    if (!server) {
      dialog.showErrorBox("FTL Arena", `Couldn't start the game server: ${lastErr?.message ?? lastErr}`);
      return;
    }
  }
  win.loadURL(`http://localhost:${server.port}/`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 760, title: "FTL Arena", backgroundColor: "#000000",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  // Links to the outside world open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  if (setUp()) void startGame();
  else win.loadFile(path.join(__dirname, "setup.html"));
}

function hostWindow() {
  const w = new BrowserWindow({
    width: 560, height: 620, title: "Host a match", parent: win ?? undefined,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  w.setMenu(null);
  w.loadFile(path.join(__dirname, "netinfo.html"));
}

// ---------------------------------------------------------------- setup: find FTL, unpack it

/** Likely FTL folders: Steam (and its other libraries), GOG, on Windows, macOS and Linux. */
function findInstalls() {
  const home = os.homedir();
  const steamRoots = [
    "C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam",
    path.join(home, "Library/Application Support/Steam"), path.join(home, ".steam/steam"), path.join(home, ".local/share/Steam"),
  ];
  const libs = new Set(steamRoots);
  for (const root of steamRoots) {
    try {
      const vdf = fs.readFileSync(path.join(root, "steamapps", "libraryfolders.vdf"), "utf8");
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, "\\"));
    } catch {}
  }
  const candidates = [
    ...[...libs].map((l) => path.join(l, "steamapps", "common", "FTL Faster Than Light")),
    "C:\\GOG Games\\FTL Advanced Edition", "C:\\Program Files (x86)\\GOG Galaxy\\Games\\FTL Advanced Edition",
    "/Applications/FTL.app", path.join(home, "Applications/FTL.app"),
  ];
  return [...new Set(candidates)].filter((c) => datIn(c));
}

/** Where ftl.dat is for a chosen folder (the install itself, or inside the macOS app bundle). */
function datIn(folder) {
  for (const p of [folder, path.join(folder, "FTL.app", "Contents", "Resources"), path.join(folder, "Contents", "Resources")]) {
    const f = path.join(p, "ftl.dat");
    if (fs.existsSync(f)) return f;
  }
  return null;
}

ipcMain.handle("find-installs", () => findInstalls());
ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Choose your FTL folder (the one with ftl.dat)", properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("extract", async (e, folder) => {
  const dat = datIn(folder);
  if (!dat) return { ok: false, error: "That folder has no ftl.dat. Pick the FTL install folder (FTL 1.6 or later)." };
  // Unpack into a scratch folder first, so a half-done setup never looks finished.
  const part = path.join(DATA(), "assets.part");
  fs.rmSync(part, { recursive: true, force: true });
  fs.mkdirSync(part, { recursive: true });
  try {
    const r = await lib().extractFtlAsync({ ftl: dat, out: part }, (done, total) => e.sender.send("extract-progress", done, total));
    fs.rmSync(ASSETS(), { recursive: true, force: true });
    fs.renameSync(part, ASSETS());
    saveSettings({ ...settings(), ftl: folder });
    setTimeout(() => void startGame(), 400);
    return { ok: true, files: r.files };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});

// ---------------------------------------------------------------- hosting: addresses, UPnP, port

ipcMain.handle("net-info", () => ({
  port: server?.port ?? settings().port,
  local: Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address),
}));
ipcMain.handle("public-ip", () =>
  new Promise((resolve) => {
    https.get("https://api.ipify.org", (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => resolve(b.trim()));
    }).on("error", () => resolve(""));
  }),
);
ipcMain.handle("upnp", async () => {
  try {
    const r = await upnp.forward(server?.port ?? settings().port);
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});
ipcMain.handle("set-port", async (_e, port) => {
  const p = Math.max(1024, Math.min(65535, Number(port) | 0));
  saveSettings({ ...settings(), port: p });
  if (server) {
    await server.close();
    server = null;
  }
  await startGame();
  return server?.port ?? p;
});

// ---------------------------------------------------------------- app

function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "FTL Arena",
      submenu: [
        { label: "Host a match (your address, port forwarding)…", click: hostWindow },
        { label: "Re-run setup (choose the FTL folder again)…", click: () => win?.loadFile(path.join(__dirname, "setup.html")) },
        { label: "Open data folder", click: () => void shell.openPath(DATA()) },
        { type: "separator" },
        { role: "reload" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  menu();
  createWindow();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (e) => {
  if (!server) return;
  // Take down the port forward and the server before exiting.
  e.preventDefault();
  const s = server;
  server = null;
  Promise.allSettled([upnp.unforward(), s.close()]).then(() => app.quit());
});
