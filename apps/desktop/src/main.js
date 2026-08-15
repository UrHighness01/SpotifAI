const { app, BrowserWindow, session, ipcMain } = require("electron");
const path = require("path");
const { fork } = require("child_process");

const WEB_URL = process.env.SPOTIFAI_WEB_URL || "http://localhost:5173";
// Vite's dev server injects an inline bootstrap script for React Fast Refresh
// that a strict script-src blocks outright (no external <script src>, so
// 'unsafe-inline' can't be scoped to it). Only relax CSP when pointed at that
// dev server; a packaged build loading a built bundle keeps the strict policy.
const IS_DEV_SERVER = WEB_URL.includes("localhost") || WEB_URL.includes("127.0.0.1");

// ── Nano track describer (on-device, offline, free) ─────────────────────
// Spawns the worker that owns the C engine. Hard rules (John's review):
// blurb generation only — never recommendation explanations; ranking stays
// co-occurrence. If the worker or engine fails to start, the app degrades
// gracefully (no blurb section) instead of crashing.
const NANO_WORKER = path.join(__dirname, "..", "nano", "nano-worker.js");
let nanoWorker = null;
let nanoReady = false;
let nanoRequestSeq = 0;
const nanoPending = new Map();

function startNanoWorker() {
  if (nanoWorker) return;
  try {
    nanoWorker = fork(NANO_WORKER, [], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  } catch (err) {
    console.error("[nano] failed to fork worker:", err.message);
    nanoWorker = null;
    return;
  }
  nanoWorker.on("message", (msg) => {
    if (msg && msg.type === "ready") {
      nanoReady = true;
    } else if (msg && (msg.type === "blurb" || msg.type === "error") && nanoPending.has(msg.id)) {
      const { resolve, reject } = nanoPending.get(msg.id);
      nanoPending.delete(msg.id);
      if (msg.type === "blurb") resolve(msg.blurb);
      else reject(new Error(msg.error));
    }
  });
  nanoWorker.on("exit", () => {
    nanoReady = false;
    nanoWorker = null;
    // Fail any in-flight requests cleanly.
    for (const [, { reject }] of nanoPending) reject(new Error("nano worker exited"));
    nanoPending.clear();
  });
}

function nanoDescribe(track) {
  return new Promise((resolve, reject) => {
    if (!nanoReady || !nanoWorker) {
      reject(new Error("nano not ready"));
      return;
    }
    const id = ++nanoRequestSeq;
    nanoPending.set(id, { resolve, reject });
    nanoWorker.send({ type: "generate", id, track });
  });
}

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
  startNanoWorker();

  // IPC bridge: renderer asks for a track blurb → worker → response.
  ipcMain.handle("nano:describe", async (_event, track) => {
    try {
      return { ok: true, blurb: await nanoDescribe(track) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle("nano:status", () => ({ ready: nanoReady, model: path.join(__dirname, "..", "nano", "track-describer.bin") }));

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

app.on("before-quit", () => {
  if (nanoWorker) {
    try {
      nanoWorker.send({ type: "shutdown" });
    } catch {
      /* already gone */
    }
  }
});
