import { useState } from "react";
import { usePlayerStore } from "../store/player";
import { AddToPlaylist } from "./AddToPlaylist";
import type { ApiTrack } from "../types";

interface Props {
  track: ApiTrack;
  index: number;
  queue: ApiTrack[];
}

export function TrackRow({ track, index, queue }: Props) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [showAi, setShowAi] = useState(false);

  // Honest AI disclosure (John's ideas pass #2): the platform's whole brand
  // is "AI-made, honestly disclosed." aiModel/aiPrompt/aiGenerationNotes are
  // stored but weren't surfaced anywhere — now a collapsible detail row makes
  // the generation parameters visible on every track row.
  const hasAiDetails = Boolean(track.aiPrompt || track.aiGenerationNotes);

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
      {showAi && hasAiDetails && (
        <div className="ai-detail-panel" onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}
    </>
  );
}
