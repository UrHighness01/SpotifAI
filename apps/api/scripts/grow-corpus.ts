// Passive corpus self-growth (John's ranked #1, slice 58).
//
// The corpus grows from the platform's OWN uploads where the generator is
// DECLARED alongside the fingerprint — the upload route already captures
// fingerprintModel (declared generator) + perceptualHash at upload. This
// job scans tracks that have a fingerprint + a declared generator matching
// the known-generator list, and appends them to the signatures corpus
// (perceptualHash -> generator). Honest: the generator label is the
// uploader's self-report — exactly the declared-provenance model the
// runbook defines. The label stays 'recorded'; we're just accumulating
// evidence privately.
//
// Known generators are the ones users actually declare (Suno/Udio/etc.).
// A track whose declared model matches is high-confidence-enough to seed
// the corpus passively.
const KNOWN_GENERATORS = ["suno v3.5", "suno v4", "udio"];

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const CORPUS_FILE = path.resolve(__dirname, "../../prisma/corpus/signatures.jsonl");

async function main() {
  const tracks = await prisma.track.findMany({
    where: {
      fingerprintHash: { not: null },
      perceptualHash: { not: null },
      aiModel: { in: KNOWN_GENERATORS },
    },
    select: { id: true, title: true, aiModel: true, perceptualHash: true, fingerprintHash: true, fingerprintCapturedAt: true },
  });

  // Skip ones already in the corpus (content-addressed by sampleId=byteHash).
  const existing = new Set<string>();
  if (fs.existsSync(CORPUS_FILE)) {
    for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
      try {
        existing.add(JSON.parse(line).sampleId);
      } catch {
        /* skip malformed line */
      }
    }
  }

  fs.mkdirSync(path.dirname(CORPUS_FILE), { recursive: true });
  const out = fs.createWriteStream(CORPUS_FILE, { flags: "a" });
  let n = 0;
  for (const t of tracks) {
    if (existing.has(t.fingerprintHash)) continue;
    const record = {
      perceptualHash: t.perceptualHash!,
      byteHash: t.fingerprintHash!,
      generator: t.aiModel,
      sample: `track-${t.id}`,
      sampleId: t.fingerprintHash!,
      collectedAt: new Date().toISOString(),
      source: "declared-upload",
    };
    out.write(JSON.stringify(record) + "\n");
    existing.add(t.fingerprintHash);
    n++;
  }
  out.end();
  console.log(`appended ${n} declared-upload signature sample(s) -> ${CORPUS_FILE}`);
  console.log("label stays 'recorded' — evidence accumulating privately per the trust-floor runbook.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
