import { useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiArtist, ApiTrack } from "../types";

// Browse facet by generator (John's ideas pass #3): "Made with X" — a
// Spotify-esque browsing dimension that fits the AI-music-only model. The
// API already supports ?aiModel= on /tracks and (now) /artists.
const AI_MODEL_FACETS = ["Suno v4", "Udio", "Suno v3.5"];

export function Search() {
  const [q, setQ] = useState("");
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [searched, setSearched] = useState(false);

  const run = async (value: string, model: string | null) => {
    setQ(value);
    setAiModel(model);
    const [a, t] = await Promise.all([
      api.artists(value.trim() || undefined, model || undefined),
      api.tracks({ q: value.trim() || undefined, aiModel: model || undefined }),
    ]);
    setArtists(a.artists);
    setTracks(t.tracks);
    setSearched(true);
  };

  const facet = (model: string) => {
    const next = aiModel === model ? null : model;
    run(q, next);
  };

  return (
    <div>
      <input
        className="search-input"
        placeholder="What do you want to listen to?"
        value={q}
        onChange={(e) => run(e.target.value, aiModel)}
        autoFocus
      />

      <div className="facet-row" style={{ marginTop: "0.75rem" }}>
        <span className="facet-label">Made with</span>
        {AI_MODEL_FACETS.map((model) => (
          <button
            key={model}
            className={`facet-chip${aiModel === model ? " active" : ""}`}
            onClick={() => facet(model)}
          >
            {model}
          </button>
        ))}
      </div>

      {searched && (
        <>
          <h1 className="section-title" style={{ marginTop: "1.5rem" }}>
            Artists {aiModel ? `· ${aiModel}` : ""}
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
            Tracks {aiModel ? `· ${aiModel}` : ""}
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
