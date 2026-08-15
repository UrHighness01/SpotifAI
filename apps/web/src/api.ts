const API_BASE = "http://localhost:4000";

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
    throw new Error(body.error || `request failed: ${res.status}`);
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

  artists: (q?: string) => request(`/artists${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  artist: (id: string) => request(`/artists/${id}`),
  createArtist: (name: string, bio: string, aiModel: string) =>
    request("/artists", { method: "POST", body: JSON.stringify({ name, bio, aiModel }) }),

  albums: (artistId?: string) => request(`/albums${artistId ? `?artistId=${artistId}` : ""}`),
  album: (id: string) => request(`/albums/${id}`),

  tracks: (params: { q?: string; artistId?: string; albumId?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request(`/tracks${qs ? `?${qs}` : ""}`);
  },
  track: (id: string) => request(`/tracks/${id}`),

  library: () => request("/library"),
  saveTrack: (trackId: string) => request(`/library/${trackId}`, { method: "POST" }),
  unsaveTrack: (trackId: string) => request(`/library/${trackId}`, { method: "DELETE" }),

  upload: (formData: FormData) => request("/upload/track", { method: "POST", body: formData }),

  streamUrl: (trackId: string) => `${API_BASE}/stream/${trackId}`,
};
