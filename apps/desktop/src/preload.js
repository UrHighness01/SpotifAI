const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spotifaiDesktop", {
  isDesktop: true,
  // Nano track describer — on-device blurb generation (offline, free).
  // Returns { ok: true, blurb } or { ok: false, error }. The worker/engine
  // degrade gracefully when the model isn't present (dev machines, early
  // boot), so callers should hide the section on !ok.
  nanoDescribe: (track) => ipcRenderer.invoke("nano:describe", track),
  // Offline mood/energy tags (John's next-ideas #4) — instant, no model.
  nanoTags: (track) => ipcRenderer.invoke("nano:tags", track),
  nanoStatus: () => ipcRenderer.invoke("nano:status"),
});
