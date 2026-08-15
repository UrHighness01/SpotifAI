import { usePlayerStore } from "../store/player";
import { api, mediaUrl } from "../api";
import { LikeButton } from "./LikeButton";
import type { ApiTrack } from "../types";

// Reusable track card: cover art + hover play button + heart (like) button
// on the cover. Used by Home, Search, MadeWith, etc. so the like feature is
// consistent everywhere tracks appear as cards.
export function TrackCard({ track, queue }: { track: ApiTrack; queue?: ApiTrack[] }) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const list = queue ?? [track];
  return (
    <div className="card" onClick={() => playTrack(track, list)}>
      <div className="card-art-wrap">
        {track.album?.coverPath ? (
          <img className="card-art" src={mediaUrl(track.album.coverPath)!} alt={track.title} />
        ) : (
          <div className="card-art" />
        )}
        <LikeButton trackId={track.id} className="like-btn-on-card" />
        {/* Clicking the play button bubbles to the card onClick (plays). */}
        <button className="card-play-btn" aria-label={`Play ${track.title}`} />
      </div>
      <div className="card-title">{track.title}</div>
      <div className="card-sub">{track.artist?.name}</div>
    </div>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="#000" aria-hidden="true">
    <path d="M7 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);
