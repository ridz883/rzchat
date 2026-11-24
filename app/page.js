'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, LogOut, MessageSquare, Sun, Moon, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/useTheme';

export default function HomePage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [openingRoomId, setOpeningRoomId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadRooms = useCallback(async (userId) => {
    const { data: myMembers } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId);

    if (!myMembers || myMembers.length === 0) {
      setRooms([]);
      return;
    }

    const roomIds = myMembers.map((m) => m.room_id);

    const { data: otherMembers } = await supabase
      .from('room_members')
      .select('room_id, user_id')
      .in('room_id', roomIds)
      .neq('user_id', userId);

    const otherUserIds = [...new Set((otherMembers || []).map((m) => m.user_id))];

    const { data: otherProfiles } = otherUserIds.length > 0
      ? await supabase.from('profiles').select('id, username, display_name').in('id', otherUserIds)
      : { data: [] };

    const profileMap = {};
    (otherProfiles || []).forEach((p) => {
      profileMap[p.id] = p;
    });

    const { data: recentMsgs } = await supabase
      .from('messages')
      .select('id, room_id, content, created_at, sender_id')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false })
      .limit(100);

    const lastMsgMap = {};
    (recentMsgs || []).forEach((msg) => {
      if (!lastMsgMap[msg.room_id]) {
        lastMsgMap[msg.room_id] = msg;
      }
    });

    const roomList = roomIds.map((rId) => {
      const member = (otherMembers || []).find((m) => m.room_id === rId);
      const otherUser = member ? profileMap[member.user_id] : null;
      return {
        roomId: rId,
        otherUser: otherUser || { username: 'pengguna', display_name: 'Pengguna' },
        lastMessage: lastMsgMap[rId] || null,
      };
    });

    roomList.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return timeB - timeA;
    });

    setRooms(roomList);
  }, []);

  useEffect(() => {
    let channel;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const authUser = session.user;
      setUser(authUser);

      let { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!prof || !prof.username) {
        const fallbackUsername = (authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'user')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '');
        const fallbackName = authUser.user_metadata?.display_name || fallbackUsername;

        const { data: upserted } = await supabase
          .from('profiles')
          .upsert({
            id: authUser.id,
            username: fallbackUsername,
            display_name: fallbackName,
          })
          .select('id, username, display_name')
          .single();

        prof = upserted || { id: authUser.id, username: fallbackUsername, display_name: fallbackName };
      }

      setProfile(prof);
      await loadRooms(authUser.id);
      setLoading(false);

      channel = supabase
        .channel('home-messages-sync')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
          loadRooms(authUser.id);
        })
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [router, loadRooms]);

  useEffect(() => {
    const q = searchQuery.trim().replace(/^@+/, '').toLowerCase();
    if (!q || !user) {
      setSearchResults([]);
      setSearchError('');
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .ilike('username', `%${q}%`)
        .neq('id', user.id)
        .limit(10);

      if (error) {
        setSearchError(error.message);
        setSearchResults([]);
      } else {
        setSearchResults(data || []);
      }
      setSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, user]);

  const handleStartChat = async (targetUser) => {
    setOpeningRoomId(targetUser.id);
    setSearchError('');
    try {
      const { data: roomId, error } = await supabase.rpc('get_or_create_direct_room', {
        target_user_id: targetUser.id,
      });
      if (error) throw error;
      router.push(`/chat/${roomId}`);
    } catch (err) {
      setSearchError(err.message || 'Gagal membuka obrolan.');
      setOpeningRoomId(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#09090B] text-zinc-400' : 'bg-white text-zinc-500'}`}>
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const initial = (profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase();

  return (
    <div className={`min-h-screen flex flex-col max-w-lg mx-auto border-x transition-colors ${isDark ? 'bg-[#09090B] text-zinc-100 border-zinc-800' : 'bg-white text-zinc-900 border-zinc-200'}`}>
      {/* Header Profil */}
      <header className={`px-4 py-3 border-b flex items-center justify-between sticky top-0 z-10 ${isDark ? 'bg-[#09090B]/95 border-zinc-800' : 'bg-white/95 border-zinc-200'} backdrop-blur`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {profile?.display_name || profile?.username || 'Pengguna'}
            </p>
            <p className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              @{profile?.username || 'belum_ada'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleTheme}
            title="Ganti Tema"
            className={`p-2 rounded-xl border transition ${isDark ? 'bg-zinc-900 border-zinc-700 text-amber-400' : 'bg-zinc-100 border-zinc-200 text-zinc-700'}`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            title="Keluar"
            className={`p-2 rounded-xl border transition ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-red-400' : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:text-red-600'}`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Kolom Cari Username */}
      <div className={`p-3 border-b ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari @username teman..."
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-400 focus:border-blue-500'
                : 'bg-zinc-100 border-zinc-200 text-zinc-900 placeholder-zinc-500 focus:border-blue-600 focus:bg-white'
            }`}
          />
        </div>
      </div>

      {/* Hasil Pencarian */}
      {searchQuery.trim() !== '' && (
        <div className={`border-b ${isDark ? 'bg-[#121215] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
          <p className={`px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Pengguna Ditemukan
          </p>

          {searching ? (
            <div className="px-4 py-4 flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Mencari...
            </div>
          ) : searchError ? (
            <p className="px-4 py-3 text-xs text-red-500">{searchError}</p>
          ) : searchResults.length === 0 ? (
            <p className={`px-4 py-3 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Tidak ada user dengan username tersebut.
            </p>
          ) : (
            <div>
              {searchResults.map((target) => (
                <button
                  key={target.id}
                  onClick={() => handleStartChat(target)}
                  disabled={openingRoomId === target.id}
                  className={`w-full px-4 py-3 flex items-center justify-between text-left transition ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-200/60'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-blue-600/15 text-blue-600 font-bold flex items-center justify-center shrink-0">
                      {(target.display_name || target.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{target.display_name || target.username}</p>
                      <p className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>@{target.username}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-blue-600 shrink-0 ml-2">
                    {openingRoomId === target.id ? 'Membuka...' : 'Chat'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Daftar Obrolan */}
      <main className="flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="h-full min-h-[55vh] flex flex-col items-center justify-center text-center px-6">
            <MessageSquare className={`w-10 h-10 mb-3 ${isDark ? 'text-zinc-600' : 'text-zinc-300'}`} />
            <p className="font-medium text-sm mb-1">Belum ada obrolan</p>
            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Ketik <span className="font-semibold">@username</span> temanmu di kolom atas untuk mulai chat.
            </p>
          </div>
        ) : (
          <div className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-zinc-100'}`}>
            {rooms.map((item) => (
              <button
                key={item.roomId}
                onClick={() => router.push(`/chat/${item.roomId}`)}
                className={`w-full px-4 py-3.5 flex items-center gap-3 text-left transition ${isDark ? 'hover:bg-zinc-900' : 'hover:bg-zinc-50'}`}
              >
                <div className="w-11 h-11 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                  {(item.otherUser.display_name || item.otherUser.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">
                      {item.otherUser.display_name || item.otherUser.username}
                    </p>
                    {item.lastMessage && (
                      <span className={`text-[11px] shrink-0 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        {new Date(item.lastMessage.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {item.lastMessage ? item.lastMessage.content : `@${item.otherUser.username}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
