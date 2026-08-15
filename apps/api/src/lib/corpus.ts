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

// Normalize generator names so declared uploads ('suno v4') and curated
// samples ('suno-v4') land in the same bucket — otherwise the density
// counts split across spellings and the gate never converges.
export function normalizeGenerator(gen: string | null | undefined): string | null {
  if (!gen) return null;
  const g = gen.toLowerCase().replace(/[-_\s]+/g, " ").trim();
  if (g.startsWith("suno v3")) return "suno v3.5";
  if (g.startsWith("suno v4") || g.startsWith("suno-v4")) return "suno v4";
  if (g.startsWith("udio")) return "udio";
  return g;
}

export function isKnownGenerator(model: string | null | undefined): boolean {
  const g = normalizeGenerator(model);
  return Boolean(g && KNOWN_GENERATORS.includes(g));
}

// John's ticket (a): the dedup must NOT sync-read the whole corpus file per
// upload — that's O(corpus) per upload and the growth ceiling. Load the
// existing sampleIds ONCE at module load into a Set (one read per process
// start), check in-memory per upload, and append to the Set on write. The
// Set only grows; a process restart re-reads the file once. (Concurrent
// duplicate races are harmless for a corpus — best-effort dedup.)
const knownSampleIds = new Set<string>();
try {
  if (fs.existsSync(CORPUS_FILE)) {
    for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
      try {
        const sampleId = JSON.parse(line).sampleId;
        if (typeof sampleId === "string") knownSampleIds.add(sampleId);
      } catch {
        /* skip malformed */
      }
    }
  }
} catch {
  /* corpus unavailable — dedup starts empty */
}

// Appends a declared-upload signature record (content-addressed, deduped by
// byteHash = sampleId via the in-memory Set). Fire-and-forget: never throws
// into the request path.
export function recordDeclaredSignature(entry: {
  perceptualHash?: string | null;
  byteHash?: string | null;
  generator?: string | null;
  trackId?: string | null;
}): void {
  try {
    if (!entry.byteHash || !entry.perceptualHash || !isKnownGenerator(entry.generator)) return;
    if (knownSampleIds.has(entry.byteHash)) return; // O(1) check

    const CORPUS_DIR = path.dirname(CORPUS_FILE);
    fs.mkdirSync(CORPUS_DIR, { recursive: true });

    const record = {
      perceptualHash: entry.perceptualHash,
      byteHash: entry.byteHash,
      generator: normalizeGenerator(entry.generator) ?? (entry.generator ?? "unknown").toLowerCase(),
      sample: entry.trackId ? `track-${entry.trackId}` : "declared",
      sampleId: entry.byteHash,
      collectedAt: new Date().toISOString(),
      source: "declared-upload",
    };
    fs.appendFileSync(CORPUS_FILE, JSON.stringify(record) + "\n");
    knownSampleIds.add(entry.byteHash);
  } catch {
    // Never let corpus bookkeeping break an upload.
  }
}

