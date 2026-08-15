import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { writeCover } from "../lib/cover-art";
import { fingerprintAudio } from "../lib/fingerprint";
import { recordDeclaredSignature } from "../lib/corpus";
import { evaluateProvenance } from "../lib/signatures";

const router = Router();

const STORAGE_ROOT = path.resolve(__dirname, "../../../../storage");
const AUDIO_DIR = path.join(STORAGE_ROOT, "audio");
const COVER_DIR = path.join(STORAGE_ROOT, "covers");
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

// Extension is derived from the validated mimetype below, never from the
// client-supplied filename, so an attacker can't smuggle an arbitrary
// extension onto a stored file.
const AUDIO_EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/flac": ".flac",
  "audio/ogg": ".ogg",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
};
const COVER_EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === "cover" ? COVER_DIR : AUDIO_DIR);
  },
  filename: (req, file, cb) => {
    const extByMime = file.fieldname === "cover" ? COVER_EXT_BY_MIME : AUDIO_EXT_BY_MIME;
    const ext = extByMime[file.mimetype] || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
    fieldSize: 32 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = file.fieldname === "cover" ? COVER_EXT_BY_MIME : AUDIO_EXT_BY_MIME;
    if (!(file.mimetype in allowed)) {
      return cb(new Error(`unsupported ${file.fieldname} file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

function unlinkQuiet(filePath?: string) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

// Shared per-track creation for single + batch upload: fingerprints the
// audio, creates the track record with the honest provenance ladder, and
// appends a declared signature to the corpus. Accepts either the top-level
// prisma client or a transaction client (batch wraps everything in one
// transaction so a mid-batch failure leaves no orphan tracks/albums).
async function createTrackRecord(
  client: Pick<typeof prisma, "track">,
  args: {
    audioPath: string;
    title: string;
    artistId: string;
    albumId: string;
    durationSec?: string | number;
    model: string;
    aiPrompt?: string;
    aiGenerationNotes?: string;
    rightsNotice?: string;
    licensePriceUsd?: string | number;
    licenseTerms?: string;
  }
) {
  const fingerprint = fingerprintAudio(args.audioPath, { aiModel: args.model, title: args.title });
  const track = await client.track.create({
    data: {
      title: args.title,
      artistId: args.artistId,
      albumId: args.albumId,
      audioPath: path.relative(STORAGE_ROOT, args.audioPath),
      durationSec: args.durationSec ? Number(args.durationSec) : 0,
      aiModel: args.model,
      aiPrompt: args.aiPrompt || undefined,
      aiGenerationNotes: args.aiGenerationNotes || undefined,
      rightsNotice: args.rightsNotice || "all-rights-reserved",
      licensePriceUsd: args.licensePriceUsd !== undefined ? Number(args.licensePriceUsd) : undefined,
      licenseTerms: args.licenseTerms || undefined,
      fingerprintHash: fingerprint?.hash,
      fingerprintModel: fingerprint?.model,
      fingerprintCapturedAt: fingerprint ? new Date() : undefined,
      // Tier C infra: the perceptual fingerprint is stored now so a
      // generator-signature matcher is *possible* later — label stays
      // 'recorded' until matching exists (never a binary 'verified').
      perceptualHash: fingerprint?.perceptual,
      // Honest label (John's Tier 3 + his review finding): 'recorded' is
      // set ONLY when a fingerprint was actually captured. Explicit null
      // (not undefined) when capture failed — otherwise Prisma falls back
      // to the column default @default("recorded") and mislabels a
      // failed-capture track as 'recorded' with a null hash.
      // Live evaluation (slice 72): when the fingerprint is captured,
      // evaluateProvenance immediately assigns the honest ladder label —
      // 'signature-matched' (discriminative), 'signature-uncertain'
      // (overlap), or 'recorded' (no signature evidence) — so new
      // declared-generator tracks acquire the claim automatically,
      // consistent with the validated corpus, not via one-time migration.
      provenanceStatus: fingerprint ? evaluateProvenance(args.model, fingerprint.perceptual) : null,
    },
  });
  // Passive corpus self-growth (John's ranked #1): declared-generator
  // uploads append to the signatures corpus at upload time — the label
  // stays 'recorded'; evidence accumulates privately per the runbook.
  recordDeclaredSignature({
    perceptualHash: fingerprint?.perceptual,
    byteHash: fingerprint?.hash,
    generator: args.model,
    trackId: track.id,
  });
  return track;
}

// Covers live on albums only: attach the uploaded file, or generate a
// placeholder so the album is never blank in the UI.
async function ensureAlbumCover(albumId: string, coverFile?: Express.Multer.File): Promise<void> {
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) return;
  if (coverFile) {
    await prisma.album.update({
      where: { id: albumId },
      data: { coverPath: path.relative(STORAGE_ROOT, coverFile.path) },
    });
  } else if (!album.coverPath) {
    const coverPath = `covers/${writeCover(COVER_DIR, albumId)}`;
    await prisma.album.update({ where: { id: albumId }, data: { coverPath } });
  }
}

router.post(
  "/track",
  requireAuth,
  (req, res, next) => {
    upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "upload failed" });
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    const files = req.files as { audio?: Express.Multer.File[]; cover?: Express.Multer.File[] };
    const audioFile = files?.audio?.[0];
    const coverFile = files?.cover?.[0];

    const cleanupAndReject = (status: number, error: string) => {
      unlinkQuiet(audioFile?.path);
      unlinkQuiet(coverFile?.path);
      return res.status(status).json({ error });
    };

    if (!audioFile) return cleanupAndReject(400, "audio file is required");

    const { title, artistId, albumId, durationSec, aiModel, aiPrompt, aiGenerationNotes, rightsNotice, licensePriceUsd, licenseTerms } = req.body || {};
    if (!title || !artistId) {
      return cleanupAndReject(400, "title and artistId are required");
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) return cleanupAndReject(404, "artist not found");
    if (artist.ownerId !== req.userId) {
      return cleanupAndReject(403, "you do not own this artist profile");
    }

    let album = null;
    if (albumId) {
      album = await prisma.album.findUnique({ where: { id: albumId } });
      if (!album) return cleanupAndReject(404, "album not found");
      if (album.artistId !== artistId) {
        return cleanupAndReject(403, "album does not belong to this artist");
      }
    }

    // F8 (John's review — MEDIUM): the album + track creation is now ONE
    // transaction, so a mid-create failure rolls back the album row instead
    // of leaving an orphan album (the batch route already did this).
    let track;
    try {
      track = await prisma.$transaction(async (tx) => {
        // Tracks have no cover of their own (only Album does), so a track
        // uploaded without an albumId gets a single-track album created for
        // it — otherwise it would have no way to ever show cover art.
        const effAlbum =
          album ?? (await tx.album.create({ data: { title, artistId } }));
        // aiModel is optional (user's ask) — 'unknown' when not disclosed.
        const model = (aiModel as string | undefined)?.trim() || "unknown";
        return createTrackRecord(tx, {
          audioPath: audioFile.path,
          title,
          artistId,
          albumId: effAlbum.id,
          durationSec,
          model,
          aiPrompt,
          aiGenerationNotes,
          rightsNotice,
          licensePriceUsd,
          licenseTerms,
        });
      });
    } catch (err) {
      cleanupAndReject(500, "upload failed");
      throw err;
    }
    const albumIdUsed = track.albumId!;
    await ensureAlbumCover(albumIdUsed, coverFile);

    res.status(201).json({ track });
  }
);

// Batch upload (user's ask): multiple tracks in one go — the album case.
// One artist for the whole batch, optionally one shared album (albumTitle),
// one model/prompt/rights set. Titles arrive position-matched from the JSON
// `titles` field (defaulting to filename stems). All DB writes run in ONE
// transaction — a failure leaves no orphan tracks/albums — and uploaded
// files are unlinked on any error.
router.post(
  "/tracks",
  requireAuth,
  (req, res, next) => {
    upload.fields([{ name: "audio", maxCount: 50 }, { name: "cover", maxCount: 1 }])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "upload failed" });
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    const files = req.files as { audio?: Express.Multer.File[]; cover?: Express.Multer.File[] };
    const audioFiles = files?.audio ?? [];
    const coverFile = files?.cover?.[0];

    const cleanupAll = () => {
      for (const f of audioFiles) unlinkQuiet(f.path);
      unlinkQuiet(coverFile?.path);
    };
    const cleanupAndReject = (status: number, error: string) => {
      cleanupAll();
      return res.status(status).json({ error });
    };

    if (audioFiles.length === 0) return cleanupAndReject(400, "at least one audio file is required");

    // F7 (John's review — HIGH): 50 files × 200MB = 10GB disk-fill per
    // request. Cap the CUMULATIVE batch bytes (2GB per request) in addition
    // to the per-file 200MB multer limit, so a single request can't exhaust
    // the disk even with 30 batches/hour.
    const MAX_BATCH_BYTES = 2 * 1024 * 1024 * 1024; // 2GB aggregate
    const totalBytes = audioFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalBytes > MAX_BATCH_BYTES) {
      return cleanupAndReject(400, `batch too large: ${Math.round(totalBytes / 1024 / 1024)}MB total (max 2048MB per batch)`);
    }

    const { artistId, albumTitle, titles, aiModel, aiPrompt, aiGenerationNotes, rightsNotice, licensePriceUsd, licenseTerms } = req.body || {};
    if (!artistId) return cleanupAndReject(400, "artistId is required");

    // Attribution is owner-gated exactly like the single route: only my own
    // artists — never someone else's profile.
    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) return cleanupAndReject(404, "artist not found");
    if (artist.ownerId !== req.userId) {
      return cleanupAndReject(403, "you do not own this artist profile");
    }

    let parsedTitles: string[] = [];
    try {
      const raw = JSON.parse((titles as string) || "[]");
      if (Array.isArray(raw)) parsedTitles = raw.map((t) => String(t));
    } catch {
      /* malformed — fall through to filename stems */
    }
    const effectiveTitles = audioFiles.map((f, i) => {
      const t = parsedTitles[i]?.trim();
      if (t) return t;
      const base = path.basename(f.originalname, path.extname(f.originalname)).trim();
      return base || `Track ${i + 1}`;
    });

    const model = (aiModel as string | undefined)?.trim() || "unknown";
    const albumTitleTrimmed = (albumTitle as string | undefined)?.trim();

    let result: { tracks: Awaited<ReturnType<typeof prisma.track.create>>[]; sharedAlbumId: string | null };
    try {
      result = await prisma.$transaction(async (tx) => {
        const sharedAlbum = albumTitleTrimmed
          ? await tx.album.create({ data: { title: albumTitleTrimmed, artistId } })
          : null;
        const tracks: Awaited<ReturnType<typeof prisma.track.create>>[] = [];
        for (let i = 0; i < audioFiles.length; i++) {
          const file = audioFiles[i];
          // No shared album → each track gets its own single-track album,
          // matching the single-upload behavior (so covers still work).
          const album = sharedAlbum ?? (await tx.album.create({ data: { title: effectiveTitles[i], artistId } }));
          tracks.push(
            await createTrackRecord(tx, {
              audioPath: file.path,
              title: effectiveTitles[i],
              artistId,
              albumId: album.id,
              model,
              aiPrompt,
              aiGenerationNotes,
              rightsNotice,
              licensePriceUsd,
              licenseTerms,
            })
          );
        }
        return { tracks, sharedAlbumId: sharedAlbum?.id ?? null };
      });
    } catch (err) {
      cleanupAll();
      throw err;
    }

    if (result.sharedAlbumId) {
      await ensureAlbumCover(result.sharedAlbumId, coverFile);
    } else {
      // Per-track albums: the uploaded cover (if any) attaches to the first,
      // placeholders fill the rest.
      for (let i = 0; i < result.tracks.length; i++) {
        // albumId is non-null here — every track in the batch got an album
        // (shared or per-track) within the same transaction.
        await ensureAlbumCover(result.tracks[i].albumId!, i === 0 ? coverFile : undefined);
      }
    }

    res.status(201).json({ tracks: result.tracks });
  }
);

export default router;
