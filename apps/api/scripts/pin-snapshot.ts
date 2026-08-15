// Pin a gate-passing corpus snapshot (John's discipline lock, slice 72):
// when the signatures corpus changes materially, bump the committed gate
// snapshot + hash so the signature-matched label always rests on frozen,
// auditable evidence. Run after any significant corpus change.
//
// Usage (with DATABASE_URL set):
//   node apps/api/scripts/pin-snapshot.ts <label>
//   e.g. node apps/api/scripts/pin-snapshot.ts udio-v3.5-densified
//
// Copies the live corpus to snapshots/<label>-<date>.jsonl and writes its
// SHA-256 to the snapshots README. Commit the result.
import crypto from "crypto";
import fs from "fs";
import path from "path";

const label = process.argv[2] ?? "gate-pass";
const CORPUS_FILE = path.resolve(__dirname, "../../prisma/corpus/signatures.jsonl");
const SNAP_DIR = path.resolve(__dirname, "../../prisma/corpus/snapshots");
const README = path.join(SNAP_DIR, "README.txt");

if (!fs.existsSync(CORPUS_FILE)) {
  console.error(`corpus not found: ${CORPUS_FILE}`);
  process.exit(1);
}
fs.mkdirSync(SNAP_DIR, { recursive: true });

const date = new Date().toISOString().slice(0, 10);
const name = `${label}-${date}.jsonl`;
const content = fs.readFileSync(CORPUS_FILE);
const hash = crypto.createHash("sha256").update(content).digest("hex");

fs.writeFileSync(path.join(SNAP_DIR, name), content);
const records = content.toString().split("\n").filter(Boolean).length;
const line = `${hash}  ${name}  (${records} records — pinned ${new Date().toISOString()})`;
fs.appendFileSync(README, line + "\n");

console.log(`pinned: ${name}`);
console.log(`  records: ${records}`);
console.log(`  sha256: ${hash}`);
console.log("commit the snapshot + README now.");
