import fs from "fs";
import path from "path";

/**
 * Generator-signature matcher (John's GO on slice 69 — the honest capstone).
 *
 * suno v4 cleared both runbook gates (110 curated >= 50 density, 91.2%
 * leave-one-out cross-val >= 90%), independently reproduced. The label can
 * now escalate from 'recorded' to 'signature-matched' for tracks whose
 * declared generator's signature is discriminative.
 *
 * Confusion-aware scoping (John's decision #1): a track gets
 * 'signature-matched' ONLY when its perceptualHash is in the declared
 * generator's signature set AND NOT in any other generator's set. The
 * overlapping region (where suno v4 shares signatures with v3.5/udio —
 * 12+8 in the training corpus) gets 'signature-uncertain', never a
 * confident match. The label means what it says.
 */

const CORPUS_FILE = path.resolve(__dirname, "../../../prisma/corpus/signatures.jsonl");

// generator (normalized) -> Set of perceptual hashes in its curated set
let signatureSets: Map<string, Set<string>> | null = null;

function loadSignatureSets(): Map<string, Set<string>> {
  if (signatureSets) return signatureSets;
  signatureSets = new Map();
  if (fs.existsSync(CORPUS_FILE)) {
    for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
      try {
        const r = JSON.parse(line);
        if (!r.perceptualHash || !r.generator) continue;
        const gen = String(r.generator).toLowerCase();
        if (!signatureSets.has(gen)) signatureSets.set(gen, new Set());
        signatureSets.get(gen)!.add(r.perceptualHash);
      } catch {
        /* skip malformed */
      }
    }
  }
  return signatureSets;
}

// Evaluates a track's provenance label given its declared generator +
// perceptual hash. Honest ladder:
//   signature-matched    — hash in declared generator's set, not in any
//                          other generator's set (discriminative)
//   signature-uncertain  — hash in declared generator's set BUT also in a
//                          conflicting generator's set (overlap)
//   recorded             — no signature evidence (fallback; unchanged)
export function evaluateProvenance(declaredGenerator: string | null | undefined, perceptualHash: string | null | undefined): "signature-matched" | "signature-uncertain" | "recorded" {
  if (!declaredGenerator || !perceptualHash) return "recorded";
  const sets = loadSignatureSets();
  const gen = declaredGenerator.toLowerCase();

  const inOwn = sets.get(gen)?.has(perceptualHash) ?? false;
  if (!inOwn) return "recorded";

  // Confusion check: does this hash ALSO appear in another generator's set?
  for (const [other, otherSet] of sets) {
    if (other === gen) continue;
    if (otherSet.has(perceptualHash)) return "signature-uncertain";
  }
  return "signature-matched";
}
