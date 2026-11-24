'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Sun, Moon, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/useTheme';

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
  const bottomRef = useRef(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    if (!roomId) return;
    let channel;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const authUser = session.user;
      setCurrentUser(authUser);

      // Ambil profil lawan bicara
      const { data: otherMember } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId)
        .neq('user_id', authUser.id)
        .maybeSingle();

      if (otherMember?.user_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, username, display_name')
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
      <div className={`h-screen flex items-center justify-center ${isDark ? 'bg-[#09090B]' : 'bg-white'}`}>
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className={`h-[100dvh] flex flex-col max-w-lg mx-auto border-x transition-colors ${isDark ? 'bg-[#09090B] text-zinc-100 border-zinc-800' : 'bg-zinc-50 text-zinc-900 border-zinc-200'}`}>
      {/* Header Chat */}
      <header className={`px-3 py-3 border-b flex items-center justify-between shrink-0 ${isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => router.push('/')}
            className={`p-2 rounded-xl transition ${isDark ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-zinc-100 text-zinc-700'}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
            {(otherUser?.display_name || otherUser?.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">
              {otherUser?.display_name || otherUser?.username || 'Obrolan'}
            </p>
            <p className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              @{otherUser?.username || ''}
            </p>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          title="Ganti Tema"
          className={`p-2 rounded-xl border transition shrink-0 ${isDark ? 'bg-zinc-900 border-zinc-700 text-amber-400' : 'bg-zinc-100 border-zinc-200 text-zinc-700'}`}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Area Pesan */}
      <main className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className={`text-xs px-4 py-2 rounded-full ${isDark ? 'bg-zinc-900 text-zinc-400' : 'bg-zinc-200/70 text-zinc-600'}`}>
              Belum ada pesan. Sapa duluan yuk!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === currentUser?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm break-words shadow-xs ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : isDark
                        ? 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                        : 'bg-white text-zinc-900 border border-zinc-200 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-[10px] mt-1 text-right ${isMine ? 'text-blue-100' : isDark ? 'text-zinc-400' : 'text-zinc-400'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
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
        className={`p-2.5 border-t flex items-end gap-2 shrink-0 ${isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'}`}
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
    </div>
  );
}

export default function ChatRoomPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-zinc-500 text-sm">Memuat obrolan...</div>}>
      <ChatRoomContent />
    </Suspense>
  );
}
