import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../store/player";
import { api, mediaUrl } from "../api";
import { clampText } from "../utils/text";
import { LikeButton } from "./LikeButton";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Parses 'mood:dark,hypnotic energy:low,mid' into small chip spans.
function TagChips({ line }: { line: string }) {
  const chips: string[] = [];
  for (const part of line.split(" ")) {
    const [label, values] = part.split(":");
    if (!values) continue;
    for (const v of values.split(",")) {
      if (v) chips.push(`${label}: ${v}`);
    }
  }
  return (
    <div className="nano-tags">
      {chips.map((c) => (
        <span key={c} className="nano-tag">
          {c}
        </span>
      ))}
    </div>
  );
}

export function PlayerBar() {
  const { queue, currentIndex, isPlaying, togglePlay, next, prev, setPlaying } = usePlayerStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [nanoBlurb, setNanoBlurb] = useState<string | null>(null);
  const [nanoTags, setNanoTags] = useState<string | null>(null);

  const track = currentIndex >= 0 ? queue[currentIndex] : null;

  // Nano on-device blurb + mood/energy tags for the current track (John's
  // next-ideas #5 + #4): the generated "what this is" line and offline
  // vibe tags in the player, desktop-only, graceful.
  useEffect(() => {
    setNanoBlurb(null);
    setNanoTags(null);
    const desktop = window.spotifaiDesktop;
    if (desktop?.nanoDescribe && desktop?.nanoTags && track) {
      desktop
        .nanoDescribe({ title: track.title, aiModel: track.aiModel, genre: track.album?.title, prompt: track.aiPrompt })
        .then((res) => {
          if (res.ok && res.blurb) setNanoBlurb(res.blurb);
        })
        .catch(() => {});
      desktop
        .nanoTags({ title: track.title, aiModel: track.aiModel, genre: track.album?.title, prompt: track.aiPrompt })
        .then((res) => {
          if (res.ok && res.tags) setNanoTags(res.tags);
        })
        .catch(() => {});
    }
  }, [track?.id]);

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
          <div className="player-meta-row">
            <div>
              <div className="title">{track.title}</div>
              <div className="artist">{track.artist?.name}</div>
            </div>
            {/* Like (heart) button in the player — the user's ask: like the
                playing track straight from the player. */}
            <LikeButton trackId={track.id} className="like-btn-in-player" />
          </div>
          {/* Provenance badge at the point of play (slice 73): the honest
              label rendered where the listener encounters it — the capstone
              made felt. signature-confirmed (independently validated),
              recorded (fingerprinted), or none. */}
          {track.provenanceStatus && (
            <span className={`rights-badge provenance ${track.provenanceStatus}`}>
              {track.provenanceStatus === "signature-matched" ? "✓ signature-confirmed" : track.provenanceStatus.replace(/-/g, " ")}
            </span>
          )}
          {/* Prompt-echo (John's next-ideas #1): the platform's pitch is
              honesty — make the actual generation prompt the hero of the
              listening experience, live in the player. */}
          {track.aiPrompt && (
            <div className="prompt-echo" title={track.aiPrompt}>
              <span className="prompt-echo-label">{track.aiModel}:</span> “{clampText(track.aiPrompt, 120)}”
            </div>
          )}
          {/* Nano on-device blurb (John's next-ideas #5): the generated
              "what this is" line, desktop-only, honest counterpoint to the
              cold prompt text. */}
          {nanoBlurb && <div className="prompt-echo">{nanoBlurb}</div>}
          {/* Offline mood/energy tags (John's next-ideas #4): parsed from
              the engine's 'mood:... energy:...' output, shown as chips. */}
          {nanoTags && <TagChips line={nanoTags} />}
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
