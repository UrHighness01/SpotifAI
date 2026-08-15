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
 *   node verify-provenance.js <manifest-url> <audio-file> [trackIndex] --pin-key <key-endpoint-or-pem>
 *
 * Verifies:
 *   1. The manifest's Ed25519 signature against the embedded public key.
 *   2. (Trust-root pinning — John's consolidation #1) When a manifest URL is
 *      used, the embedded public key is cross-checked against the
 *      separately-fetched /artists/provenance-public-key from the same
 *      origin (the independent trust root). Without this, a MITM could swap
 *      the embedded key + re-sign. The --pin-key flag accepts an explicit
 *      expected key (PEM or a key-endpoint URL) for fully offline pinning.
 *   3. The local audio file's byte-hash matches the manifest entry.
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

// Fetch the platform's independently-published public key from the same
// origin as the manifest (the trust root that lives OUTSIDE the manifest).
async function fetchPlatformKey(manifestUrl) {
  const origin = new URL(manifestUrl).origin;
  const res = await fetch(`${origin}/artists/provenance-public-key`);
  if (!res.ok) throw new Error(`failed to fetch platform public key: ${res.status}`);
  const body = await res.json();
  return body.key;
}

async function main() {
  const args = process.argv.slice(2);
  let manifestSrc, audioFile, trackIndexStr, pinnedKey = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pin-key") pinnedKey = args[++i];
    else if (manifestSrc === undefined) manifestSrc = args[i];
    else if (audioFile === undefined) audioFile = args[i];
    else trackIndexStr = args[i];
  }
  const trackIndex = trackIndexStr ? Number(trackIndexStr) : 0;
  if (!manifestSrc || !audioFile) {
    console.error("usage: node verify-provenance.js <manifest-url|file> <audio-file> [trackIndex] [--pin-key <key|url>]");
    process.exit(1);
  }

  const manifest = await loadManifest(manifestSrc);
  if (manifest.schema !== "spotifai-provenance-v1") {
    console.error("not a spotifai provenance manifest");
    process.exit(1);
  }

  // Resolve the trust root: explicit pin > platform key endpoint (same
  // origin) > embedded key (self-consistent only, weaker).
  let trustKey = manifest.publicKey;
  let trustSource = "embedded (self-consistent only)";
  try {
    if (pinnedKey) {
      if (/^https?:\/\//.test(pinnedKey)) {
        const res = await fetch(pinnedKey);
        if (!res.ok) throw new Error(`failed to fetch pinned key: ${res.status}`);
        trustKey = (await res.json()).key;
        trustSource = `pinned (${pinnedKey})`;
      } else {
        trustKey = pinnedKey;
        trustSource = "pinned (explicit key)";
      }
    } else if (/^https?:\/\//.test(manifestSrc)) {
      trustKey = await fetchPlatformKey(manifestSrc);
      trustSource = "platform key endpoint (same origin)";
    }
  } catch (err) {
    console.error(`note: could not fetch independent trust root — using embedded key only: ${err.message}`);
  }

  // Cross-check: if the embedded key differs from the trusted key, the
  // manifest may be a forgery (key swapped + re-signed by an attacker).
  if (trustSource !== "embedded (self-consistent only)" && manifest.publicKey !== trustKey) {
    console.error("MANIFEST PUBLIC KEY DOES NOT MATCH THE TRUSTED KEY — possible forgery");
    process.exit(1);
  }

  const { signature, ...payload } = manifest;
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(JSON.stringify(payload)), trustKey, Buffer.from(signature, "base64"));
  } catch {
    valid = false;
  }
  console.log(`manifest: ${manifest.artistName} (${manifest.artistId})`);
  console.log(`trust root: ${trustSource}`);
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
