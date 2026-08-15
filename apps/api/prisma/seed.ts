import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const STORAGE_ROOT = path.resolve(__dirname, "../../../storage");
const AUDIO_DIR = path.join(STORAGE_ROOT, "audio");

// Minimal valid silent WAV (44-byte header, 1 second of silence, 8kHz mono 8-bit)
function makeSilentWav(): Buffer {
  const sampleRate = 8000;
  const seconds = 1;
  const numSamples = sampleRate * seconds;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + numSamples, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(numSamples, 40);
  const silence = Buffer.alloc(numSamples, 128);
  return Buffer.concat([header, silence]);
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const seedPasswordHash = await bcrypt.hash("seed-owner-password-change-me", 10);
  const seedOwner = await prisma.user.upsert({
    where: { email: "seed-owner@spotifai.local" },
    create: {
      email: "seed-owner@spotifai.local",
      passwordHash: seedPasswordHash,
      displayName: "Seed Owner",
      emailVerified: true,
    },
    update: {},
  });

  const artist1 = await prisma.artist.create({
    data: { name: "Null Horizon", bio: "A fully AI-generated ambient project.", aiModel: "Suno v4", ownerId: seedOwner.id },
  });
  const artist2 = await prisma.artist.create({
    data: { name: "Static Bloom", bio: "AI-generated synthpop.", aiModel: "Udio", ownerId: seedOwner.id },
  });

  const album1 = await prisma.album.create({
    data: { title: "Signal Drift", artistId: artist1.id, releaseDate: new Date("2026-06-01") },
  });

  const seedTracks = [
    { title: "Latent Space", artist: artist1, album: album1, aiPrompt: "slow ambient drone, tape hiss" },
    { title: "Overfit Sunrise", artist: artist1, album: album1, aiPrompt: "ambient, rising synth pads" },
    { title: "Neon Gradient", artist: artist2, album: null, aiPrompt: "80s synthpop, driving bassline" },
  ];

  for (const t of seedTracks) {
    const wavPath = path.join(AUDIO_DIR, `${t.title.replace(/\s+/g, "_").toLowerCase()}.wav`);
    fs.writeFileSync(wavPath, makeSilentWav());
    await prisma.track.create({
      data: {
        title: t.title,
        artistId: t.artist.id,
        albumId: t.album?.id,
        audioPath: `audio/${path.basename(wavPath)}`,
        durationSec: 1,
        aiModel: t.artist.aiModel,
        aiPrompt: t.aiPrompt,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
