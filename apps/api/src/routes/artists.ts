import { Router } from "express";
import path from "path";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { writeCover } from "../lib/cover-art";

const router = Router();

const STORAGE_ROOT = path.resolve(__dirname, "../../../../storage");
const AVATAR_DIR = path.join(STORAGE_ROOT, "avatars");

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
    include: { albums: true, tracks: { include: { album: true } } },
  });
  if (!artist) return res.status(404).json({ error: "artist not found" });
  res.json({ artist });
});

router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { name, bio, aiModel } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  // avatarPath is never taken from the client — it's not backed by an
  // upload, so trusting a client-supplied string here would let it point
  // anywhere the media static route can resolve. Every artist gets a
  // generated placeholder instead, keyed to its own id.
  const artist = await prisma.artist.create({
    data: { name, bio, aiModel: aiModel || "unknown", ownerId: req.userId! },
  });
  const avatarPath = `avatars/${writeCover(AVATAR_DIR, artist.id)}`;
  const updated = await prisma.artist.update({ where: { id: artist.id }, data: { avatarPath } });
  res.status(201).json({ artist: updated });
});

export default router;
