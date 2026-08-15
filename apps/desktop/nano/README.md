# SpotifAI Nano — On-Device Track Describer

Sub-2MB, zero-dependency, INT4-quantized character-level GLA (gated linear
attention) model that generates short "About this AI track" blurbs from track
metadata (title + `aiModel` + `aiPrompt`/genre), running **on-device in the
Electron app** — private, offline, free, no server/GPU/API cost.

Tracked in [`build-loop-nano.html`](../../build-loop-nano.html). Decision
recorded in [`docs/decisions/0001-project-k-recommendations.md`](../../docs/decisions/0001-project-k-recommendations.md).

## Hard rules (John's review conditions)

1. **Blurbs, never explainers.** The model generates *descriptions* ("a
   synthwave track generated with Suno v4, mid-tempo, analog-synth lead").
   It must **never** generate "why was this recommended" text — that stays a
   **template** interpolating real co-occurrence data, because a generated
   explainer risks hallucinating a false reason.
2. **Ranking stays co-occurrence.** This model never touches
   `GET /tracks/:id/related` or `GET /tracks/recommended`.
3. **Corpus quality is the whole project.** A 2.67M-param GLA learns whatever
   coherent data it's given. The bottleneck is the corpus, not the model.

## Pipeline (mirrors Project-K)

```
corpus/seed.jsonl          hand-curated metadata samples (titles, aiModel,
                           aiPrompt/genre, hand-written blurbs) + provenance
corpus/build_corpus.py     JSONL → train.bin / val.bin (uint16 char tokens)
                           + meta.pkl (itos/stoi), Project-M format
train/                     GLA training loop (Project-K train_simple_gla.py
                           --dataset spotifai-music)
export/                    INT4 quantization + .bin export (Project-K
                           export_int4_bin.py, MHSI format)
engine/                    C inference engine + Electron worker wrapper
```

## Commands

```bash
# 1. Build the corpus (corpus-first — this is the real work)
npm run nano:corpus -w apps/desktop

# 2. Train (needs torch; GPU optional, CPU works for tiny models)
npm run nano:train -w apps/desktop -- --iters 80000

# 3. Export INT4 .bin
npm run nano:export -w apps/desktop

# 4. Verify: generate a blurb for a seed track
npm run nano:verify -w apps/desktop
```

## Corpus format

Each line in `corpus/seed.jsonl` is one document. The builder lowercases,
char-tokenizes, and splits into `train.bin`/`val.bin` exactly like
Project-M's `creator` corpus, so `train_simple_gla.py` can load it with
`--dataset spotifai-music`.

```json
{"title":"Overfit Sunrise","aiModel":"Suno v4","genre":"synthwave","prompt":"retro-future synthwave, analog lead, mid-tempo","blurb":"A mid-tempo synthwave cut generated with Suno v4 — analog-synth lead, retro-future glow."}
```

Provenance is kept per-line (`source` field) so every document can be
attributed — this is the one place real-world text can leak in.
