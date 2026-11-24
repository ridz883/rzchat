'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Search, LogOut, Loader2, MessageCircle } from 'lucide-react';

export default function InboxPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [chats, setChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);

  const loadInbox = useCallback(async (userId) => {
    const { data: memberships } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }

    const roomIds = memberships.map((m) => m.room_id);

    const [{ data: rooms }, { data: allMembers }, { data: recentMsgs }] = await Promise.all([
      supabase.from('rooms').select('*').in('id', roomIds).order('updated_at', { ascending: false }),
      supabase.from('room_members').select('room_id, user_id, profiles(*)').in('room_id', roomIds),
      supabase.from('messages').select('*').in('room_id', roomIds).order('created_at', { ascending: false }).limit(100),
    ]);

    const formatted = (rooms || []).map((room) => {
      const otherMember = (allMembers || []).find(
        (m) => m.room_id === room.id && m.user_id !== userId
      );
      const lastMsg = (recentMsgs || []).find((msg) => msg.room_id === room.id);

      return {
        roomId: room.id,
        updatedAt: room.updated_at,
        otherUser: otherMember?.profiles || { display_name: 'Pengguna', username: 'unknown' },
        lastMessage: lastMsg || null,
      };
    });

    setChats(formatted);
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      setCurrentUser(user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setMyProfile(profile);

      await loadInbox(user.id);

      channel = supabase
        .channel('inbox-updates')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          () => {
            loadInbox(user.id);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [router, loadInbox]);

  useEffect(() => {
    const clean = searchQuery.replace(/^@/, '').trim().toLowerCase();
    if (clean.length < 2 || !currentUser) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${clean}%`)
        .neq('id', currentUser.id)
        .limit(8);

      setSearchResults(data || []);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUser]);

  const handleStartChat = async (targetUserId) => {
    if (startingChat) return;
    setStartingChat(true);
    try {
      const { data: roomId, error } = await supabase.rpc('get_or_create_direct_room', {
        target_user_id: targetUserId,
      });
      if (error) throw error;
      router.push(`/chat/${roomId}`);
    } catch (err) {
      alert('Gagal membuka obrolan: ' + err.message);
      setStartingChat(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredChats = chats.filter((c) => {
    const q = searchQuery.replace(/^@/, '').toLowerCase();
    return (
      c.otherUser.display_name.toLowerCase().includes(q) ||
      c.otherUser.username.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-[#09090B]">
        <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex bg-[#09090B] text-zinc-100">
      {/* Panel Kiri (Full di Mobile, 360px di Desktop) */}
      <div className="w-full md:w-[360px] md:border-r border-zinc-800 flex flex-col h-full">
        {/* Top Header */}
        <header className="px-4 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-[#09090B]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#2563EB] flex items-center justify-center font-bold text-sm">
              {myProfile?.display_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">{myProfile?.display_name}</h1>
              <p className="text-[11px] font-mono text-zinc-400">@{myProfile?.username}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        {/* Universal Search Bar */}
        <div className="p-3 border-b border-zinc-800/70">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari obrolan atau @username baru..."
              className="w-full bg-[#18181B] border border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>

        {/* List Hasil Pencarian User Baru */}
        {searchQuery.trim().length >= 2 && (
          <div className="border-b border-zinc-800 bg-zinc-900/40">
            <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Pengguna Ditemukan
            </p>
            {searchResults.length === 0 ? (
              <p className="px-4 py-3 text-xs text-zinc-500">Tidak ada user dengan username tersebut.</p>
            ) : (
              searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleStartChat(user.id)}
                  disabled={startingChat}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-800/60 transition text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-semibold text-sm shrink-0">
                    {user.display_name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{user.display_name}</p>
                    <p className="text-xs font-mono text-blue-400">@{user.username}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Daftar Percakapan (Inbox) */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
          {filteredChats.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <MessageCircle className="w-10 h-10 text-zinc-700 mb-2" />
              <p className="text-sm font-medium text-zinc-400">Belum ada obrolan</p>
              <p className="text-xs text-zinc-500 mt-1">
                Ketik <span className="font-mono text-zinc-300">@username</span> temanmu di kolom atas untuk mulai chat.
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.roomId}
                onClick={() => router.push(`/chat/${chat.roomId}`)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#18181B] transition text-left"
              >
                <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-sm shrink-0">
                  {chat.otherUser.display_name[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{chat.otherUser.display_name}</p>
                    <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                      {formatTime(chat.lastMessage?.created_at || chat.updatedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {chat.lastMessage
                      ? `${chat.lastMessage.sender_id === currentUser?.id ? 'Kamu: ' : ''}${chat.lastMessage.content}`
                      : 'Mulai kirim pesan...'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Panel Kanan (Khusus Desktop) */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center text-zinc-500 p-6">
        <div className="w-14 h-14 rounded-2xl bg-[#18181B] border border-zinc-800 flex items-center justify-center mb-3">
          <MessageCircle className="w-7 h-7 text-zinc-600" />
        </div>
        <p className="text-sm font-medium text-zinc-300">Pilih obrolan untuk mulai mengirim pesan</p>
        <p className="text-xs text-zinc-500 mt-1">Atau cari @username baru di panel sebelah kiri</p>
      </div>
    </div>
  );
}
