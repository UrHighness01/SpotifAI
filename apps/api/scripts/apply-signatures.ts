// Apply the honest signature-matched evaluation to fingerprinted tracks
// (slice 69 capstone). Tracks declared as a generator whose signature is
// discriminative (in-set, no confusion) -> 'signature-matched'; overlap ->
// 'signature-uncertain'; otherwise 'recorded' (unchanged).
//
// Usage: node apps/api/scripts/apply-signatures.ts  (run with DATABASE_URL)
import { PrismaClient } from "@prisma/client";
import { evaluateProvenance } from "../src/lib/signatures";

const prisma = new PrismaClient();

async function main() {
  const tracks = await prisma.track.findMany({
    where: { fingerprintHash: { not: null }, perceptualHash: { not: null } },
    select: { id: true, title: true, aiModel: true, perceptualHash: true },
  });

  let matched = 0, uncertain = 0, recorded = 0;
  for (const t of tracks) {
    const label = evaluateProvenance(t.aiModel, t.perceptualHash);
    if (label === "signature-matched") {
      await prisma.track.update({ where: { id: t.id }, data: { provenanceStatus: label } });
      matched++;
      console.log(`  matched: ${t.title} (${t.aiModel})`);
    } else if (label === "signature-uncertain") {
      await prisma.track.update({ where: { id: t.id }, data: { provenanceStatus: label } });
      uncertain++;
      console.log(`  uncertain: ${t.title} (${t.aiModel})`);
    } else {
      recorded++;
    }
  }
  console.log(`\n${matched} signature-matched, ${uncertain} signature-uncertain, ${recorded} recorded (no change)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
