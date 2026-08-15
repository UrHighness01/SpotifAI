import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiArtist, ApiTrack } from "../types";

// Browse-all page (user's ask): unlike /made-with/:model (which filters to
// ONE generator and therefore never showed undisclosed tracks), this page
// browses the WHOLE catalog — including aiModel="unknown"/Not disclosed —
// with a live search field and the same "Made with" facets for narrowing.
// Same resilience as Search: failed loads show an error + retry, and it
// refetches on window focus regain.
const AI_MODEL_FACETS = ["Suno v4", "Udio", "Suno v3.5"];
const UNKNOWN_FACET = "unknown";
// "All" = no filter — the default, so undisclosed tracks show up.
const ALL_FACET = "all";

export function Browse() {
  const [q, setQ] = useState("");
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);

  const run = async (value: string, model: string | null) => {
    const seq = ++reqSeq.current;
    setQ(value);
    setAiModel(model);
    setError(null);
    // No aiModel param = browse ALL (including unknown). A model of
    // UNKNOWN_FACET ("unknown") filters to Not-disclosed tracks only.
    const modelParam = model === ALL_FACET || model === null ? undefined : model;
    try {
      const [a, t] = await Promise.all([
        api.artists(value.trim() || undefined, modelParam),
        api.tracks({ q: value.trim() || undefined, aiModel: modelParam }),
      ]);
      if (seq !== reqSeq.current) return; // stale response
      setArtists(a.artists);
      setTracks(t.tracks);
      setSearched(true);
    } catch (err) {
      if (seq !== reqSeq.current) return;
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : "browse failed";
      setError(status === 429 ? "Too many requests — try again in a moment" : `Browse failed (${msg}) — retrying…`);
      if (status === undefined || status >= 500) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => run(value, model), 2000);
      }
    }
  };

  useEffect(() => {
    run("", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry/refresh on window focus regain.
  useEffect(() => {
    const onRefocus = () => {
      if (document.visibilityState === "visible" && searched) run(q, aiModel);
    };
    window.addEventListener("focus", onRefocus);
    document.addEventListener("visibilitychange", onRefocus);
    return () => {
      window.removeEventListener("focus", onRefocus);
      document.removeEventListener("visibilitychange", onRefocus);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, q, aiModel]);

  const facet = (model: string) => {
    const next = aiModel === model ? ALL_FACET : model;
    run(q, next);
  };

  const typeQuery = (value: string) => {
    // Typing searches across everything — clear any facet so Not-disclosed
    // tracks are never hidden.
    run(value, null);
  };

  return (
    <div>
      <h1 className="page-greeting">Browse all</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>
        Every track on SpotifAI — including ones without a disclosed model.
      </p>

      <input
        className="search-input"
        placeholder="Search the catalog…"
        value={q}
        onChange={(e) => typeQuery(e.target.value)}
        autoFocus
      />

      <div className="facet-row" style={{ marginTop: "0.75rem" }}>
        <span className="facet-label">Made with</span>
        <button
          className={`facet-chip${aiModel === null || aiModel === ALL_FACET ? " active" : ""}`}
          onClick={() => facet(ALL_FACET)}
        >
          All
        </button>
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
      </div>

      {error && <div className="auth-error" style={{ marginTop: "0.75rem" }}>{error}</div>}

      {searched && (
        <>
          <h1 className="section-title" style={{ marginTop: "1.5rem" }}>
            Artists {aiModel && aiModel !== ALL_FACET ? `· ${aiModel === UNKNOWN_FACET ? "Not disclosed" : aiModel}` : ""}
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
                <div className="card-sub">{artist.aiModel === "unknown" ? "Not disclosed" : artist.aiModel}</div>
              </Link>
            ))}
            {artists.length === 0 && <div className="card-sub">No artists found.</div>}
          </div>

          <h1 className="section-title" style={{ marginTop: "1.5rem" }}>
            Tracks {aiModel && aiModel !== ALL_FACET ? `· ${aiModel === UNKNOWN_FACET ? "Not disclosed" : aiModel}` : ""}
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
