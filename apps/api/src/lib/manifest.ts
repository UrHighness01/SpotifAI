import crypto from "crypto";

/**
 * Provenance manifest signing (John's Tier D #1, hardened per Tier G #1).
 *
 * Ed25519 asymmetric signing: the private key signs the manifest; the
 * PUBLIC key is published at GET /artists/provenance-public-key and
 * embedded in the verify tool — so anyone can verify the signature against
 * a key they got from a channel the platform doesn't control. This is the
 * honest completion of "verify it yourself, offline, signed": not "signed
 * by the platform" but "verifiable against a public key."
 *
 * Dev defaults below — production MUST set MANIFEST_PRIVATE_KEY /
 * MANIFEST_PUBLIC_KEY (env PEM). The API already refuses to start in
 * production without JWT_SECRET; the same spirit applies here.
 */

// Dev-only keypair (generated 2026-08-15). Replace via env in production.
const DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIL7kv32gp9fXiWaGH0PCCEEwW/G3ahseBlkbNdwDhnxq
-----END PRIVATE KEY-----`;
const DEV_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAcI7gxMkbbcmsh0meRj8Goy4WuYnZw6m2RdlWc/r5xk8=
-----END PUBLIC KEY-----`;

export const MANIFEST_PRIVATE_KEY = process.env.MANIFEST_PRIVATE_KEY || DEV_PRIVATE_KEY;
export const MANIFEST_PUBLIC_KEY = process.env.MANIFEST_PUBLIC_KEY || DEV_PUBLIC_KEY;

// Ed25519 keys must be loaded as KeyObjects, and Node (22) requires a
// null digest for Ed25519 (createSign('ed25519') throws
// ERR_CRYPTO_INVALID_DIGEST). crypto.sign(null, ...) handles both.
const privateKeyObj = crypto.createPrivateKey(MANIFEST_PRIVATE_KEY);
const publicKeyObj = crypto.createPublicKey(MANIFEST_PUBLIC_KEY);

export function signManifest(payload: string): string {
  return crypto.sign(null, Buffer.from(payload), privateKeyObj).toString("base64");
}

export function verifyManifest(payload: string, signature: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(payload), publicKeyObj, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export interface ManifestTrackEntry {
  title: string;
  trackId: string;
  model: string;
  byteHash: string;
  perceptualHash: string | null;
  recordedAt: string;
}

export interface ProvenanceManifest {
  schema: "spotifai-provenance-v1";
  artistId: string;
  artistName: string;
  generatedAt: string;
  tracks: ManifestTrackEntry[];
  signature: string;
  // The public key that verifies this signature (self-describing, so the
  // manifest is verifiable offline even before fetching the key endpoint).
  publicKey: string;
}
