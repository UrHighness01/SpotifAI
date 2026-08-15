import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

const CORPUS_FILE = path.resolve(__dirname, "../../../prisma/corpus/signatures.jsonl");
const DENSITY_THRESHOLD = 50;

// Corpus transparency (John's endorsed page): public, non-ranking,
// honest — per-generator curated/declared counts + 'X to threshold'.
// Makes the collection socially legible and motivates seed-collection,
// without escalating any un-floored label.
router.get("/status", (_req, res) => {
  const byGenerator = new Map<string, { curated: number; declared: number }>();
  if (fs.existsSync(CORPUS_FILE)) {
    for (const line of fs.readFileSync(CORPUS_FILE, "utf8").split("\n").filter(Boolean)) {
      try {
        const r = JSON.parse(line);
        const gen = String(r.generator ?? "unknown").toLowerCase();
        if (!byGenerator.has(gen)) byGenerator.set(gen, { curated: 0, declared: 0 });
        const e = byGenerator.get(gen)!;
        if (r.source === "declared-upload") e.declared++;
        else e.curated++;
      } catch {
        /* skip malformed */
      }
    }
  }
  const generators = [...byGenerator.entries()]
    .map(([generator, e]) => ({
      generator,
      curated: e.curated,
      declared: e.declared,
      total: e.curated + e.declared,
      toThreshold: Math.max(0, DENSITY_THRESHOLD - e.curated),
      ready: e.curated >= DENSITY_THRESHOLD,
    }))
    .sort((a, b) => b.curated - a.curated);
  res.json({ threshold: DENSITY_THRESHOLD, generators, capstoneReady: generators.some((g) => g.ready) });
});

export default router;
