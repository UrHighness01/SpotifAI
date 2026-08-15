import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { usePlayerStore } from "../store/player";
import type { ApiPlaylistDetail } from "../types";

export function PlaylistDetail() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<ApiPlaylistDetail | null>(null);
  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user && id) api.playlist(id).then((d) => setPlaylist(d.playlist));
  }, [user, id]);

  if (!user || !id) return null;
  if (!playlist) return <div className="card-sub">Loading…</div>;

  const tracks = playlist.tracks.map((t) => t.track);

  const onRemove = async (trackId: string) => {
    await api.removeFromPlaylist(playlist.id, trackId);
    setPlaylist((prev) =>
      prev ? { ...prev, tracks: prev.tracks.filter((t) => t.trackId !== trackId) } : prev
    );
  };

  return (
    <div>
      <h1 className="section-title">{playlist.name}</h1>
      <div>
        {playlist.tracks.map((pt, i) => (
          <div key={pt.trackId} className="track-row" onClick={() => playTrack(pt.track, tracks)}>
            <span className="idx">{i + 1}</span>
            <div>
              <div className="title">{pt.track.title}</div>
              <div className="artist">{pt.track.artist?.name || "Unknown artist"}</div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(pt.trackId);
              }}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
            >
              Remove
            </button>
          </div>
        ))}
        {playlist.tracks.length === 0 && (
          <div className="card-sub">No tracks yet — add some from Home, Search, or Liked Songs.</div>
        )}
      </div>
    </div>
  );
}
