import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiArtist, ApiTrack } from "../types";

// "Made with" community grid (John's next-ideas #2): a shareable,
// browseable page per generator/model — discover by creation method, which
// no label-centric service can offer. Owns the niche.
export function MadeWith() {
  const { model } = useParams();
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!model) return;
    setLoading(true);
    Promise.all([api.artists(undefined, model), api.tracks({ aiModel: model })])
      .then(([a, t]) => {
        setArtists(a.artists);
        setTracks(t.tracks);
      })
      .finally(() => setLoading(false));
  }, [model]);

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-greeting">Everything made with {model}</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: "1.5rem" }}>
        {artists.length} uploader-artist{artists.length === 1 ? "" : "s"} · {tracks.length} track{tracks.length === 1 ? "" : "s"} — discover by creation method.
      </p>

      {artists.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Artists</h2>
          </div>
          <div className="card-grid">
            {artists.map((artist) => (
              <Link key={artist.id} className="card" to={`/artist/${artist.id}`}>
                {artist.avatarPath ? (
                  <img className="card-art artist-art" src={mediaUrl(artist.avatarPath)!} alt={artist.name} />
                ) : (
                  <div className="card-art artist-art">🤖</div>
                )}
                <div className="card-title">{artist.name}</div>
                <div className="card-sub">{artist.aiModel}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      {tracks.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: "1.5rem" }}>
            <h2 className="section-title">Tracks</h2>
          </div>
          <div>
            {tracks.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={tracks} />
            ))}
          </div>
        </>
      )}

      {artists.length === 0 && tracks.length === 0 && (
        <div className="card-sub">Nothing made with {model} yet — upload a track to be first.</div>
      )}
    </div>
  );
}
