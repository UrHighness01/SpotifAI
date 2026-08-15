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

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) api.library().then((d) => setSaves(d.saves));
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
    </div>
  );
}
