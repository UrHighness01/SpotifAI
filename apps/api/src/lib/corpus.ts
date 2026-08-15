import fs from "fs";
import path from "path";

/**
 * Passive corpus self-growth (John's ranked #1): the signatures corpus grows
 * from the platform's own uploads where the generator is DECLARED alongside
 * the fingerprint. Called at upload time (fire-and-forget) and from the
 * grow-corpus.ts backfill script.
 *
 * Honest model (trust-floor runbook): the generator label is the uploader's
 * self-report — declared-provenance, exactly as the runbook defines. The
 * provenance label stays 'recorded'; we're just accumulating evidence
 * privately. No label escalates until the runbook density threshold is met.
 */

const KNOWN_GENERATORS = ["suno v3.5", "suno v4", "udio"];

const CORPUS_FILE = path.resolve(__dirname, "../../../prisma/corpus/signatures.jsonl");

export function isKnownGenerator(model: string | null | undefined): boolean {
  return Boolean(model && KNOWN_GENERATORS.includes(model.toLowerCase()));
}

// Appends a declared-upload signature record (content-addressed, deduped by
// byteHash = sampleId). Fire-and-forget: never throws into the request path.
export function recordDeclaredSignature(entry: {
  perceptualHash?: string | null;
  byteHash?: string | null;
  generator?: string | null;
  trackId?: string | null;
}): void {
  try {
    if (!entry.byteHash || !entry.perceptualHash || !isKnownGenerator(entry.generator)) return;
    const CORPUS_DIR = path.dirname(CORPUS_FILE);
    fs.mkdirSync(CORPUS_DIR, { recursive: true });

    // Skip if already present (content-addressed).
    if (fs.existsSync(CORPUS_FILE)) {
      for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
        try {
          if (JSON.parse(line).sampleId === entry.byteHash) return;
        } catch {
          /* skip malformed */
        }
      }
    }

    const record = {
      perceptualHash: entry.perceptualHash,
      byteHash: entry.byteHash,
      generator: (entry.generator ?? "unknown").toLowerCase(),
      sample: entry.trackId ? `track-${entry.trackId}` : "declared",
      sampleId: entry.byteHash,
      collectedAt: new Date().toISOString(),
      source: "declared-upload",
    };
    fs.appendFileSync(CORPUS_FILE, JSON.stringify(record) + "\n");
  } catch {
    // Never let corpus bookkeeping break an upload.
  }
}
