// Generator-signature corpus collector (John's direction B, slice 55).
//
// The honest escalation ladder's last rung: 'signature-matched' /
// 'signature-uncertain' on top of 'recorded'. That label can only ship when
// backed by a corpus the platform actually trusts — so this script builds
// the corpus FIRST, quietly, from known-generator audio samples. No label
// changes until the corpus is real.
//
// Each sample is a file whose generator is KNOWN (the uploader declares it
// at collection time — provenance of the corpus itself). We compute the same
// windowed perceptual fingerprint the API uses, and record
//   perceptualHash -> { generator, sampleFile, collectedAt }
// into apps/api/prisma/corpus/signatures.jsonl.
//
// Usage:
//   node apps/api/scripts/collect-signatures.js <samples.json>
// where samples.json is [{ file, generator }].
//
// The corpus is a seed; over time it grows as the platform's own uploads
// with declared generators contribute (same fingerprint path). The label
// stays 'recorded' until the corpus is dense enough to be trustworthy.
import crypto from "crypto";
import fs from "fs";
import path from "path";

const SAMPLES_JSON = process.argv[2];
if (!SAMPLES_JSON) {
  console.error("usage: node collect-signatures.js <samples.json>");
  process.exit(1);
}

const CORPUS_DIR = path.resolve(__dirname, "../../prisma/corpus");
const CORPUS_FILE = path.join(CORPUS_DIR, "signatures.jsonl");
const MAX_BYTES = 1024 * 1024;

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function perceptualFingerprint(audio: Buffer): string {
  const WINDOWS = 64;
  const winSize = Math.max(1, Math.floor(audio.length / WINDOWS));
  const buckets: Buffer[] = [];
  for (let w = 0; w < WINDOWS; w++) {
    const start = w * winSize;
    const end = Math.min(audio.length, start + winSize);
    const slice = audio.subarray(start, end);
    if (slice.length === 0) break;
    const dist = new Uint8Array(16);
    for (let i = 0; i < slice.length; i++) dist[slice[i] >> 4]++;
    buckets.push(Buffer.from(dist));
  }
  return sha256Hex(Buffer.concat(buckets));
}

const samples = JSON.parse(fs.readFileSync(path.resolve(SAMPLES_JSON), "utf8")) as { file: string; generator: string }[];
if (!Array.isArray(samples) || samples.length === 0) {
  console.error("samples.json must be a non-empty array of { file, generator }");
  process.exit(1);
}

fs.mkdirSync(CORPUS_DIR, { recursive: true });
const out = fs.createWriteStream(CORPUS_FILE, { flags: "a" });
const now = new Date().toISOString();

let n = 0;
for (const s of samples) {
  const abs = path.resolve(s.file);
  if (!fs.existsSync(abs)) {
    console.error(`skip (missing): ${abs}`);
    continue;
  }
  const audio = fs.readFileSync(abs).subarray(0, MAX_BYTES);
  const record = {
    perceptualHash: perceptualFingerprint(audio),
    byteHash: sha256Hex(audio),
    generator: s.generator,
    sampleFile: abs,
    collectedAt: now,
  };
  out.write(JSON.stringify(record) + "\n");
  n++;
}
out.end();
console.log(`appended ${n} signature sample(s) -> ${CORPUS_FILE}`);
console.log("label stays 'recorded' until this corpus is dense enough to be trustworthy.");
