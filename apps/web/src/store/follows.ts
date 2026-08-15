import { create } from "zustand";
import { api } from "../api";
import type { ApiArtist } from "../types";

// Shared followed-artists state: the sidebar "Following" list reads from
// one store, loaded once, updated optimistically when the user follows or
// unfollows from an artist page — so the sidebar updates instantly without
// a full page reload.
interface FollowsState {
  artists: ApiArtist[];
  loaded: boolean;
  load: () => Promise<void>;
  isFollowing: (artistId: string) => boolean;
  setFollowing: (artistId: string, following: boolean) => void;
}

export const useFollowsStore = create<FollowsState>((set, get) => ({
  artists: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const d = await api.follows();
      set({ artists: d.follows, loaded: true });
    } catch {
      // Not logged in (401) or offline — empty list.
      set({ artists: [], loaded: true });
    }
  },

  isFollowing: (artistId) => get().artists.some((a) => a.id === artistId),

  setFollowing: (artistId, following) => {
    set({ artists: get().artists.filter((a) => a.id !== artistId) });
    if (following) {
      // Refetch so the sidebar shows the full artist record (avatar etc.).
      api.follows().then((d) => set({ artists: d.follows })).catch(() => {});
    }
  },
}));
