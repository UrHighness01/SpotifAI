const { app, BrowserWindow, session } = require("electron");
const path = require("path");

const WEB_URL = process.env.SPOTIFAI_WEB_URL || "http://localhost:5173";
// Vite's dev server injects an inline bootstrap script for React Fast Refresh
// that a strict script-src blocks outright (no external <script src>, so
// 'unsafe-inline' can't be scoped to it). Only relax CSP when pointed at that
// dev server; a packaged build loading a built bundle keeps the strict policy.
const IS_DEV_SERVER = WEB_URL.includes("localhost") || WEB_URL.includes("127.0.0.1");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
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
  const scriptSrc = IS_DEV_SERVER ? "script-src 'self' 'unsafe-inline' " + WEB_URL + "; " : "";
  const csp =
    "default-src 'self' " + WEB_URL + "; " + scriptSrc +
    "connect-src 'self' " + WEB_URL + " http://localhost:4000 ws://localhost:5173; " +
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
