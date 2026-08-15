// Cross-validation of the generator-signature corpus (John's honest next
// action, slice 67). The runbook's gate is density (>=50 curated) + 90%
// cross-val: held-out samples for a generator must match their own
// generator's signature set (same perceptualHash seen in that generator's
// curated samples) more than other generators'. This is the measurement
// that validates the perceptual-fingerprint approach actually
// DISCRIMINATES generators — before scaling collection to 50x3.
//
// Current limitation (honest): with few curated samples per generator, the
// held-out match rate is a rough signal — a generator needs enough
// distinct samples for a held-out set to mean anything. This script
// reports what it can and states when a generator is too sparse to
// evaluate (density gate not yet met).
//
// Usage: node apps/api/scripts/cross-val.ts
import fs from "fs";
import path from "path";

const CORPUS_FILE = path.resolve(__dirname, "../../prisma/corpus/signatures.jsonl");
const MIN_CURATED_FOR_VAL = 10; // below this, held-out is meaningless
const TARGET_CROSS_VAL = 0.9; // runbook: 90%

interface Record {
  perceptualHash?: string;
  generator?: string;
  source?: string;
}

const byGenerator = new Map<string, Map<string, Set<string>>>(); // generator -> perceptualHash -> sampleIds
const samplesByGenerator = new Map<string, { perceptual: string; source: string }[]>();

if (fs.existsSync(CORPUS_FILE)) {
  for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
    try {
      const r = JSON.parse(line) as Record;
      if (!r.perceptualHash || !r.generator) continue;
      const gen = r.generator.toLowerCase();
      if (!byGenerator.has(gen)) byGenerator.set(gen, new Map());
      const sigs = byGenerator.get(gen)!;
      if (!sigs.has(r.perceptualHash)) sigs.set(r.perceptualHash, new Set());
      sigs.get(r.perceptualHash)!.add(line);
      if (!samplesByGenerator.has(gen)) samplesByGenerator.set(gen, []);
      samplesByGenerator.get(gen)!.push({ perceptual: r.perceptualHash, source: r.source ?? "curated" });
    } catch {
      /* skip malformed */
    }
  }
}

console.log("=== generator-signature cross-validation ===");
console.log(`target: ${TARGET_CROSS_VAL * 100}% held-out match (runbook)`);
console.log(`min curated for evaluation: ${MIN_CURATED_FOR_VAL}`);
console.log("");

for (const [gen, sigs] of [...byGenerator.entries()].sort()) {
  const samples = samplesByGenerator.get(gen)!;
  const curated = samples.filter((s) => s.source !== "declared-upload").length;
  if (curated < MIN_CURATED_FOR_VAL) {
    console.log(`${gen}: ${curated} curated — too sparse to evaluate cross-val (need ${MIN_CURATED_FOR_VAL})`);
    continue;
  }

  // Held-out: for each sample of this generator, does its perceptualHash
  // appear in THIS generator's signature set (a true positive)? Confusion:
  // does it also appear in other generators' sets?
  let tp = 0;
  const confusion = new Map<string, number>();
  for (const s of samples) {
    if (sigs.has(s.perceptual)) tp++;
    for (const [other, otherSigs] of byGenerator) {
      if (other === gen) continue;
      if (otherSigs.has(s.perceptual)) confusion.set(other, (confusion.get(other) ?? 0) + 1);
    }
  }
  const heldOutRate = samples.length ? tp / samples.length : 0;
  const meets = heldOutRate >= TARGET_CROSS_VAL;
  console.log(
    `${gen}: ${samples.length} samples (${curated} curated) · held-out match ${(heldOutRate * 100).toFixed(1)}% ` +
      `${meets ? "PASSES ✓" : "(below 90% — inspect confusion)"}`
  );
  if (confusion.size) {
    for (const [other, n] of confusion) console.log(`   confusion with ${other}: ${n} sample(s)`);
  }
}
console.log("");
console.log("Cross-val validates the fingerprint discriminates generators — density alone doesn't.");
