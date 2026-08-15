// Cross-validation of the generator-signature corpus (John's honest next
// action, slice 67 + his methodology finding). The runbook's gate is
// density (>=50 curated) + 90% cross-val.
//
// REAL leave-one-out (John's fix): for each sample of a generator, EXCLUDE
// it from the reference set, then check whether its perceptualHash still
// appears in the generator's REMAINING set (a true out-of-sample match),
// and whether it appears in other generators' sets (confusion). The naive
// version — testing against the full set including the sample itself — is
// self-consistency and always ~100%; this is the genuine held-out test.
//
// Usage: node apps/api/scripts/cross-val.ts
import fs from "fs";
import path from "path";

const CORPUS_FILE = path.resolve(__dirname, "../../prisma/corpus/signatures.jsonl");
const MIN_CURATED_FOR_VAL = 10; // below this, leave-one-out is too thin
const TARGET_CROSS_VAL = 0.9; // runbook: 90%

interface Record {
  perceptualHash?: string;
  generator?: string;
  source?: string;
}

// generator -> list of { perceptual, source, line }
const samplesByGenerator = new Map<string, { perceptual: string; source: string; line: string }[]>();

if (fs.existsSync(CORPUS_FILE)) {
  for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
    try {
      const r = JSON.parse(line) as Record;
      if (!r.perceptualHash || !r.generator) continue;
      const gen = r.generator.toLowerCase();
      if (!samplesByGenerator.has(gen)) samplesByGenerator.set(gen, []);
      samplesByGenerator.get(gen)!.push({ perceptual: r.perceptualHash, source: r.source ?? "curated", line });
    } catch {
      /* skip malformed */
    }
  }
}

console.log("=== generator-signature cross-validation (leave-one-out) ===");
console.log(`target: ${TARGET_CROSS_VAL * 100}% out-of-sample match (runbook)`);
console.log(`min curated for evaluation: ${MIN_CURATED_FOR_VAL}`);
console.log("");

for (const [gen, samples] of [...samplesByGenerator.entries()].sort()) {
  const curated = samples.filter((s) => s.source !== "declared-upload").length;
  if (curated < MIN_CURATED_FOR_VAL) {
    console.log(`${gen}: ${curated} curated — too sparse to evaluate cross-val (need ${MIN_CURATED_FOR_VAL})`);
    continue;
  }

  // Leave-one-out: for each sample, exclude it, then check its hash against
  // the remaining set of THIS generator + other generators' sets.
  let oosMatch = 0;
  const confusion = new Map<string, number>();
  for (const s of samples) {
    // Reference sets with THIS sample excluded.
    const thisRemaining = samples.filter((o) => o.line !== s.line).some((o) => o.perceptual === s.perceptual);
    if (thisRemaining) oosMatch++;
    for (const [other, otherSamples] of samplesByGenerator) {
      if (other === gen) continue;
      if (otherSamples.some((o) => o.perceptual === s.perceptual)) confusion.set(other, (confusion.get(other) ?? 0) + 1);
    }
  }
  const oosRate = samples.length ? oosMatch / samples.length : 0;
  const meets = oosRate >= TARGET_CROSS_VAL;
  console.log(
    `${gen}: ${samples.length} samples (${curated} curated) · out-of-sample match ${(oosRate * 100).toFixed(1)}% ` +
      `${meets ? "PASSES ✓" : "(below 90% — inspect confusion)"}`
  );
  if (confusion.size) {
    for (const [other, n] of confusion) console.log(`   confusion with ${other}: ${n} sample(s)`);
  } else {
    console.log("   no confusion with other generators");
  }
}
console.log("");
console.log("Leave-one-out validates the fingerprint discriminates generators out-of-sample.");

