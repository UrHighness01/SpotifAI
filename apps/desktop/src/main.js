const { app, BrowserWindow, session } = require("electron");
const path = require("path");

const WEB_URL = process.env.SPOTIFAI_WEB_URL || "http://localhost:5173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(WEB_URL);
}

app.whenReady().then(() => {
  const csp =
    "default-src 'self' " + WEB_URL + "; connect-src 'self' " + WEB_URL + " http://localhost:4000; " +
    "media-src 'self' http://localhost:4000; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://localhost:4000;";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
