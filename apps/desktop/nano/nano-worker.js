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

// John's review guard #1: cap the request queue so a flapping renderer can't
// stack unbounded spawned engine processes. Requests beyond the cap are
// rejected fast (the renderer degrades gracefully).
const MAX_QUEUE = 8;
// John's review guard #2: truncate renderer-supplied track fields at the IPC
// boundary — belt-and-suspenders memory hygiene even though the C engine
// clamps the prompt to 2048 chars.
const MAX_FIELD_CHARS = 256;

let engine = null;
let busy = false;
let queue = [];

function truncate(value) {
  if (value == null) return "";
  return String(value).slice(0, MAX_FIELD_CHARS);
}

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
    `title: ${truncate(track.title).toLowerCase()}`,
    `aimodel: ${truncate(track.aiModel || "unknown").toLowerCase()}`,
  ];
  if (track.genre) head.push(`genre: ${truncate(track.genre).toLowerCase()}`);
  if (track.prompt) head.push(`prompt: ${truncate(track.prompt).toLowerCase()}`);
  return `${head.join(" | ")} | blurb: `;
}

function request(prompt) {
  return new Promise((resolve, reject) => {
    if (queue.length >= MAX_QUEUE) {
      reject(new Error("nano queue full — try again"));
      return;
    }
    queue.push({ prompt, resolve, reject });
    pump();
  });
}

// Tags mode: `track_describer --tags < prompt` — no model, instant.
function requestTags(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(ENGINE, ["--tags"], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk.toString()));
    child.on("error", (err) => reject(new Error(`tags spawn error: ${err.message}`)));
    child.on("close", (code) => {
      if (out.trim()) resolve(out.trim());
      else reject(new Error(`tags exited (${code}) with no output`));
    });
    child.stdin.write(prompt + "\n");
    child.stdin.end();
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
  } else if (msg && msg.type === "tags" && msg.track) {
    // Offline mood/energy tags (John's next-ideas #4): deterministic
    // keyword classifier via `track_describer --tags` — no model needed,
    // instant, local. Drives "play similar by vibe" offline.
    try {
      const tags = await requestTags(buildPrompt(msg.track));
      process.send({ type: "tags-result", id: msg.id, tags });
    } catch (err) {
      process.send({ type: "error", id: msg.id, error: err.message });
    }
  } else if (msg && msg.type === "shutdown") {
    process.exit(0);
  }
});

process.send({ type: "ready" });
