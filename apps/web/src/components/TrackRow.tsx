import { useEffect, useState } from "react";
import { usePlayerStore } from "../store/player";
import { AddToPlaylist } from "./AddToPlaylist";
import { api } from "../api";
import { clampText } from "../utils/text";
import type { ApiTrack } from "../types";

interface Props {
  track: ApiTrack;
  index: number;
  queue: ApiTrack[];
  onMetaChange?: (trackId: string, meta: { aiPrompt?: string | null; aiGenerationNotes?: string | null; rightsNotice?: string }) => void;
}

export function TrackRow({ track, index, queue, onMetaChange }: Props) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [showAi, setShowAi] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(track.aiPrompt ?? "");
  const [notes, setNotes] = useState(track.aiGenerationNotes ?? "");
  const [rights, setRights] = useState(track.rightsNotice ?? "all-rights-reserved");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Honest AI disclosure (John's ideas pass #2): the platform's whole brand
  // is "AI-made, honestly disclosed." aiModel/aiPrompt/aiGenerationNotes are
  // stored but weren't surfaced anywhere — now a collapsible detail row makes
  // the generation parameters visible on every track row.
  const hasAiDetails = Boolean(track.aiPrompt || track.aiGenerationNotes);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateTrackMeta(track.id, {
        aiPrompt: prompt.trim() || null,
        aiGenerationNotes: notes.trim() || null,
        rightsNotice: rights,
      });
      onMetaChange?.(track.id, { aiPrompt: prompt.trim() || null, aiGenerationNotes: notes.trim() || null, rightsNotice: rights });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="track-row" onClick={() => playTrack(track, queue)}>
        <span className="idx">{index + 1}</span>
        <div>
          <div className="title">{track.title}</div>
          <div className="artist">{track.artist?.name || "Unknown artist"}</div>
        </div>
        <span className="artist">{track.aiModel}</span>
        {hasAiDetails && (
          <button
            className="ai-detail-toggle"
            aria-label="AI generation details"
            title="AI generation details"
            onClick={(e) => {
              e.stopPropagation();
              setShowAi((s) => !s);
            }}
          >
            ⓘ
          </button>
        )}
        <AddToPlaylist trackId={track.id} />
      </div>
      {showAi && (
        <div className="ai-detail-panel" onClick={(e) => e.stopPropagation()}>
          {!editing ? (
            <>
              {track.aiPrompt && (
                <div title={track.aiPrompt}>
                  <span className="ai-detail-label">Prompt:</span> {clampText(track.aiPrompt)}
                </div>
              )}
              {track.aiGenerationNotes && (
                <div title={track.aiGenerationNotes}>
                  <span className="ai-detail-label">Notes:</span> {clampText(track.aiGenerationNotes, 300)}
                </div>
              )}
              {/* Rights/consent notice (John's next-ideas #8): an explicit
                  licensing field — quiet differentiator in the AI-music
                  space where training-data provenance is radioactive. */}
              <div>
                <span className="ai-detail-label">Rights:</span>{" "}
                <span className={`rights-badge ${track.rightsNotice}`}>{track.rightsNotice.replace(/-/g, " ")}</span>
                {/* License + price (Tier A #3): each track is a sellable
                    asset without a storefront — buyers deal with the
                    uploader directly, platform stays custody-free. */}
                {track.licensePriceUsd !== null && track.licensePriceUsd !== undefined && (
                  <span className="license-price">
                    {" "}· ${track.licensePriceUsd.toFixed(2)}
                  </span>
                )}
              </div>
              {track.licenseTerms && (
                <div title={track.licenseTerms}>
                  <span className="ai-detail-label">License terms:</span> {clampText(track.licenseTerms, 200)}
                </div>
              )}
              {/* Remix/continuation attribution (John's next-ideas #7 +
                  Tier E #3): metadata-only community-graph link — with
                  certified lineage: the remix source's provenance (when
                  recorded) inherits, so a fan can trace 'this came from
                  that, which came from that' pinned to fingerprints. */}
              {track.remixOf && (
                <div>
                  <span className="ai-detail-label">Remix of:</span>{" "}
                  <span style={{ color: "var(--text)" }}>
                    {track.remixOf.title} · {track.remixOf.artist?.name}
                    {track.remixOf.fingerprintHash && (
                      <span className={`rights-badge provenance`} style={{ marginLeft: "0.4rem" }}>
                        ✓ provenance recorded
                      </span>
                    )}
                    {track.remixOf._count?.attestations ? (
                      <span className={`rights-badge provenance`} style={{ marginLeft: "0.4rem" }}>
                        {track.remixOf._count.attestations} verified attest{track.remixOf._count.attestations === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
              {/* Provenance fingerprint (John's next-ideas #6 + Tier 3):
                  recorded immutably at upload — the 'we can prove it'
                  layer. The label is honest: 'recorded' means the
                  fingerprint was captured; signature matching (when the
                  corpus exists) upgrades it to matched/uncertain — never a
                  binary 'verified'. */}
              {track.fingerprintHash && (
                <div>
                  <span className="ai-detail-label">Provenance:</span>{" "}
                  <span
                    className={`rights-badge provenance ${track.provenanceStatus || "recorded"}`}
                    title={`Fingerprint ${track.fingerprintHash} captured at upload · status: ${track.provenanceStatus || "recorded"}`}
                  >
                    ✓ {track.provenanceStatus || "recorded"} · {track.fingerprintHash}
                  </span>
                </div>
              )}
              {/* Support the artist (Tier A #2): one click from the
                  disclosure panel deep-links to the uploader's payout —
                  direct patronage, no platform fee. */}
              {track.artist?.payoutHandle && track.artist?.payoutKind && (
                <div>
                  <a
                    href={track.artist.payoutHandle}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="support-link"
                    style={{ fontSize: "0.8rem" }}
                  >
                    Support {track.artist.name} via {track.artist.payoutKind} →
                  </a>
                </div>
              )}
              {/* Community attestation ring (Tier H #3): anyone with the
                  audio can independently verify it against the recorded
                  fingerprint. The platform records; the community adds
                  credibility. */}
              <AttestSection track={track} />
              {/* Generation-notes annex (John idea #8): owner edits the
                  disclosure metadata in place. */}
              <button className="ai-edit-btn" onClick={() => setEditing(true)}>
                Edit AI disclosure
              </button>
            </>
          ) : (
            <div className="ai-edit-form">
              <label className="ai-detail-label">Prompt</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} maxLength={32 * 1024} />
              <label className="ai-detail-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={32 * 1024} />
              <label className="ai-detail-label">Rights</label>
              <select value={rights} onChange={(e) => setRights(e.target.value)} className="ai-rights-select">
                <option value="all-rights-reserved">All rights reserved</option>
                <option value="cc-by">CC BY</option>
                <option value="cc-by-sa">CC BY-SA</option>
                <option value="cc-by-nc">CC BY-NC</option>
                <option value="public-domain">Public domain</option>
              </select>
              {saveError && <div style={{ color: "var(--flag, #a13a2e)", fontSize: "0.8rem" }}>{saveError}</div>}
              <div className="ai-edit-actions">
                <button className="ai-edit-btn" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="ai-edit-btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Community attestation ring (Tier H #3): show the attestation count and
// let any logged-in user who independently verified the audio record it.
interface Attestation {
  id: string;
  trackId: string;
  byteHash: string;
  handle: string;
  createdAt: string;
}

function AttestSection({ track }: { track: ApiTrack }) {
  const [attestations, setAttestations] = useState<Attestation[] | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (track.fingerprintHash) {
      api.trackAttestations(track.id).then((d) => setAttestations(d.attestations)).catch(() => {});
    }
  }, [track.id, track.fingerprintHash]);

  if (!track.fingerprintHash) return null;

  const attest = async () => {
    if (!track.fingerprintHash || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.attestTrack(track.id, track.fingerprintHash, handle.trim() || "anonymous-listener");
      setDone(true);
      setAttestations((prev) => [{ id: "me", trackId: track.id, byteHash: track.fingerprintHash!, handle: handle.trim() || "anonymous-listener", createdAt: new Date().toISOString() }, ...(prev ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "attest failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: "0.3rem" }}>
      <div className="ai-detail-label">
        Attested by {attestations ? attestations.length : "…"} verified listener{attestations && attestations.length === 1 ? "" : "s"}
        <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.75 }}>
          {" "}(email-verified accounts only — anti-sybil floor)
        </span>
      </div>
      {!done && (
        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="your handle (optional)"
            maxLength={60}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              padding: "0.3rem 0.5rem",
              fontSize: "0.8rem",
              maxWidth: 180,
            }}
          />
          <button className="ai-edit-btn" onClick={attest} disabled={busy} title="I have this audio file and its hash matches the recorded fingerprint">
            {busy ? "Verifying…" : "I verified this file ✓"}
          </button>
        </div>
      )}
      {done && <div style={{ fontSize: "0.8rem", color: "var(--accent)" }}>✓ Attested — thanks for helping verify provenance.</div>}
      {error && <div style={{ fontSize: "0.78rem", color: "var(--flag, #a13a2e)" }}>{error}</div>}
    </div>
  );
}
