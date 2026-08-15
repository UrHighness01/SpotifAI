import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibraryStore } from "../store/library";
import { useAuth } from "../auth";

// Heart button: toggles a track in the liked-songs library. Filled when
// saved, outline when not. Requires login — clicking while logged out
// redirects to /login. Uses the shared library store so every heart + the
// player stay in sync.
export function LikeButton({ trackId, className = "" }: { trackId: string; className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const load = useLibraryStore((s) => s.load);
  const loaded = useLibraryStore((s) => s.loaded);
  const isSaved = useLibraryStore((s) => s.isSaved(trackId));
  const toggle = useLibraryStore((s) => s.toggle);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) {
      navigate("/login");
      return;
    }
    setError(null);
    try {
      await toggle(trackId);
    } catch (err) {
      // Surface failures (rate limit, offline, 401) instead of silently
      // rolling back — the heart reverting with no explanation read as the
      // "like bug". The store already rolled the optimistic state back.
      setError(err instanceof Error ? err.message : "Could not update like");
      setTimeout(() => setError(null), 2500);
    }
  };

  return (
    <span className="like-wrap">
      <button
        className={`like-btn${isSaved ? " liked" : ""} ${className}`}
        onClick={onClick}
        aria-label={isSaved ? "Remove from liked songs" : "Add to liked songs"}
        title={isSaved ? "Remove from liked songs" : "Add to liked songs"}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 21s-6.7-4.3-9.3-8.1C.8 10.2 1.5 6.6 4.4 5.3c2-.9 4.2-.3 5.6 1.3L12 8.8l2-2.2c1.4-1.6 3.6-2.2 5.6-1.3 2.9 1.3 3.6 4.9 1.7 7.6C18.7 16.7 12 21 12 21z" />
        </svg>
        {loaded === false ? "" : null}
      </button>
      {error && <span className="like-error">{error}</span>}
    </span>
  );
}
