export interface ApiArtist {
  id: string;
  name: string;
  bio: string | null;
  avatarPath: string | null;
  aiModel: string;
  createdAt: string;
  owner?: { id: string; displayName: string };
}

export interface ApiAlbum {
  id: string;
  title: string;
  artistId: string;
  coverPath: string | null;
  releaseDate: string | null;
  artist?: ApiArtist;
}

export interface ApiTrack {
  id: string;
  title: string;
  albumId: string | null;
  artistId: string;
  audioPath: string;
  durationSec: number;
  aiModel: string;
  aiPrompt: string | null;
  aiGenerationNotes: string | null;
  rightsNotice: string;
  remixOfId: string | null;
  remixOf?: ApiTrack | null;
  fingerprintHash: string | null;
  fingerprintModel: string | null;
  fingerprintCapturedAt: string | null;
  playCount: number;
  createdAt: string;
  artist?: ApiArtist;
  album?: ApiAlbum | null;
}

export interface ApiPlaylist {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
}

export interface ApiPlaylistTrack {
  playlistId: string;
  trackId: string;
  position: number;
  track: ApiTrack;
}

export interface ApiPlaylistDetail extends ApiPlaylist {
  tracks: ApiPlaylistTrack[];
}

export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  emailVerified: boolean;
}

// Shared global type for the Electron preload bridge (nano blurb + tags).
export interface SpotifaiDesktop {
  isDesktop: boolean;
  nanoDescribe?: (track: unknown) => Promise<{ ok: boolean; blurb?: string; error?: string }>;
  nanoTags?: (track: unknown) => Promise<{ ok: boolean; tags?: string; error?: string }>;
}

declare global {
  interface Window {
    spotifaiDesktop?: SpotifaiDesktop;
  }
}
