import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../store/player";
import { api, mediaUrl } from "../api";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const { queue, currentIndex, isPlaying, togglePlay, next, prev, setPlaying } = usePlayerStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const track = currentIndex >= 0 ? queue[currentIndex] : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.src = api.streamUrl(track.id);
    setCurrentTime(0);
    if (isPlaying) audio.play().catch(() => {});
  }, [track?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  if (!track) {
    return (
      <div className="player-bar">
        <div className="player-now-playing">
          <div className="art" />
          <div className="meta">
            <div className="title" style={{ color: "var(--text-dim)" }}>
              Nothing playing
            </div>
          </div>
        </div>
        <div />
        <div />
      </div>
    );
  }

  return (
    <div className="player-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false);
          next();
        }}
      />
      <div className="player-now-playing">
        {track.album?.coverPath ? (
          <img className="art" src={mediaUrl(track.album.coverPath)!} alt={track.title} />
        ) : (
          <div className="art" />
        )}
        <div className="meta">
          <div className="title">{track.title}</div>
          <div className="artist">{track.artist?.name}</div>
          {/* Prompt-echo (John's next-ideas #1): the platform's pitch is
              honesty — make the actual generation prompt the hero of the
              listening experience, live in the player. */}
          {track.aiPrompt && (
            <div className="prompt-echo" title={track.aiPrompt}>
              <span className="prompt-echo-label">{track.aiModel}:</span> “{track.aiPrompt}”
            </div>
          )}
        </div>
      </div>

      <div className="player-center">
        <div className="transport-controls">
          <button onClick={prev} disabled={currentIndex <= 0} aria-label="Previous">
            ⏮
          </button>
          <button className="play-btn" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button onClick={next} disabled={currentIndex >= queue.length - 1} aria-label="Next">
            ⏭
          </button>
        </div>
        <div className="seek-row">
          <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (audioRef.current) audioRef.current.currentTime = t;
              setCurrentTime(t);
            }}
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-volume">
        <span style={{ fontSize: "0.9rem" }}>🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
