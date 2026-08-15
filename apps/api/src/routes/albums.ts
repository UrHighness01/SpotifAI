import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

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
    include: { artist: true, tracks: true },
  });
  if (!album) return res.status(404).json({ error: "album not found" });
  res.json({ album });
});

router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { title, artistId, coverPath, releaseDate } = req.body || {};
  if (!title || !artistId) return res.status(400).json({ error: "title and artistId are required" });
  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) return res.status(404).json({ error: "artist not found" });
  if (artist.ownerId !== req.userId) return res.status(403).json({ error: "you do not own this artist profile" });
  const album = await prisma.album.create({
    data: { title, artistId, coverPath, releaseDate: releaseDate ? new Date(releaseDate) : undefined },
  });
  res.status(201).json({ album });
});

export default router;
