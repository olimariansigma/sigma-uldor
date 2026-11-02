// Narrow bridge for the launcher page only (the game windows get no preload).
const { contextBridge, ipcRenderer } = require('electron');
const progress = {};
ipcRenderer.on('dl-progress', (_e, d) => { const f = progress[d.version]; if (f) f(d.got, d.total); });
contextBridge.exposeInMainWorld('wyNative', {
  info: () => ipcRenderer.invoke('info'),
  installed: () => ipcRenderer.invoke('installed'),
  releases: () => ipcRenderer.invoke('releases'),
  download: async (version, url, onProgress) => { progress[version] = onProgress; try { await ipcRenderer.invoke('download', version, url); } finally { delete progress[version]; } },
  remove: (version) => ipcRenderer.invoke('remove', version),
  play: (version) => ipcRenderer.invoke('play', version),
  open: (url) => ipcRenderer.invoke('open', url),
  quit: () => ipcRenderer.invoke('quit'),
});
