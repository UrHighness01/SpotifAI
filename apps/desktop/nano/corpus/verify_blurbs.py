#!/usr/bin/env python3
"""
verify_blurbs.py — Corpus-quality gate (nano 7, John's GO condition #2).

A tiny GLA on a small corpus hallucinates freely, and the fix is nearly always
more/cleaner corpus, not a bigger model. This harness invokes the exported
INT4 .bin through the C engine and hand-checks generated blurbs against a
fixed set of seed tracks for nonsense or off-brand output.

Usage:
    python3 verify_blurbs.py [--bin path/to/track-describer.bin]

Prints each generated blurb for the seed set. The HUMAN (or John in review)
reads them and decides: on-brand -> gate passes; nonsense -> more corpus.
"""
import argparse
import subprocess
import sys
from pathlib import Path

NANO_DIR = Path(__file__).resolve().parents[1]
ENGINE = NANO_DIR / "engine" / "track_describer"
VOCAB = NANO_DIR / "engine" / "vocab.tsv"

SEED = [
    {"title": "Overfit Sunrise", "aiModel": "Suno v4", "genre": "synthwave",
     "prompt": "retro-future synthwave, analog lead, mid-tempo"},
    {"title": "Error 500", "aiModel": "Suno v4", "genre": "glitch",
     "prompt": "glitchy electronica, stuttering beats"},
    {"title": "Midnight Circuit", "aiModel": "Udio", "genre": "darksynth",
     "prompt": "darksynth, pulsing sequencer"},
]


def prompt_for(track: dict) -> str:
    return (
        f"title: {track['title'].lower()} | aimodel: {track['aiModel'].lower()}"
        f" | genre: {track['genre'].lower()} | prompt: {track['prompt'].lower()}"
        f" | blurb: "
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin", default=str(NANO_DIR / "track-describer.bin"),
                    help="path to the exported INT4 .bin")
    a = ap.parse_args()

    bin_path = Path(a.bin)
    if not bin_path.exists():
        sys.exit(f"model binary not found: {bin_path} — run nano:export first")
    if not ENGINE.exists() or not VOCAB.exists():
        sys.exit(f"engine ({ENGINE}) or vocab ({VOCAB}) missing — build/export first")

    print("=" * 70)
    print("CORPUS-QUALITY GATE — read each blurb and judge on-brand vs nonsense")
    print("=" * 70)
    for t in SEED:
        prompt = prompt_for(t)
        print(f"\nTrack: {t['title']} ({t['genre']}, {t['aiModel']})")
        print(f"Prompt: {prompt!r}")
        try:
            result = subprocess.run(
                [str(ENGINE), str(bin_path), str(VOCAB), "96"],
                input=prompt + "\n", capture_output=True, text=True, timeout=30,
            )
            print(f"Blurb: {result.stdout.strip()}")
            if result.stderr.strip():
                print(f"(stderr: {result.stderr.strip()[:200]})")
        except subprocess.TimeoutExpired:
            print("Blurb: <engine timed out>")


if __name__ == "__main__":
    main()
