import { useEffect, useState } from "react";
import { api } from "../api";

// Corpus transparency (John's endorsed page): public, non-ranking, honest —
// per-generator curated/declared counts + 'X to threshold'. Makes the
// signature-collection socially legible and motivates seed-collection. The
// label stays 'recorded' until a generator's CURATED count hits the
// threshold AND cross-validation passes (trust-floor runbook).
interface GenStatus {
  generator: string;
  curated: number;
  declared: number;
  total: number;
  toThreshold: number;
  ready: boolean;
}

export function CorpusStatus() {
  const [data, setData] = useState<{ threshold: number; generators: GenStatus[]; capstoneReady: boolean } | null>(null);

  useEffect(() => {
    api.corpusStatus().then(setData).catch(() => {});
  }, []);

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-greeting">Generator signature corpus</h1>
      <p style={{ color: "var(--text-dim)", maxWidth: "62ch" }}>
        The honest escalation ladder's evidence: independently-curated audio samples per generator, toward the runbook threshold ({data.threshold} curated samples/generator + cross-validation) before any
        <code> signature-matched</code> label can ship. The label stays <code>recorded</code> until the evidence earns the claim.
      </p>

      <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.6rem" }}>
        {data.generators.map((g) => (
          <div key={g.generator} className="recipe-card">
            <div className="recipe-title">
              {g.generator} {g.ready && <span className={`rights-badge provenance`}>corpus-ready ✓</span>}
            </div>
            <div className="recipe-row">
              <span className="ai-detail-label">Curated</span> {g.curated} {g.ready ? "" : `· ${g.toThreshold} to threshold`}
            </div>
            <div className="recipe-row">
              <span className="ai-detail-label">Declared</span> {g.declared} (self-reported, supporting evidence)
            </div>
            <div className="recipe-row">
              <span className="ai-detail-label">Total</span> {g.total}
            </div>
          </div>
        ))}
        {data.generators.length === 0 && <div className="card-sub">Corpus is empty — collection is the work.</div>}
      </div>

      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "1.5rem" }}>
        Capstone (provenance-gated ranking) status:{" "}
        <strong>{data.capstoneReady ? "corpus-density reached — cross-validation still required" : "waiting on corpus density"}</strong>.
      </p>
    </div>
  );
}
