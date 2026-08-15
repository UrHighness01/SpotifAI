if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-me")
) {
  throw new Error("JWT_SECRET must be set to a non-default value in production");
}

export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Fail-closed on the provenance signing keys (John's consolidation #3): the
// whole provenance trust model collapses if the dev keys ship in production
// (everyone with the repo could then forge a valid manifest). Same spirit as
// the JWT_SECRET guard above — refuse to start.
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.MANIFEST_PRIVATE_KEY || !process.env.MANIFEST_PUBLIC_KEY)
) {
  throw new Error("MANIFEST_PRIVATE_KEY and MANIFEST_PUBLIC_KEY must be set in production (Ed25519 keypair for provenance manifests)");
}
