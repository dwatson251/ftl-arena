// The only bridge between the app's own setup / network pages and the main process (context isolation on).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ftlArena", {
  findInstalls: () => ipcRenderer.invoke("find-installs"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  extract: (folder) => ipcRenderer.invoke("extract", folder),
  onProgress: (fn) => ipcRenderer.on("extract-progress", (_e, done, total) => fn(done, total)),
  netInfo: () => ipcRenderer.invoke("net-info"),
  publicIp: () => ipcRenderer.invoke("public-ip"),
  upnp: () => ipcRenderer.invoke("upnp"),
  setPort: (port) => ipcRenderer.invoke("set-port", port),
});
