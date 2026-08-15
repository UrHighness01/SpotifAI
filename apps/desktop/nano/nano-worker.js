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
  engine.on("exit", (code) => {
    console.error(`[nano] engine exited (${code}) — will respawn on next request`);
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

function pump() {
  if (busy || queue.length === 0) return;
  busy = true;
  ensureEngine();
  const { prompt, resolve, reject } = queue.shift();

  let out = "";
  const onData = (chunk) => {
    out += chunk.toString();
  };
  const onClose = () => {
    engine.stdout.removeListener("data", onData);
    engine.removeListener("close", onClose);
    busy = false;
    if (out.trim()) resolve(out.trim());
    else reject(new Error("engine produced no output"));
    pump();
  };

  engine.stdout.on("data", onData);
  engine.on("close", onClose);
  engine.stdin.write(prompt + "\n");
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
    if (engine) engine.kill();
    process.exit(0);
  }
});

process.send({ type: "ready" });
