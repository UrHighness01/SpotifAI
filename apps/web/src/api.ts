// API base (John's operational note): env-ized like the report address so a
// production web build can point at a real backend instead of localhost.
// Dev default is localhost:4000.
export const API_BASE: string = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ?? "http://localhost:4000";

// Payout-report address (production-readiness debt): the placeholder is
// replaced via Vite env (VITE_REPORT_ADDRESS) at build time in production.
// The Trust-Floor runbook requires this to be a real inbox before launch.
export const REPORT_ADDRESS: string = (import.meta as { env?: Record<string, string> }).env?.VITE_REPORT_ADDRESS ?? "abuse@spotifai.local";

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

  artists: (q?: string, aiModel?: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (aiModel) qs.set("aiModel", aiModel);
    const s = qs.toString();
    return request(`/artists${s ? `?${s}` : ""}`);
  },
  // Only artists I created — upload attribution must stay within my own
  // profiles (the upload picker uses this, not the public list).
  myArtists: () => request("/artists/mine"),
  artist: (id: string) => request(`/artists/${id}`),
  updateArtistPayout: (id: string, payout: { payoutKind?: string | null; payoutHandle?: string | null }) =>
    request(`/artists/${id}/payout`, { method: "PATCH", body: JSON.stringify(payout) }),
  createArtist: (name: string, bio: string, aiModel: string) =>
    request("/artists", { method: "POST", body: JSON.stringify({ name, bio, aiModel }) }),

  albums: (artistId?: string) => request(`/albums${artistId ? `?artistId=${artistId}` : ""}`),
  album: (id: string) => request(`/albums/${id}`),
  updateAlbumCover: (id: string, formData: FormData) =>
    request(`/albums/${id}/cover`, { method: "PATCH", body: formData }),

  tracks: (params: { q?: string; artistId?: string; albumId?: string; aiModel?: string; sort?: string; fingerprinted?: boolean; signatureMatched?: boolean } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request(`/tracks${qs ? `?${qs}` : ""}`);
  },
  track: (id: string) => request(`/tracks/${id}`),
  updateTrackMeta: (id: string, meta: { aiPrompt?: string | null; aiGenerationNotes?: string | null; rightsNotice?: string; remixOfId?: string | null; licensePriceUsd?: number | null; licenseTerms?: string | null }) =>
    request(`/tracks/${id}/meta`, { method: "PATCH", body: JSON.stringify(meta) }),
  relatedTracks: (id: string) => request(`/tracks/${id}/related`),
  similarTracks: (id: string) => request(`/tracks/${id}/similar`),
  recommendedTracks: () => request("/tracks/recommended"),
  attestTrack: (id: string, byteHash: string, handle: string) =>
    request(`/tracks/${id}/attest`, { method: "POST", body: JSON.stringify({ byteHash, handle }) }),
  trackAttestations: (id: string) => request(`/tracks/${id}/attestations`),

  library: () => request("/library"),
  saveTrack: (trackId: string) => request(`/library/${trackId}`, { method: "POST" }),
  unsaveTrack: (trackId: string) => request(`/library/${trackId}`, { method: "DELETE" }),
  verifiedMine: () => request("/tracks/verified-mine"),
  userVerified: (userId: string) => request(`/tracks/user/${userId}/verified`),

  follows: () => request("/follows"),
  followArtist: (artistId: string) => request(`/follows/${artistId}`, { method: "POST" }),
  unfollowArtist: (artistId: string) => request(`/follows/${artistId}`, { method: "DELETE" }),
  followFeed: () => request("/follows/feed"),

  collabRequests: () => request("/collabs/mine"),
  requestRemix: (trackId: string, message?: string) =>
    request(`/collabs/track/${trackId}/request`, { method: "POST", body: JSON.stringify({ message }) }),
  respondCollab: (id: string, status: "accepted" | "rejected") =>
    request(`/collabs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  // Batch upload (multiple tracks, one artist, optional shared album).
  uploadBatch: (formData: FormData) => request("/upload/tracks", { method: "POST", body: formData }),
  corpusStatus: () => request("/corpus/status"),

  upload: (formData: FormData) => request("/upload/track", { method: "POST", body: formData }),

  playlists: () => request("/playlists"),
  playlist: (id: string) => request(`/playlists/${id}`),
  createPlaylist: (name: string, trackIds?: string[]) =>
    request("/playlists", { method: "POST", body: JSON.stringify({ name, trackIds }) }),
  deletePlaylist: (id: string) => request(`/playlists/${id}`, { method: "DELETE" }),
  addToPlaylist: (playlistId: string, trackId: string) =>
    request(`/playlists/${playlistId}/tracks`, { method: "POST", body: JSON.stringify({ trackId }) }),
  removeFromPlaylist: (playlistId: string, trackId: string) =>
    request(`/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" }),

  streamUrl: (trackId: string) => `${API_BASE}/stream/${trackId}`,
};
