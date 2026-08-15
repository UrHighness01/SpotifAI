#!/usr/bin/env python3
"""
augment_corpus.py — Quality synthetic augmentation for the nano corpus.

John's gate verdict was honest: a 0.63M-param char GLA overfits ~6K tokens
and can't generalize. His rule: fix = corpus, not model size. This script
grows the corpus with *structured, genre-coherent* documents so the model
learns the real pattern — `title | aimodel | genre | prompt → blurb` —
instead of memorizing 32 one-off lines.

Every doc is tagged source: "synthetic-augmentation-v1" so provenance stays
honest (the nano README keeps the provenance rule). The templates below are
hand-written per genre with real vocabulary; the variation comes from
combinatorial title/prompt/blurb assembly, not random junk.

Usage:
    python3 augment_corpus.py --out corpus/augmented.jsonl [--n 600]
    # then concatenate: cat corpus/augmented.jsonl >> corpus/seed.jsonl
"""
import argparse
import json
import random
from pathlib import Path

random.seed(20260815)

GENRES = {
    "synthwave": {
        "adjs": ["retro-future", "neon-soaked", "chrome-edged", "night-drive", "analog-drenched"],
        "details": [
            "built around an analog-synth lead",
            "pushing a driving bassline through city-night textures",
            "all arpeggiated synths and pulsing sequencers",
            "layering dreamy pads over a night-drive pulse",
            "with a rolling arp and a low-slung bass",
        ],
        "blurb_adj": ["neon-drenched", "mid-tempo", "glowing", "cinematic"],
    },
    "ambient": {
        "adjs": ["slow-evolving", "deep", "frozen", "icy", "minimal"],
        "details": [
            "layering evolving pads over a spacious drone",
            "letting a minimal melody surface and recede",
            "built from slow-drifting textures and quiet air",
            "finding beauty in silent spaces and low hum",
            "unfolding over a long, patient arc",
        ],
        "blurb_adj": ["slow", "spacious", "quiet", "meditative"],
    },
    "techno": {
        "adjs": ["hypnotic", "minimal", "relentless", "warehouse", "pulsing"],
        "details": [
            "built on a rolling bassline",
            "driven by a hypnotic pulse",
            "with pulse-width textures and dead-center kicks",
            "all machinery and momentum",
            "layering sub-bass pressure over a locked groove",
        ],
        "blurb_adj": ["hypnotic", "driving", "relentless", "functional"],
    },
    "lo-fi": {
        "adjs": ["dusty", "warm", "sleepy", "crackly", "soft-focus"],
        "details": [
            "dusted with vinyl crackle and soft chords",
            "built from dusty drums and a warm bass",
            "with tape hiss and a sleepy swing",
            "layering soft keys over a mellow break",
            "all warmth and worn edges",
        ],
        "blurb_adj": ["mellow", "dusty", "warm", "hazy"],
    },
    "idm": {
        "adjs": ["glitchy", "intricate", "fractured", "mathy", "granular"],
        "details": [
            "foregrounding glitchy, intricate percussion",
            "built from recursive patterns and granular synthesis",
            "with fractured beats and odd-meter detail",
            "all micro-edits and restless textures",
            "twisting clean tones through broken rhythms",
        ],
        "blurb_adj": ["intricate", "fractured", "restless", "detailed"],
    },
    "darksynth": {
        "adjs": ["pulsing", "menacing", "horror-tinged", "sequencer-driven", "industrial"],
        "details": [
            "driven by a pulsing sequencer line",
            "with horror-synth stabs and a driving kick",
            "built from dark pads and relentless arps",
            "all tension and chrome",
            "layering eerie leads over a machine pulse",
        ],
        "blurb_adj": ["dark", "relentless", "cinematic", "brooding"],
    },
    "dream pop": {
        "adjs": ["hazy", "reverb-drenched", "soft-focus", "lush", "weightless"],
        "details": [
            "wrapped in reverb-drenched textures",
            "submerging vocals under layers of haze",
            "built from lush chords and buried melodies",
            "all soft edges and slow bloom",
            "floating on washed-out guitars",
        ],
        "blurb_adj": ["hazy", "lush", "dreamy", "soft"],
    },
    "drum and bass": {
        "adjs": ["breakbeat-driven", "high-energy", "sub-heavy", "rolling", "frenetic"],
        "details": [
            "powered by breakbeats and sub-bass pressure",
            "with rolling drums and deep low end",
            "built from chopped breaks and weighty bass",
            "all velocity and pressure",
            "layering euphoric pads over a frantic break",
        ],
        "blurb_adj": ["high-energy", "rolling", "urgent", "weighty"],
    },
    "industrial": {
        "adjs": ["metallic", "noise-heavy", "machine-driven", "harsh", "clanging"],
        "details": [
            "built from noise and metallic percussion",
            "with clanging rhythms and abrasive textures",
            "all gears, sparks, and distortion",
            "layering industrial clatter over a slow burn",
            "driven by relentless machine-gun percussion",
        ],
        "blurb_adj": ["harsh", "machine-like", "relentless", "abrasive"],
    },
    "chillwave": {
        "adjs": ["warm", "hazy", "sun-bleached", "dreamy", "summer-tinged"],
        "details": [
            "glowing with warm synth pads",
            "built from sun-bleached textures and slow beats",
            "all hazy warmth and faded tape",
            "layering lazy chords over a soft groove",
            "drifting in a warm, analog glow",
        ],
        "blurb_adj": ["hazy", "warm", "sunny", "mellow"],
    },
}

MODELS = ["Suno v4", "Suno v3.5", "Udio"]

TITLE_A = ["Neon", "Chrome", "Silent", "Faded", "Lunar", "Static", "Glass", "Solar",
           "Hollow", "Crystal", "Velvet", "Iron", "Pale", "Golden", "Deep", "Wild"]
TITLE_B = ["Gradient", "Circuit", "Horizon", "Echo", "Drift", "Signal", "Bloom",
           "Vector", "Pulse", "Spectrum", "Vault", "Mirror", "Arc", "Field", "Ghost", "Tide"]

PROMPT_BRIDGES = ["", " slow build", " minimal arrangement", " layered textures",
                  " with a hook", " for night driving", " on tape", " big room"]


def make_prompt(genre: str, adj: str, detail: str) -> str:
    return f"{adj} {genre}{random.choice(PROMPT_BRIDGES)}"


def make_blurb(genre: str, model: str, adj: str, detail: str) -> str:
    b_adj = random.choice(GENRES[genre]["blurb_adj"])
    article = "an" if genre[0].lower() in "aeiou" else "a"
    template = random.choice([
        f"{article.capitalize()} {b_adj} {genre} track generated with {model}, {detail}.",
        f"{b_adj.capitalize()} {genre} from {model}, {detail}.",
        f"{article.capitalize()} {genre} cut generated with {model}, {detail}.",
        f"Generated with {model}: {b_adj} {genre}, {detail}.",
    ])
    return template


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).parent / "augmented.jsonl"))
    ap.add_argument("--n", type=int, default=600)
    a = ap.parse_args()

    rows = []
    genre_names = list(GENRES.keys())
    for _ in range(a.n):
        genre = random.choice(genre_names)
        g = GENRES[genre]
        adj = random.choice(g["adjs"])
        detail = random.choice(g["details"])
        model = random.choice(MODELS)
        title = f"{random.choice(TITLE_A)} {random.choice(TITLE_B)}"
        row = {
            "title": title,
            "aiModel": model,
            "genre": genre,
            "prompt": make_prompt(genre, adj, detail),
            "blurb": make_blurb(genre, model, adj, detail),
            "source": "synthetic-augmentation-v1",
        }
        rows.append(row)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"wrote {len(rows)} augmented docs -> {out}")
    print(f"genres: {sorted(set(r['genre'] for r in rows))}")
    print(f"models: {sorted(set(r['aiModel'] for r in rows))}")
    print("sample:")
    for r in rows[:3]:
        print(" ", json.dumps(r))


if __name__ == "__main__":
    main()
