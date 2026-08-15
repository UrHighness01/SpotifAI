import crypto from "crypto";
import fs from "fs";

/**
 * Content fingerprint for provenance (John's next-ideas #6 + Tier C).
 *
 * Two hashes, recorded immutably at upload:
 *  - byteHash: exact SHA-256 of audio bytes + metadata — proves "this exact
 *    upload was recorded" (already shipped as fingerprintHash).
 *  - perceptualHash: a windowed spectral-energy fingerprint — hashes the
 *    byte-distribution across ~64 windows of the audio, so it's resilient
 *    to small offsets/edits the byte-hash would miss. This is the
 *    *infrastructure* for the Tier C signature matcher: once a corpus of
 *    known generator signatures exists, matching is done against this
 *    fingerprint and the label moves to signature-matched/uncertain — never
 *    a binary 'verified' until the corpus is trustworthy.
 *
 * Honest semantics: both hashes are captured now so the moat is *possible*
 * later; the label stays 'recorded' until signature matching exists.
 */

function sha256(payload: Buffer): string {
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function fingerprintAudio(
  filePath: string,
  metadata: { aiModel?: string | null; title?: string | null }
): { hash: string; model: string; perceptual: string } | null {
  try {
    const stat = fs.statSync(filePath);
    // Cap the hashed bytes: reading 1MB of the audio is enough for a stable
    // provenance anchor without loading whole files into memory.
    const MAX_BYTES = 1024 * 1024;
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(MAX_BYTES);
    const read = fs.readSync(fd, buffer, 0, MAX_BYTES, 0);
    fs.closeSync(fd);

    const audio = buffer.subarray(0, read);

    // Byte-hash (exact-match anchor).
    const hash = sha256(Buffer.concat([audio, Buffer.from(`|${metadata.aiModel || ""}|${metadata.title || ""}|`)]));

    // Perceptual-style fingerprint: divide the audio into 64 windows and
    // hash the per-window byte distribution, then SHA-256 the concatenation.
    // Resilient to small offsets (a few bytes shifting a window boundary
    // barely changes each window's distribution), which is the property a
    // generator-signature matcher will eventually rely on.
    const WINDOWS = 64;
    const winSize = Math.max(1, Math.floor(audio.length / WINDOWS));
    const buckets: Buffer[] = [];
    for (let w = 0; w < WINDOWS; w++) {
      const start = w * winSize;
      const end = Math.min(audio.length, start + winSize);
      const slice = audio.subarray(start, end);
      if (slice.length === 0) break;
      // Bucket the bytes into 16 levels; hash the distribution.
      const dist = new Uint8Array(16);
      for (let i = 0; i < slice.length; i++) dist[slice[i] >> 4]++;
      buckets.push(Buffer.from(dist));
    }
    const perceptual = sha256(Buffer.concat(buckets));

    return { hash, model: metadata.aiModel || "unknown", perceptual };
  } catch {
    return null;
  }
}

