// Corpus stats (John's measurement action, slice 62): monitor the
// signatures corpus against the trust-floor runbook gates — per-generator
// density toward the >=50 samples threshold, plus declared-vs-curated
// source split. 'Let the corpus mature' made concrete: watch the evidence,
// don't build more.
//
// Usage:
//   node apps/api/scripts/corpus-stats.js
//
// Reports per-generator counts + the runbook readiness status. The capstone
// (signature-matched label) ships only when the gates are met.
import fs from "fs";
import path from "path";

const CORPUS_FILE = path.resolve(__dirname, "../../prisma/corpus/signatures.jsonl");
const DENSITY_THRESHOLD = 50; // per-generator samples (runbook)

interface Record {
  perceptualHash?: string;
  byteHash?: string;
  generator?: string;
  source?: string;
  collectedAt?: string;
}

const byGenerator = new Map<string, { total: number; declared: number; curated: number; uniquePerceptual: Set<string> }>();

if (fs.existsSync(CORPUS_FILE)) {
  for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
    try {
      const r = JSON.parse(line) as Record;
      const gen = (r.generator ?? "unknown").toLowerCase();
      if (!byGenerator.has(gen)) byGenerator.set(gen, { total: 0, declared: 0, curated: 0, uniquePerceptual: new Set() });
      const e = byGenerator.get(gen)!;
      e.total++;
      if (r.source === "declared-upload") e.declared++;
      else e.curated++;
      if (r.perceptualHash) e.uniquePerceptual.add(r.perceptualHash);
    } catch {
      /* skip malformed */
    }
  }
}

console.log("=== signatures corpus stats ===");
console.log(`file: ${CORPUS_FILE}`);
console.log(`total records: ${[...byGenerator.values()].reduce((a, e) => a + e.total, 0)}`);
console.log(`density threshold per generator: ${DENSITY_THRESHOLD} (runbook)`);
console.log("");
for (const [gen, e] of [...byGenerator.entries()].sort((a, b) => b[1].total - a[1].total)) {
  const pct = Math.min(100, Math.round((e.total / DENSITY_THRESHOLD) * 100));
  const ready = e.total >= DENSITY_THRESHOLD;
  console.log(
    `${gen}: ${e.total} (${e.declared} declared, ${e.curated} curated) · ${e.uniquePerceptual.size} unique perceptual · ${ready ? "READY ✓" : `${pct}% to threshold`}`
  );
}
console.log("");
const anyReady = [...byGenerator.values()].some((e) => e.total >= DENSITY_THRESHOLD);
console.log(`capstone gated: ${anyReady ? "corpus-ready (cross-val still required per runbook)" : "corpus below density — label stays 'recorded'"}`);
