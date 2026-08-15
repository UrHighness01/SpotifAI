import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { TrackRow } from "../components/TrackRow";
import { useAuth } from "../auth";
import type { ApiTrack } from "../types";

interface LibrarySave {
  trackId: string;
  track: ApiTrack;
}

export function Library() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [saves, setSaves] = useState<LibrarySave[]>([]);
  const [verified, setVerified] = useState<(ApiTrack & { verifiedAt?: string })[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      api.library().then((d) => setSaves(d.saves));
      // Verified-library (John's #1): my own history of attested tracks —
      // 'tracks where I hold the actual audio and confirmed it matches the
      // recorded fingerprint.' Personal history, self-evidently true.
      api.verifiedMine().then((d) => setVerified(d.verified)).catch(() => {});
    }
  }, [user]);

  if (!user) return null;

  const tracks = saves.map((s) => s.track);

  return (
    <div>
      <h1 className="section-title">Liked Songs</h1>
      <div>
        {tracks.map((track, i) => (
          <TrackRow key={track.id} track={track} index={i} queue={tracks} />
        ))}
        {tracks.length === 0 && <div className="card-sub">Songs you like will appear here.</div>}
      </div>

      {/* Verified history (John's #1): the reward-the-honesty-loop feature —
          makes verifying audio visible + valued, needs no anti-sybil (it's
          your own per-user data, like playlists). */}
      {verified.length > 0 && (
        <div style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2 className="section-title">I verified this</h2>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
            {verified.length} track(s) where you hold the actual audio and confirmed it matches the recorded fingerprint.{" "}
            <a href={`/verified/${user.id}`} className="support-link" style={{ fontSize: "0.8rem" }}>
              Share your verified library →
            </a>
          </p>
          <div>
            {verified.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={verified} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
