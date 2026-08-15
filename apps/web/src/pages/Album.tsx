import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiAlbum, ApiTrack } from "../types";

export function Album() {
  const { id } = useParams();
  const [album, setAlbum] = useState<(ApiAlbum & { tracks: ApiTrack[] }) | null>(null);
  const [related, setRelated] = useState<ApiTrack[]>([]);

  useEffect(() => {
    if (id) {
      api.album(id).then((d) => {
        setAlbum(d.album);
        // Seed related tracks from the album's most-played track — the most
        // representative signal this album has.
        const seed = [...(d.album.tracks ?? [])].sort((a, b) => b.playCount - a.playCount)[0];
        if (seed) api.relatedTracks(seed.id).then((r) => setRelated(r.tracks));
      });
    }
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
      {related.length > 0 && (
        <div style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2 className="section-title">Related tracks</h2>
          </div>
          {related.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} queue={related} />
          ))}
        </div>
      )}
    </div>
  );
}
