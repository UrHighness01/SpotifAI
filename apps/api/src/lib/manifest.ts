import crypto from "crypto";

/**
 * Provenance manifest signing (John's Tier D #1).
 *
 * Every uploader's provenance wall becomes a verifiable JSON manifest,
 * signed with HMAC-SHA256 under a platform key. A listener can download the
 * manifest and verify the signature + hashes offline against their own copy
 * of the audio — "trust us, we recorded it" becomes "verify it yourself."
 * The signature key is a dev default here; production must set
 * MANIFEST_SIGNING_KEY (checked in secrets.ts's spirit — the API already
 * refuses to start in production without JWT_SECRET).
 */

export const MANIFEST_SIGNING_KEY = process.env.MANIFEST_SIGNING_KEY || "dev-manifest-signing-key-change-me";

export function signManifest(payload: string): string {
  return crypto.createHmac("sha256", MANIFEST_SIGNING_KEY).update(payload).digest("hex");
}

export function verifyManifest(payload: string, signature: string): boolean {
  const expected = signManifest(payload);
  // Constant-time compare.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
}
