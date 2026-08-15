import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

// Collab/remix requests (John's #4 social tier): since uploader = artist
// and follows exist, remix attribution becomes a REQUEST — 'can I remix
// this?' flows through the graph. Metadata-only, honor-system, deepens the
// no-label community without any provenance-claim risk.
router.post("/track/:trackId/request", requireAuth, async (req: AuthedRequest, res) => {
  const { message } = req.body || {};
  if (message !== undefined && (typeof message !== "string" || message.length > 500)) {
    return res.status(400).json({ error: "message must be a string <= 500 chars" });
  }
  const track = await prisma.track.findUnique({ where: { id: req.params.trackId }, include: { artist: true } });
  if (!track) return res.status(404).json({ error: "track not found" });
  if (track.artist.ownerId === req.userId) {
    return res.status(400).json({ error: "you cannot request to remix your own track" });
  }

  // John's ticket (b): 'rejected' is terminal — a rejected request stays
  // rejected (the owner said no; re-POSTing must not silently re-open it).
  // Only 'pending' or 'accepted' requests can be updated/re-sent. This
  // keeps accept/reject a real decision, not a whack-a-mole loop.
  const existing = await prisma.collabRequest.findUnique({
    where: { requesterId_trackId: { requesterId: req.userId!, trackId: track.id } },
  });
  if (existing?.status === "rejected") {
    return res.status(409).json({ error: "this request was rejected and is final" });
  }

  const request = await prisma.collabRequest.upsert({
    where: { requesterId_trackId: { requesterId: req.userId!, trackId: track.id } },
    create: { requesterId: req.userId!, trackId: track.id, message: message || null },
    update: { message: message || null, status: "pending" },
  });
  res.status(201).json({ request });
});

// Requests I've sent + requests on my tracks (both feed the same UI).
router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const sent = await prisma.collabRequest.findMany({
    where: { requesterId: req.userId! },
    include: { track: { include: { artist: true } } },
    orderBy: { createdAt: "desc" },
  });
  const received = await prisma.collabRequest.findMany({
    where: { track: { artist: { ownerId: req.userId! } } },
    include: { track: { include: { artist: true } }, requester: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ sent, received });
});

// Owner accepts/rejects a request on their track.
router.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { status } = req.body || {};
  if (status !== "accepted" && status !== "rejected") {
    return res.status(400).json({ error: "status must be accepted or rejected" });
  }
  const request = await prisma.collabRequest.findUnique({
    where: { id: req.params.id },
    include: { track: { include: { artist: true } } },
  });
  if (!request) return res.status(404).json({ error: "request not found" });
  if (request.track.artist.ownerId !== req.userId) {
    return res.status(403).json({ error: "you do not own this track" });
  }
  const updated = await prisma.collabRequest.update({ where: { id: request.id }, data: { status } });
  res.json({ request: updated });
});

export default router;
