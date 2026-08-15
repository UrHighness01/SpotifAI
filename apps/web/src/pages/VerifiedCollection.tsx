import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiTrack, ApiUser } from "../types";

// Shareable verified collection (John's endorsed feature): a public view of
// a listener's verified-library — 'here's audio I've actually held and
// confirmed it matches the recorded fingerprint.' Sharing turns the
// personal honesty record into a social signal, sybil-immune (per-user
// sharing, not ranking).
export function VerifiedCollection() {
  const { userId } = useParams();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [verified, setVerified] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      api
        .userVerified(userId)
        .then((d) => {
          setUser(d.user);
          setVerified(d.verified);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [userId]);

  if (loading) return <div>Loading…</div>;
  if (!user) return <div>User not found.</div>;

  return (
    <div>
      <h1 className="page-greeting">{user.displayName}'s verified library</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: "1.5rem" }}>
        Tracks {user.displayName} holds the actual audio for and confirmed match the recorded fingerprint — their personal honesty record, shared.
      </p>
      <div>
        {verified.map((track, i) => (
          <TrackRow key={track.id} track={track} index={i} queue={verified} />
        ))}
        {verified.length === 0 && <div className="card-sub">Nothing verified yet.</div>}
      </div>
    </div>
  );
}
