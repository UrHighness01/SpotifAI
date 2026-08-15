import { Router } from "express";
import path from "path";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { writeCover } from "../lib/cover-art";
import { signManifest, ProvenanceManifest } from "../lib/manifest";

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

// Signed, exportable provenance manifest (John's Tier D #1): public by
// design — anyone can download and verify the hashes offline against their
// own copy of the audio, without trusting the website. The signature
// (HMAC-SHA256 under the platform key) pins the manifest to the platform,
// so tampering is detectable.
router.get("/:id/provenance-manifest", async (req, res) => {
  const artist = await prisma.artist.findUnique({
    where: { id: req.params.id },
    include: { tracks: { select: { id: true, title: true, aiModel: true, fingerprintHash: true, perceptualHash: true, fingerprintCapturedAt: true } } },
  });
  if (!artist) return res.status(404).json({ error: "artist not found" });

  const fingerprintTracks = artist.tracks.filter((t) => t.fingerprintHash);
  const manifest: ProvenanceManifest = {
    schema: "spotifai-provenance-v1",
    artistId: artist.id,
    artistName: artist.name,
    generatedAt: new Date().toISOString(),
    tracks: fingerprintTracks.map((t) => ({
      title: t.title,
      trackId: t.id,
      model: t.aiModel,
      byteHash: t.fingerprintHash!,
      perceptualHash: t.perceptualHash,
      recordedAt: t.fingerprintCapturedAt?.toISOString() ?? "",
    })),
    signature: "", // replaced below
  };
  const { signature, ...payload } = manifest;
  manifest.signature = signManifest(JSON.stringify(payload));
  res.json(manifest);
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

// John's review ticket: kind↔host cross-validation. A 'ko-fi' handle must
// point at ko-fi.com, 'paypal' at paypal.com, etc. — otherwise a phishing
// handle could masquerade as a trusted kind on the money path.
const KIND_HOSTS: Record<string, string[]> = {
  "ko-fi": ["ko-fi.com", "ko-fi.dev"],
  paypal: ["paypal.com", "paypal.me"],
  stripe: ["stripe.com", "buy.stripe.com"],
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

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
  // Kind↔host coherence (John's ticket): when both kind + handle are set,
  // the handle's host must match the kind's known domains (unless 'other').
  if (payoutHandle && payoutKind && payoutKind !== "other") {
    const expected = KIND_HOSTS[payoutKind];
    if (expected) {
      const host = hostOf(payoutHandle);
      if (!host || !expected.some((h) => host === h || host.endsWith(`.${h}`))) {
        return res.status(400).json({
          error: `payoutHandle host must be one of: ${expected.join(", ")} for payoutKind '${payoutKind}'`,
        });
      }
    }
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
