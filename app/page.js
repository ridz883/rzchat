'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LogOut,
  MessageSquare,
  User,
  Sun,
  Moon,
  Loader2,
  Camera,
  Check,
  CheckCheck,
  Trash2,
  Smartphone,
  Bell,
  BellOff,
  Ban,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  MoreVertical,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/useTheme';
import { useCall } from '../components/CallProvider';
import {
  getPushStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush,
} from '../lib/pushClient';
import Avatar from '../components/Avatar';

const compressImageToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

const formatPreviewText = (msg) => {
  if (!msg) return '';
  if (msg.is_deleted) return '🚫 Pesan telah dihapus';
  if (msg.is_view_once) {
    return msg.media_type === 'video' ? '🎬 Video 1x lihat' : '📷 Foto 1x lihat';
  }
  if (msg.media_type === 'audio') return '🎤 Voice Note';
  if (msg.media_type === 'image') return msg.content ? `📷 ${msg.content}` : '📷 Foto';
  if (msg.media_type === 'video') return msg.content ? `🎬 ${msg.content}` : '🎬 Video';
  if (msg.media_type === 'file') return msg.file_name ? `📄 ${msg.file_name}` : '📄 Dokumen';
  return msg.content || '';
};

export default function HomePage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const callCtx = useCall();
  const onlineUsers = callCtx?.onlineUsers || new Set();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('chat');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [blockedList, setBlockedList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [openingRoomId, setOpeningRoomId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [roomMenuTarget, setRoomMenuTarget] = useState(null);

  // Push Notification state
  const [pushState, setPushState] = useState({ supported: false, enabled: false });
  const [pushBusy, setPushBusy] = useState(false);

  // Form edit akun
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });

  const syncFormWithProfile = (prof) => {
    setEditDisplayName(prof?.display_name || '');
    setEditUsername(prof?.username || '');
    setEditBio(prof?.bio || '');
    setEditStatus(prof?.status_text || '');
    setEditLocation(prof?.location || '');
    setEditAvatar(prof?.avatar_url || '');
  };

  const loadBlockedUsers = useCallback(async (userId) => {
    const { data: rows } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', userId);

    const ids = (rows || []).map((r) => r.blocked_id);
    if (ids.length === 0) {
      setBlockedList([]);
      return;
    }

    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);

    setBlockedList(profs || []);
  }, []);

  const loadRooms = useCallback(async (userId) => {
    const { data: myMembers } = await supabase
      .from('room_members')
      .select('room_id, is_pinned, is_archived, pinned_at')
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

    const { data: otherProfiles } =
      otherUserIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, status_text, last_seen')
            .in('id', otherUserIds)
        : { data: [] };

    const profileMap = {};
    (otherProfiles || []).forEach((p) => {
      profileMap[p.id] = p;
    });

    const { data: recentMsgs } = await supabase
      .from('messages')
      .select('id, room_id, content, created_at, sender_id, read_at, media_type, is_deleted, is_view_once, file_name')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false })
      .limit(300);

    const lastMsgMap = {};
    (recentMsgs || []).forEach((msg) => {
      if (!lastMsgMap[msg.room_id]) {
        lastMsgMap[msg.room_id] = msg;
      }
    });

    const { data: unreadRows } = await supabase
      .from('messages')
      .select('room_id')
      .in('room_id', roomIds)
      .neq('sender_id', userId)
      .is('read_at', null);

    const unreadMap = {};
    (unreadRows || []).forEach((row) => {
      unreadMap[row.room_id] = (unreadMap[row.room_id] || 0) + 1;
    });

    const myPrefMap = {};
    (myMembers || []).forEach((m) => {
      myPrefMap[m.room_id] = {
        isPinned: Boolean(m.is_pinned),
        isArchived: Boolean(m.is_archived),
        pinnedAt: m.pinned_at || null,
      };
    });

    const roomList = roomIds.map((rId) => {
      const member = (otherMembers || []).find((m) => m.room_id === rId);
      const otherUser = member ? profileMap[member.user_id] : null;
      const pref = myPrefMap[rId] || { isPinned: false, isArchived: false, pinnedAt: null };
      return {
        roomId: rId,
        otherUser: otherUser || { id: '', username: 'pengguna', display_name: 'Pengguna', avatar_url: '' },
        lastMessage: lastMsgMap[rId] || null,
        unreadCount: unreadMap[rId] || 0,
        isPinned: pref.isPinned,
        isArchived: pref.isArchived,
        pinnedAt: pref.pinnedAt,
      };
    });

    roomList.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const timeA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return timeB - timeA;
    });

    setRooms(roomList);
  }, []);

  const handleTogglePinRoom = async (item) => {
    const nextPinned = !item.isPinned;
    setRoomMenuTarget(null);
    setRooms((prev) => {
      const updated = prev.map((r) =>
        r.roomId === item.roomId
          ? { ...r, isPinned: nextPinned, pinnedAt: nextPinned ? new Date().toISOString() : null }
          : r
      );
      return updated.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const tA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
        const tB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
        return tB - tA;
      });
    });
    const { error } = await supabase.rpc('update_room_preference', {
      p_room_id: String(item.roomId),
      p_is_pinned: nextPinned,
    });
    if (error && user?.id) loadRooms(user.id);
  };

  const handleToggleArchiveRoom = async (item) => {
    const nextArchived = !item.isArchived;
    setRoomMenuTarget(null);
    setRooms((prev) =>
      prev.map((r) =>
        r.roomId === item.roomId
          ? { ...r, isArchived: nextArchived, isPinned: nextArchived ? false : r.isPinned }
          : r
      )
    );
    const { error } = await supabase.rpc('update_room_preference', {
      p_room_id: String(item.roomId),
      p_is_archived: nextArchived,
      p_is_pinned: nextArchived ? false : undefined,
    });
    if (error && user?.id) loadRooms(user.id);
  };

  const archivedRooms = rooms.filter((r) => r.isArchived);
  const activeRooms = rooms.filter((r) => !r.isArchived);
  const visibleRooms = showArchived ? archivedRooms : activeRooms;

  useEffect(() => {
    let channel;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const authUser = session.user;
      setUser(authUser);

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, status_text, location, avatar_url, onboarding_completed')
        .eq('id', authUser.id)
        .maybeSingle();

      // Wajib buat username dulu jika akun email baru belum punya username
      if (!prof || !prof.username || !prof.onboarding_completed) {
        router.replace('/onboarding');
        return;
      }

      setProfile(prof);
      syncFormWithProfile(prof);
      await Promise.all([loadRooms(authUser.id), loadBlockedUsers(authUser.id)]);
      const ps = await getPushStatus();
      setPushState(ps);
      setLoading(false);

      channel = supabase
        .channel(`home-sync-${authUser.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          loadRooms(authUser.id);
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_members',
            filter: `user_id=eq.${authUser.id}`,
          },
          () => {
            loadRooms(authUser.id);
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_users' }, () => {
          loadBlockedUsers(authUser.id);
        })
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [router, loadRooms, loadBlockedUsers]);

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
        .select('id, username, display_name, avatar_url, bio')
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

  const handleTogglePush = async () => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushState.enabled) {
        await unsubscribeUserFromPush();
      } else {
        await subscribeUserToPush(user.id);
      }
      const next = await getPushStatus();
      setPushState(next);
    } catch (err) {
      alert(err.message || 'Gagal mengubah pengaturan notifikasi.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleUnblockFromList = async (blockedId) => {
    if (!user) return;
    await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId);
    loadBlockedUsers(user.id);
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveMessage({ type: '', text: '' });
    try {
      const compressed = await compressImageToDataUrl(file);
      setEditAvatar(compressed);
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message || 'Gagal memproses foto.' });
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setSaveMessage({ type: '', text: '' });

    try {
      const cleanName = editDisplayName.trim();
      const cleanUser = editUsername
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

      if (!cleanName) throw new Error('Nama tampilan tidak boleh kosong.');
      if (cleanUser.length < 3) throw new Error('Username minimal 3 karakter (huruf/angka/_).');

      if (cleanUser !== profile?.username) {
        const { data: available } = await supabase.rpc('check_username_available', {
          p_username: cleanUser,
        });
        if (!available) throw new Error('Username tersebut sudah dipakai orang lain.');
      }

      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          display_name: cleanName,
          username: cleanUser,
          bio: editBio.trim(),
          status_text: editStatus.trim(),
          location: editLocation.trim(),
          avatar_url: editAvatar || '',
          onboarding_completed: true,
        })
        .eq('id', user.id)
        .select('id, username, display_name, bio, status_text, location, avatar_url, onboarding_completed')
        .single();

      if (error) throw error;

      setProfile(updated);
      syncFormWithProfile(updated);
      setSaveMessage({ type: 'success', text: 'Profil berhasil disimpan!' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message || 'Gagal menyimpan profil.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTriggerPwaInstall = async () => {
    const promptEvt = typeof window !== 'undefined' ? window.__rzchatInstallPrompt : null;
    if (promptEvt) {
      promptEvt.prompt();
      await promptEvt.userChoice;
      window.__rzchatInstallPrompt = null;
    } else {
      alert(
        'Buka menu titik tiga (⋮) di browser Chrome lalu pilih "Tambahkan ke layar utama" atau "Install aplikasi".'
      );
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div
        className={`w-full h-[100dvh] flex items-center justify-center ${
          isDark ? 'bg-[#09090B] text-zinc-400' : 'bg-white text-zinc-500'
        }`}
      >
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const totalUnread = rooms.reduce((sum, r) => sum + (r.unreadCount || 0), 0);

  const inputClass = isDark
    ? 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-500'
    : 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-600';

  return (
    <div
      className={`w-full h-[100dvh] flex flex-col transition-colors ${
        isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-white text-zinc-900'
      }`}
    >
      {/* Header */}
      <header
        className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        {activeTab === 'chat' ? (
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              src={profile?.avatar_url}
              name={profile?.display_name || profile?.username}
              size="sm"
            />
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">
                {profile?.display_name || profile?.username}
              </p>
              <p className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                @{profile?.username}
              </p>
            </div>
          </div>
        ) : (
          <h1 className="font-bold text-base">Akun & Pengaturan</h1>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {pushState.supported && (
            <button
              onClick={handleTogglePush}
              disabled={pushBusy}
              title={pushState.enabled ? 'Notifikasi Aktif' : 'Aktifkan Notifikasi Push'}
              className={`p-2 rounded-xl border transition ${
                pushState.enabled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                  : isDark
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-600'
              }`}
            >
              {pushState.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={toggleTheme}
            title="Ganti Tema"
            className={`p-2 rounded-xl border transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-amber-400'
                : 'bg-zinc-100 border-zinc-200 text-zinc-700'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            title="Keluar"
            className={`p-2 rounded-xl border transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-red-400'
                : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:text-red-600'
            }`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Banner Aktifkan Notifikasi Push jika belum aktif */}
      {activeTab === 'chat' && pushState.supported && !pushState.enabled && (
        <div
          className={`px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'bg-blue-950/40 border-zinc-800' : 'bg-blue-50 border-blue-100'
          }`}
        >
          <p className={`text-xs ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
            Aktifkan notifikasi agar chat & telepon masuk walau aplikasi ditutup.
          </p>
          <button
            onClick={handleTogglePush}
            disabled={pushBusy}
            className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold shrink-0"
          >
            {pushBusy ? '...' : 'Aktifkan'}
          </button>
        </div>
      )}

      {/* Konten Utama */}
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`p-3 border-b shrink-0 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
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

          {searchQuery.trim() !== '' && (
            <div
              className={`border-b shrink-0 ${
                isDark ? 'bg-[#121215] border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <p
                className={`px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider ${
                  isDark ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
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
                      className={`w-full px-4 py-3 flex items-center justify-between text-left transition ${
                        isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-200/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar
                            src={target.avatar_url}
                            name={target.display_name || target.username}
                            size="sm"
                          />
                          {onlineUsers.has(target.id) && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {target.display_name || target.username}
                          </p>
                          <p className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            @{target.username}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-blue-600 shrink-0 ml-2">
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
            {showArchived ? (
              <div
                className={`px-4 py-2.5 border-b flex items-center justify-between ${
                  isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShowArchived(false)}
                  className="flex items-center gap-2 text-xs font-semibold text-blue-600"
                >
                  <ArrowLeft className="w-4 h-4" /> Kembali ke Obrolan Utama
                </button>
                <span className="text-[11px] text-zinc-500">Arsip ({archivedRooms.length})</span>
              </div>
            ) : (
              archivedRooms.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchived(true)}
                  className={`w-full px-4 py-3 border-b flex items-center justify-between text-left transition ${
                    isDark
                      ? 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900'
                      : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/15 text-blue-600 flex items-center justify-center">
                      <Archive className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold">Diarsipkan</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-600">
                    {archivedRooms.length}
                  </span>
                </button>
              )
            )}

            {roomMenuTarget && (
              <div
                className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center p-3"
                onClick={() => setRoomMenuTarget(null)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`w-full max-w-md rounded-2xl p-4 shadow-xl space-y-2 ${
                    isDark
                      ? 'bg-[#121215] border border-zinc-800 text-zinc-100'
                      : 'bg-white text-zinc-900'
                  }`}
                >
                  <p className="text-xs font-semibold px-2 pb-1 text-zinc-400 truncate">
                    {roomMenuTarget.otherUser.display_name || roomMenuTarget.otherUser.username}
                  </p>
                  {!roomMenuTarget.isArchived && (
                    <button
                      type="button"
                      onClick={() => handleTogglePinRoom(roomMenuTarget)}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                        isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                      }`}
                    >
                      {roomMenuTarget.isPinned ? (
                        <>
                          <PinOff className="w-4 h-4 text-amber-500" /> Lepas Sematan Chat
                        </>
                      ) : (
                        <>
                          <Pin className="w-4 h-4 text-blue-600" /> Sematkan ke Atas
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleArchiveRoom(roomMenuTarget)}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                    }`}
                  >
                    {roomMenuTarget.isArchived ? (
                      <>
                        <ArchiveRestore className="w-4 h-4 text-emerald-500" /> Keluarkan dari Arsip
                      </>
                    ) : (
                      <>
                        <Archive className="w-4 h-4 text-zinc-500" /> Arsipkan Obrolan
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {rooms.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <MessageSquare
                  className={`w-10 h-10 mb-3 ${isDark ? 'text-zinc-600' : 'text-zinc-300'}`}
                />
                <p className="font-medium text-sm mb-1">Belum ada obrolan</p>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Ketik <span className="font-semibold">@username</span> temanmu di kolom atas
                  untuk mulai chat.
                </p>
              </div>
            ) : (
              <div className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-zinc-100'}`}>
                {visibleRooms.length === 0 && (
                  <div className="py-12 text-center text-xs text-zinc-500">
                    {showArchived ? 'Tidak ada obrolan diarsipkan.' : 'Semua obrolan sedang diarsipkan.'}
                  </div>
                )}
                {visibleRooms.map((item) => {
                  const isLastMine = item.lastMessage?.sender_id === user?.id;
                  const hasUnread = item.unreadCount > 0;
                  const isOnline = Boolean(item.otherUser?.id && onlineUsers.has(item.otherUser.id));

                  return (
                    <button
                      key={item.roomId}
                      onClick={() => router.push(`/chat/${item.roomId}`)}
                      className={`w-full px-4 py-3.5 flex items-center gap-3 text-left transition ${
                        isDark ? 'hover:bg-zinc-900' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <Avatar
                          src={item.otherUser.avatar_url}
                          name={item.otherUser.display_name || item.otherUser.username}
                          size="md"
                        />
                        {isOnline && (
                          <span
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ${
                              isDark ? 'ring-[#09090B]' : 'ring-white'
                            }`}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {item.isPinned && (
                              <Pin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            )}
                            <p className={`text-sm truncate ${hasUnread ? 'font-bold' : 'font-semibold'}`}>
                              {item.otherUser.display_name || item.otherUser.username}
                            </p>
                          </div>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoomMenuTarget(item);
                            }}
                            title="Sematkan / Arsipkan Chat"
                            className={`p-1 rounded-lg shrink-0 ${
                              isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-500'
                            }`}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </span>
                          {item.lastMessage && (
                            <span
                              className={`text-[11px] shrink-0 ${
                                hasUnread
                                  ? 'text-blue-600 font-semibold'
                                  : isDark
                                    ? 'text-zinc-500'
                                    : 'text-zinc-400'
                              }`}
                            >
                              {new Date(item.lastMessage.created_at).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div
                            className={`flex items-center gap-1 min-w-0 text-xs ${
                              hasUnread
                                ? isDark
                                  ? 'text-zinc-100 font-medium'
                                  : 'text-zinc-900 font-medium'
                                : isDark
                                  ? 'text-zinc-400'
                                  : 'text-zinc-500'
                            }`}
                          >
                            {isLastMine &&
                              !item.lastMessage?.is_deleted &&
                              (item.lastMessage.read_at ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <CheckCheck className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              ))}
                            <span className="truncate">
                              {item.lastMessage
                                ? formatPreviewText(item.lastMessage)
                                : `@${item.otherUser.username}`}
                            </span>
                          </div>

                          {hasUnread && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                              {item.unreadCount > 99 ? '99+' : item.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      ) : (
        /* TAB AKUN, NOTIFIKASI PUSH & BLOKIR */
        <main className="flex-1 overflow-y-auto px-4 py-5">
          <div className="max-w-lg mx-auto space-y-5 pb-8">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <Avatar
                  src={editAvatar}
                  name={editDisplayName || editUsername}
                  size="xl"
                  className="shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-blue-600 text-white shadow-md"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-blue-600"
                >
                  Ubah Foto
                </button>
                {editAvatar && (
                  <button
                    type="button"
                    onClick={() => setEditAvatar('')}
                    className="text-xs font-medium text-red-500 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus Foto
                  </button>
                )}
              </div>
            </div>

            {saveMessage.text && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  saveMessage.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                    : 'bg-red-500/10 border-red-500/30 text-red-500'
                }`}
              >
                {saveMessage.text}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Nama Tampilan
                </label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Username
                </label>
                <div className="relative">
                  <span className="text-zinc-400 text-sm font-semibold absolute left-3.5 top-2.5">@</span>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value.replace(/\s/g, ''))}
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Bio
                </label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Ceritakan sedikit tentang dirimu..."
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Status / Info Singkat
                </label>
                <input
                  type="text"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  placeholder="Tersedia, Sibuk, dll."
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Lokasi
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Depok, Indonesia"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Simpan Perubahan
              </button>
            </form>

            {/* True Web Push Settings */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold">Notifikasi Push (Real-Time)</p>
                  <p className={`text-[11px] truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {pushState.enabled
                      ? 'Aktif — pesan & panggilan masuk walau ditutup'
                      : 'Nonaktif — ketuk untuk mengaktifkan'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleTogglePush}
                disabled={pushBusy || !pushState.supported}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${
                  pushState.enabled
                    ? 'bg-red-500/15 text-red-500'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {pushBusy ? '...' : pushState.enabled ? 'Matikan' : 'Aktifkan'}
              </button>
            </div>

            {/* Install PWA */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-600/15 text-blue-600 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold">Install Aplikasi (PWA)</p>
                  <p className={`text-[11px] truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Pasang rzchat ke layar utama HP
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleTriggerPwaInstall}
                className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold shrink-0"
              >
                Install
              </button>
            </div>

            {/* Daftar Pengguna Diblokir */}
            <div
              className={`p-4 rounded-2xl border ${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-4 h-4 text-red-500" />
                <p className="text-xs font-bold">Pengguna Diblokir ({blockedList.length})</p>
              </div>
              {blockedList.length === 0 ? (
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Tidak ada pengguna yang diblokir.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {blockedList.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={u.avatar_url} name={u.display_name || u.username} size="xs" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{u.display_name || u.username}</p>
                          <p className="text-[11px] text-zinc-400 truncate">@{u.username}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnblockFromList(u.id)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold shrink-0"
                      >
                        Buka Blokir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Bottom Nav */}
      <nav
        className={`grid grid-cols-2 border-t shrink-0 ${
          isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <button
          onClick={() => setActiveTab('chat')}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 transition ${
            activeTab === 'chat'
              ? 'text-blue-600'
              : isDark
                ? 'text-zinc-400'
                : 'text-zinc-500'
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {totalUnread > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold">Chat</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('account');
            setSaveMessage({ type: '', text: '' });
          }}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 transition ${
            activeTab === 'account'
              ? 'text-blue-600'
              : isDark
                ? 'text-zinc-400'
                : 'text-zinc-500'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[11px] font-semibold">Akun</span>
        </button>
      </nav>
    </div>
  );
}
