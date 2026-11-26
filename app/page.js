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
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Star,
  X,
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
import VerifiedBadge, { GroupBadge } from '../components/VerifiedBadge';
import AccountHub from '../components/AccountHub';
import GroupCreateModal from '../components/GroupCreateModal';
import StatusSection from '../components/StatusSection';
import { Users, CircleDot, Star as FavStar } from 'lucide-react';
import ZoomableLightbox from '../components/ZoomableLightbox';
import { ANDROID_IMAGE_ACCEPT } from '../lib/security';

const compressImageToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.onload = () => {
        const size = 1080;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
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
  if (msg.media_type === 'sticker') return '🎨 Stiker';
  if (msg.media_type === 'gif') return '🎞️ GIF';
  if (msg.media_type === 'album') return msg.content ? `🖼️ ${msg.content}` : '🖼️ Album Foto';
  if (msg.media_type === 'location') return '📍 Lokasi';
  if (msg.media_type === 'live_location') return '🟢 Lokasi Live';
  if (msg.media_type === 'status_reply') return msg.content ? `💬 ${msg.content}` : '💬 Membalas status';
  if (msg.media_type === 'poll') return msg.content ? `📊 ${msg.content}` : '📊 Polling';
  return msg.content || '';
};

export default function HomePage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const callCtx = useCall();
  const onlineUsers = callCtx?.onlineUsers || new Set();
  const fileInputRef = useRef(null);
  const tabSwipeRef = useRef({ x: 0, y: 0, active: false });

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
  const [chatFilter, setChatFilter] = useState('all');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [hasUnseenStatus, setHasUnseenStatus] = useState(false);
  const [zoomAvatar, setZoomAvatar] = useState(null);
  const [starredList, setStarredList] = useState([]);
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [loadingStarred, setLoadingStarred] = useState(false);
  const [draftMap, setDraftMap] = useState({});
  const [callLogs, setCallLogs] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [pwaReady, setPwaReady] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  // Push Notification state
  const [pushState, setPushState] = useState({ supported: false, enabled: false });
  const [pushBusy, setPushBusy] = useState(false);

  // Form edit akun
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editBannerType, setEditBannerType] = useState('');
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
      .select('id, username, display_name, avatar_url, is_verified, badge_type')
      .in('id', ids);

    setBlockedList(profs || []);
  }, []);

  const loadRooms = useCallback(async (userId) => {
    const { data: myMembers } = await supabase
      .from('room_members')
      .select('room_id, is_pinned, is_archived, pinned_at, role, is_favorite, last_read_at')
      .eq('user_id', userId);

    if (!myMembers || myMembers.length === 0) {
      setRooms([]);
      return;
    }

    const roomIds = myMembers.map((m) => m.room_id);

    const [{ data: roomMetaRows }, { data: allMembers }] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, is_group, name, description, avatar_url, created_by')
        .in('id', roomIds),
      supabase.from('room_members').select('room_id, user_id').in('room_id', roomIds),
    ]);

    const roomMetaMap = {};
    (roomMetaRows || []).forEach((r) => {
      roomMetaMap[r.id] = r;
    });

    const otherMembers = (allMembers || []).filter((m) => m.user_id !== userId);
    const otherUserIds = [...new Set(otherMembers.map((m) => m.user_id))];

    const { data: otherProfiles } =
      otherUserIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, status_text, last_seen, is_verified, badge_type')
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
      .limit(350);

    const lastMsgMap = {};
    (recentMsgs || []).forEach((msg) => {
      if (!lastMsgMap[msg.room_id]) {
        lastMsgMap[msg.room_id] = msg;
      }
    });

    const myPrefMap = {};
    (myMembers || []).forEach((m) => {
      myPrefMap[m.room_id] = {
        isPinned: Boolean(m.is_pinned),
        isArchived: Boolean(m.is_archived),
        isFavorite: Boolean(m.is_favorite),
        pinnedAt: m.pinned_at || null,
        lastReadMs: m.last_read_at ? new Date(m.last_read_at).getTime() : 0,
      };
    });

    // Hitung pesan belum dibaca secara akurat (fix bug badge nyangkut setelah dibuka)
    const unreadMap = {};
    (recentMsgs || []).forEach((msg) => {
      if (msg.sender_id === userId) return;
      const pref = myPrefMap[msg.room_id];
      const msgMs = new Date(msg.created_at).getTime();
      if (msg.read_at) return;
      if (pref && pref.lastReadMs > 0 && msgMs <= pref.lastReadMs) return;
      unreadMap[msg.room_id] = (unreadMap[msg.room_id] || 0) + 1;
    });

    const roomList = roomIds.map((rId) => {
      const meta = roomMetaMap[rId];
      const isGroup = Boolean(meta?.is_group);
      const member = otherMembers.find((m) => m.room_id === rId);
      const otherUser = isGroup
        ? {
            id: rId,
            username: 'grup',
            display_name: meta?.name || 'Grup',
            avatar_url: meta?.avatar_url || '',
          }
        : (member ? profileMap[member.user_id] : null) || {
            id: '',
            username: 'pengguna',
            display_name: 'Pengguna',
            avatar_url: '',
          };
      const pref = myPrefMap[rId] || {
        isPinned: false,
        isArchived: false,
        isFavorite: false,
        pinnedAt: null,
      };
      return {
        roomId: rId,
        isGroup,
        otherUser,
        lastMessage: lastMsgMap[rId] || null,
        unreadCount: unreadMap[rId] || 0,
        isPinned: pref.isPinned,
        isArchived: pref.isArchived,
        isFavorite: pref.isFavorite,
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

  const loadDrafts = useCallback(() => {
    if (typeof window === 'undefined') return;
    const map = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rzchat_draft_')) {
          const val = (localStorage.getItem(k) || '').trim();
          if (val) map[k.replace('rzchat_draft_', '')] = val;
        }
      }
    } catch {}
    setDraftMap(map);
  }, []);

  const loadStarredMessages = useCallback(async (userId) => {
    if (!userId) return;
    setLoadingStarred(true);
    try {
      const { data: stars } = await supabase
        .from('starred_messages')
        .select('id, message_id, room_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(60);
      if (!stars || stars.length === 0) {
        setStarredList([]);
        return;
      }
      const msgIds = stars.map((s) => s.message_id);
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, room_id, sender_id, content, created_at, media_type, file_name, is_deleted')
        .in('id', msgIds);
      const mMap = {};
      (msgs || []).forEach((m) => {
        mMap[m.id] = m;
      });
      setStarredList(
        stars
          .map((s) => ({ ...s, message: mMap[s.message_id] || null }))
          .filter((x) => x.message && !x.message.is_deleted)
      );
    } finally {
      setLoadingStarred(false);
    }
  }, []);

  const loadCallLogs = useCallback(async (userId) => {
    setLoadingCalls(true);
    try {
      const { data: logs } = await supabase
        .from('call_logs')
        .select('id, call_id, room_id, caller_id, callee_id, call_type, status, duration_sec, created_at')
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!logs || logs.length === 0) {
        setCallLogs([]);
        return;
      }

      const peerIds = [...new Set(logs.map((l) => (l.caller_id === userId ? l.callee_id : l.caller_id)))];
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified, badge_type')
        .in('id', peerIds);
      const pMap = {};
      (profs || []).forEach((p) => {
        pMap[p.id] = p;
      });

      const seenCallIds = new Set();
      const uniqueLogs = logs.filter((l) => {
        const key = l.call_id || l.id;
        if (seenCallIds.has(key)) return false;
        seenCallIds.add(key);
        return true;
      });
      setCallLogs(
        uniqueLogs.map((l) => {
          const isOutgoing = l.caller_id === userId;
          const peerId = isOutgoing ? l.callee_id : l.caller_id;
          return {
            ...l,
            isOutgoing,
            peer: pMap[peerId] || { id: peerId, username: 'pengguna', display_name: 'Pengguna', avatar_url: '' },
          };
        })
      );
    } finally {
      setLoadingCalls(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true;
    setIsPwaInstalled(Boolean(standalone));
    setPwaReady(Boolean(window.__rzchatInstallPrompt));

    const onReady = () => setPwaReady(Boolean(window.__rzchatInstallPrompt));
    const onInstalled = () => {
      setIsPwaInstalled(true);
      setPwaReady(false);
    };
    window.addEventListener('rzchat-pwa-ready', onReady);
    window.addEventListener('rzchat-pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('rzchat-pwa-ready', onReady);
      window.removeEventListener('rzchat-pwa-installed', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadDrafts();
    loadCallLogs(user.id);
    const onLogUpdate = () => loadCallLogs(user.id);
    const onFocus = () => loadDrafts();
    window.addEventListener('rzchat-call-log-updated', onLogUpdate);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('rzchat-call-log-updated', onLogUpdate);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, loadDrafts, loadCallLogs]);

  const handleSmartPwaInstall = async () => {
    if (isPwaInstalled) {
      alert('rzchat sudah terpasang sebagai aplikasi di HP kamu.');
      return;
    }
    const promptEvent = typeof window !== 'undefined' ? window.__rzchatInstallPrompt : null;
    if (promptEvent) {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        window.__rzchatInstallPrompt = null;
        setPwaReady(false);
        setIsPwaInstalled(true);
      }
      return;
    }
    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
    const isInAppWebView =
      typeof navigator !== 'undefined' &&
      /; wv\)|FBAN|FBAV|Instagram|Line|MicroMessenger|MiuiBrowser/i.test(navigator.userAgent);
    if (isAndroid && isInAppWebView) {
      window.location.href = `intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    alert(
      'Ketuk ikon menu browser (⋮) di pojok kanan atas lalu pilih "Install aplikasi" / "Tambahkan ke layar utama" untuk memasang rzchat.'
    );
  };

  const formatCallDur = (sec) => {
    const s = Number(sec) || 0;
    if (s <= 0) return '';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
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
        .select('id, username, display_name, bio, status_text, location, avatar_url, onboarding_completed, is_verified, badge_type, banner_url, banner_type, is_banned')
        .eq('id', authUser.id)
        .maybeSingle();

      // Wajib buat username dulu jika akun email baru belum punya username
      if (!prof || !prof.username || !prof.onboarding_completed) {
        router.replace('/onboarding');
        return;
      }

      if (prof.is_banned && String(prof.username || '').toLowerCase() !== 'dev') {
        return;
      }
      setProfile(prof);
      syncFormWithProfile(prof);
      setEditBannerUrl(prof?.banner_url || '');
      setEditBannerType(prof?.banner_type || '');
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
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          const updated = payload.new;
          if (!updated?.id) return;
          if (updated.id === authUser.id) {
            setProfile((prev) => ({ ...(prev || {}), ...updated }));
          }
          setRooms((prev) =>
            prev.map((r) =>
              !r.isGroup && r.otherUser?.id === updated.id
                ? { ...r, otherUser: { ...r.otherUser, ...updated } }
                : r
            )
          );
          setSearchResults((prev) =>
            prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
          );
        })
        .subscribe();
      const onReSync = () => {
        if (document.visibilityState === 'visible') {
          loadRooms(authUser.id);
          loadDrafts();
        }
      };
      window.addEventListener('pageshow', onReSync);
      document.addEventListener('visibilitychange', onReSync);

      return () => {
        window.removeEventListener('pageshow', onReSync);
        document.removeEventListener('visibilitychange', onReSync);
        if (channel) supabase.removeChannel(channel);
      };
    };

    let cleanupFn;
    init().then((fn) => {
      cleanupFn = fn;
    });

    return () => {
      if (typeof cleanupFn === 'function') cleanupFn();
    };
  }, [router, loadRooms, loadBlockedUsers, loadDrafts]);

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
        .select('id, username, display_name, avatar_url, bio, is_verified, badge_type')
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

  
  const openStarredMessages = async () => {
    setShowStarredModal(true);
    if (!user?.id) return;
    setLoadingStarred(true);
    try {
      const { data: stars } = await supabase
        .from('starred_messages')
        .select('id, room_id, message_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const ids = (stars || []).map((s) => s.message_id).filter(Boolean);
      if (ids.length === 0) {
        setStarredList([]);
      } else {
        const { data: msgs } = await supabase
          .from('messages')
          .select('id, content, media_type, file_name, is_deleted, is_view_once, created_at')
          .in('id', ids);
        const mMap = {};
        (msgs || []).forEach((m) => { mMap[m.id] = m; });
        setStarredList((stars || []).filter((s) => mMap[s.message_id]).map((s) => ({ ...s, message: mMap[s.message_id] })));
      }
    } finally {
      setLoadingStarred(false);
    }
  };

  const handleUnblockUser = async (targetUserId) => {
    if (!user?.id || !targetUserId) return;
    await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetUserId);
    setBlockedList((prev) => prev.filter((u) => u.id !== targetUserId));
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
              <p className={`text-xs truncate flex items-center gap-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                <span className="truncate">@{profile?.username}</span>
                <VerifiedBadge user={profile} size="xs" />
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

      {/* Konten Utama (Dukung Geser Kiri/Kanan Antar Menu) */}
      <div
        onTouchStart={(e) => {
          if (e.touches.length !== 1) return;
          tabSwipeRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            active: true,
          };
        }}
        onTouchEnd={(e) => {
          if (!tabSwipeRef.current.active || e.changedTouches.length !== 1) return;
          tabSwipeRef.current.active = false;
          const dx = e.changedTouches[0].clientX - tabSwipeRef.current.x;
          const dy = e.changedTouches[0].clientY - tabSwipeRef.current.y;
          if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
          const order = ['chat', 'status', 'calls', 'account'];
          const curIdx = order.indexOf(activeTab);
          if (curIdx === -1) return;
          const nextIdx = dx < 0 ? Math.min(order.length - 1, curIdx + 1) : Math.max(0, curIdx - 1);
          const nextTab = order[nextIdx];
          if (nextTab !== activeTab) {
            setActiveTab(nextTab);
            if (nextTab === 'calls' && user?.id) loadCallLogs(user.id);
          }
        }}
        className="flex-1 flex flex-col overflow-hidden"
      >
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`p-3 border-b shrink-0 space-y-2.5 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
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
              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                title="Buat Grup Baru"
                className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <Users className="w-4 h-4" />
                <span>Grup</span>
              </button>
            </div>

            {/* Filter Cepat Halaman Utama */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {[
                { id: 'all', label: 'Semua' },
                { id: 'unread', label: 'Belum Dibaca' },
                { id: 'groups', label: 'Grup' },
                { id: 'favorites', label: 'Favorit' },
              ].map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() => setChatFilter(flt.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition ${
                    chatFilter === flt.id
                      ? 'bg-blue-600 text-white'
                      : isDark
                        ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
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
                          <p className={`text-xs truncate flex items-center gap-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            <span className="truncate">@{target.username}</span>
                            <VerifiedBadge user={target} size="xs" />
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
                    onClick={async () => {
                      const target = roomMenuTarget;
                      setRoomMenuTarget(null);
                      await supabase.rpc('set_room_favorite', {
                        p_room_id: String(target.roomId),
                        p_is_favorite: !target.isFavorite,
                      });
                      if (user?.id) loadRooms(user.id);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                    }`}
                  >
                    <FavStar className="w-4 h-4 text-amber-500" />
                    {roomMenuTarget.isFavorite ? 'Hapus dari Favorit' : 'Tambahkan ke Favorit'}
                  </button>
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
                  <button
                    type="button"
                    onClick={async () => {
                      const target = roomMenuTarget;
                      setRoomMenuTarget(null);
                      const label =
                        target.otherUser?.display_name || target.otherUser?.username || 'obrolan ini';
                      const ok = window.confirm(
                        target.isGroup
                          ? `Keluar dan hapus grup "${label}" dari daftar chat?`
                          : `Hapus obrolan dengan "${label}" dari daftar chat?`
                      );
                      if (!ok) return;
                      const { error } = await supabase.rpc('leave_or_delete_direct_room', {
                        p_room_id: String(target.roomId),
                      });
                      if (error) {
                        alert('Gagal menghapus obrolan: ' + error.message);
                        return;
                      }
                      setRooms((prev) => prev.filter((r) => String(r.roomId) !== String(target.roomId)));
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-red-500 ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    {roomMenuTarget.isGroup ? 'Keluar & Hapus Grup' : 'Hapus Obrolan'}
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
                {visibleRooms.filter((item) => {
                    if (chatFilter === 'unread') return item.unreadCount > 0;
                    if (chatFilter === 'groups') return item.isGroup;
                    if (chatFilter === 'favorites') return item.isFavorite;
                    return true;
                  }).map((item) => {
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
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomAvatar({
                            url: item.otherUser.avatar_url || '',
                            title: item.otherUser.display_name || item.otherUser.username,
                            subtitle: `@${item.otherUser.username}`,
                          });
                        }}
                        title="Ketuk untuk perbesar foto profil"
                        className="relative shrink-0 cursor-zoom-in"
                      >
                        <Avatar
                          src={item.otherUser.avatar_url}
                          name=<span className="inline-flex items-center gap-1 min-w-0">
                              <span className="truncate">{item.otherUser.display_name || item.otherUser.username}</span>
                              {!item.isGroup && <VerifiedBadge user={item.otherUser} size="xs" />}
                            </span>
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
                            {item.isGroup ? (
                              <GroupBadge />
                            ) : (
                              <VerifiedBadge user={item.otherUser} size="xs" />
                            )}
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
                            {draftMap[String(item.roomId)] ? (
                              <span className="truncate">
                                <span className="text-red-500 font-semibold">Draft: </span>
                                {draftMap[String(item.roomId)]}
                              </span>
                            ) : (
                              <>
                                {isLastMine &&
                                  !item.lastMessage?.is_deleted &&
                                  (item.lastMessage.read_at ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                  ))}
                                <span className="truncate">
                                  {item.lastMessage
                                    ? formatPreviewText(item.lastMessage)
                                    : `@${item.otherUser.username}`}
                                </span>
                              </>
                            )}
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
      ) : activeTab === 'calls' ? (
        /* TAB RIWAYAT PANGGILAN */
        <main className="flex-1 overflow-y-auto">
          {loadingCalls && callLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : callLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <Phone className={`w-10 h-10 mb-3 ${isDark ? 'text-zinc-600' : 'text-zinc-300'}`} />
              <p className="font-medium text-sm mb-1">Belum ada riwayat panggilan</p>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Panggilan suara & video call kamu akan tercatat otomatis di sini.
              </p>
            </div>
          ) : (
            <div className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-zinc-100'}`}>
              {callLogs.map((log) => {
                const isMissed = !log.isOutgoing && (log.status === 'missed' || log.status === 'cancelled');
                const statusLabel =
                  log.status === 'completed'
                    ? `Terhubung ${formatCallDur(log.duration_sec)}`
                    : log.status === 'rejected'
                      ? 'Ditolak'
                      : log.isOutgoing
                        ? 'Tidak dijawab'
                        : 'Tak terjawab';
                return (
                  <div
                    key={log.id}
                    className={`px-4 py-3.5 flex items-center justify-between gap-3 ${
                      isDark ? 'hover:bg-zinc-900' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          setZoomAvatar({
                            url: log.peer.avatar_url || '',
                            title: log.peer.display_name || log.peer.username,
                            subtitle: `@${log.peer.username}`,
                          })
                        }
                        className="shrink-0"
                      >
                        <Avatar
                          src={log.peer.avatar_url}
                          name={log.peer.display_name || log.peer.username}
                          size="md"
                        />
                      </button>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${isMissed ? 'text-red-500' : ''}`}>
                          {log.peer.display_name || log.peer.username}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
                          {isMissed ? (
                            <PhoneMissed className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : log.isOutgoing ? (
                            <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <PhoneIncoming className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          )}
                          <span className="truncate">
                            {log.call_type === 'video' ? 'Video' : 'Suara'} · {statusLabel}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {new Date(log.created_at).toLocaleString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          callCtx?.startCall({
                            roomId: log.room_id,
                            targetUser: log.peer,
                            callType: log.call_type === 'video' ? 'video' : 'audio',
                          })
                        }
                        title={log.call_type === 'video' ? 'Video call balik' : 'Telepon balik'}
                        className={`p-2.5 rounded-xl transition ${
                          isDark ? 'hover:bg-zinc-800 text-emerald-400' : 'hover:bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {log.call_type === 'video' ? (
                          <Video className="w-4 h-4" />
                        ) : (
                          <Phone className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      ) : activeTab === 'status' ? (
        <StatusSection
          currentUser={user}
          profile={profile}
          isDark={isDark}
          onUnseenChange={setHasUnseenStatus}
        />
      ) : (
        /* TAB AKUN BARU (BERSIH & FUNGSIONAL) */
        <AccountHub
          user={user}
          profile={profile}
          isDark={isDark}
          toggleTheme={toggleTheme}
          rooms={rooms}
          blockedList={blockedList}
          pushState={pushState}
          pushBusy={pushBusy}
          onTogglePush={handleTogglePush}
          onLogout={handleLogout}
          onOpenStarred={openStarredMessages}
          onOpenArchived={() => {
            setActiveTab('chat');
            setShowArchived(true);
          }}
          onOpenCreateGroup={() => setShowCreateGroup(true)}
          onOpenFilter={(flt) => {
            setActiveTab('chat');
            setShowArchived(false);
            setChatFilter(flt);
          }}
          onZoomAvatar={(cfg) => setZoomAvatar(cfg)}
          fileInputRef={fileInputRef}
          onPhotoSelect={handlePhotoSelect}
          editDisplayName={editDisplayName}
          setEditDisplayName={setEditDisplayName}
          editUsername={editUsername}
          setEditUsername={setEditUsername}
          editBio={editBio}
          setEditBio={setEditBio}
          editStatus={editStatus}
          setEditStatus={setEditStatus}
          editLocation={editLocation}
          setEditLocation={setEditLocation}
          editAvatar={editAvatar}
          setEditAvatar={setEditAvatar}
          savingProfile={savingProfile}
          editBannerUrl={editBannerUrl}
          setEditBannerUrl={setEditBannerUrl}
          editBannerType={editBannerType}
          setEditBannerType={setEditBannerType}
          onSaveProfile={handleSaveProfile}
          onUnblockUser={handleUnblockUser}
          isPwaInstalled={isPwaInstalled}
          pwaReady={pwaReady}
          onInstallPwa={handleSmartPwaInstall}
        />
      )}
      </div>

      {showCreateGroup && (
        <GroupCreateModal
          currentUser={user}
          isDark={isDark}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(newRoomId) => {
            setShowCreateGroup(false);
            router.push(`/chat/${newRoomId}`);
          }}
        />
      )}

      {/* Bottom Nav (4 Tab: Chat, Status, Panggilan, Akun) */}
      <nav
        className={`grid grid-cols-4 border-t shrink-0 ${
          isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <button
          onClick={() => {
            setActiveTab('chat');
            loadDrafts();
          }}
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
          onClick={() => setActiveTab('status')}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 transition ${
            activeTab === 'status'
              ? 'text-blue-600'
              : isDark
                ? 'text-zinc-400'
                : 'text-zinc-500'
          }`}
        >
          <div className="relative">
            <CircleDot className="w-5 h-5" />
            {hasUnseenStatus && (
              <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-black" />
            )}
          </div>
          <span className="text-[11px] font-semibold">Status</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('calls');
            if (user?.id) loadCallLogs(user.id);
          }}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 transition ${
            activeTab === 'calls'
              ? 'text-blue-600'
              : isDark
                ? 'text-zinc-400'
                : 'text-zinc-500'
          }`}
        >
          <Phone className="w-5 h-5" />
          <span className="text-[11px] font-semibold">Panggilan</span>
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
