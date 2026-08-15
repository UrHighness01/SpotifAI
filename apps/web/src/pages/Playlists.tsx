import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { ApiPlaylist } from "../types";

export function Playlists() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) api.playlists().then((d) => setPlaylists(d.playlists));
  }, [user]);

  if (!user) return null;

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      const { playlist } = await api.createPlaylist(name.trim());
      setPlaylists((prev) => [playlist, ...prev]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create playlist");
    }
  };

  const onDelete = async (id: string) => {
    await api.deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div>
      <h1 className="section-title">Playlists</h1>
      <form onSubmit={onCreate} style={{ display: "flex", gap: ".5rem", marginBottom: "1.5rem" }}>
        <input
          type="text"
          placeholder="New playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Create
        </button>
      </form>
      {error && <div className="auth-error">{error}</div>}
      <div>
        {playlists.map((p) => (
          <div key={p.id} className="track-row">
            <Link to={`/playlist/${p.id}`} style={{ color: "var(--text)", flex: 1 }}>
              {p.name}
            </Link>
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
            >
              Delete
            </button>
          </div>
        ))}
        {playlists.length === 0 && <div className="card-sub">Create a playlist to start organizing your tracks.</div>}
      </div>
    </div>
  );
}
