import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
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
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
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

// Cover/avatar art only (never audio — that stays behind the rate-limited,
// play-counting /stream route). express.static normalizes the path itself,
// so a `..` segment in the URL can't escape these two directories.
const STORAGE_ROOT = path.resolve(__dirname, "../../../storage");
app.use("/media/covers", express.static(path.join(STORAGE_ROOT, "covers"), { fallthrough: false, maxAge: "1d" }));
app.use("/media/avatars", express.static(path.join(STORAGE_ROOT, "avatars"), { fallthrough: false, maxAge: "1d" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth/forgot-password", mailLimiter);
app.use("/auth/resend-verification", mailLimiter);
app.use("/auth", authLimiter, authRoutes);
app.use("/artists", writeLimiter, artistRoutes);
app.use("/albums", writeLimiter, albumRoutes);
app.use("/tracks", trackRoutes);
app.use("/upload", uploadLimiter, uploadRoutes);
app.use("/stream", streamLimiter, streamRoutes);
app.use("/library", writeLimiter, libraryRoutes);
app.use("/playlists", writeLimiter, playlistRoutes);
app.use("/follows", writeLimiter, followRoutes);
app.use("/collabs", writeLimiter, collabRoutes);

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
