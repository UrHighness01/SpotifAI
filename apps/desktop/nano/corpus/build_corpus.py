#!/usr/bin/env python3
"""
build_corpus.py — Convert corpus/seed.jsonl into the Project-M corpus format
(train.bin / val.bin as uint16 char tokens + meta.pkl with itos/stoi), so
Project-K's train_simple_gla.py can train a char-level GLA directly with
    --dataset spotifai-music --meta apps/desktop/nano/corpus/meta.pkl

This is the CORPUS-FIRST step (John's GO condition #2): a 2.67M-param GLA
learns whatever coherent data it's given, so the corpus is the real work.

Format mirrors Project-M's creator corpus exactly:
  meta.pkl = { vocab_size, itos: {id: char}, stoi: {char: id},
               n_train, n_val, n_docs }
"""
import argparse
import json
import pickle
import sys
from pathlib import Path

import numpy as np

# Document separator used by the tokenizer so the model learns doc boundaries.
DOC_SEP = "\n\n"


def build_vocab(docs: list[str]) -> tuple[dict[int, str], dict[str, int]]:
    """Character-level vocab: every unique character across the corpus."""
    chars = sorted({c for doc in docs for c in doc})
    itos = {i: ch for i, ch in enumerate(chars)}
    stoi = {ch: i for i, ch in itos.items()}
    return itos, stoi


def encode(text: str, stoi: dict[str, int]) -> np.ndarray:
    return np.array([stoi[c] for c in text], dtype=np.uint16)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=str(Path(__file__).parent / "seed.jsonl"))
    ap.add_argument("--output-dir", default=str(Path(__file__).parent))
    ap.add_argument("--val-frac", type=float, default=0.1,
                    help="fraction of docs held out for validation")
    a = ap.parse_args()

    in_path = Path(a.input)
    out_dir = Path(a.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Each JSONL line is one document; the blurb is the target text, but we
    # include the title/aiModel/genre prefix so the model learns to *map from*
    # metadata to a blurb. Format:
    #   "title: <t> | aiModel: <m> | genre: <g> | prompt: <p> | blurb: <b>"
    docs: list[str] = []
    n_skipped = 0
    with open(in_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                n_skipped += 1
                continue
            if not o.get("blurb"):
                n_skipped += 1
                continue
            head = " | ".join(
                f"{k}: {o.get(k, '')}".lower()
                for k in ("title", "aiModel", "genre", "prompt")
            )
            docs.append(f"{head} | blurb: {o['blurb'].lower()}{DOC_SEP}")

    if not docs:
        sys.exit(f"no valid documents found in {in_path}")

    itos, stoi = build_vocab(docs)

    # Deterministic split: sort docs, take every 10th as val.
    docs_sorted = sorted(docs)
    n_val = max(1, round(len(docs_sorted) * a.val_frac))
    val_docs = docs_sorted[:: max(1, len(docs_sorted) // n_val)][:n_val]
    val_set = set(val_docs)
    train_docs = [d for d in docs_sorted if d not in val_set]

    train_bin = np.concatenate([encode(d, stoi) for d in train_docs]).astype(np.uint16)
    val_bin = np.concatenate([encode(d, stoi) for d in val_docs]).astype(np.uint16)

    train_bin.tofile(out_dir / "spotifai_music_train.bin")
    val_bin.tofile(out_dir / "spotifai_music_val.bin")

    meta = {
        "vocab_size": len(itos),
        "itos": itos,
        "stoi": stoi,
        "n_train": len(train_bin),
        "n_val": len(val_bin),
        "n_docs": len(docs),
    }
    with open(out_dir / "spotifai_music_meta.pkl", "wb") as f:
        pickle.dump(meta, f)

    # Project-K's train_simple_gla.py hardcodes its data dir to
    # Project-M/data and loads `{dataset}_{split}.bin` there. Deploy the
    # corpus there too so `nano:train` (--dataset spotifai_music) finds it.
    deploy_dir = Path(__file__).resolve().parents[5] / "Project-M" / "data"
    if deploy_dir.exists():
        for name in ("spotifai_music_train.bin", "spotifai_music_val.bin"):
            (out_dir / name).replace(deploy_dir / name)
        print(f"deployed corpus to {deploy_dir}")

    print(f"docs: {len(docs)} (train {len(train_docs)}, val {len(val_docs)}) "
          f"skipped {n_skipped}")
    print(f"vocab_size: {len(itos)}")
    print(f"train tokens: {len(train_bin):,}  val tokens: {len(val_bin):,}")
    print(f"wrote {out_dir / 'spotifai_music_train.bin'}, "
          f"{out_dir / 'spotifai_music_val.bin'}, "
          f"{out_dir / 'spotifai_music_meta.pkl'}")
    print(f"first 60 chars of first doc: {repr(train_docs[0][:60])}")


if __name__ == "__main__":
    main()
