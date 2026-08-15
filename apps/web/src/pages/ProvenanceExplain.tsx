import { Link } from "react-router-dom";

// How provenance works (John's trust-communication win, slice 73): the
// honest label ladder, explained for listeners. The whole brand rests on
// listeners understanding the claims honestly.
export function ProvenanceExplain() {
  return (
    <div style={{ maxWidth: "72ch" }}>
      <h1 className="page-greeting">How provenance works</h1>
      <p style={{ color: "var(--text-dim)" }}>
        Every track on SpotifAI is labeled by how strongly its origin is evidenced. The label is honest about what it proves — and what it doesn't.
      </p>

      <h2 style={{ marginTop: "1.5rem" }}>The label ladder</h2>
      <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.6rem" }}>
        <div className="recipe-card">
          <div className="recipe-title">
            <span className={`rights-badge provenance`}>✓ signature-confirmed</span>
          </div>
          <div className="recipe-row">
            The track's audio fingerprint was independently validated against a generator-signature corpus (≥50 curated samples, ≥90% leave-one-out cross-validation, pinned + hashed in the repo). It means: "this audio's fingerprint matches a validated signature cluster." It is <em>not</em> absolute proof of generator — the declared model is still the uploader's self-report.
          </div>
        </div>
        <div className="recipe-card">
          <div className="recipe-title">
            <span className={`rights-badge provenance`}>signature-uncertain</span>
          </div>
          <div className="recipe-row">
            The fingerprint matches a signature cluster, but also overlaps another generator's — so we honestly refuse to claim a confident match. The label says "ambiguous," not "matched."
          </div>
        </div>
        <div className="recipe-card">
          <div className="recipe-title">
            <span className={`rights-badge provenance`}>recorded</span>
          </div>
          <div className="recipe-row">
            The audio + metadata fingerprint was recorded immutably at upload (SHA-256, publicly verifiable via the signed manifest). It proves "this exact upload was recorded," not "this is what the generator made."
          </div>
        </div>
        <div className="recipe-card">
          <div className="recipe-title">no label</div>
          <div className="recipe-row">
            No fingerprint was captured (e.g. pre-fingerprint uploads). Honest absence, not a downgrade.
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Verify it yourself</h2>
      <p style={{ color: "var(--text-dim)", marginTop: "0.4rem" }}>
        Every uploader's fingerprints are published in a signed manifest — anyone can verify offline against their own copy of the audio.{" "}
        <Link to="/corpus" className="support-link">
          See the generator-signature corpus →
        </Link>
      </p>
    </div>
  );
}
