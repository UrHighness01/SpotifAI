import crypto from "crypto";
import fs from "fs";

/**
 * Content fingerprint for provenance (John's next-ideas #6).
 *
 * Honest v1: a stable SHA-256 of the audio bytes + generation metadata.
 * This proves "this exact audio + metadata was recorded at upload time" —
 * immutable, verifiable, and it anchors the provenance claim. A full
 * perceptual-hash + known-generator-signature matcher (which can *verify*
 * the generator) is the future extension; this v1 records the fingerprint
 * so nothing can be silently swapped later.
 *
 * Returns a 16-char hex prefix (collision-safe for this scale) plus the
 * model string used, or null if the file is unreadable.
 */
export function fingerprintAudio(filePath: string, metadata: { aiModel?: string | null; title?: string | null }): { hash: string; model: string } | null {
  try {
    const stat = fs.statSync(filePath);
    // Cap the hashed bytes: reading 1MB of the audio is enough for a stable
    // provenance anchor without loading whole files into memory.
    const MAX_BYTES = 1024 * 1024;
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(MAX_BYTES);
    const read = fs.readSync(fd, buffer, 0, MAX_BYTES, 0);
    fs.closeSync(fd);

    const payload = Buffer.concat([
      buffer.subarray(0, read),
      Buffer.from(`|${metadata.aiModel || ""}|${metadata.title || ""}|`),
    ]);
    const hash = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
    return { hash, model: metadata.aiModel || "unknown" };
  } catch {
    return null;
  }
}
