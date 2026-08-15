import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { TrackRow } from "../components/TrackRow";
import type { ApiAlbum, ApiTrack } from "../types";

export function Album() {
  const { id } = useParams();
  const [album, setAlbum] = useState<(ApiAlbum & { tracks: ApiTrack[] }) | null>(null);
  const [related, setRelated] = useState<ApiTrack[]>([]);
  const [blurb, setBlurb] = useState<string | null>(null);
  const [nanoAvailable, setNanoAvailable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const reload = () => {
    if (id) api.album(id).then((d) => setAlbum(d.album));
  };

  useEffect(() => {
    if (id) {
      api.album(id).then((d) => {
        setAlbum(d.album);
        // Seed related tracks from the album's most-played track — the most
        // representative signal this album has.
        const seed = [...(d.album.tracks ?? [])].sort((a, b) => b.playCount - a.playCount)[0];
        if (seed) api.relatedTracks(seed.id).then((r) => setRelated(r.tracks));

        // On-device nano track describer (desktop app only). Blurb generation
        // is a hard-rule "blurb, never explainer" — it describes the track,
        // it never explains *why* it was recommended.
        const desktop = window.spotifaiDesktop;
        if (desktop?.nanoDescribe) {
          setNanoAvailable(true);
          const track = d.album.tracks?.[0];
          if (track) {
            desktop
              .nanoDescribe({ title: track.title, aiModel: track.aiModel, genre: track.album?.title })
              .then((res) => {
                if (res.ok && res.blurb) setBlurb(res.blurb);
                else setNanoAvailable(false);
              })
              .catch(() => setNanoAvailable(false));
          }
        }
      });
    }
  }, [id]);

  if (!album) return <div>Loading…</div>;

  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    setCoverError(null);
    try {
      const fd = new FormData();
      fd.append("cover", file);
      await api.updateAlbumCover(id, fd);
      reload();
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div>
      <h1 className="section-title">{album.title}</h1>
      <p style={{ color: "var(--text-dim)" }}>{album.artist?.name}</p>
      {nanoAvailable && (
        <p className="track-blurb" style={{ color: "var(--text-dim)", maxWidth: "62ch", fontStyle: "italic" }}>
          {blurb ? blurb : "Generating an on-device description…"}
        </p>
      )}
      <label className="cover-upload">
        {uploading ? "Uploading…" : "Change cover"}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onCoverChange} hidden />
      </label>
      {coverError && <p style={{ color: "var(--flag, #a13a2e)", fontSize: "0.85rem" }}>{coverError}</p>}
      <div style={{ marginTop: "1.5rem" }}>
        {album.tracks.map((track, i) => (
          <TrackRow key={track.id} track={{ ...track, artist: album.artist }} index={i} queue={album.tracks.map((t) => ({ ...t, artist: album.artist }))} />
        ))}
      </div>
      {/* Remix reverse index (John's Tier 2 #4): tracks that remix this
          album's tracks — turns remixOfId into a browseable lineage. */}
      {album.tracks.some((t) => t.remixes?.length) && (
        <div style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2 className="section-title">Remixed from this album</h2>
          </div>
          {album.tracks.flatMap((t) => (t.remixes ?? []).map((r) => ({ source: t, remix: r }))).map(({ source, remix }, i) => (
            <div key={remix.id} className="recipe-card" style={{ marginBottom: "0.5rem" }}>
              <div className="recipe-title">{remix.title}</div>
              <div className="recipe-row">
                {remix.artist?.name} · remix of “{source.title}”
              </div>
            </div>
          ))}
        </div>
      )}
      {related.length > 0 && (
        <div style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2 className="section-title">Related tracks</h2>
          </div>
          {related.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} queue={related} />
          ))}
        </div>
      )}
    </div>
  );
}
