import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

const STORAGE_ROOT = path.resolve(__dirname, "../../../../storage");
const AUDIO_DIR = path.join(STORAGE_ROOT, "audio");
const COVER_DIR = path.join(STORAGE_ROOT, "covers");
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === "cover" ? COVER_DIR : AUDIO_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

router.post(
  "/track",
  requireAuth,
  upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  async (req, res) => {
    const files = req.files as { audio?: Express.Multer.File[]; cover?: Express.Multer.File[] };
    const audioFile = files?.audio?.[0];
    if (!audioFile) return res.status(400).json({ error: "audio file is required" });

    const { title, artistId, albumId, durationSec, aiModel, aiPrompt, aiGenerationNotes } = req.body || {};
    if (!title || !artistId || !aiModel) {
      return res.status(400).json({ error: "title, artistId, and aiModel are required" });
    }

    const coverFile = files?.cover?.[0];

    const track = await prisma.track.create({
      data: {
        title,
        artistId,
        albumId: albumId || undefined,
        audioPath: path.relative(STORAGE_ROOT, audioFile.path),
        durationSec: durationSec ? Number(durationSec) : 0,
        aiModel,
        aiPrompt: aiPrompt || undefined,
        aiGenerationNotes: aiGenerationNotes || undefined,
      },
    });

    if (coverFile) {
      if (albumId) {
        await prisma.album.update({
          where: { id: albumId },
          data: { coverPath: path.relative(STORAGE_ROOT, coverFile.path) },
        });
      }
    }

    res.status(201).json({ track });
  }
);

export default router;
