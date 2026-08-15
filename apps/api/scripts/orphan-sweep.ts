// Local-only hygiene helper (John's idea #7): finds files in storage/audio
// and storage/covers with no matching Track/Album row and (with --delete)
// removes them. A failed/aborted upload leaves an orphan blob; this completes
// the orphan-cleanup from the security review. Run by hand in dev, never CI.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const STORAGE_ROOT = path.resolve(__dirname, "../../../storage");
const AUDIO_DIR = path.join(STORAGE_ROOT, "audio");
const COVER_DIR = path.join(STORAGE_ROOT, "covers");

async function main() {
  const dryRun = !process.argv.includes("--delete");

  const tracks = await prisma.track.findMany({ select: { audioPath: true } });
  const albums = await prisma.album.findMany({ select: { coverPath: true } });
  const artists = await prisma.artist.findMany({ select: { avatarPath: true } });

  const referenced = new Set([
    ...tracks.map((t) => path.normalize(t.audioPath)),
    ...albums.map((a) => a.coverPath && path.normalize(a.coverPath)).filter(Boolean),
    ...artists.map((a) => a.avatarPath && path.normalize(a.avatarPath)).filter(Boolean),
  ]);

  const orphans: { dir: string; name: string; rel: string }[] = [];
  for (const dir of [AUDIO_DIR, COVER_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name === ".gitkeep") continue;
      const rel = path.normalize(path.relative(STORAGE_ROOT, path.join(dir, name)));
      if (!referenced.has(rel)) orphans.push({ dir, name, rel });
    }
  }

  console.log(dryRun ? "DRY RUN (use --delete to remove)" : "DELETING");
  console.log(`${orphans.length} orphan file(s) in storage/audio + storage/covers`);
  for (const o of orphans) {
    console.log(`  ${o.rel}`);
    if (!dryRun) {
      try {
        fs.unlinkSync(path.join(o.dir, o.name));
        console.log("    -> removed");
      } catch (err) {
        console.error(`    -> FAILED: ${(err as Error).message}`);
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
