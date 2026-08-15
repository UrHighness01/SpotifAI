import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { ApiArtist, ApiTrack } from "../types";
import { usePlayerStore } from "../store/player";

export function Home() {
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    api.artists().then((d) => setArtists(d.artists));
    api.tracks().then((d) => setTracks(d.tracks));
  }, []);

  return (
    <div>
      <h1 className="section-title">AI Artists</h1>
      <div className="card-grid">
        {artists.map((artist) => (
          <Link key={artist.id} className="card" to={`/artist/${artist.id}`}>
            <div className="card-art">🤖</div>
            <div className="card-title">{artist.name}</div>
            <div className="card-sub">{artist.aiModel}</div>
          </Link>
        ))}
        {artists.length === 0 && <div className="card-sub">No artists yet — upload a track to create one.</div>}
      </div>

      <h1 className="section-title">Recent tracks</h1>
      <div className="card-grid">
        {tracks.map((track) => (
          <div key={track.id} className="card" onClick={() => playTrack(track, tracks)}>
            <div className="card-art">▶</div>
            <div className="card-title">{track.title}</div>
            <div className="card-sub">{track.artist?.name}</div>
          </div>
        ))}
        {tracks.length === 0 && <div className="card-sub">No tracks yet.</div>}
      </div>
    </div>
  );
}
