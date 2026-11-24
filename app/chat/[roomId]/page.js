'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Sun,
  Moon,
  Loader2,
  X,
  MapPin,
  Info,
  Calendar,
  Check,
  CheckCheck,
  Mic,
  Paperclip,
  Trash2,
  Download,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/useTheme';
import Avatar from '../../../components/Avatar';

const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const getSupportedAudioMime = () => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return '';
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
};

function ChatRoomContent() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId;
  const { isDark, toggleTheme } = useTheme();

  const [currentUser, setCurrentUser] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // State media (foto/video)
  const [pendingMedia, setPendingMedia] = useState(null);
  const mediaInputRef = useRef(null);

  // State voice note
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const cancelVoiceRef = useRef(false);

  const bottomRef = useRef(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  const markAsRead = useCallback(async () => {
    if (!roomId) return;
    await supabase.rpc('mark_room_messages_read', { p_room_id: roomId });
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let channel;
    let authSub;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        markAsRead();
      }
    };

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const authUser = session.user;
      setCurrentUser(authUser);

      const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession) {
          router.replace('/login');
        } else {
          setCurrentUser(newSession.user);
        }
      });
      authSub = listener?.subscription;

      // Profil lawan bicara
      const { data: otherMember } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId)
        .neq('user_id', authUser.id)
        .maybeSingle();

      if (otherMember?.user_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, username, display_name, bio, status_text, location, avatar_url, created_at')
          .eq('id', otherMember.user_id)
          .maybeSingle();
        setOtherUser(prof || { username: 'pengguna', display_name: 'Pengguna' });
      }

      // Ambil riwayat pesan
      const { data: initialMsgs } = await supabase
        .from('messages')
        .select('id, room_id, sender_id, content, created_at, read_at, media_url, media_type')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      setMessages(initialMsgs || []);
      setLoading(false);
      scrollToBottom();

      // Tandai pesan dari lawan bicara sebagai sudah dibaca
      await markAsRead();

      // Realtime INSERT + UPDATE (pesan baru & status sudah dibaca)
      channel = supabase
        .channel(`room-${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            const newMsg = payload.new;
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            scrollToBottom();
            if (newMsg.sender_id !== authUser.id && document.visibilityState === 'visible') {
              markAsRead();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            const updated = payload.new;
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
            );
          }
        )
        .subscribe();

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleVisibility);
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (authSub) authSub.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [roomId, router, markAsRead]);

  // Pilih foto atau video
  const handleMediaSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('Ukuran file maksimal 25 MB.');
      return;
    }

    const type = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('image/')
        ? 'image'
        : null;

    if (!type) {
      alert('Hanya mendukung file foto atau video.');
      return;
    }

    if (pendingMedia?.previewUrl) {
      URL.revokeObjectURL(pendingMedia.previewUrl);
    }

    setPendingMedia({
      file,
      type,
      previewUrl: URL.createObjectURL(file),
    });
  };

  const clearPendingMedia = () => {
    if (pendingMedia?.previewUrl) {
      URL.revokeObjectURL(pendingMedia.previewUrl);
    }
    setPendingMedia(null);
  };

  // Kirim teks dan/atau foto/video
  const handleSend = async (e) => {
    e?.preventDefault();
    const content = text.trim();
    if ((!content && !pendingMedia) || !currentUser || sending) return;

    setSending(true);
    let uploadedUrl = '';
    let uploadedType = '';

    try {
      if (pendingMedia) {
        const ext = (pendingMedia.file.name.split('.').pop() || 'bin')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        const filePath = `${roomId}/${currentUser.id}-${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('chat-media')
          .upload(filePath, pendingMedia.file, {
            contentType: pendingMedia.file.type || undefined,
            upsert: false,
          });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
        uploadedUrl = urlData.publicUrl;
        uploadedType = pendingMedia.type;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          sender_id: currentUser.id,
          content,
          media_url: uploadedUrl,
          media_type: uploadedType,
        })
        .select('id, room_id, sender_id, content, created_at, read_at, media_url, media_type')
        .single();

      if (error) throw error;

      setText('');
      clearPendingMedia();

      if (data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });
        scrollToBottom();
      }
    } catch (err) {
      alert('Gagal mengirim: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setSending(false);
    }
  };

  // Mulai rekam Voice Note
  const startRecording = async () => {
    if (isRecording || uploadingVoice) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Browser ini tidak mendukung perekaman suara.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      cancelVoiceRef.current = false;

      const mimeType = getSupportedAudioMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setIsRecording(false);
        setRecordingSec(0);

        if (cancelVoiceRef.current || audioChunksRef.current.length === 0) {
          audioChunksRef.current = [];
          return;
        }

        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        audioChunksRef.current = [];

        if (blob.size < 100) return;

        setUploadingVoice(true);
        try {
          const ext = finalMime.includes('mp4')
            ? 'm4a'
            : finalMime.includes('ogg')
              ? 'ogg'
              : 'webm';
          const filePath = `${roomId}/${currentUser.id}-vn-${Date.now()}.${ext}`;

          const { error: upErr } = await supabase.storage
            .from('chat-media')
            .upload(filePath, blob, { contentType: finalMime, upsert: false });

          if (upErr) throw upErr;

          const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);

          const { data: msgData, error: msgErr } = await supabase
            .from('messages')
            .insert({
              room_id: roomId,
              sender_id: currentUser.id,
              content: '',
              media_url: urlData.publicUrl,
              media_type: 'audio',
            })
            .select('id, room_id, sender_id, content, created_at, read_at, media_url, media_type')
            .single();

          if (msgErr) throw msgErr;

          if (msgData) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msgData.id)) return prev;
              return [...prev, msgData];
            });
            scrollToBottom();
          }
        } catch (err) {
          alert('Gagal mengirim voice note: ' + (err.message || 'Error'));
        } finally {
          setUploadingVoice(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSec(0);
      timerRef.current = setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch (err) {
      alert('Izin mikrofon ditolak atau tidak tersedia.');
    }
  };

  const stopAndSendRecording = () => {
    cancelVoiceRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    cancelVoiceRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      setIsRecording(false);
      setRecordingSec(0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div
        className={`w-full h-[100dvh] flex items-center justify-center ${
          isDark ? 'bg-[#09090B]' : 'bg-white'
        }`}
      >
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div
      className={`w-full h-[100dvh] flex flex-col transition-colors ${
        isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      {/* Header Chat */}
      <header
        className={`px-3 py-2.5 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => router.push('/')}
            className={`p-2 rounded-xl transition shrink-0 ${
              isDark ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-zinc-100 text-zinc-700'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left py-0.5 rounded-xl"
          >
            <Avatar
              src={otherUser?.avatar_url}
              name={otherUser?.display_name || otherUser?.username}
              size="sm"
            />
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">
                {otherUser?.display_name || otherUser?.username || 'Obrolan'}
              </p>
              <p className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                @{otherUser?.username || ''} • Ketuk lihat profil
              </p>
            </div>
          </button>
        </div>

        <button
          onClick={toggleTheme}
          title="Ganti Tema"
          className={`p-2 rounded-xl border transition shrink-0 ml-2 ${
            isDark
              ? 'bg-zinc-900 border-zinc-700 text-amber-400'
              : 'bg-zinc-100 border-zinc-200 text-zinc-700'
          }`}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Area Pesan */}
      <main className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center">
            <p
              className={`text-xs px-4 py-2 rounded-full ${
                isDark ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-zinc-600 shadow-xs'
              }`}
            >
              Belum ada pesan. Sapa duluan yuk!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = Boolean(
              currentUser?.id && msg.sender_id && String(msg.sender_id) === String(currentUser.id)
            );
            const isRead = Boolean(msg.read_at);

            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                {!isMine && (
                  <Avatar
                    src={otherUser?.avatar_url}
                    name={otherUser?.display_name || otherUser?.username}
                    size="xs"
                    className="mb-0.5"
                  />
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm break-words shadow-xs ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : isDark
                        ? 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                        : 'bg-white text-zinc-900 border border-zinc-200 rounded-bl-sm'
                  }`}
                >
                  {/* Media: Foto */}
                  {msg.media_type === 'image' && msg.media_url && (
                    <button
                      type="button"
                      onClick={() => setLightboxImage(msg.media_url)}
                      className="block mb-1.5 overflow-hidden rounded-xl"
                    >
                      <img
                        src={msg.media_url}
                        alt="Foto"
                        className="max-h-64 w-auto max-w-full rounded-xl object-cover"
                      />
                    </button>
                  )}

                  {/* Media: Video */}
                  {msg.media_type === 'video' && msg.media_url && (
                    <video
                      src={msg.media_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-64 w-full rounded-xl bg-black mb-1.5"
                    />
                  )}

                  {/* Media: Voice Note */}
                  {msg.media_type === 'audio' && msg.media_url && (
                    <div className="min-w-[210px] py-0.5">
                      <audio
                        src={msg.media_url}
                        controls
                        preload="metadata"
                        className="w-full h-9"
                      />
                    </div>
                  )}

                  {/* Teks / Caption */}
                  {msg.content && (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  )}

                  {/* Jam & Tanda Baca (Ceklis 2 = Belum Dibaca, Ceklis 1 = Sudah Dibaca) */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isMine ? 'text-blue-100' : 'text-zinc-400'
                    }`}
                  >
                    <span>
                      {new Date(msg.created_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMine &&
                      (isRead ? (
                        <span title="Sudah dibaca" className="inline-flex items-center text-emerald-300">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span title="Belum dibaca" className="inline-flex items-center text-blue-200/80">
                          <CheckCheck className="w-3.5 h-3.5" />
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </main>

      {/* Preview Foto/Video sebelum dikirim */}
      {pendingMedia && (
        <div
          className={`px-3 py-2 border-t flex items-center justify-between gap-3 shrink-0 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {pendingMedia.type === 'image' ? (
              <img
                src={pendingMedia.previewUrl}
                alt="Preview"
                className="w-12 h-12 rounded-lg object-cover shrink-0 border border-black/10"
              />
            ) : (
              <video
                src={pendingMedia.previewUrl}
                className="w-12 h-12 rounded-lg object-cover shrink-0 bg-black"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{pendingMedia.file.name}</p>
              <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {pendingMedia.type === 'video' ? 'Video siap dikirim' : 'Foto siap dikirim'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearPendingMedia}
            className={`p-1.5 rounded-lg shrink-0 ${
              isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-600'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Bar / Voice Note Bar */}
      {isRecording ? (
        <div
          className={`p-2.5 border-t flex items-center justify-between gap-3 shrink-0 ${
            isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          <button
            type="button"
            onClick={cancelRecording}
            className="p-2.5 rounded-xl bg-red-500/15 text-red-500 hover:bg-red-500/25 transition"
            title="Batal Rekam"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-semibold tabular-nums">
              Merekam {formatDuration(recordingSec)}
            </span>
          </div>

          <button
            type="button"
            onClick={stopAndSendRecording}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-1.5 transition"
          >
            <Send className="w-4 h-4" /> Kirim
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          className={`p-2.5 border-t flex items-end gap-2 shrink-0 ${
            isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            disabled={sending || uploadingVoice}
            title="Kirim Foto atau Video"
            className={`p-2.5 rounded-xl border transition shrink-0 ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white'
                : 'bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              uploadingVoice
                ? 'Mengirim voice note...'
                : pendingMedia
                  ? 'Tambah keterangan (opsional)...'
                  : 'Tulis pesan...'
            }
            disabled={uploadingVoice}
            className={`flex-1 rounded-xl px-3.5 py-2.5 text-sm border resize-none max-h-28 focus:outline-none ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-400 focus:border-blue-500'
                : 'bg-zinc-100 border-zinc-300 text-zinc-900 placeholder-zinc-500 focus:border-blue-600 focus:bg-white'
            }`}
          />

          {text.trim() || pendingMedia ? (
            <button
              type="submit"
              disabled={sending}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition shrink-0"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={uploadingVoice}
              title="Rekam Voice Note"
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition shrink-0"
            >
              {uploadingVoice ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          )}
        </form>
      )}

      {/* Modal Fullscreen Foto */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <a
              href={lightboxImage}
              download
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <Download className="w-5 h-5" />
            </a>
            <button
              onClick={() => setLightboxImage(null)}
              className="p-2 rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={lightboxImage}
            alt="Foto penuh"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
          />
        </div>
      )}

      {/* Modal Lihat Profil Lawan Bicara */}
      {showProfileModal && otherUser && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowProfileModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-xl ${
              isDark ? 'bg-[#121215] text-zinc-100 border border-zinc-800' : 'bg-white text-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm">Info Pengguna</h2>
              <button
                onClick={() => setShowProfileModal(false)}
                className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center mb-5">
              <Avatar
                src={otherUser.avatar_url}
                name={otherUser.display_name || otherUser.username}
                size="xl"
              />
              <h3 className="font-bold text-lg mt-3">
                {otherUser.display_name || otherUser.username}
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                @{otherUser.username}
              </p>
              {otherUser.status_text && (
                <span
                  className={`mt-2 inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full ${
                    isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {otherUser.status_text}
                </span>
              )}
            </div>

            <div
              className={`space-y-3 pt-4 border-t text-sm ${
                isDark ? 'border-zinc-800' : 'border-zinc-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                <div>
                  <p
                    className={`text-[11px] font-medium ${
                      isDark ? 'text-zinc-400' : 'text-zinc-500'
                    }`}
                  >
                    Bio
                  </p>
                  <p className="text-sm">
                    {otherUser.bio ? otherUser.bio : 'Pengguna ini belum menambahkan bio.'}
                  </p>
                </div>
              </div>

              {otherUser.location && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <div>
                    <p
                      className={`text-[11px] font-medium ${
                        isDark ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      Lokasi
                    </p>
                    <p className="text-sm">{otherUser.location}</p>
                  </div>
                </div>
              )}

              {otherUser.created_at && (
                <div className="flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <div>
                    <p
                      className={`text-[11px] font-medium ${
                        isDark ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      Bergabung Sejak
                    </p>
                    <p className="text-sm">
                      {new Date(otherUser.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[100dvh] flex items-center justify-center text-zinc-500 text-sm">
          Memuat obrolan...
        </div>
      }
    >
      <ChatRoomContent />
    </Suspense>
  );
}
