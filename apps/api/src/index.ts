import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import path from "path";

import "./lib/secrets";
import "./lib/email";

import authRoutes from "./routes/auth";
import artistRoutes from "./routes/artists";
import albumRoutes from "./routes/albums";
import trackRoutes from "./routes/tracks";
import uploadRoutes from "./routes/upload";
import streamRoutes from "./routes/stream";
import libraryRoutes from "./routes/library";
import playlistRoutes from "./routes/playlists";
import followRoutes from "./routes/follows";
import collabRoutes from "./routes/collabs";
import { verifySessionToken } from "./lib/jwt";

// Rate-limit keys: authenticated requests are bucketed PER USER, anonymous
// ones per IP. express-rate-limit defaults to IP — on localhost every client
// (and every test script) shares ::1, so one active session exhausted the
// shared bucket and EVERY write started returning 429. In the UI that meant
// the optimistic heart filled, the save got 429'd, and the store rolled back
// — "likes and auto-unlikes rapidly".
function rateLimitKey(req: express.Request): string {
  const token = (req as express.Request & { cookies?: Record<string, string> }).cookies?.token;
  if (token) {
    try {
      return `user:${verifySessionToken(token).userId}`;
    } catch {
      /* invalid/expired token — fall through to IP */
    }
  }
  // ipKeyGenerator normalizes IPv6 addresses to a /56 subnet, so anonymous
  // users can't cycle addresses to bypass the limit. Without it, v8 throws
  // ERR_ERL_KEY_GEN_IPV6 at startup (the terminal error we saw).
  return ipKeyGenerator(req.ip ?? "unknown");
}
import corpusRoutes from "./routes/corpus";

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// Dev-friendly CORS: allow the configured origin AND any localhost port.
// Vite bounces to 5174/5175 when 5173 is taken (concurrently -k races),
// and a strict single-origin list makes every credentialed request (me(),
// likes, myArtists) fail CORS → the app thinks you're logged out and your
// own artists look "unlinked". In dev we allow any localhost origin;
// production still requires the exact CORS_ORIGIN.
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // non-browser / same-origin
      const allowed = CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
      if (allowed.includes(origin)) return cb(null, true);
      if (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Looser than auth (mutating writes, not credential guesses) but still bounded
// so a single account can't be scripted into hammering the API or the disk.
// skipFailedRequests: rejected requests (429) don't consume quota — otherwise
// a flapping client clicks like → 429 → clicks again → 429... and locks
// itself out for the whole window (the "like bug" coming back).
// skip: only WRITES count against this limiter. Reads (GET/HEAD/OPTIONS) are
// public catalog browsing — Home loads ~8 GETs, Search typing fires 2 GETs
// per keystroke, visiting Library fires 3. Counting those against a
// 60/15min user budget meant normal browsing locked the whole UI out with
// 429s after a couple of minutes ("everything is not fetch anymore",
// user-reported). The limiter's purpose is bounding mutating writes.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  skipFailedRequests: true,
  skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method),
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  skipFailedRequests: true,
});

// Tighter than authLimiter: these two send mail, so an unbounded caller can
// mail-bomb a single inbox even though they can't brute-force anything (tokens
// are 256-bit random).
const mailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

// Streaming is intentionally public (shared catalog), but files can be large,
// so bound how hard one IP can hammer disk/bandwidth via repeated range requests.
const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Cover/avatar/banner art only (never audio — that stays behind the
// rate-limited, play-counting /stream route). express.static normalizes the
// path itself, so a `..` segment in the URL can't escape these directories.
const STORAGE_ROOT = path.resolve(__dirname, "../../../storage");
app.use("/media/covers", express.static(path.join(STORAGE_ROOT, "covers"), { fallthrough: false, maxAge: "1d" }));
app.use("/media/avatars", express.static(path.join(STORAGE_ROOT, "avatars"), { fallthrough: false, maxAge: "1d" }));
app.use("/media/banners", express.static(path.join(STORAGE_ROOT, "banners"), { fallthrough: false, maxAge: "1d" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth/forgot-password", mailLimiter);
app.use("/auth/resend-verification", mailLimiter);
app.use("/auth", authLimiter, authRoutes);
app.use("/artists", writeLimiter, artistRoutes);
app.use("/albums", writeLimiter, albumRoutes);
// /tracks under writeLimiter too (F10, John's review): PATCH /:id/meta was
// the one unbounded write router — it only skips GET/HEAD/OPTIONS, so
// public catalog reads stay unlimited while owner writes are bounded.
app.use("/tracks", writeLimiter, trackRoutes);
app.use("/upload", uploadLimiter, uploadRoutes);
app.use("/stream", streamLimiter, streamRoutes);
app.use("/library", writeLimiter, libraryRoutes);
app.use("/playlists", writeLimiter, playlistRoutes);
app.use("/follows", writeLimiter, followRoutes);
app.use("/collabs", writeLimiter, collabRoutes);
app.use("/corpus", corpusRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

// Centralized error handler — express-async-errors forwards rejected promises
// from async route handlers here instead of letting them hang the request.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, () => {
  console.log(`SpotifAI API listening on http://localhost:${PORT}`);
});
