import { useState } from "react";
import { usePlayerStore } from "../store/player";
import { AddToPlaylist } from "./AddToPlaylist";
import { api } from "../api";
import type { ApiTrack } from "../types";

interface Props {
  track: ApiTrack;
  index: number;
  queue: ApiTrack[];
  onMetaChange?: (trackId: string, meta: { aiPrompt?: string | null; aiGenerationNotes?: string | null }) => void;
}

export function TrackRow({ track, index, queue, onMetaChange }: Props) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [showAi, setShowAi] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(track.aiPrompt ?? "");
  const [notes, setNotes] = useState(track.aiGenerationNotes ?? "");
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
      });
      onMetaChange?.(track.id, { aiPrompt: prompt.trim() || null, aiGenerationNotes: notes.trim() || null });
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
