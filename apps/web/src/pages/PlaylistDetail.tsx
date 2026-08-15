import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { TrackRow } from "../components/TrackRow";
import type { ApiPlaylistDetail } from "../types";

export function PlaylistDetail() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<ApiPlaylistDetail | null>(null);

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
        {/* TrackRow renders the cover thumbnail on the left of the title
            (user's ask) + the like heart, and supports playlist removal via
            onRemove. */}
        {playlist.tracks.map((pt, i) => (
          <TrackRow key={pt.trackId} track={pt.track} index={i} queue={tracks} onRemove={onRemove} />
        ))}
        {playlist.tracks.length === 0 && (
          <div className="card-sub">No tracks yet — add some from Home, Search, or Liked Songs.</div>
        )}
      </div>
    </div>
  );
}
