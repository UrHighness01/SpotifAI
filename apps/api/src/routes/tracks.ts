import { Router } from "express";
import { prisma } from "../db";
import { verifySessionToken } from "../lib/jwt";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const TRACK_INCLUDE = { artist: true, album: true } as const;

/**
 * Co-occurrence scoring for recommendations (John-approved v1, slice 19):
 * two tracks are "related" when they show up together in the same context —
 * a user's saved library, or a user's playlist. We weight library saves more
 * than playlist membership (playlists are often thematic, saves are taste),
 * then merge the two signals and rank by combined score.
 *
 * The whole thing is plain Prisma groupBy — no model, no training infra. This
 * is deliberately the "probabilistic" co-occurrence heuristic John endorsed
 * over embedding `sample_model.bin` into the ranking path (see
 * docs/decisions/0001-project-k-recommendations.md).
 */

type CoScore = { trackId: string; score: number };

function mergeScores(library: CoScore[], playlist: CoScore[]): CoScore[] {
  const merged = new Map<string, number>();
  for (const { trackId, score } of library) merged.set(trackId, (merged.get(trackId) ?? 0) + score * 2);
  for (const { trackId, score } of playlist) merged.set(trackId, (merged.get(trackId) ?? 0) + score);
  return [...merged.entries()].map(([trackId, score]) => ({ trackId, score })).sort((a, b) => b.score - a.score);
}

/** Fallback ranking when a track (or user) has no co-occurrence signal yet. */
async function coldStart(trackId: string, excludeIds: Set<string>): Promise<string[]> {
  const track = await prisma.track.findUnique({ where: { id: trackId }, select: { artistId: true, aiModel: true } });
  const seen = new Set(excludeIds);
  const out: string[] = [];

  const push = (t: { id: string }) => {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t.id);
    }
  };

  // 1. Same artist (an artist's own catalog is the strongest cold-start signal).
  if (track) {
    const sameArtist = await prisma.track.findMany({
      where: { artistId: track.artistId },
      select: { id: true },
      take: 10,
    });
    sameArtist.forEach(push);
  }

  // 2. Same generator (loose "sounds similar" proxy) if we still need slots.
  if (track && track.aiModel !== "unknown" && out.length < 10) {
    const sameModel = await prisma.track.findMany({
      where: { aiModel: track.aiModel },
      select: { id: true },
      take: 10,
    });
    sameModel.forEach(push);
  }

  // 3. Trending (most-played) fills whatever's left — an isolated track in a
  // tiny catalog should still surface the catalog's most-loved tracks.
  if (out.length < 10) {
    const trending = await prisma.track.findMany({
      where: { id: { notIn: [...seen] } },
      select: { id: true },
      orderBy: { playCount: "desc" },
      take: 10,
    });
    trending.forEach(push);
  }

  return out.slice(0, 10);
}

router.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const artistId = typeof req.query.artistId === "string" ? req.query.artistId : undefined;
  const albumId = typeof req.query.albumId === "string" ? req.query.albumId : undefined;
  const aiModel = typeof req.query.aiModel === "string" ? req.query.aiModel : undefined;
  const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
  const tracks = await prisma.track.findMany({
    where: {
      // Spotify-esque search: match title OR the artist's name (the artist
      // IS the uploader's profile, so searching an uploader finds their
      // tracks too).
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { artist: { name: { contains: q } } },
            ],
          }
        : {}),
      ...(artistId ? { artistId } : {}),
      ...(albumId ? { albumId } : {}),
      ...(aiModel ? { aiModel } : {}),
    },
    include: TRACK_INCLUDE,
    orderBy: sort === "trending" ? { playCount: "desc" } : { createdAt: "desc" },
  });
  res.json({ tracks });
});

/** Tracks that co-occur with the given track across libraries and playlists. */
router.get("/:id/related", async (req, res) => {
  const trackId = req.params.id;
  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) return res.status(404).json({ error: "track not found" });

  // Signal 1: users who saved this track, and the other tracks they saved.
  const savers = await prisma.librarySave.findMany({
    where: { trackId },
    select: { userId: true },
  });
  const libraryScores: CoScore[] = savers.length
    ? (
        await prisma.librarySave.groupBy({
          by: ["trackId"],
          where: { userId: { in: savers.map((s) => s.userId) }, trackId: { not: trackId } },
          _count: { trackId: true },
          orderBy: { _count: { trackId: "desc" } },
          take: 30,
        })
      ).map((g) => ({ trackId: g.trackId, score: g._count.trackId }))
    : [];

  // Signal 2: playlists this track appears in, and the other tracks in them.
  const playlists = await prisma.playlistTrack.findMany({
    where: { trackId },
    select: { playlistId: true },
  });
  const playlistScores: CoScore[] = playlists.length
    ? (
        await prisma.playlistTrack.groupBy({
          by: ["trackId"],
          where: { playlistId: { in: playlists.map((p) => p.playlistId) }, trackId: { not: trackId } },
          _count: { trackId: true },
          orderBy: { _count: { trackId: "desc" } },
          take: 30,
        })
      ).map((g) => ({ trackId: g.trackId, score: g._count.trackId }))
    : [];

  let ranked = mergeScores(libraryScores, playlistScores).map((c) => c.trackId).slice(0, 10);
  const exclude = new Set([trackId, ...ranked]);

  if (ranked.length < 10) {
    // Cold start: fill any remaining slots with same-artist / same-generator.
    ranked = [...ranked, ...(await coldStart(trackId, exclude))].slice(0, 10);
  }

  const tracks = await prisma.track.findMany({
    where: { id: { in: ranked } },
    include: TRACK_INCLUDE,
  });

  // Preserve ranking order (findMany doesn't guarantee input order).
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const ordered = ranked.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  res.json({ tracks: ordered, source: libraryScores.length || playlistScores.length ? "co-occurrence" : "cold-start" });
});

/**
 * Personalized recommendations for the current user, if any. Uses the same
 * co-occurrence signal as /related but seeded from *this user's* library and
 * playlists. Unauthenticated callers get a trending fallback, so the Home
 * page can always render the section.
 */
router.get("/recommended", async (req, res) => {
  // Same validation as requireAuth (including the tokenVersion check) so a
  // revoked session — e.g. after a password reset — stops getting
  // personalized recs immediately, instead of until the cookie expires.
  // John's non-blocking note, fixed: decode + verify against the DB, and on
  // any failure fall through to the anonymous trending path.
  let userId: string | undefined;
  if (req.cookies?.token) {
    try {
      const payload = verifySessionToken(req.cookies.token as string);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, tokenVersion: true },
      });
      if (user && user.tokenVersion === payload.tokenVersion) userId = user.id;
    } catch {
      userId = undefined;
    }
  }

  if (userId) {
    // Users who share taste with me: saved tracks overlap with my library.
    const mySaves = await prisma.librarySave.findMany({ where: { userId }, select: { trackId: true } });
    const myTrackIds = mySaves.map((s) => s.trackId);
    const myPlaylists = await prisma.playlist.findMany({ where: { userId }, select: { id: true } });
    const myPlaylistTrackIds = myPlaylists.length
      ? (
          await prisma.playlistTrack.findMany({
            where: { playlistId: { in: myPlaylists.map((p) => p.id) } },
            select: { trackId: true },
          })
        ).map((p) => p.trackId)
      : [];

    const seedIds = [...new Set([...myTrackIds, ...myPlaylistTrackIds])];
    if (seedIds.length) {
      // People who saved any of my tracks → what else did they save?
      const likeMinded = await prisma.librarySave.findMany({
        where: { trackId: { in: seedIds } },
        select: { userId: true },
      });
      const libraryScores: CoScore[] = likeMinded.length
        ? (
            await prisma.librarySave.groupBy({
              by: ["trackId"],
              where: { userId: { in: likeMinded.map((l) => l.userId) }, trackId: { notIn: seedIds } },
              _count: { trackId: true },
              orderBy: { _count: { trackId: "desc" } },
              take: 30,
            })
          ).map((g) => ({ trackId: g.trackId, score: g._count.trackId }))
        : [];

      // Playlists that share a track with one of mine → what else is in them?
      const sharingPlaylists = await prisma.playlistTrack.findMany({
        where: { trackId: { in: seedIds } },
        select: { playlistId: true },
      });
      const playlistScores: CoScore[] = sharingPlaylists.length
        ? (
            await prisma.playlistTrack.groupBy({
              by: ["trackId"],
              where: { playlistId: { in: sharingPlaylists.map((p) => p.playlistId) }, trackId: { notIn: seedIds } },
              _count: { trackId: true },
              orderBy: { _count: { trackId: "desc" } },
              take: 30,
            })
          ).map((g) => ({ trackId: g.trackId, score: g._count.trackId }))
        : [];

      let ranked = mergeScores(libraryScores, playlistScores).map((c) => c.trackId).slice(0, 10);
      const exclude = new Set([...seedIds, ...ranked]);
      if (ranked.length < 10) ranked = [...ranked, ...(await coldStart(seedIds[0], exclude))].slice(0, 10);

      if (ranked.length) {
        const tracks = await prisma.track.findMany({ where: { id: { in: ranked } }, include: TRACK_INCLUDE });
        const byId = new Map(tracks.map((t) => [t.id, t]));
        const ordered = ranked.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
        return res.json({ tracks: ordered, source: "co-occurrence" });
      }
    }
  }

  // Fallback: anonymous or zero signals → trending.
  const tracks = await prisma.track.findMany({
    include: TRACK_INCLUDE,
    orderBy: { playCount: "desc" },
    take: 10,
  });
  res.json({ tracks, source: "trending" });
});

router.get("/:id", async (req, res) => {
  const track = await prisma.track.findUnique({
    where: { id: req.params.id },
    include: TRACK_INCLUDE,
  });
  if (!track) return res.status(404).json({ error: "track not found" });
  res.json({ track });
});

// Generation-notes annex (John's ideas pass #8): owner-scoped editing of the
// AI-disclosure metadata (aiPrompt / aiGenerationNotes) after upload. Only
// the artist's owner can change it; bounded lengths (32KB fieldSize cap
// mirrors the upload route).
router.patch("/:id/meta", requireAuth, async (req: AuthedRequest, res) => {
  const { aiPrompt, aiGenerationNotes } = req.body || {};
  if (aiPrompt === undefined && aiGenerationNotes === undefined) {
    return res.status(400).json({ error: "aiPrompt or aiGenerationNotes is required" });
  }
  const MAX = 32 * 1024;
  if (aiPrompt !== undefined && (typeof aiPrompt !== "string" || aiPrompt.length > MAX)) {
    return res.status(400).json({ error: `aiPrompt must be a string <= ${MAX} chars` });
  }
  if (aiGenerationNotes !== undefined && (typeof aiGenerationNotes !== "string" || aiGenerationNotes.length > MAX)) {
    return res.status(400).json({ error: `aiGenerationNotes must be a string <= ${MAX} chars` });
  }

  const track = await prisma.track.findUnique({ where: { id: req.params.id }, include: { artist: true } });
  if (!track) return res.status(404).json({ error: "track not found" });
  if (track.artist.ownerId !== req.userId) return res.status(403).json({ error: "you do not own this artist profile" });

  const updated = await prisma.track.update({
    where: { id: track.id },
    data: {
      ...(aiPrompt !== undefined ? { aiPrompt: aiPrompt || null } : {}),
      ...(aiGenerationNotes !== undefined ? { aiGenerationNotes: aiGenerationNotes || null } : {}),
    },
    include: TRACK_INCLUDE,
  });
  res.json({ track: updated });
});

export default router;
