import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, API_BASE, REPORT_ADDRESS, mediaUrl } from "../api";
import { TrackRow } from "../components/TrackRow";
import { clampText } from "../utils/text";
import { useAuth } from "../auth";
import { useFollowsStore } from "../store/follows";
import type { ApiArtist, ApiTrack, ApiAlbum } from "../types";

export function Artist() {
  const { id } = useParams();
  const { user } = useAuth();
  const [artist, setArtist] = useState<(ApiArtist & { tracks: ApiTrack[]; albums: ApiAlbum[] }) | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const following = useFollowsStore((s) => (id ? s.isFollowing(id) : false));
  const setFollowing = useFollowsStore((s) => s.setFollowing);
  const loadFollows = useFollowsStore((s) => s.load);

  useEffect(() => {
    if (id) api.artist(id).then((d) => setArtist(d.artist));
  }, [id]);

  // Load the follows list so `following` reflects server state (logged in).
  useEffect(() => {
    if (user) loadFollows();
  }, [user, loadFollows]);

  const isOwn = Boolean(user && artist?.owner?.id === user.id);

  const toggleFollow = async () => {
    if (!id || followBusy) return;
    setFollowBusy(true);
    setFollowError(null);
    try {
      if (following) {
        await api.unfollowArtist(id);
        setFollowing(id, false);
      } else {
        await api.followArtist(id);
        setFollowing(id, true);
      }
    } catch (err) {
      // Surface instead of swallowing — a silent fail read as "the follow
      // button doesn't work" (user-reported).
      setFollowError(err instanceof Error ? err.message : "Could not update follow");
      setTimeout(() => setFollowError(null), 3000);
    } finally {
      setFollowBusy(false);
    }
  };

  if (!artist) return <div>Loading…</div>;

  return (
    <div>
      {/* Banner (user's ask: 'add banner etc') — a wide header image when
          the owner has uploaded one; a subtle gradient placeholder else. */}
      {artist.bannerPath && (
        <div className="artist-banner-wrap">
          <img className="artist-banner" src={mediaUrl(artist.bannerPath)!} alt={`${artist.name} banner`} />
        </div>
      )}
      <h1 className="section-title">{artist.name}</h1>
      {/* You-own badge (user's ask): make the link to my account explicit —
          previously nothing distinguished 'your artist' from anyone else's,
          so Virtual Verse felt like it belonged to nobody. */}
      {isOwn && (
        <p className="owner-badge">✓ You own this artist — it's linked to your account</p>
      )}
      <p style={{ color: "var(--text-dim)" }}>
        {artist.bio} · <span style={{ color: "var(--accent)" }}>{artist.aiModel}</span>
      </p>
      {/* Follow the uploader (John's Tier 2 #5): no labels means the
          uploader's fanbase is the distribution engine. Hidden on your own
          artist — the API 400s there anyway, and hiding it is clearer. */}
      {user && !isOwn && (
        <button className="ai-edit-btn" onClick={toggleFollow} disabled={followBusy}>
          {following ? "Following ✓" : "Follow"}
        </button>
      )}
      {followError && <div className="auth-error">{followError}</div>}

      {/* Customize your artist page (user's ask): edit name/bio, upload an
          avatar + banner — owner only. */}
      {isOwn && <ArtistProfileEditor artistId={artist.id} artistName={artist.name} artistBio={artist.bio} onSaved={() => api.artist(artist.id).then((d) => setArtist(d.artist))} />}

      {/* Support / payout (Tier A #1-2 + Tier F #5 trust safety): the
          uploader's external payout handle — the literal absence of a
          label. One click routes money directly at the artist, zero
          platform custody or fee. The resolved host is always shown and a
          report link is available — a community-reportable payout surface
          is what makes the economics layer safe to scale. */}
      {artist.payoutHandle && artist.payoutKind && (
        <p style={{ marginTop: "0.5rem" }}>
          <a
            href={artist.payoutHandle}
            target="_blank"
            rel="noopener noreferrer"
            className="support-link"
          >
            Support {artist.name} via {artist.payoutKind} →
          </a>
          <span style={{ color: "var(--text-dim)", fontSize: "0.78rem" }}>
            {" "}(direct to artist, no middleman · {new URL(artist.payoutHandle).hostname})
          </span>
          <a
            href={`mailto:${REPORT_ADDRESS}?subject=Report payout: ${encodeURIComponent(artist.name)} (${encodeURIComponent(artist.payoutHandle)})`}
            className="report-link"
          >
            {" "}· report suspicious
          </a>
        </p>
      )}
      {/* Owner sets the payout handle (Tier A #1). */}
      {user && artist.owner?.id === user.id && <PayoutEditor artistId={artist.id} payoutKind={artist.payoutKind} payoutHandle={artist.payoutHandle} onSaved={() => api.artist(artist.id).then((d) => setArtist(d.artist))} />}
      {/* Differentiating brand (John's ideas pass #6): the artist IS the
          uploader's own profile — no label or distributor layer in between.
          Made explicit so the platform's model is self-evident. */}
      {artist.owner && (
        <p className="uploader-brand" style={{ marginTop: "0.4rem" }}>
          <span className="uploader-badge">Artist = uploader</span>
          <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            {" "}Uploaded directly by {artist.owner.displayName} — no label, no distributor.
          </span>
        </p>
      )}

      {artist.albums.length > 0 && (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Albums</h2>
          <div className="card-grid">
            {artist.albums.map((album) => (
              <Link key={album.id} className="card" to={`/album/${album.id}`}>
                {album.coverPath ? (
                  <img className="card-art" src={mediaUrl(album.coverPath)!} alt={album.title} />
                ) : (
                  <div className="card-art">💿</div>
                )}
                <div className="card-title">{album.title}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Tracks</h2>
      <div>
        {artist.tracks.map((track, i) => (
          <TrackRow key={track.id} track={{ ...track, artist }} index={i} queue={artist.tracks.map((t) => ({ ...t, artist }))} />
        ))}
      </div>

      {/* "How I made this" recipe library (John's next-ideas #3): since the
          artist IS the uploader, their generation recipes are a discovery
          surface — fans of one track can see everything made by the same
          method. Structured from aiModel/aiPrompt/aiGenerationNotes. */}
      {artist.tracks.some((t) => t.aiPrompt || t.aiGenerationNotes) && (
        <div style={{ marginTop: "2.5rem" }}>
          <h2>How this was made</h2>
          {artist.tracks
            .filter((t) => t.aiPrompt || t.aiGenerationNotes)
            .map((track) => (
              <div key={track.id} className="recipe-card">
                <div className="recipe-title">{track.title}</div>
                <div className="recipe-row">
                  <span className="ai-detail-label">Model</span> {track.aiModel}
                </div>
                {track.aiPrompt && (
                  <div className="recipe-row" title={track.aiPrompt}>
                    <span className="ai-detail-label">Prompt</span> {clampText(track.aiPrompt)}
                  </div>
                )}
                {track.aiGenerationNotes && (
                  <div className="recipe-row" title={track.aiGenerationNotes}>
                    <span className="ai-detail-label">Notes</span> {clampText(track.aiGenerationNotes, 300)}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Provenance wall (John's Tier B #4 + Tier E #4): a public,
          immutable log of every fingerprint captured by this uploader —
          turns the per-track badge into a reputation surface. The honesty
          ratio is shown plainly ('X of Y tracks have fingerprints; Z remixes
          point to verifiable sources') — an ungameable coverage disclosure,
          not a gamified score. */}
      {artist.tracks.some((t) => t.fingerprintHash) && (
        <div style={{ marginTop: "2.5rem" }}>
          <h2>Provenance wall</h2>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
            {artist.tracks.filter((t) => t.fingerprintHash).length} of {artist.tracks.length} tracks have fingerprints recorded at upload
            {(() => {
              const remixWithSource = artist.tracks.filter((t) => t.remixOf?.fingerprintHash).length;
              return remixWithSource > 0 ? ` · ${remixWithSource} remix(es) point to verifiable sources` : "";
            })()}
            .{" "}
            <a href={`${API_BASE}/artists/${artist.id}/provenance-manifest`} target="_blank" rel="noopener noreferrer" className="support-link" style={{ fontSize: "0.8rem" }}>
              Signed manifest →
            </a>
          </p>
          {artist.tracks
            .filter((t) => t.fingerprintHash)
            .map((track) => (
              <div key={track.id} className="recipe-card">
                <div className="recipe-title">{track.title}</div>
                <div className="recipe-row">
                  <span className="ai-detail-label">Model</span> {track.aiModel}
                </div>
                <div className="recipe-row">
                  <span className="ai-detail-label">Fingerprint</span>{" "}
                  <span className={`rights-badge provenance ${track.provenanceStatus || "recorded"}`}>
                    ✓ {track.provenanceStatus || "recorded"} · {track.fingerprintHash}
                  </span>
                </div>
                {track.fingerprintCapturedAt && (
                  <div className="recipe-row">
                    <span className="ai-detail-label">Recorded</span> {new Date(track.fingerprintCapturedAt).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// Owner-only payout handle editor (Tier A #1): metadata-only, no custody.
function PayoutEditor({
  artistId,
  payoutKind,
  payoutHandle,
  onSaved,
}: {
  artistId: string;
  payoutKind: string | null;
  payoutHandle: string | null;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState(payoutKind ?? "");
  const [handle, setHandle] = useState(payoutHandle ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateArtistPayout(artistId, {
        payoutKind: kind.trim() || null,
        payoutHandle: handle.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ai-detail-panel" style={{ marginLeft: 0, marginTop: "0.6rem" }}>
      <div className="ai-edit-form">
        <label className="ai-detail-label">Payout kind</label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="ai-rights-select">
          <option value="">None</option>
          <option value="ko-fi">Ko-fi</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="btc">Bitcoin</option>
          <option value="other">Other</option>
        </select>
        <label className="ai-detail-label">Payout link / handle</label>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="https://ko-fi.com/you"
          maxLength={500}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text)",
            padding: "0.4rem 0.6rem",
            fontSize: "0.85rem",
          }}
        />
        {error && <div style={{ color: "var(--flag, #a13a2e)", fontSize: "0.8rem" }}>{error}</div>}
        <div className="ai-edit-actions">
          <button className="ai-edit-btn" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save payout"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Owner-only artist page customization (user's ask): edit the name/bio,
// upload a custom avatar and banner to make the page your own.
function ArtistProfileEditor({
  artistId,
  artistName,
  artistBio,
  onSaved,
}: {
  artistId: string;
  artistName: string;
  artistBio: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(artistName);
  const [bio, setBio] = useState(artistBio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await api.updateArtistProfile(artistId, {
        name: name.trim() || undefined,
        bio: bio.trim() || null,
      });
      onSaved();
      setStatus("Profile saved");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (kind: "avatar" | "banner", file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append(kind, file);
      if (kind === "avatar") await api.uploadArtistAvatar(artistId, formData);
      else await api.uploadArtistBanner(artistId, formData);
      onSaved();
      setStatus(kind === "avatar" ? "Avatar updated" : "Banner updated");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${kind} upload failed`);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text)",
    padding: "0.4rem 0.6rem",
    fontSize: "0.85rem",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div className="ai-detail-panel" style={{ marginLeft: 0, marginTop: "0.6rem" }}>
      <div className="ai-edit-form" style={{ display: "grid", gap: "0.5rem" }}>
        <label className="ai-detail-label">Customize your artist page</label>
        <label className="ai-detail-label">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={inputStyle} />
        <label className="ai-detail-label">Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={2000} style={inputStyle} />
        <div className="ai-edit-actions">
          <button className="ai-edit-btn" onClick={saveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>

        <label className="ai-detail-label" style={{ marginTop: "0.3rem" }}>
          Avatar image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => uploadImage("avatar", e.target.files?.[0] ?? undefined)}
          />
        </label>
        <label className="ai-detail-label">
          Banner image (wide header)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => uploadImage("banner", e.target.files?.[0] ?? undefined)}
          />
        </label>

        {error && <div style={{ color: "var(--flag, #a13a2e)", fontSize: "0.8rem" }}>{error}</div>}
        {status && <div style={{ color: "var(--accent)", fontSize: "0.8rem" }}>{status}</div>}
      </div>
    </div>
  );
}
