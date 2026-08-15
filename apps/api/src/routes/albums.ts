import { Router } from "express";
import path from "path";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { writeCover } from "../lib/cover-art";

const router = Router();

const STORAGE_ROOT = path.resolve(__dirname, "../../../../storage");
const COVER_DIR = path.join(STORAGE_ROOT, "covers");

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
    include: { artist: true, tracks: { include: { album: true } } },
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

export default router;
