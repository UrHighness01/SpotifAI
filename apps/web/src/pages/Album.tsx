import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiAlbum, ApiTrack } from "../types";

declare global {
  interface Window {
    spotifaiDesktop?: {
      isDesktop: boolean;
      nanoDescribe?: (track: unknown) => Promise<{ ok: boolean; blurb?: string; error?: string }>;
    };
  }
}

export function Album() {
  const { id } = useParams();
  const [album, setAlbum] = useState<(ApiAlbum & { tracks: ApiTrack[] }) | null>(null);
  const [related, setRelated] = useState<ApiTrack[]>([]);
  const [blurb, setBlurb] = useState<string | null>(null);
  const [nanoAvailable, setNanoAvailable] = useState(false);

  useEffect(() => {
    if (id) {
      api.album(id).then((d) => {
        setAlbum(d.album);
        // Seed related tracks from the album's most-played track — the most
        // representative signal this album has.
        const seed = [...(d.album.tracks ?? [])].sort((a, b) => b.playCount - a.playCount)[0];
        if (seed) api.relatedTracks(seed.id).then((r) => setRelated(r.tracks));

        // On-device nano track describer (desktop app only). Blurb generation
        // is a hard-rule "blurb, never explainer" — it describes the track,
        // it never explains *why* it was recommended.
        const desktop = window.spotifaiDesktop;
        if (desktop?.nanoDescribe) {
          setNanoAvailable(true);
          const track = d.album.tracks?.[0];
          if (track) {
            desktop
              .nanoDescribe({ title: track.title, aiModel: track.aiModel, genre: track.album?.title })
              .then((res) => {
                if (res.ok && res.blurb) setBlurb(res.blurb);
                else setNanoAvailable(false);
              })
              .catch(() => setNanoAvailable(false));
          }
        }
      });
    }
  }, [id]);

  if (!album) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="section-title">{album.title}</h1>
      <p style={{ color: "var(--text-dim)" }}>{album.artist?.name}</p>
      {nanoAvailable && (
        <p className="track-blurb" style={{ color: "var(--text-dim)", maxWidth: "62ch", fontStyle: "italic" }}>
          {blurb ? blurb : "Generating an on-device description…"}
        </p>
      )}
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
