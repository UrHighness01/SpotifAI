export interface Artist {
  id: string;
  name: string;
  bio: string | null;
  avatarPath: string | null;
  aiModel: string;
  createdAt: string;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  coverPath: string | null;
  releaseDate: string | null;
}

export interface AiDisclosure {
  model: string;
  prompt?: string;
  generationNotes?: string;
}

export interface Track {
  id: string;
  title: string;
  albumId: string | null;
  artistId: string;
  audioPath: string;
  durationSec: number;
  aiDisclosure: AiDisclosure;
  playCount: number;
  createdAt: string;
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
}
