import { useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiArtist, ApiTrack } from "../types";

// Browse facet by generator (John's ideas pass #3): "Made with X" — a
// Spotify-esque browsing dimension that fits the AI-music-only model. The
// API already supports ?aiModel= on /tracks and (now) /artists.
const AI_MODEL_FACETS = ["Suno v4", "Udio", "Suno v3.5"];
// Tracks uploaded without a disclosed model have aiModel="unknown" — they
// used to vanish from search entirely once any facet was active (typing in
// the box kept the facet, and "unknown" wasn't in the facet list). Now the
// box clears the facet, and this chip keeps undisclosed-model tracks
// browsable.
const UNKNOWN_FACET = "unknown";

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

  const typeQuery = (value: string) => {
    // Typing a fresh query searches EVERYTHING — clear any active facet so
    // tracks with an undisclosed/unknown model don't silently vanish (the
    // Error 500 report: q=Error 500 + aiModel=Suno v4 returned 0).
    run(value, null);
  };

  return (
    <div>
      <input
        className="search-input"
        placeholder="What do you want to listen to?"
        value={q}
        onChange={(e) => typeQuery(e.target.value)}
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
        <button
          className={`facet-chip${aiModel === UNKNOWN_FACET ? " active" : ""}`}
          onClick={() => facet(UNKNOWN_FACET)}
        >
          Not disclosed
        </button>
        <span className="facet-label" style={{ marginLeft: "0.5rem" }}>
          <Link to="/made-with/Suno v4" style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>
            Browse all →
          </Link>
        </span>
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
