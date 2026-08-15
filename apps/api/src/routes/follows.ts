import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const TRACK_INCLUDE = {
  artist: true,
  album: true,
  remixOf: { include: { artist: true } },
} as const;

// Follow an uploader-artist (John's Tier 2 #5): no labels means the
// uploader's fanbase is the distribution engine — following + a new-drop
// feed makes that real. The "artist" IS the uploader's profile.
router.post("/:artistId", requireAuth, async (req: AuthedRequest, res) => {
  const artist = await prisma.artist.findUnique({ where: { id: req.params.artistId } });
  if (!artist) return res.status(404).json({ error: "artist not found" });
  if (artist.ownerId === req.userId) return res.status(400).json({ error: "you cannot follow your own artist profile" });

  await prisma.follow.upsert({
    where: { userId_artistId: { userId: req.userId!, artistId: artist.id } },
    create: { userId: req.userId!, artistId: artist.id },
    update: {},
  });
  res.status(204).end();
});

router.delete("/:artistId", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.follow.deleteMany({
    where: { userId: req.userId!, artistId: req.params.artistId },
  });
  res.status(204).end();
});

// Artists I follow.
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const follows = await prisma.follow.findMany({
    where: { userId: req.userId! },
    include: { artist: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ follows: follows.map((f) => f.artist) });
});

// New-drop feed: tracks from artists I follow, most recent first.
router.get("/feed", requireAuth, async (req: AuthedRequest, res) => {
  const follows = await prisma.follow.findMany({
    where: { userId: req.userId! },
    select: { artistId: true },
  });
  if (follows.length === 0) return res.json({ tracks: [] });

  const tracks = await prisma.track.findMany({
    where: { artistId: { in: follows.map((f) => f.artistId) } },
    include: TRACK_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ tracks });
});

export default router;
