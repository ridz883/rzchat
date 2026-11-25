'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

const SPEEDS = [1, 1.5, 2];

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function VoiceNotePlayer({ src, isMine, isDark }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const speed = SPEEDS[speedIdx];

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onLoaded = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };
    const onTime = () => {
      setCurrentTime(el.currentTime || 0);
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('durationchange', onLoaded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnded);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    return () => {
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('durationchange', onLoaded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, [src]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.playbackRate = speed;
      el.play().catch(() => {});
    }
  };

  const handleSeek = (e) => {
    const el = audioRef.current;
    const val = Number(e.target.value);
    if (el && Number.isFinite(val)) {
      el.currentTime = val;
      setCurrentTime(val);
    }
  };

  const cycleSpeed = () => {
    setSpeedIdx((idx) => (idx + 1) % SPEEDS.length);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2.5 min-w-[225px] max-w-[260px] py-1"
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${
          isMine
            ? 'bg-white text-blue-600'
            : 'bg-blue-600 text-white'
        }`}
        aria-label={playing ? 'Jeda voice note' : 'Putar voice note'}
      >
        {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          step={0.1}
          value={duration > 0 ? Math.min(currentTime, duration) : 0}
          onChange={handleSeek}
          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${
            isMine ? 'accent-white bg-white/30' : 'accent-blue-600 bg-zinc-400/35'
          }`}
        />
        <div
          className={`flex items-center justify-between text-[10px] mt-1 tabular-nums ${
            isMine ? 'text-blue-100' : isDark ? 'text-zinc-400' : 'text-zinc-500'
          }`}
        >
          <span>{fmtTime(currentTime)}</span>
          <span>{duration > 0 ? fmtTime(duration) : 'Voice Note'}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        title="Ubah kecepatan putar"
        className={`px-2 py-1 rounded-lg text-[11px] font-bold shrink-0 transition ${
          isMine
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : isDark
              ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100'
              : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
        }`}
      >
        {speed}x
      </button>
    </div>
  );
}
