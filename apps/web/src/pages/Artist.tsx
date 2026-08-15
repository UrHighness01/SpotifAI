import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { TrackRow } from "../components/TrackRow";
import { clampText } from "../utils/text";
import type { ApiArtist, ApiTrack, ApiAlbum } from "../types";

export function Artist() {
  const { id } = useParams();
  const [artist, setArtist] = useState<(ApiArtist & { tracks: ApiTrack[]; albums: ApiAlbum[] }) | null>(null);

  useEffect(() => {
    if (id) api.artist(id).then((d) => setArtist(d.artist));
  }, [id]);

  if (!artist) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="section-title">{artist.name}</h1>
      <p style={{ color: "var(--text-dim)" }}>
        {artist.bio} · <span style={{ color: "var(--accent)" }}>{artist.aiModel}</span>
      </p>
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
    </div>
  );
}
