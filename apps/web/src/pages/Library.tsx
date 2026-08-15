import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { TrackRow } from "../components/TrackRow";
import { useAuth } from "../auth";
import { useLibraryStore } from "../store/library";
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
  // Selection for bulk playlist creation: ctrl/cmd-click toggles one,
  // shift-click range-selects from the last anchor (index within `tracks`).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const savedIds = useLibraryStore((s) => s.savedIds);
  const loadLibrary = useLibraryStore((s) => s.load);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      // Seed the shared store so its optimistic unlikes drive this list.
      loadLibrary();
      api.library().then((d) => setSaves(d.saves));
      // Verified-library (John's #1): my own history of attested tracks —
      // 'tracks where I hold the actual audio and confirmed it matches the
      // recorded fingerprint.' Personal history, self-evidently true.
      api.verifiedMine().then((d) => setVerified(d.verified)).catch(() => {});
    }
  }, [user, loadLibrary]);

  if (!user) return null;

  const allTracks = saves.map((s) => s.track);
  // Live filter by the shared store: clicking a heart optimistically removes
  // the track from savedIds, so the row disappears from this list directly.
  const tracks = allTracks.filter((t) => savedIds.has(t.id));

  const toggleSelect = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelected !== null) {
        const [a, b] = [Math.min(lastSelected, index), Math.max(lastSelected, index)];
        for (let i = a; i <= b; i++) next.add(tracks[i].id);
      } else if (next.has(tracks[index].id)) {
        next.delete(tracks[index].id);
      } else {
        next.add(tracks[index].id);
      }
      return next;
    });
    setLastSelected(index);
  };

  const clearSelection = () => {
    setSelected(new Set());
    setLastSelected(null);
  };

  const onCreateFromSelection = async (e: FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim() || selected.size === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const ids = tracks.filter((t) => selected.has(t.id)).map((t) => t.id);
      const { playlist } = await api.createPlaylist(playlistName.trim(), ids);
      clearSelection();
      setPlaylistName("");
      navigate(`/playlist/${playlist.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create playlist");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1 className="section-title">Liked Songs</h1>

      {selected.size > 0 && (
        <div className="selection-bar">
          <span className="selection-count">{selected.size} selected</span>
          {!creating ? (
            <form className="selection-create" onSubmit={onCreateFromSelection}>
              <input
                type="text"
                placeholder={`Name your playlist (${selected.size} track${selected.size === 1 ? "" : "s"})`}
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn-primary selection-create-btn" disabled={!playlistName.trim()}>
                Create playlist
              </button>
              <button type="button" className="selection-cancel" onClick={clearSelection}>
                Cancel
              </button>
            </form>
          ) : (
            <span className="card-sub">Creating playlist…</span>
          )}
          {createError && <div className="auth-error">{createError}</div>}
        </div>
      )}

      <div>
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            queue={tracks}
            selectable
            selected={selected.has(track.id)}
            onToggleSelect={(e) => toggleSelect(e, i)}
          />
        ))}
        {tracks.length === 0 && <div className="card-sub">Songs you like will appear here.</div>}
      </div>
      {tracks.length > 0 && selected.size === 0 && (
        <p className="card-sub" style={{ marginTop: "0.4rem" }}>
          Tip: Ctrl/Cmd+click songs to select multiple, Shift+click for a range — then create a playlist from your selection.
        </p>
      )}

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
