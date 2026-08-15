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
const COVER_DIR = path.join(STORAGE_ROOT, "covers");
fs.mkdirSync(COVER_DIR, { recursive: true });

// Same cover validation as /upload/track — mimetype allowlist, extension
// derived from the validated mimetype (never the client filename).
const COVER_EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, COVER_DIR),
    filename: (_req, file, cb) => {
      const ext = COVER_EXT_BY_MIME[file.mimetype] || "";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, fieldSize: 32 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in COVER_EXT_BY_MIME)) {
      return cb(new Error(`unsupported cover file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

router.get("/", async (req, res) => {
  const artistId = typeof req.query.artistId === "string" ? req.query.artistId : undefined;
  const albums = await prisma.album.findMany({
    where: artistId ? { artistId } : undefined,
    include: { artist: true },
    orderBy: { releaseDate: "desc" },
  });
  res.json({ albums });
});

router.get("/:id", async (req, res) => {
  const album = await prisma.album.findUnique({
    where: { id: req.params.id },
    include: {
      artist: true,
      tracks: { include: { album: true, artist: true, remixes: { include: { artist: true } } } },
    },
  });
  if (!album) return res.status(404).json({ error: "album not found" });
  res.json({ album });
});

router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { title, artistId, releaseDate } = req.body || {};
  if (!title || !artistId) return res.status(400).json({ error: "title and artistId are required" });
  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) return res.status(404).json({ error: "artist not found" });
  if (artist.ownerId !== req.userId) return res.status(403).json({ error: "you do not own this artist profile" });
  // coverPath is never taken from the client here — see /track upload for
  // the real (multer-validated) way to attach cover art. Every album gets
  // a generated placeholder immediately so it's never blank in the UI.
  const album = await prisma.album.create({
    data: { title, artistId, releaseDate: releaseDate ? new Date(releaseDate) : undefined },
  });
  const coverPath = `covers/${writeCover(COVER_DIR, album.id)}`;
  const updated = await prisma.album.update({ where: { id: album.id }, data: { coverPath } });
  res.status(201).json({ album: updated });
});

// Owner-scoped cover upload (John's ideas pass #5): replace an album's cover
// after creation. The uploader owns the artist, so only they can change the
// art. Mimetype-validated; the old file is unlinked to avoid orphan blobs.
router.patch("/:id/cover", requireAuth, coverUpload.single("cover"), async (req: AuthedRequest, res) => {
  const album = await prisma.album.findUnique({ where: { id: req.params.id }, include: { artist: true } });
  if (!album) return res.status(404).json({ error: "album not found" });
  if (album.artist.ownerId !== req.userId) return res.status(403).json({ error: "you do not own this artist profile" });

  const coverFile = req.file;
  if (!coverFile) return res.status(400).json({ error: "cover image is required" });

  // Unlink the previous cover if it lives under storage/covers (never a
  // client-supplied path — album.coverPath was server-generated or set by
  // a validated upload).
  const oldPath = album.coverPath;
  if (oldPath && oldPath.startsWith("covers/")) {
    const abs = path.join(STORAGE_ROOT, oldPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }

  const rel = path.relative(STORAGE_ROOT, coverFile.path);
  const updated = await prisma.album.update({ where: { id: album.id }, data: { coverPath: rel } });
  res.json({ album: updated });
});

export default router;
