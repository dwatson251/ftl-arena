// The only bridge between the app's setup page and the main process (context isolation on).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ftlArena", {
  findInstalls: () => ipcRenderer.invoke("find-installs"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  extract: (folder) => ipcRenderer.invoke("extract", folder),
  onProgress: (fn) => ipcRenderer.on("extract-progress", (_e, done, total) => fn(done, total)),
  // Ship presets (the game page), kept in the data folder whatever port the game is served on.
  presets: { load: () => ipcRenderer.invoke("presets-load"), save: (list) => ipcRenderer.invoke("presets-save", list) },
});
