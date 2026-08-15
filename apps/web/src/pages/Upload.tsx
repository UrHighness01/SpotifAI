import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { ApiArtist } from "../types";

export function Upload() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [artistId, setArtistId] = useState("");
  const [newArtistName, setNewArtistName] = useState("");
  const [title, setTitle] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    api.artists().then((d) => setArtists(d.artists));
  }, []);

  if (!user) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (!audio) {
      setError("Choose an audio file");
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
      formData.append("title", title);
      formData.append("artistId", finalArtistId);
      formData.append("aiModel", aiModel);
      if (aiPrompt) formData.append("aiPrompt", aiPrompt);
      formData.append("audio", audio);
      if (cover) formData.append("cover", cover);

      await api.upload(formData);
      setStatus("Track uploaded!");
      setTitle("");
      setAiPrompt("");
      setAudio(null);
      setCover(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="upload-page">
      <h1 className="section-title">Upload an AI track</h1>
      <form className="upload-form" onSubmit={onSubmit}>
        {error && <div className="auth-error">{error}</div>}
        {status && <div className="auth-status">{status}</div>}

        <label>
          Track title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label>
          Artist
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
          AI model (e.g. Suno v4, Udio)
          <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} required />
        </label>

        <label>
          AI prompt (optional)
          <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} />
        </label>

        <label>
          Audio file
          <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} required />
        </label>

        <label>
          Cover art (optional)
          <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
        </label>

        <button type="submit" className="btn-primary">
          Upload
        </button>
      </form>
    </div>
  );
}
