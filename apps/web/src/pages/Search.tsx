import { useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiArtist, ApiTrack } from "../types";

export function Search() {
  const [q, setQ] = useState("");
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [searched, setSearched] = useState(false);

  const run = async (value: string) => {
    setQ(value);
    if (!value.trim()) {
      setArtists([]);
      setTracks([]);
      setSearched(false);
      return;
    }
    const [a, t] = await Promise.all([api.artists(value), api.tracks({ q: value })]);
    setArtists(a.artists);
    setTracks(t.tracks);
    setSearched(true);
  };

  return (
    <div>
      <input
        className="search-input"
        placeholder="What do you want to listen to?"
        value={q}
        onChange={(e) => run(e.target.value)}
        autoFocus
      />

      {searched && (
        <>
          <h1 className="section-title" style={{ marginTop: "1.5rem" }}>
            Artists
          </h1>
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
            {artists.length === 0 && <div className="card-sub">No artists found.</div>}
          </div>

          <h1 className="section-title" style={{ marginTop: "1.5rem" }}>
            Tracks
          </h1>
          <div>
            {tracks.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={tracks} />
            ))}
            {tracks.length === 0 && <div className="card-sub">No tracks found.</div>}
          </div>
        </>
      )}
    </div>
  );
}
