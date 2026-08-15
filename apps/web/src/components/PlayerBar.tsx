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

// Clean speaker SVG — swaps between muted / low / high wave states so the
// icon actually mirrors the volume level (replaces the raw 🔊 emoji).
function VolumeIcon({ level, muted }: { level: number; muted: boolean }) {
  const waves = muted || level === 0 ? 0 : level < 0.5 ? 1 : 2;
  return (
    <svg
      className="vol-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {waves >= 1 && <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
      {waves >= 2 && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
      {waves === 0 && <path d="M15.5 9.5l5 5m0-5l-5 5" />}
    </svg>
  );
}

// Transport icons — clean SVGs instead of emoji glyphs (⏮⏭ had uneven
// baseline alignment, making the row look off-center; user-reported).
const SkipBackIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M6 6h2v12H6zM20 6v12L9.5 12z" />
  </svg>
);
const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M16 6h2v12h-2zM4 6v12l10.5-6z" />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

export function PlayerBar() {
  const { queue, currentIndex, isPlaying, togglePlay, next, prev, setPlaying } = usePlayerStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [nanoBlurb, setNanoBlurb] = useState<string | null>(null);
  const [nanoTags, setNanoTags] = useState<string | null>(null);

  const track = currentIndex >= 0 ? queue[currentIndex] : null;

  // Nano on-device blurb + mood/energy tags for the current track (John's
  // next-ideas #5 + #4): the generated "what this is" line and offline
  // vibe tags in the player, desktop-only, graceful. The blurb is skipped
  // when the generator wasn't disclosed — the tiny model fabricates a
  // "made with X" description from nothing (user-reported wrong info), so
  // no blurb is more honest than a hallucinated one. Tags are a
  // deterministic keyword classifier; when no keyword matched, the engine
  // returns the default fallback 'mood:neutral energy:mid' — that's "no
  // signal", so the chips are hidden rather than claiming a vibe the
  // classifier couldn't detect (user asked: make smarter or hide).
  useEffect(() => {
    setNanoBlurb(null);
    setNanoTags(null);
    const desktop = window.spotifaiDesktop;
    if (desktop?.nanoDescribe && desktop?.nanoTags && track) {
      const model = (track.aiModel || "").trim().toLowerCase();
      const disclosed = model && model !== "unknown";
      if (disclosed) {
        desktop
          .nanoDescribe({ title: track.title, aiModel: track.aiModel, genre: track.album?.title, prompt: track.aiPrompt })
          .then((res) => {
            if (res.ok && res.blurb) setNanoBlurb(res.blurb);
          })
          .catch(() => {});
      }
      desktop
        .nanoTags({ title: track.title, aiModel: track.aiModel, genre: track.album?.title, prompt: track.aiPrompt })
        .then((res) => {
          // Engine's "nothing matched" fallback — hide the chips entirely.
          if (res.ok && res.tags && !res.tags.includes("mood:neutral energy:mid")) setNanoTags(res.tags);
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
    if (audio) audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const toggleMute = () => setMuted((m) => !m);

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
          <button onClick={prev} disabled={currentIndex <= 0} aria-label="Previous" title="Previous">
            <SkipBackIcon />
          </button>
          <button className="play-btn" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={next} disabled={currentIndex >= queue.length - 1} aria-label="Next" title="Next">
            <SkipForwardIcon />
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
        <button
          className="vol-mute-btn"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          title={muted ? "Unmute" : "Mute"}
        >
          <VolumeIcon level={volume} muted={muted} />
        </button>
        <input
          type="range"
          className="vol-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            setVolume(Number(e.target.value));
            if (muted && Number(e.target.value) > 0) setMuted(false);
          }}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
