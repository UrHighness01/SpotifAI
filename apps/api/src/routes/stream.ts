import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../db";

const router = Router();
const STORAGE_ROOT = path.resolve(__dirname, "../../../../storage");

// F21 (John's review — MEDIUM): play-count increments on every rangeless
// request were unbounded write amplification AND trivially gameable (a bot
// inflates a track's play count → drives "trending" ordering). Dedupe per
// IP+track within a short window: one counted play per (IP, track) per 2
// minutes. In-memory Map with lazy eviction — fine at this scale.
const PLAY_DEDUPE_MS = 2 * 60 * 1000;
const playDedupe = new Map<string, number>();
function countPlay(ip: string, trackId: string): boolean {
  const key = `${ip}:${trackId}`;
  const now = Date.now();
  const last = playDedupe.get(key);
  if (last && now - last < PLAY_DEDUPE_MS) return false;
  if (playDedupe.size > 50_000) playDedupe.clear(); // crude eviction guard
  playDedupe.set(key, now);
  return true;
}

router.get("/:trackId", async (req, res) => {
  const track = await prisma.track.findUnique({ where: { id: req.params.trackId } });
  if (!track) return res.status(404).json({ error: "track not found" });

  const filePath = path.join(STORAGE_ROOT, track.audioPath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "audio file missing" });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = guessContentType(filePath);

  // Only count a play once per audio element load, not per seek — a seek issues
  // its own ranged request but always carries a Range header, so a fresh
  // (rangeless) request is what a browser sends when it first loads the track.
  // Additionally deduped per IP+track (F21) so bots can't inflate play counts.
  if (!range && countPlay(req.ip ?? "unknown", track.id)) {
    prisma.track.update({ where: { id: track.id }, data: { playCount: { increment: 1 } } }).catch(() => {});
  }

  if (!range) {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
    return res.end();
  }
  const start = match[1] ? parseInt(match[1], 10) : fileSize - parseInt(match[2], 10);
  const end = match[2] && match[1] ? parseInt(match[2], 10) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= fileSize) {
    res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
    return res.end();
  }
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": contentType,
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
});

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".flac") return "audio/flac";
  return "application/octet-stream";
}

export default router;
