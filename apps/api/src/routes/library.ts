import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const saves = await prisma.librarySave.findMany({
    where: { userId: req.userId! },
    include: { track: { include: { artist: true, album: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ saves });
});

router.post("/:trackId", requireAuth, async (req: AuthedRequest, res) => {
  const save = await prisma.librarySave.upsert({
    where: { userId_trackId: { userId: req.userId!, trackId: req.params.trackId } },
    create: { userId: req.userId!, trackId: req.params.trackId },
    update: {},
  });
  res.status(201).json({ save });
});

router.delete("/:trackId", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.librarySave
    .delete({ where: { userId_trackId: { userId: req.userId!, trackId: req.params.trackId } } })
    .catch(() => null);
  res.status(204).end();
});

export default router;
