import { useState } from "react";
import { usePlayerStore } from "../store/player";
import { AddToPlaylist } from "./AddToPlaylist";
import { api } from "../api";
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
                <div>
                  <span className="ai-detail-label">Prompt:</span> {track.aiPrompt}
                </div>
              )}
              {track.aiGenerationNotes && (
                <div>
                  <span className="ai-detail-label">Notes:</span> {track.aiGenerationNotes}
                </div>
              )}
              {/* Rights/consent notice (John's next-ideas #8): an explicit
                  licensing field — quiet differentiator in the AI-music
                  space where training-data provenance is radioactive. */}
              <div>
                <span className="ai-detail-label">Rights:</span>{" "}
                <span className={`rights-badge ${track.rightsNotice}`}>{track.rightsNotice.replace(/-/g, " ")}</span>
              </div>
              {/* Remix/continuation attribution (John's next-ideas #7):
                  metadata-only community-graph link — builds the
                  remix-chain discovery surface. */}
              {track.remixOf && (
                <div>
                  <span className="ai-detail-label">Remix of:</span>{" "}
                  <span style={{ color: "var(--text)" }}>
                    {track.remixOf.title} · {track.remixOf.artist?.name}
                  </span>
                </div>
              )}
              {/* Provenance fingerprint (John's next-ideas #6): recorded
                  immutably at upload — the 'we can prove it' layer. */}
              {track.fingerprintHash && (
                <div>
                  <span className="ai-detail-label">Provenance:</span>{" "}
                  <span className={`rights-badge provenance`} title={`Fingerprint ${track.fingerprintHash} captured at upload`}>
                    ✓ fingerprint {track.fingerprintHash}
                  </span>
                </div>
              )}
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
