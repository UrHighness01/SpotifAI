// Hash-check tooling (John's Tier D #2 + G #1): verify a track's
// provenance offline against a downloaded manifest. Ships the provenance
// claim as a utility listeners can run on their own files.
//
// Usage:
//   node apps/api/scripts/verify-provenance.js <manifest-url> <audio-file> [trackIndex]
//   # trackIndex defaults to 0 (first track in the manifest)
//
// Verifies: (1) the manifest's Ed25519 signature against the public key
// embedded IN the manifest (self-describing, so no separate fetch needed),
// (2) the local audio file's byte-hash matches the manifest entry.
import crypto from "crypto";
import fs from "fs";
import path from "path";

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function main() {
  const manifestUrl = process.argv[2];
  const audioFile = process.argv[3];
  const trackIndex = process.argv[4] ? Number(process.argv[4]) : 0;
  if (!manifestUrl || !audioFile) {
    console.error("usage: node verify-provenance.js <manifest-url> <audio-file> [trackIndex]");
    process.exit(1);
  }

  const res = await fetch(manifestUrl);
  if (!res.ok) {
    console.error(`failed to fetch manifest: ${res.status}`);
    process.exit(1);
  }
  const manifest = await res.json();

  if (manifest.schema !== "spotifai-provenance-v1") {
    console.error("not a spotifai provenance manifest");
    process.exit(1);
  }
  const { signature, ...payload } = manifest;
  const valid = (() => {
    try {
      return crypto.verify(null, Buffer.from(JSON.stringify(payload)), manifest.publicKey, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  })();
  console.log(`manifest: ${manifest.artistName} (${manifest.artistId})`);
  console.log(`signature: ${valid ? "VALID ✓" : "INVALID ✗"}`);
  if (!valid) {
    console.error("manifest signature does not verify — tampered, wrong key, or not Ed25519");
    process.exit(1);
  }

  const entry = manifest.tracks[trackIndex];
  if (!entry) {
    console.error(`no track at index ${trackIndex}`);
    process.exit(1);
  }
  console.log(`track[${trackIndex}]: ${entry.title} (${entry.trackId})`);
  console.log(`  manifest byteHash:  ${entry.byteHash}`);
  console.log(`  manifest perceptual: ${entry.perceptualHash ?? "(none)"}`);

  const bytes = fs.readFileSync(path.resolve(audioFile)).subarray(0, 1024 * 1024);
  const localByteHash = sha256Hex(bytes);
  const match = localByteHash === entry.byteHash;
  console.log(`  local file byteHash: ${localByteHash} -> ${match ? "MATCH ✓" : "NO MATCH ✗"}`);
  process.exit(match ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
