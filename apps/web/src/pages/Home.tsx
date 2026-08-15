import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import type { ApiArtist, ApiTrack } from "../types";
import { usePlayerStore } from "../store/player";
import { useAuth } from "../auth";
import { TrackRow } from "../components/TrackRow";
import { TrackCard } from "../components/TrackCard";
import { clampText } from "../utils/text";

// Greeting follows the USER's system time (new Date() is the browser's local
// clock — never the server's). Kept live via a timer in Home so an app left
// open all day flips from Good morning → afternoon → evening on its own.
function greeting(h: number) {
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  // Live clock state: refreshes every 30s so the greeting tracks the user's
  // local time even without any re-render from data changes.
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { user } = useAuth();
  const [myArtists, setMyArtists] = useState<ApiArtist[]>([]);
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [trending, setTrending] = useState<ApiTrack[]>([]);
  const [recommended, setRecommended] = useState<ApiTrack[]>([]);
  const [followFeed, setFollowFeed] = useState<ApiTrack[]>([]);
  const [verifiable, setVerifiable] = useState<ApiTrack[]>([]);
  const [signatureMatched, setSignatureMatched] = useState<ApiTrack[]>([]);
  const playTrack = usePlayerStore((s) => s.playTrack);

  // Home fetches everything on mount. A SINGLE failed fetch used to leave
  // sections permanently empty — the desktop window can open before the API
  // is listening (dev:desktop waits on vite, not the API), so api.artists()
  // failed once, artists stayed [], and Home said "No artists yet" forever
  // even though artists existed (user-reported). Now: every fetch is
  // caught, network/server failures schedule a bounded retry (4xx like 429
  // or 401 never retry — the API is up, the request just can't succeed),
  // and regaining window focus refetches everything.
  useEffect(() => {
    let alive = true;
    let retryCount = 0;
    let retryTimer: number | undefined;
    const MAX_RETRIES = 5;

    // Retry only when the API may genuinely be down (network error, 5xx).
    // 4xx (429 rate limit, 401 not logged in) won't fix themselves by
    // retrying — spinning every 2s just hammers the server for nothing.
    const shouldRetry = (err: unknown) => {
      const status = (err as { status?: number })?.status;
      return status === undefined || status >= 500;
    };

    const load = () => {
      if (!alive) return;
      if (user) {
        api.myArtists().then((d) => alive && setMyArtists(d.artists)).catch(() => {});
      }
      api.artists().then((d) => alive && setArtists(d.artists)).catch((e) => shouldRetry(e) && scheduleRetry());
      api.tracks().then((d) => alive && setTracks(d.tracks)).catch((e) => shouldRetry(e) && scheduleRetry());
      api.tracks({ sort: "trending" }).then((d) => alive && setTrending(d.tracks.slice(0, 10))).catch((e) => shouldRetry(e) && scheduleRetry());
      // Real co-occurrence recommendations (logged-in: taste-based;
      // logged-out: trending fallback). Replaces the old shuffle stopgap.
      api.recommendedTracks().then((d) => alive && setRecommended(d.tracks)).catch((e) => shouldRetry(e) && scheduleRetry());
      // New-drop feed from followed uploaders (John's Tier 2 #5) — 401 for
      // anonymous, handled silently.
      api.followFeed().then((d) => alive && setFollowFeed(d.tracks)).catch(() => {});
      // Provenance-gated discovery (John's post-consolidation #6): tracks
      // with a RECORDED fingerprint — un-gameable (a track either has one
      // or not), honestly scoped as 'recorded', not independently
      // corroborated.
      api.tracks({ fingerprinted: true }).then((d) => alive && setVerifiable(d.tracks)).catch((e) => shouldRetry(e) && scheduleRetry());
      // Signature-confirmed tier (slice 71 — the capstone payoff): tracks
      // whose provenance is independently validated against the
      // generator-signature corpus — the honest ladder's highest rung.
      api.tracks({ signatureMatched: true }).then((d) => alive && setSignatureMatched(d.tracks)).catch((e) => shouldRetry(e) && scheduleRetry());
    };

    // Bounded retry for the API-still-booting case — one timer at a time.
    const scheduleRetry = () => {
      if (!alive || retryTimer || retryCount >= MAX_RETRIES) return;
      retryCount++;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        load();
      }, 2000);
    };

    // Refetch when the window/tab regains focus — the API may have come up
    // in the meantime (or tsx restarted mid-session).
    const onRefocus = () => {
      if (document.visibilityState === "visible") load();
    };

    load();
    window.addEventListener("focus", onRefocus);
    document.addEventListener("visibilitychange", onRefocus);
    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("focus", onRefocus);
      document.removeEventListener("visibilitychange", onRefocus);
    };
  }, [user]);

  return (
    <div>
      <h1 className="page-greeting">{greeting(hour)}</h1>

      {/* Your artists (user's ask): the profiles I created, front and
          center so I can reach my own uploads instantly. Hidden for
          anonymous visitors; the general AI Artists grid follows. */}
      {user && myArtists.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Your artists</h2>
          </div>
          <div className="card-grid">
            {myArtists.map((artist) => (
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
          </div>
        </>
      )}

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
                <TrackCard key={track.id} track={track} queue={trending} />
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
              <TrackCard key={track.id} track={track} queue={recommended} />
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
                  <div className="recipe-card" style={{ marginBottom: "0.5rem", marginLeft: "6.2rem" }}>
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
              <TrackCard key={track.id} track={track} queue={signatureMatched} />
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
              <TrackCard key={track.id} track={track} queue={verifiable} />
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Recent tracks</h2>
      </div>
      <div className="card-grid">
        {tracks.map((track) => (
          <TrackCard key={track.id} track={track} queue={tracks} />
        ))}
        {tracks.length === 0 && <div className="card-sub">No tracks yet.</div>}
      </div>
    </div>
  );
}
