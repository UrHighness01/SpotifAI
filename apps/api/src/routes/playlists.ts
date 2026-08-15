import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const playlists = await prisma.playlist.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
  });
  res.json({ playlists });
});

router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({
    where: { id: req.params.id },
    include: { tracks: { include: { track: { include: { artist: true, album: true } } }, orderBy: { position: "asc" } } },
  });
  if (!playlist || playlist.userId !== req.userId) {
    return res.status(404).json({ error: "playlist not found" });
  }
  res.json({ playlist });
});

router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const playlist = await prisma.playlist.create({ data: { name, userId: req.userId! } });
  res.status(201).json({ playlist });
});

router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } });
  if (!playlist || playlist.userId !== req.userId) {
    return res.status(404).json({ error: "playlist not found" });
  }
  await prisma.playlist.delete({ where: { id: playlist.id } });
  res.status(204).end();
});

router.post("/:id/tracks", requireAuth, async (req: AuthedRequest, res) => {
  const { trackId } = req.body || {};
  if (!trackId) return res.status(400).json({ error: "trackId is required" });

  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } });
  if (!playlist || playlist.userId !== req.userId) {
    return res.status(404).json({ error: "playlist not found" });
  }
  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) return res.status(404).json({ error: "track not found" });

  const count = await prisma.playlistTrack.count({ where: { playlistId: playlist.id } });
  const entry = await prisma.playlistTrack.upsert({
    where: { playlistId_trackId: { playlistId: playlist.id, trackId } },
    create: { playlistId: playlist.id, trackId, position: count },
    update: {},
  });
  res.status(201).json({ entry });
});

router.delete("/:id/tracks/:trackId", requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } });
  if (!playlist || playlist.userId !== req.userId) {
    return res.status(404).json({ error: "playlist not found" });
  }
  await prisma.playlistTrack
    .delete({ where: { playlistId_trackId: { playlistId: playlist.id, trackId: req.params.trackId } } })
    .catch(() => null);
  res.status(204).end();
});

export default router;
