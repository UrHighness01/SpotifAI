import { usePlayerStore } from "../store/player";
import type { ApiTrack } from "../types";

interface Props {
  track: ApiTrack;
  index: number;
  queue: ApiTrack[];
}

export function TrackRow({ track, index, queue }: Props) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  return (
    <div className="track-row" onClick={() => playTrack(track, queue)}>
      <span className="idx">{index + 1}</span>
      <div>
        <div className="title">{track.title}</div>
        <div className="artist">{track.artist?.name || "Unknown artist"}</div>
      </div>
      <span className="artist">{track.aiModel}</span>
    </div>
  );
}
