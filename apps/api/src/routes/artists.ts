import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const artists = await prisma.artist.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { createdAt: "desc" },
  });
  res.json({ artists });
});

router.get("/:id", async (req, res) => {
  const artist = await prisma.artist.findUnique({
    where: { id: req.params.id },
    include: { albums: true, tracks: true },
  });
  if (!artist) return res.status(404).json({ error: "artist not found" });
  res.json({ artist });
});

router.post("/", requireAuth, async (req, res) => {
  const { name, bio, avatarPath, aiModel } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const artist = await prisma.artist.create({
    data: { name, bio, avatarPath, aiModel: aiModel || "unknown" },
  });
  res.status(201).json({ artist });
});

export default router;
