import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { ApiArtist } from "../types";

// "My Song.mp3" → "My Song" (track title default for batch uploads).
function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim();
}

export function Upload() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // Only artists I created — attribution must stay within my own profiles.
  // First upload always has an empty list, so creating one is the only path.
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [artistId, setArtistId] = useState("");
  const [newArtistName, setNewArtistName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [albumTitle, setAlbumTitle] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) api.myArtists().then((d) => setArtists(d.artists));
  }, [user]);

  if (!user) return null;

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    setTitles(list.map((f) => stem(f.name)));
  };

  const setTitleAt = (i: number, v: string) =>
    setTitles((prev) => prev.map((t, j) => (j === i ? v : t)));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (files.length === 0) {
      setError("Choose at least one audio file");
      return;
    }
    try {
      let finalArtistId = artistId;
      if (!finalArtistId && newArtistName.trim()) {
        const created = await api.createArtist(newArtistName.trim(), "", aiModel || "unknown");
        finalArtistId = created.artist.id;
        setArtists((prev) => [created.artist, ...prev]);
      }
      if (!finalArtistId) {
        setError("Choose or create an artist");
        return;
      }

      const formData = new FormData();
      formData.append("artistId", finalArtistId);
      for (const f of files) formData.append("audio", f);
      // Position-matched per-file titles; empty entries fall back to the
      // filename stem on the server.
      formData.append("titles", JSON.stringify(titles.map((t) => t.trim())));
      if (albumTitle.trim()) formData.append("albumTitle", albumTitle.trim());
      if (aiModel) formData.append("aiModel", aiModel);
      if (aiPrompt) formData.append("aiPrompt", aiPrompt);
      if (cover) formData.append("cover", cover);

      await api.uploadBatch(formData);
      setStatus(`Uploaded ${files.length} track${files.length === 1 ? "" : "s"}!`);
      setFiles([]);
      setTitles([]);
      setAlbumTitle("");
      setAiPrompt("");
      setCover(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="upload-page">
      <h1 className="section-title">Upload AI tracks</h1>
      <form className="upload-form" onSubmit={onSubmit}>
        {error && <div className="auth-error">{error}</div>}
        {status && <div className="auth-status">{status}</div>}

        <label>
          Artist (yours only)
          <select value={artistId} onChange={(e) => setArtistId(e.target.value)}>
            <option value="">— create new artist —</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {!artistId && (
          <label>
            New artist name
            <input value={newArtistName} onChange={(e) => setNewArtistName(e.target.value)} />
          </label>
        )}

        <label>
          Album title (optional — groups all selected tracks into one album)
          <input value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} placeholder="e.g. Midnight Sessions" />
        </label>

        <label>
          AI model (optional — e.g. Suno v4, Udio)
          <input
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            placeholder="Unknown (not disclosed)"
          />
        </label>

        <label>
          AI prompt (optional — applied to all tracks in this batch)
          <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} />
        </label>

        <label>
          Audio files (select multiple for a batch)
          <input type="file" accept="audio/*" multiple onChange={onFiles} required />
        </label>

        {files.length > 0 && (
          <div className="batch-files">
            <div className="card-sub" style={{ marginBottom: "0.4rem" }}>
              {files.length} file{files.length === 1 ? "" : "s"} — edit the track titles below (pre-filled from filenames):
            </div>
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="batch-file-row">
                <span className="batch-file-name" title={f.name}>
                  {f.name}
                </span>
                <input
                  value={titles[i] ?? ""}
                  onChange={(e) => setTitleAt(i, e.target.value)}
                  placeholder="Track title"
                  aria-label={`Title for ${f.name}`}
                />
              </div>
            ))}
          </div>
        )}

        <label>
          Cover art (optional — one cover for the album)
          <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
        </label>

        <button type="submit" className="btn-primary" disabled={files.length === 0}>
          {files.length > 0 ? `Upload ${files.length} track${files.length === 1 ? "" : "s"}` : "Upload"}
        </button>
      </form>
    </div>
  );
}
