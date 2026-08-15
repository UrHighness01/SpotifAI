import { create } from "zustand";
import type { ApiTrack } from "../types";

interface PlayerState {
  queue: ApiTrack[];
  currentIndex: number;
  isPlaying: boolean;
  playTrack: (track: ApiTrack, queue?: ApiTrack[]) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  setPlaying: (playing: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  playTrack: (track, queue) => {
    const list = queue || [track];
    const index = list.findIndex((t) => t.id === track.id);
    set({ queue: list, currentIndex: index === -1 ? 0 : index, isPlaying: true });
  },
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  next: () => {
    const { queue, currentIndex } = get();
    if (currentIndex < queue.length - 1) set({ currentIndex: currentIndex + 1, isPlaying: true });
  },
  prev: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) set({ currentIndex: currentIndex - 1, isPlaying: true });
  },
  setPlaying: (playing) => set({ isPlaying: playing }),
}));
