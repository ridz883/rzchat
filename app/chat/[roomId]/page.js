'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/useTheme';
import Avatar from '../../../components/Avatar';

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
  const bottomRef = useRef(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    if (!roomId) return;
    let channel;
    let authSub;

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

      // Sinkronkan sesi jika berubah
      const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession) {
          router.replace('/login');
        } else {
          setCurrentUser(newSession.user);
        }
      });
      authSub = listener?.subscription;

      // Ambil profil lengkap lawan bicara
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
        .select('id, room_id, sender_id, content, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      setMessages(initialMsgs || []);
      setLoading(false);
      scrollToBottom();

      // Subscribe Realtime pesan masuk
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
          }
        )
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (authSub) authSub.unsubscribe();
    };
  }, [roomId, router]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content || !currentUser || sending) return;

    setSending(true);
    setText('');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        sender_id: currentUser.id,
        content,
      })
      .select('id, room_id, sender_id, content, created_at')
      .single();

    if (!error && data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      scrollToBottom();
    } else if (error) {
      setText(content);
      alert('Gagal mengirim pesan: ' + error.message);
    }

    setSending(false);
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
      {/* Header Chat (Klik nama/foto untuk lihat profil lawan bicara) */}
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
                  className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm break-words shadow-xs ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : isDark
                        ? 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                        : 'bg-white text-zinc-900 border border-zinc-200 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1 text-right ${
                      isMine ? 'text-blue-100' : isDark ? 'text-zinc-400' : 'text-zinc-400'
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input Pesan */}
      <form
        onSubmit={handleSend}
        className={`p-2.5 border-t flex items-end gap-2 shrink-0 ${
          isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tulis pesan..."
          className={`flex-1 rounded-xl px-3.5 py-2.5 text-sm border resize-none max-h-28 focus:outline-none ${
            isDark
              ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-400 focus:border-blue-500'
              : 'bg-zinc-100 border-zinc-300 text-zinc-900 placeholder-zinc-500 focus:border-blue-600 focus:bg-white'
          }`}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>

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

            <div className={`space-y-3 pt-4 border-t text-sm ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                <div>
                  <p className={`text-[11px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
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
                    <p className={`text-[11px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
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
                    <p className={`text-[11px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
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
