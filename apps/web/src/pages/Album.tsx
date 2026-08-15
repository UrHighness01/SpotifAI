import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiAlbum, ApiTrack } from "../types";

export function Album() {
  const { id } = useParams();
  const [album, setAlbum] = useState<(ApiAlbum & { tracks: ApiTrack[] }) | null>(null);

  useEffect(() => {
    if (id) api.album(id).then((d) => setAlbum(d.album));
  }, [id]);

  if (!album) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="section-title">{album.title}</h1>
      <p style={{ color: "var(--text-dim)" }}>{album.artist?.name}</p>
      <div style={{ marginTop: "1.5rem" }}>
        {album.tracks.map((track, i) => (
          <TrackRow key={track.id} track={{ ...track, artist: album.artist }} index={i} queue={album.tracks.map((t) => ({ ...t, artist: album.artist }))} />
        ))}
      </div>
    </div>
  );
}
