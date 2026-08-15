import { create } from "zustand";
import { api } from "../api";

// Shared liked-songs state: every like button and the player read from one
// store, loaded once from the API, with optimistic toggles so the heart
// responds instantly. Persisted server-side via /library save/unsave.
interface LibraryState {
  savedIds: Set<string>;
  loaded: boolean;
  load: () => Promise<void>;
  isSaved: (trackId: string) => boolean;
  toggle: (trackId: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  savedIds: new Set(),
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const d = await api.library();
      set({ savedIds: new Set(d.saves.map((s: { trackId: string }) => s.trackId)), loaded: true });
    } catch {
      // Not logged in (401) or offline — treat as empty; buttons will prompt login.
      set({ savedIds: new Set(), loaded: true });
    }
  },

  isSaved: (trackId) => get().savedIds.has(trackId),

  toggle: async (trackId) => {
    const saved = get().savedIds;
    const wasSaved = saved.has(trackId);
    // Optimistic flip.
    const next = new Set(saved);
    if (wasSaved) next.delete(trackId);
    else next.add(trackId);
    set({ savedIds: next });
    try {
      if (wasSaved) await api.unsaveTrack(trackId);
      else await api.saveTrack(trackId);
    } catch {
      // Roll back on failure.
      const rollback = new Set(get().savedIds);
      if (wasSaved) rollback.add(trackId);
      else rollback.delete(trackId);
      set({ savedIds: rollback });
      throw new Error("Could not update liked songs — are you logged in?");
    }
  },
}));
