#!/usr/bin/env python3
"""
export_vocab_tsv.py — Emit a vocab.tsv (token_idx \t char) from the corpus
meta.pkl, so the C engine can decode generated token ids to characters.

Usage:
    python3 nano/export_vocab_tsv.py \
        --meta nano/corpus/spotifai_music_meta.pkl \
        --out nano/engine/vocab.tsv
"""
import argparse
import pickle
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", required=True, help="path to meta.pkl from build_corpus.py")
    ap.add_argument("--out", required=True, help="output vocab.tsv path")
    a = ap.parse_args()

    meta = pickle.load(open(a.meta, "rb"))
    itos = meta["itos"]
    if isinstance(itos, dict):
        V = max(itos.keys()) + 1
        itos_list = [itos.get(i, "\x00") for i in range(V)]
    else:
        itos_list = list(itos)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for i, ch in enumerate(itos_list):
            if ch == "\x00":
                continue
            f.write(f"{i}\t{ch}\n")

    print(f"wrote {out} with {sum(1 for _ in open(out))} entries")


if __name__ == "__main__":
    main()
