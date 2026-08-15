import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { writeCover } from "../lib/cover-art";

const router = Router();

const STORAGE_ROOT = path.resolve(__dirname, "../../../../storage");
const AUDIO_DIR = path.join(STORAGE_ROOT, "audio");
const COVER_DIR = path.join(STORAGE_ROOT, "covers");
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

// Extension is derived from the validated mimetype below, never from the
// client-supplied filename, so an attacker can't smuggle an arbitrary
// extension onto a stored file.
const AUDIO_EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/flac": ".flac",
  "audio/ogg": ".ogg",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
};
const COVER_EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === "cover" ? COVER_DIR : AUDIO_DIR);
  },
  filename: (req, file, cb) => {
    const extByMime = file.fieldname === "cover" ? COVER_EXT_BY_MIME : AUDIO_EXT_BY_MIME;
    const ext = extByMime[file.mimetype] || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
    fieldSize: 32 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = file.fieldname === "cover" ? COVER_EXT_BY_MIME : AUDIO_EXT_BY_MIME;
    if (!(file.mimetype in allowed)) {
      return cb(new Error(`unsupported ${file.fieldname} file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

function unlinkQuiet(filePath?: string) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

router.post(
  "/track",
  requireAuth,
  (req, res, next) => {
    upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "upload failed" });
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    const files = req.files as { audio?: Express.Multer.File[]; cover?: Express.Multer.File[] };
    const audioFile = files?.audio?.[0];
    const coverFile = files?.cover?.[0];

    const cleanupAndReject = (status: number, error: string) => {
      unlinkQuiet(audioFile?.path);
      unlinkQuiet(coverFile?.path);
      return res.status(status).json({ error });
    };

    if (!audioFile) return cleanupAndReject(400, "audio file is required");

    const { title, artistId, albumId, durationSec, aiModel, aiPrompt, aiGenerationNotes, rightsNotice } = req.body || {};
    if (!title || !artistId || !aiModel) {
      return cleanupAndReject(400, "title, artistId, and aiModel are required");
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) return cleanupAndReject(404, "artist not found");
    if (artist.ownerId !== req.userId) {
      return cleanupAndReject(403, "you do not own this artist profile");
    }

    let album = null;
    if (albumId) {
      album = await prisma.album.findUnique({ where: { id: albumId } });
      if (!album) return cleanupAndReject(404, "album not found");
      if (album.artistId !== artistId) {
        return cleanupAndReject(403, "album does not belong to this artist");
      }
    }

    // Tracks have no cover of their own (only Album does), so a track
    // uploaded without an albumId gets a single-track album created for it
    // — otherwise it would have no way to ever show cover art in the UI.
    if (!album) {
      album = await prisma.album.create({ data: { title, artistId } });
    }

    const track = await prisma.track.create({
      data: {
        title,
        artistId,
        albumId: album.id,
        audioPath: path.relative(STORAGE_ROOT, audioFile.path),
        durationSec: durationSec ? Number(durationSec) : 0,
        aiModel,
        aiPrompt: aiPrompt || undefined,
        aiGenerationNotes: aiGenerationNotes || undefined,
        rightsNotice: rightsNotice || "all-rights-reserved",
      },
    });

    if (coverFile) {
      await prisma.album.update({
        where: { id: album.id },
        data: { coverPath: path.relative(STORAGE_ROOT, coverFile.path) },
      });
    } else if (!album.coverPath) {
      // No cover was uploaded and the album didn't already have one —
      // generate a placeholder so the album is never blank in the UI.
      const coverPath = `covers/${writeCover(COVER_DIR, album.id)}`;
      await prisma.album.update({ where: { id: album.id }, data: { coverPath } });
    }

    res.status(201).json({ track });
  }
);

export default router;
