import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import artistRoutes from "./routes/artists";
import albumRoutes from "./routes/albums";
import trackRoutes from "./routes/tracks";
import uploadRoutes from "./routes/upload";
import streamRoutes from "./routes/stream";
import libraryRoutes from "./routes/library";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/artists", artistRoutes);
app.use("/albums", albumRoutes);
app.use("/tracks", trackRoutes);
app.use("/upload", uploadRoutes);
app.use("/stream", streamRoutes);
app.use("/library", libraryRoutes);

app.listen(PORT, () => {
  console.log(`SpotifAI API listening on http://localhost:${PORT}`);
});
