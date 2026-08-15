export interface ApiArtist {
  id: string;
  name: string;
  bio: string | null;
  avatarPath: string | null;
  aiModel: string;
  createdAt: string;
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
  createdAt: string;
  artist?: ApiArtist;
  album?: ApiAlbum | null;
}

export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}
