// The only bridge between the control page and the main process (context isolation on).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("serverApp", {
  getConfig: () => ipcRenderer.invoke("config-get"),
  saveConfig: (c) => ipcRenderer.invoke("config-save", c),
  start: () => ipcRenderer.invoke("start"),
  stop: () => ipcRenderer.invoke("stop"),
  status: () => ipcRenderer.invoke("status"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  onStatus: (fn) => ipcRenderer.on("status", (_e, s) => fn(s)),
});
