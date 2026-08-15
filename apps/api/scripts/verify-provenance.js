#!/usr/bin/env node
/**
 * verify-provenance.js — STANDALONE, dependency-free provenance verifier.
 *
 * Tier I #5 (web-of-trust portability): this script ships as plain Node with
 * zero dependencies so ANY service or listener — not just SpotifAI — can
 * verify a SpotifAI provenance manifest and its audio hashes. The platform
 * stops being the ledger and becomes *a* ledger in an interoperable one:
 * you're not the gatekeeper of truth, you're the most trustworthy publisher
 * of it.
 *
 * Usage:
 *   node verify-provenance.js <manifest-url-or-file> <audio-file> [trackIndex]
 *
 * Verifies:
 *   1. The manifest's Ed25519 signature against the embedded public key.
 *   2. The local audio file's byte-hash matches the manifest entry.
 *
 * Exit codes: 0 = verified, 2 = hash mismatch, 1 = error.
 */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function loadManifest(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`failed to fetch manifest: ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(path.resolve(src), "utf8"));
}

async function main() {
  const [manifestSrc, audioFile, trackIndexStr] = process.argv.slice(2);
  const trackIndex = trackIndexStr ? Number(trackIndexStr) : 0;
  if (!manifestSrc || !audioFile) {
    console.error("usage: node verify-provenance.js <manifest-url|file> <audio-file> [trackIndex]");
    process.exit(1);
  }

  const manifest = await loadManifest(manifestSrc);
  if (manifest.schema !== "spotifai-provenance-v1") {
    console.error("not a spotifai provenance manifest");
    process.exit(1);
  }

  const { signature, ...payload } = manifest;
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(JSON.stringify(payload)), manifest.publicKey, Buffer.from(signature, "base64"));
  } catch {
    valid = false;
  }
  console.log(`manifest: ${manifest.artistName} (${manifest.artistId})`);
  console.log(`signature: ${valid ? "VALID ✓" : "INVALID ✗"}`);
  if (!valid) {
    console.error("manifest signature does not verify — tampered, wrong key, or not Ed25519");
    process.exit(1);
  }

  const entry = manifest.tracks[trackIndex];
  if (!entry) {
    console.error(`no track at index ${trackIndex}`);
    process.exit(1);
  }
  console.log(`track[${trackIndex}]: ${entry.title} (${entry.trackId})`);
  console.log(`  manifest byteHash:  ${entry.byteHash}`);
  console.log(`  manifest perceptual: ${entry.perceptualHash ?? "(none)"}`);

  const bytes = fs.readFileSync(path.resolve(audioFile)).subarray(0, 1024 * 1024);
  const localByteHash = sha256Hex(bytes);
  const match = localByteHash === entry.byteHash;
  console.log(`  local file byteHash: ${localByteHash} -> ${match ? "MATCH ✓" : "NO MATCH ✗"}`);
  process.exit(match ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
