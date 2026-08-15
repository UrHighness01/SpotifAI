import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { ApiPlaylist } from "../types";

interface Props {
  trackId: string;
}

export function AddToPlaylist({ trackId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) api.playlists().then((d) => setPlaylists(d.playlists));
  }, [open, user]);

  if (!user) return null;

  const onAdd = async (playlistId: string) => {
    await api.addToPlaylist(playlistId, trackId);
    setStatus("Added");
    setTimeout(() => setStatus(null), 1200);
  };

  return (
    <span
      className="add-to-playlist"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      <button type="button" className="add-to-playlist-btn" title="Add to playlist">
        +
      </button>
      {open && (
        <div className="add-to-playlist-menu" onClick={(e) => e.stopPropagation()}>
          {status ? (
            <div className="add-to-playlist-status">{status}</div>
          ) : playlists.length === 0 ? (
            <div className="add-to-playlist-status">No playlists yet</div>
          ) : (
            playlists.map((p) => (
              <button key={p.id} type="button" onClick={() => onAdd(p.id)}>
                {p.name}
              </button>
            ))
          )}
        </div>
      )}
    </span>
  );
}
