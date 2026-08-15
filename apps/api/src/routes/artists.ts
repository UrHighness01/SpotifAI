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
  const aiModel = typeof req.query.aiModel === "string" ? req.query.aiModel : undefined;
  const artists = await prisma.artist.findMany({
    where: {
      ...(q ? { name: { contains: q } } : {}),
      ...(aiModel ? { aiModel } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ artists });
});

router.get("/:id", async (req, res) => {
  const artist = await prisma.artist.findUnique({
    where: { id: req.params.id },
    include: {
      albums: true,
      tracks: { include: { album: true } },
      // The differentiating brand: an artist IS the uploader's own profile —
      // there is no label or distributor layer. Surfacing the uploader
      // identity makes that explicit (John's ideas pass #6).
      owner: { select: { id: true, displayName: true } },
    },
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

// Payout handle (Tier A #1 — monetize the no-middleman pitch): the uploader
// sets an external payout handle (Kofi/Stripe/PayPal/BTC) on their profile.
// Metadata-only, no platform custody, no fee — the artist routes income
// directly at themselves, the literal opposite of a label's cut. Owner-only.
const PAYOUT_KINDS = ["ko-fi", "stripe", "paypal", "btc", "other"];

router.patch("/:id/payout", requireAuth, async (req: AuthedRequest, res) => {
  const { payoutKind, payoutHandle } = req.body || {};
  if (payoutKind !== undefined && !PAYOUT_KINDS.includes(payoutKind)) {
    return res.status(400).json({ error: `payoutKind must be one of: ${PAYOUT_KINDS.join(", ")}` });
  }
  if (payoutHandle !== undefined && (typeof payoutHandle !== "string" || payoutHandle.length > 500)) {
    return res.status(400).json({ error: "payoutHandle must be a string <= 500 chars" });
  }
  // The handle becomes an href in the renderer — only http(s) schemes are
  // allowed so a javascript:/data: handle can never execute in the web app
  // (defense in depth beyond rel=noopener). Same posture as an allowlist.
  if (payoutHandle !== undefined && payoutHandle && !/^https?:\/\//.test(payoutHandle)) {
    return res.status(400).json({ error: "payoutHandle must be an http(s) URL" });
  }
  const artist = await prisma.artist.findUnique({ where: { id: req.params.id } });
  if (!artist) return res.status(404).json({ error: "artist not found" });
  if (artist.ownerId !== req.userId) return res.status(403).json({ error: "you do not own this artist profile" });

  const updated = await prisma.artist.update({
    where: { id: artist.id },
    data: {
      ...(payoutKind !== undefined ? { payoutKind: payoutKind || null } : {}),
      ...(payoutHandle !== undefined ? { payoutHandle: payoutHandle || null } : {}),
    },
  });
  res.json({ artist: updated });
});

export default router;
