'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Eye, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏', '😢'];

export default function StatusViewer({
  group,
  currentUser,
  onClose,
  onDeleted,
  onViewed,
}) {
  const router = useRouter();
  const items = group?.items || [];
  const isMine = group?.user?.id === currentUser?.id;

  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const videoRef = useRef(null);

  const current = items[idx];

  // Tandai status sudah dilihat & muat daftar penonton jika status sendiri
  useEffect(() => {
    if (!current?.id || !currentUser?.id) return;
    setProgress(0);

    if (!isMine) {
      supabase
        .from('status_views')
        .upsert(
          { status_id: current.id, viewer_id: currentUser.id, viewed_at: new Date().toISOString() },
          { onConflict: 'status_id,viewer_id' }
        )
        .then(() => onViewed?.());
    } else {
      supabase
        .from('status_views')
        .select('viewer_id, viewed_at')
        .eq('status_id', current.id)
        .order('viewed_at', { ascending: false })
        .then(async ({ data }) => {
          const rows = data || [];
          if (rows.length === 0) {
            setViewers([]);
            return;
          }
          const ids = rows.map((r) => r.viewer_id);
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', ids);
          const pMap = {};
          (profs || []).forEach((p) => {
            pMap[p.id] = p;
          });
          setViewers(rows.map((r) => ({ ...r, profile: pMap[r.viewer_id] || {} })));
        });
    }
  }, [current?.id, currentUser?.id, isMine, onViewed]);

  // Timer progres otomatis (5 detik untuk foto/teks, durasi video untuk video)
  useEffect(() => {
    if (!current || paused || showViewersSheet) return;
    if (current.media_type === 'video') return;

    const durationMs = 5000;
    const stepMs = 50;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (stepMs / durationMs) * 100;
        if (next >= 100) {
          clearInterval(timer);
          if (idx < items.length - 1) setIdx((i) => i + 1);
          else onClose?.();
          return 100;
        }
        return next;
      });
    }, stepMs);

    return () => clearInterval(timer);
  }, [current, paused, showViewersSheet, idx, items.length, onClose]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || showViewersSheet) v.pause();
    else v.play().catch(() => {});
  }, [paused, showViewersSheet, idx]);

  if (!current) return null;

  const goPrev = () => {
    if (idx > 0) setIdx((i) => i - 1);
    else setProgress(0);
  };

  const goNext = () => {
    if (idx < items.length - 1) setIdx((i) => i + 1);
    else onClose?.();
  };

  const sendStatusReply = async (textToSend) => {
    const msgText = String(textToSend || '').trim();
    if (!msgText || sendingReply || isMine || !group?.user?.id) return;
    setSendingReply(true);
    try {
      const { data: roomId, error: rErr } = await supabase.rpc('get_or_create_direct_room', {
        target_user_id: group.user.id,
      });
      if (rErr) throw rErr;

      const label = current.caption ? `"${current.caption.slice(0, 40)}"` : 'Status';
      await supabase.from('messages').insert({
        room_id: roomId,
        sender_id: currentUser.id,
        content: `Membalas Status (${label}): ${msgText}`,
      });
      setReplyText('');
      onClose?.();
      router.push(`/chat/${roomId}`);
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!isMine) return;
    await supabase.from('statuses').delete().eq('id', current.id);
    onDeleted?.();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[75] bg-black text-white flex flex-col justify-between select-none">
      {/* Progress Bars + Header */}
      <div className="px-3 pt-3 pb-4 bg-gradient-to-b from-black/80 to-transparent z-20 space-y-2.5">
        <div className="flex items-center gap-1">
          {items.map((it, i) => (
            <div key={it.id} className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden">
              <div
                style={{
                  width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%',
                }}
                className="h-full bg-white transition-all duration-75"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              src={group.user.avatar_url}
              name={group.user.display_name || group.user.username}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">
                {isMine ? 'Status Saya' : group.user.display_name || group.user.username}
              </p>
              <p className="text-[10px] text-zinc-300">
                {new Date(current.created_at).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isMine && (
              <button
                type="button"
                onClick={handleDeleteCurrent}
                className="p-2 rounded-full bg-white/15 hover:bg-red-600"
                title="Hapus Status"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/15">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tap Left/Right + Hold to Pause */}
      <div
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        style={current.media_type === 'text' ? { backgroundImage: current.bg_style } : undefined}
        className="relative flex-1 flex items-center justify-center overflow-hidden"
      >
        <button
          type="button"
          onClick={goPrev}
          aria-label="Sebelumnya"
          className="absolute inset-y-0 left-0 w-1/3 z-10"
        />
        <button
          type="button"
          onClick={goNext}
          aria-label="Berikutnya"
          className="absolute inset-y-0 right-0 w-2/3 z-10"
        />

        {current.media_type === 'text' ? (
          <p className="px-6 text-center text-2xl font-bold leading-relaxed whitespace-pre-wrap">
            {current.caption}
          </p>
        ) : current.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={current.media_url}
            autoPlay
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgress((v.currentTime / v.duration) * 100);
            }}
            onEnded={goNext}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <img
            src={current.media_url}
            alt="Status"
            className="max-h-full max-w-full object-contain"
          />
        )}

        {current.media_type !== 'text' && current.caption && (
          <div className="absolute bottom-4 inset-x-4 text-center z-10 pointer-events-none">
            <span className="inline-block px-3.5 py-2 rounded-2xl bg-black/65 text-xs font-medium">
              {current.caption}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Daftar Penonton (Status Sendiri) ATAU Balas & Reaksi Cepat (Status Teman) */}
      <div className="p-4 bg-gradient-to-t from-black/90 to-transparent z-20">
        {isMine ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowViewersSheet((v) => !v)}
              className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-2"
            >
              <Eye className="w-4 h-4" /> Dilihat oleh {viewers.length} orang
            </button>
          </div>
        ) : (
          <div className="max-w-lg mx-auto space-y-2.5">
            <div className="flex items-center justify-center gap-2">
              {QUICK_REACTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => sendStatusReply(em)}
                  className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/30 text-lg flex items-center justify-center"
                >
                  {em}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendStatusReply(replyText);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={replyText}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Balas status ini..."
                className="flex-1 px-4 py-2.5 rounded-full bg-white/15 text-white placeholder-white/60 text-xs focus:outline-none"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="p-2.5 rounded-full bg-blue-600 text-white disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Sheet Daftar Penonton */}
      {isMine && showViewersSheet && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-5 max-h-[55vh] overflow-y-auto space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-blue-400" /> Penonton Status ({viewers.length})
            </p>
            <button type="button" onClick={() => setShowViewersSheet(false)} className="p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          {viewers.length === 0 ? (
            <p className="text-xs text-zinc-400 py-4 text-center">Belum ada yang melihat status ini.</p>
          ) : (
            viewers.map((v) => (
              <div key={v.viewer_id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={v.profile?.avatar_url}
                    name={v.profile?.display_name || v.profile?.username}
                    size="xs"
                  />
                  <div>
                    <p className="text-xs font-semibold">
                      {v.profile?.display_name || v.profile?.username}
                    </p>
                    <p className="text-[10px] text-zinc-400">@{v.profile?.username}</p>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-400">
                  {new Date(v.viewed_at).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
