import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth";
import artistRoutes from "./routes/artists";
import albumRoutes from "./routes/albums";
import trackRoutes from "./routes/tracks";
import uploadRoutes from "./routes/upload";
import streamRoutes from "./routes/stream";
import libraryRoutes from "./routes/library";

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-me")) {
  throw new Error("JWT_SECRET must be set to a non-default value in production");
}

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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authLimiter, authRoutes);
app.use("/artists", artistRoutes);
app.use("/albums", albumRoutes);
app.use("/tracks", trackRoutes);
app.use("/upload", uploadRoutes);
app.use("/stream", streamRoutes);
app.use("/library", libraryRoutes);

app.listen(PORT, () => {
  console.log(`SpotifAI API listening on http://localhost:${PORT}`);
});
