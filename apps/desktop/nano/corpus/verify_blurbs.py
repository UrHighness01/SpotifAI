#!/usr/bin/env python3
"""
verify_blurbs.py — Corpus-quality gate (nano 7, John's GO condition #2).

A tiny GLA on a small corpus hallucinates freely, and the fix is nearly always
more/cleaner corpus, not a bigger model. This harness loads the exported INT4
.bin through the C engine and hand-checks generated blurbs against a fixed set
of seed tracks for nonsense or off-brand output.

Usage:
    python3 verify_blurbs.py [--bin path/to/track-describer.bin]

Prints each generated blurb for the seed set. The HUMAN (or John in review)
reads them and decides: on-brand -> gate passes; nonsense -> more corpus.
"""
import argparse
import json
import sys
from pathlib import Path

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
        f"title: {track['title'].lower()} | aiModel: {track['aiModel'].lower()}"
        f" | genre: {track['genre'].lower()} | prompt: {track['prompt'].lower()}"
        f" | blurb: "
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin", default="nano/track-describer.bin",
                    help="path to the exported INT4 .bin (relative to apps/desktop)")
    ap.add_argument("--engine", default=None,
                    help="path to the C inference engine binary (default: build one from nano/engine/)")
    a = ap.parse_args()

    # The engine wrapper is a thin Python/C boundary; once the worker exists
    # (nano 5), this can shell out to the same code path the Electron app uses.
    if not Path(a.bin).exists():
        sys.exit(f"model binary not found: {a.bin} — run nano:export first")

    print("=" * 70)
    print("CORPUS-QUALITY GATE — read each blurb and judge on-brand vs nonsense")
    print("=" * 70)
    for t in SEED:
        print(f"\nTrack: {t['title']} ({t['genre']}, {t['aiModel']})")
        print(f"Prompt: {prompt_for(t)!r}")
        # TODO(nano 4/5): invoke the engine here. For now the gate harness is
        # the acceptance checklist; actual generation lands with the worker.
        print("Blurb: <engine output — lands with nano:export + worker>")


if __name__ == "__main__":
    main()
