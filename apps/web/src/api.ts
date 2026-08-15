const API_BASE = "http://localhost:4000";

export function mediaUrl(relPath: string | null | undefined): string | null {
  return relPath ? `${API_BASE}/media/${relPath}` : null;
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `request failed: ${res.status}`) as Error & { code?: string };
    if (body.code) err.code = body.code;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (email: string, password: string, displayName: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password, displayName }) }),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  verifyEmail: (token: string) => request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: (email: string) =>
    request("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }),
  forgotPassword: (email: string) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  artists: (q?: string) => request(`/artists${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  artist: (id: string) => request(`/artists/${id}`),
  createArtist: (name: string, bio: string, aiModel: string) =>
    request("/artists", { method: "POST", body: JSON.stringify({ name, bio, aiModel }) }),

  albums: (artistId?: string) => request(`/albums${artistId ? `?artistId=${artistId}` : ""}`),
  album: (id: string) => request(`/albums/${id}`),

  tracks: (params: { q?: string; artistId?: string; albumId?: string; aiModel?: string; sort?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request(`/tracks${qs ? `?${qs}` : ""}`);
  },
  track: (id: string) => request(`/tracks/${id}`),
  relatedTracks: (id: string) => request(`/tracks/${id}/related`),
  recommendedTracks: () => request("/tracks/recommended"),

  library: () => request("/library"),
  saveTrack: (trackId: string) => request(`/library/${trackId}`, { method: "POST" }),
  unsaveTrack: (trackId: string) => request(`/library/${trackId}`, { method: "DELETE" }),

  upload: (formData: FormData) => request("/upload/track", { method: "POST", body: formData }),

  playlists: () => request("/playlists"),
  playlist: (id: string) => request(`/playlists/${id}`),
  createPlaylist: (name: string) => request("/playlists", { method: "POST", body: JSON.stringify({ name }) }),
  deletePlaylist: (id: string) => request(`/playlists/${id}`, { method: "DELETE" }),
  addToPlaylist: (playlistId: string, trackId: string) =>
    request(`/playlists/${playlistId}/tracks`, { method: "POST", body: JSON.stringify({ trackId }) }),
  removeFromPlaylist: (playlistId: string, trackId: string) =>
    request(`/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" }),

  streamUrl: (trackId: string) => `${API_BASE}/stream/${trackId}`,
};
