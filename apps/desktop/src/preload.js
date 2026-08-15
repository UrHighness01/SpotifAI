const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("spotifaiDesktop", {
  isDesktop: true,
});
