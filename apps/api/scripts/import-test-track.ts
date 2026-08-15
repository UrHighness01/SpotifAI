// Local-only helper: copies a file from the developer's machine into
// storage/audio and creates a Track row, so the player has something real
// to test against. Never run in CI/production — reads from a path outside
// the repo and is meant to be invoked by hand during development.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { writeCover } from "../src/lib/cover-art";

const prisma = new PrismaClient();
const STORAGE_ROOT = path.resolve(__dirname, "../../../storage");
const AUDIO_DIR = path.join(STORAGE_ROOT, "audio");
const COVER_DIR = path.join(STORAGE_ROOT, "covers");
const AVATAR_DIR = path.join(STORAGE_ROOT, "avatars");

const EXT_BY_MIME_SOURCE_EXT: Record<string, string> = {
  ".mp3": ".mp3",
  ".wav": ".wav",
  ".flac": ".flac",
  ".ogg": ".ogg",
  ".m4a": ".m4a",
};

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("usage: ts-node scripts/import-test-track.ts <path-to-audio-file> [title] [artistName]");
    process.exit(1);
  }
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    console.error(`file not found: ${resolved}`);
    process.exit(1);
  }
  const ext = path.extname(resolved).toLowerCase();
  if (!(ext in EXT_BY_MIME_SOURCE_EXT)) {
    console.error(`unsupported extension: ${ext}`);
    process.exit(1);
  }

  const title = process.argv[3] || path.basename(resolved, ext);
  const artistName = process.argv[4] || "Local Test Import";

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(COVER_DIR, { recursive: true });
  fs.mkdirSync(AVATAR_DIR, { recursive: true });

  const owner = await prisma.user.upsert({
    where: { email: "seed-owner@spotifai.local" },
    create: {
      email: "seed-owner@spotifai.local",
      passwordHash: "unused-see-seed-ts",
      displayName: "Seed Owner",
      emailVerified: true,
    },
    update: {},
  });

  let artist = await prisma.artist.findFirst({ where: { name: artistName, ownerId: owner.id } });
  if (!artist) {
    artist = await prisma.artist.create({
      data: {
        name: artistName,
        aiModel: "unknown",
        ownerId: owner.id,
        avatarPath: `avatars/${writeCover(AVATAR_DIR, artistName)}`,
      },
    });
  }

  const destName = `${randomUUID()}${ext}`;
  fs.copyFileSync(resolved, path.join(AUDIO_DIR, destName));

  const single = await prisma.album.create({
    data: {
      title,
      artistId: artist.id,
      coverPath: `covers/${writeCover(COVER_DIR, title)}`,
    },
  });

  const track = await prisma.track.create({
    data: {
      title,
      artistId: artist.id,
      albumId: single.id,
      audioPath: `audio/${destName}`,
      durationSec: 0,
      aiModel: "unknown",
    },
  });

  console.log(`Imported "${track.title}" (${track.id}) under artist "${artist.name}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
