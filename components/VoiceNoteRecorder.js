'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, Trash2, Send, Loader2 } from 'lucide-react';

function fmtSec(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export default function VoiceNoteRecorder({ isDark, uploading, onSendBlob, onCancel }) {
  const [phase, setPhase] = useState('recording'); // 'recording' | 'paused' | 'preview'
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState(() => Array(24).fill(14));
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animRef = useRef(null);
  const timerRef = useRef(null);
  const previewAudioRef = useRef(null);

  const stopTracksAndAudioCtx = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

        const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorderRef.current = mr;
        chunksRef.current = [];

        mr.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
        };

        mr.onstop = () => {
          const finalBlob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
          blobRef.current = finalBlob;
          const url = URL.createObjectURL(finalBlob);
          setPreviewUrl(url);
          setPhase('preview');
        };

        // Visualisasi waveform realtime
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);
          const dataArr = new Uint8Array(analyser.frequencyBinCount);

          const tickWave = () => {
            if (recorderRef.current?.state === 'recording') {
              analyser.getByteFrequencyData(dataArr);
              const nextBars = [];
              for (let i = 0; i < 24; i++) {
                const v = dataArr[i % dataArr.length] || 0;
                nextBars.push(Math.max(12, Math.min(100, Math.round((v / 255) * 100))));
              }
              setBars(nextBars);
            }
            animRef.current = requestAnimationFrame(tickWave);
          };
          tickWave();
        }

        mr.start(200);
        timerRef.current = setInterval(() => {
          if (recorderRef.current?.state === 'recording') {
            setSeconds((s) => s + 1);
          }
        }, 1000);
      } catch {
        alert('Izin mikrofon ditolak atau tidak tersedia.');
        onCancel?.();
      }
    };

    boot();

    return () => {
      cancelled = true;
      stopTracksAndAudioCtx();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePauseResume = () => {
    const mr = recorderRef.current;
    if (!mr) return;
    if (mr.state === 'recording' && mr.pause) {
      mr.pause();
      setPhase('paused');
    } else if (mr.state === 'paused' && mr.resume) {
      mr.resume();
      setPhase('recording');
    }
  };

  const handleFinishToPreview = () => {
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    }
    stopTracksAndAudioCtx();
  };

  const handleDiscard = () => {
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.onstop = null;
      mr.stop();
    }
    stopTracksAndAudioCtx();
    onCancel?.();
  };

  const togglePreviewPlay = () => {
    const el = previewAudioRef.current;
    if (!el) return;
    if (previewPlaying) {
      el.pause();
      setPreviewPlaying(false);
    } else {
      el.play().then(() => setPreviewPlaying(true)).catch(() => {});
    }
  };

  const handleSend = () => {
    if (blobRef.current) {
      onSendBlob?.(blobRef.current);
      return;
    }
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        onSendBlob?.(finalBlob);
      };
      mr.stop();
      stopTracksAndAudioCtx();
    }
  };

  return (
    <div
      className={`px-3 py-2.5 border-t flex items-center gap-2 shrink-0 ${
        isDark ? 'bg-[#121215] border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      <button
        type="button"
        onClick={handleDiscard}
        disabled={uploading}
        title="Hapus rekaman"
        className="p-2.5 rounded-xl bg-red-500/15 text-red-500 hover:bg-red-500/25 shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {phase !== 'preview' ? (
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                phase === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="text-xs font-bold tabular-nums">{fmtSec(seconds)}</span>
          </div>

          {/* Waveform Bars */}
          <div className="flex-1 h-8 flex items-center justify-center gap-[2px] px-1 overflow-hidden">
            {bars.map((h, i) => (
              <span
                key={i}
                style={{ height: `${phase === 'paused' ? 18 : h}%` }}
                className="w-1 rounded-full bg-blue-500 transition-all duration-100"
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handlePauseResume}
            title={phase === 'recording' ? 'Jeda rekaman' : 'Lanjut rekam'}
            className={`p-2 rounded-xl border shrink-0 ${
              isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
          >
            {phase === 'recording' ? <Pause className="w-4 h-4" /> : <Mic className="w-4 h-4 text-red-500" />}
          </button>

          <button
            type="button"
            onClick={handleFinishToPreview}
            title="Selesai & Dengar Ulang"
            className={`p-2 rounded-xl border shrink-0 ${
              isDark ? 'bg-zinc-900 border-zinc-700 text-amber-400' : 'bg-zinc-100 border-zinc-300 text-amber-600'
            }`}
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        </>
      ) : (
        <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/30">
          <audio
            ref={previewAudioRef}
            src={previewUrl}
            onEnded={() => setPreviewPlaying(false)}
            className="hidden"
          />
          <button
            type="button"
            onClick={togglePreviewPlay}
            className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"
          >
            {previewPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold truncate">Pratinjau Voice Note</p>
            <p className="text-[10px] text-zinc-400 tabular-nums">Durasi {fmtSec(seconds)}</p>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={uploading}
        onClick={handleSend}
        title="Kirim Voice Note"
        className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white shrink-0"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
}
