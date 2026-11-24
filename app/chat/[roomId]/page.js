'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Send, Plus, Loader2, Check, Clock } from 'lucide-react';

export default function ChatRoomPage() {
  const router = useRouter();
  const { roomId } = useParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (!roomId) return;
    let channel;

    const initRoom = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      setCurrentUser(user);

      // Ambil profil lawan bicara
      const { data: members } = await supabase
        .from('room_members')
        .select('user_id, profiles(*)')
        .eq('room_id', roomId);

      const opponent = (members || []).find((m) => m.user_id !== user.id);
      if (opponent?.profiles) {
        setOtherUser(opponent.profiles);
      }

      // Ambil 50 pesan terakhir
      const { data: initialMsgs } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(50);

      setMessages((initialMsgs || []).reverse());
      setLoading(false);
      setTimeout(() => scrollToBottom(false), 50);

      // Subscribe pesan baru secara realtime
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

              // Ganti pesan optimistic (pending) milik sendiri dengan data asli dari server
              if (newMsg.sender_id === user.id) {
                const pendingIdx = prev.findIndex((m) => m.pending && m.content === newMsg.content);
                if (pendingIdx !== -1) {
                  const copy = [...prev];
                  copy[pendingIdx] = newMsg;
                  return copy;
                }
              }
              return [...prev, newMsg];
            });
            setTimeout(() => scrollToBottom(true), 50);
          }
        )
        .subscribe();
    };

    initRoom();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, router]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content || !currentUser) return;

    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Optimistic UI: langsung tampil di layar
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      room_id: roomId,
      sender_id: currentUser.id,
      content,
      type: 'text',
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 30);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        sender_id: currentUser.id,
        content,
        type: 'text',
      })
      .select()
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert('Gagal mengirim pesan: ' + error.message);
      return;
    }

    if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) {
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? data : m));
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputResize = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
  };

  const formatTime = (iso) => {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-[#09090B]">
        <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#09090B] text-zinc-100 max-w-3xl mx-auto md:border-x border-zinc-800">
      {/* Sticky Header */}
      <header className="px-3 py-2.5 border-b border-zinc-800 bg-[#09090B]/90 backdrop-blur-md flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push('/')}
          className="p-2 rounded-xl hover:bg-zinc-900 text-zinc-300 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-sm shrink-0">
          {otherUser?.display_name?.[0]?.toUpperCase() || '?'}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold truncate">{otherUser?.display_name || 'Obrolan'}</h2>
          <p className="text-[11px] font-mono text-zinc-400 truncate">@{otherUser?.username || '...'}</p>
        </div>
      </header>

      {/* Message Feed */}
      <main className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-zinc-500 bg-[#18181B] border border-zinc-800 px-3.5 py-2 rounded-full">
              Belum ada pesan. Sapa duluan!
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUser?.id;
            const prevMsg = messages[idx - 1];
            const isGrouped =
              prevMsg &&
              prevMsg.sender_id === msg.sender_id &&
              new Date(msg.created_at) - new Date(prevMsg.created_at) < 120000;

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${
                  isGrouped ? 'mt-0.5' : 'mt-3'
                }`}
              >
                <div
                  className={`max-w-[78%] px-3.5 py-2 text-sm leading-relaxed break-words transition-opacity ${
                    msg.pending ? 'opacity-70' : 'opacity-100'
                  } ${
                    isMe
                      ? 'bg-[#2563EB] text-white rounded-2xl rounded-br-sm'
                      : 'bg-[#27272A] text-zinc-100 rounded-2xl rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-mono ${
                      isMe ? 'text-blue-200' : 'text-zinc-400'
                    }`}
                  >
                    <span>{formatTime(msg.created_at)}</span>
                    {isMe && (
                      msg.pending ? (
                        <Clock className="w-2.5 h-2.5" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </main>

      {/* Bottom Input Bar */}
      <form
        onSubmit={handleSend}
        className="p-2.5 border-t border-zinc-800 bg-[#09090B] flex items-end gap-2 shrink-0"
      >
        <button
          type="button"
          disabled
          title="Fitur kirim media hadir di Tahap 3"
          className="p-2.5 rounded-xl bg-[#18181B] border border-zinc-800 text-zinc-600 cursor-not-allowed shrink-0"
        >
          <Plus className="w-5 h-5" />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleInputResize}
          onKeyDown={handleKeyDown}
          placeholder="Tulis pesan..."
          className="flex-1 bg-[#18181B] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm resize-none max-h-28 focus:outline-none focus:border-[#2563EB]"
        />

        <button
          type="submit"
          disabled={!text.trim()}
          className="p-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
