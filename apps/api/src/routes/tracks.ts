import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const artistId = typeof req.query.artistId === "string" ? req.query.artistId : undefined;
  const albumId = typeof req.query.albumId === "string" ? req.query.albumId : undefined;
  const tracks = await prisma.track.findMany({
    where: {
      ...(q ? { title: { contains: q } } : {}),
      ...(artistId ? { artistId } : {}),
      ...(albumId ? { albumId } : {}),
    },
    include: { artist: true, album: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ tracks });
});

router.get("/:id", async (req, res) => {
  const track = await prisma.track.findUnique({
    where: { id: req.params.id },
    include: { artist: true, album: true },
  });
  if (!track) return res.status(404).json({ error: "track not found" });
  res.json({ track });
});

export default router;
