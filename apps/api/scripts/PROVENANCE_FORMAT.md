# SpotifAI Provenance Manifest — Open Format (v1)

A portable, cryptographically verifiable record of audio provenance.
Anyone — not just SpotifAI — can download a manifest, verify its
signature against the embedded Ed25519 public key, and check a local
audio file against the recorded hashes. SpotifAI is *a* ledger in an
interoperable one, not the gatekeeper of truth (Tier I #5).

## Endpoints

- `GET /artists/:id/provenance-manifest` — the signed manifest (public).
- `GET /artists/provenance-public-key` — the platform's Ed25519 public key.

## Schema (`spotifai-provenance-v1`)

```json
{
  "schema": "spotifai-provenance-v1",
  "artistId": "cuid",
  "artistName": "string",
  "generatedAt": "ISO-8601",
  "tracks": [
    {
      "title": "string",
      "trackId": "cuid",
      "model": "string",
      "byteHash": "16-hex (SHA-256 prefix of audio bytes + metadata)",
      "perceptualHash": "16-hex | null (windowed spectral-energy fingerprint)",
      "recordedAt": "ISO-8601"
    }
  ],
  "signature": "base64 Ed25519 signature",
  "publicKey": "PEM — verifies the signature"
}
```

## Verification algorithm

1. Parse the manifest; confirm `schema === "spotifai-provenance-v1"`.
2. Remove `signature`; canonicalize the rest (JSON.stringify, stable key
   order as emitted).
3. `crypto.verify(null, payload, manifest.publicKey, signature)` —
   Ed25519 (null digest per Node's API).
4. For a local audio file: SHA-256 of the first 1 MB → 16-hex prefix;
   compare to the entry's `byteHash`. A match means "this exact audio was
   recorded at upload time." (`perceptualHash` is resilient to small
   offsets; signature matching against a generator corpus is the future
   escalation — never a binary "verified" until the corpus is trustworthy.)

## Standalone verifier

`apps/api/scripts/verify-provenance.js` — plain Node, zero dependencies:

```bash
node verify-provenance.js <manifest-url-or-file> <audio-file> [trackIndex]
# exit 0 = verified, 2 = hash mismatch
```

## Honest-label semantics

- `provenanceStatus: "recorded"` — fingerprint captured at upload; no
  generator-signature match attempted yet.
- Future: `signature-matched` / `signature-uncertain` — only after a
  trustworthy generator-signature corpus exists. Never a binary "verified"
  claim before that.
