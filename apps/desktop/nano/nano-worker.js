/**
 * nano-worker.js — SpotifAI nano track describer worker.
 *
 * Spawns the C engine (apps/desktop/nano/engine/track_describer) once and
 * exposes generate(track) -> blurb over the process's message channel.
 * Loaded from Electron's main process (nano 5), surfaced to the renderer
 * via preload + IPC (nano 6).
 *
 * Hard rules (John's review conditions):
 *  - Generates BLURBS only. Never "why was this recommended" text — that
 *    stays a template on the co-occurrence data.
 *  - Ranking stays co-occurrence; this worker never touches the API.
 */
"use strict";

const { spawn } = require("child_process");
const path = require("path");

const ENGINE = path.join(__dirname, "engine", "track_describer");
const MODEL = path.join(__dirname, "track-describer.bin");
const VOCAB = path.join(__dirname, "engine", "vocab.tsv");

const GEN_TOKENS = 96;

let engine = null;
let busy = false;
let queue = [];

function ensureEngine() {
  if (engine) return;
  engine = spawn(ENGINE, [MODEL, VOCAB, String(GEN_TOKENS)], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  engine.on("error", (err) => {
    console.error(`[nano] engine spawn error: ${err.message}`);
    engine = null;
  });
}

function buildPrompt(track) {
  const head = [
    `title: ${(track.title || "").toLowerCase()}`,
    `aimodel: ${(track.aiModel || "unknown").toLowerCase()}`,
  ];
  if (track.genre) head.push(`genre: ${String(track.genre).toLowerCase()}`);
  if (track.prompt) head.push(`prompt: ${String(track.prompt).toLowerCase()}`);
  return `${head.join(" | ")} | blurb: `;
}

function request(prompt) {
  return new Promise((resolve, reject) => {
    queue.push({ prompt, resolve, reject });
    pump();
  });
}

// Each request gets its own engine run (spawn, write prompt, read output,
// exit). Simple and race-free; the engine is a few-hundred-KB binary that
// starts in milliseconds, and blurb generation is not hot-path.
function pump() {
  if (busy || queue.length === 0) return;
  busy = true;
  const { prompt, resolve, reject } = queue.shift();

  let child;
  try {
    child = spawn(ENGINE, [MODEL, VOCAB, String(GEN_TOKENS)], {
      stdio: ["pipe", "pipe", "inherit"],
    });
  } catch (err) {
    busy = false;
    reject(new Error(`engine spawn failed: ${err.message}`));
    pump();
    return;
  }

  let out = "";
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    child.kill();
    busy = false;
    reject(new Error("engine timed out"));
    pump();
  }, 15000);

  child.stdout.on("data", (chunk) => {
    out += chunk.toString();
  });
  child.on("error", (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    busy = false;
    reject(new Error(`engine spawn error: ${err.message}`));
    pump();
  });
  child.on("close", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    busy = false;
    if (out.trim()) resolve(out.trim());
    else reject(new Error(`engine exited (${code}) with no output`));
    pump();
  });

  child.stdin.write(prompt + "\n");
  child.stdin.end();
}

process.on("message", async (msg) => {
  if (msg && msg.type === "generate" && msg.track) {
    try {
      const blurb = await request(buildPrompt(msg.track));
      process.send({ type: "blurb", id: msg.id, blurb });
    } catch (err) {
      process.send({ type: "error", id: msg.id, error: err.message });
    }
  } else if (msg && msg.type === "shutdown") {
    process.exit(0);
  }
});

process.send({ type: "ready" });
