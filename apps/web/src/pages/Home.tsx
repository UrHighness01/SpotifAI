import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import type { ApiArtist, ApiTrack } from "../types";
import { usePlayerStore } from "../store/player";
import { TrackRow } from "../components/TrackRow";
import { clampText } from "../utils/text";

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="#000" aria-hidden="true">
    <path d="M7 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [trending, setTrending] = useState<ApiTrack[]>([]);
  const [recommended, setRecommended] = useState<ApiTrack[]>([]);
  const [followFeed, setFollowFeed] = useState<ApiTrack[]>([]);
  const [verifiable, setVerifiable] = useState<ApiTrack[]>([]);
  const [signatureMatched, setSignatureMatched] = useState<ApiTrack[]>([]);
  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    api.artists().then((d) => setArtists(d.artists));
    api.tracks().then((d) => setTracks(d.tracks));
    api.tracks({ sort: "trending" }).then((d) => setTrending(d.tracks.slice(0, 10)));
    // Real co-occurrence recommendations (logged-in: taste-based; logged-out:
    // trending fallback). Replaces the old seeded-shuffle stopgap.
    api.recommendedTracks().then((d) => setRecommended(d.tracks));
    // New-drop feed from followed uploaders (John's Tier 2 #5) — 401 for
    // anonymous, handled silently.
    api.followFeed().then((d) => setFollowFeed(d.tracks)).catch(() => {});
    // Provenance-gated discovery (John's post-consolidation #6): tracks with
    // a RECORDED fingerprint — un-gameable (a track either has one or not),
    // honestly scoped as 'recorded', not independently corroborated.
    api.tracks({ fingerprinted: true }).then((d) => setVerifiable(d.tracks));
    // Signature-confirmed tier (slice 71 — the capstone payoff): tracks whose
    // provenance is independently validated against the generator-signature
    // corpus — the honest ladder's highest rung.
    api.tracks({ signatureMatched: true }).then((d) => setSignatureMatched(d.tracks));
  }, []);

  return (
    <div>
      <h1 className="page-greeting">{greeting()}</h1>

      <div className="section-head">
        <h2 className="section-title">AI Artists</h2>
      </div>
      <div className="card-grid">
        {artists.map((artist) => (
          <Link key={artist.id} className="card" to={`/artist/${artist.id}`}>
            <div className="card-art-wrap">
              {artist.avatarPath ? (
                <img className="card-art artist-art" src={mediaUrl(artist.avatarPath)!} alt={artist.name} />
              ) : (
                <div className="card-art artist-art">🤖</div>
              )}
            </div>
            <div className="card-title">{artist.name}</div>
            <div className="card-sub">{artist.aiModel}</div>
          </Link>
        ))}
        {artists.length === 0 && <div className="card-sub">No artists yet — upload a track to create one.</div>}
      </div>

      {trending.some((t) => t.playCount > 0) && (
        <>
          <div className="section-head">
            <h2 className="section-title">Trending</h2>
          </div>
          <div className="card-grid">
            {trending
              .filter((t) => t.playCount > 0)
              .map((track) => (
                <div key={track.id} className="card" onClick={() => playTrack(track, trending)}>
                  <div className="card-art-wrap">
                    {track.album?.coverPath ? (
                      <img className="card-art" src={mediaUrl(track.album.coverPath)!} alt={track.title} />
                    ) : (
                      <div className="card-art" />
                    )}
                    <button className="card-play-btn" aria-label={`Play ${track.title}`}>
                      <PlayIcon />
                    </button>
                  </div>
                  <div className="card-title">{track.title}</div>
                  <div className="card-sub">{track.artist?.name}</div>
                </div>
              ))}
          </div>
        </>
      )}

      {recommended.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Made For You</h2>
          </div>
          <div className="card-grid">
            {recommended.map((track) => (
              <div key={track.id} className="card" onClick={() => playTrack(track, recommended)}>
                <div className="card-art-wrap">
                  {track.album?.coverPath ? (
                    <img className="card-art" src={mediaUrl(track.album.coverPath)!} alt={track.title} />
                  ) : (
                    <div className="card-art" />
                  )}
                  <button className="card-play-btn" aria-label={`Play ${track.title}`}>
                    <PlayIcon />
                  </button>
                </div>
                <div className="card-title">{track.title}</div>
                <div className="card-sub">{track.artist?.name}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* New drops from followed uploaders (John's Tier 2 #5) — with the
          drop + its recipe paired visibly (Tier B #5): 'here's my prompt,
          here's what it made', closing the loop between follows and the
          recipe library. */}
      {followFeed.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">New from artists you follow</h2>
          </div>
          <div>
            {followFeed.map((track, i) => (
              <div key={track.id}>
                <TrackRow track={track} index={i} queue={followFeed} />
                {track.aiPrompt && (
                  <div className="recipe-card" style={{ marginBottom: "0.5rem", marginLeft: "3rem" }}>
                    <div className="recipe-row">
                      <span className="ai-detail-label">Made from</span> “{clampText(track.aiPrompt, 120)}”
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Signature-confirmed tier (slice 71 — the capstone payoff): tracks
          whose provenance is independently validated against the
          generator-signature corpus — the honest ladder's highest rung,
          above 'recorded'. */}
      {signatureMatched.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Signature-confirmed</h2>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
            Tracks whose audio fingerprint was independently validated against the generator-signature corpus — not just recorded, confirmed.
          </p>
          <div className="card-grid">
            {signatureMatched.map((track) => (
              <div key={track.id} className="card" onClick={() => playTrack(track, signatureMatched)}>
                <div className="card-art-wrap">
                  {track.album?.coverPath ? (
                    <img className="card-art" src={mediaUrl(track.album.coverPath)!} alt={track.title} />
                  ) : (
                    <div className="card-art" />
                  )}
                  <button className="card-play-btn" aria-label={`Play ${track.title}`}>
                    <PlayIcon />
                  </button>
                </div>
                <div className="card-title">{track.title}</div>
                <div className="card-sub">{track.artist?.name}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Provenance-gated discovery (John's post-consolidation #6): tracks
          with a recorded fingerprint — 'verifiably honest' in scope: the
          origin is recorded (un-gameable signal), not yet independently
          corroborated (that waits for anti-sybil attestation). */}
      {verifiable.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Verifiably honest</h2>
          </div>
          <div className="card-grid">
            {verifiable.map((track) => (
              <div key={track.id} className="card" onClick={() => playTrack(track, verifiable)}>
                <div className="card-art-wrap">
                  {track.album?.coverPath ? (
                    <img className="card-art" src={mediaUrl(track.album.coverPath)!} alt={track.title} />
                  ) : (
                    <div className="card-art" />
                  )}
                  <button className="card-play-btn" aria-label={`Play ${track.title}`}>
                    <PlayIcon />
                  </button>
                </div>
                <div className="card-title">{track.title}</div>
                <div className="card-sub">{track.artist?.name}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Recent tracks</h2>
      </div>
      <div className="card-grid">
        {tracks.map((track) => (
          <div key={track.id} className="card" onClick={() => playTrack(track, tracks)}>
            <div className="card-art-wrap">
              {track.album?.coverPath ? (
                <img className="card-art" src={mediaUrl(track.album.coverPath)!} alt={track.title} />
              ) : (
                <div className="card-art" />
              )}
              <button className="card-play-btn" aria-label={`Play ${track.title}`}>
                <PlayIcon />
              </button>
            </div>
            <div className="card-title">{track.title}</div>
            <div className="card-sub">{track.artist?.name}</div>
          </div>
        ))}
        {tracks.length === 0 && <div className="card-sub">No tracks yet.</div>}
      </div>
    </div>
  );
}
