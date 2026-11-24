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
  Reply,
  Pencil,
  Phone,
  Video,
  Ban,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Search,
  Forward,
  FileText,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/useTheme';
import { useCall } from '../../../components/CallProvider';
import { sendPushNotification } from '../../../lib/pushClient';
import Avatar from '../../../components/Avatar';
import LinkPreviewCard from '../../../components/LinkPreviewCard';
import {
  ANDROID_MEDIA_ACCEPT,
  sanitizeText,
  validateUploadFile,
  formatFileSize,
} from '../../../lib/security';
import { saveMediaToDevice } from '../../../lib/mediaHelper';

const QUICK_EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢'];

const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const formatLastSeen = (iso) => {
  if (!iso) return 'Offline';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Terakhir dilihat ${timeStr}`;
  return `Terakhir dilihat ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${timeStr}`;
};

const getSupportedAudioMime = () => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
};

const extractStoragePath = (publicUrl) => {
  if (!publicUrl || !publicUrl.includes('/chat-media/')) return null;
  return decodeURIComponent(publicUrl.split('/chat-media/')[1].split('?')[0]);
};

const snippetOf = (msg) => {
  if (!msg) return 'Pesan';
  if (msg.is_deleted) return 'Pesan telah dihapus';
  if (msg.is_view_once) return msg.media_type === 'video' ? '🎬 Video 1x lihat' : '📷 Foto 1x lihat';
  if (msg.media_type === 'audio') return '🎤 Voice Note';
  if (msg.media_type === 'image') return msg.content ? `📷 ${msg.content}` : '📷 Foto';
  if (msg.media_type === 'video') return msg.content ? `🎬 ${msg.content}` : '🎬 Video';
  if (msg.media_type === 'file') return msg.file_name ? `📄 ${msg.file_name}` : '📄 Dokumen';
  return msg.content || '';
};

function ChatRoomContent() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId;
  const { isDark, toggleTheme } = useTheme();
  const callCtx = useCall();
  const onlineUsers = callCtx?.onlineUsers || new Set();

  const [currentUser, setCurrentUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Typing indicator
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const roomChannelRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const otherTypingTimeoutRef = useRef(null);

  // Reply, Edit, Action Menu, Search, Forward, Highlight, Save
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [forwardingMsg, setForwardingMsg] = useState(null);
  const [forwardRooms, setForwardRooms] = useState([]);
  const [loadingForwardRooms, setLoadingForwardRooms] = useState(false);
  const [forwardingToRoomId, setForwardingToRoomId] = useState(null);
  const [savingMediaId, setSavingMediaId] = useState(null);

  // Media + View Once (1x Lihat)
  const [pendingMedia, setPendingMedia] = useState(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [viewOnceViewer, setViewOnceViewer] = useState(null);
  const mediaInputRef = useRef(null);

  // Blokir pengguna
  const [iBlockedOther, setIBlockedOther] = useState(false);
  const [otherBlockedMe, setOtherBlockedMe] = useState(false);

  // Voice Note
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

  const refreshBlockStatus = useCallback(async (myId, otherId) => {
    if (!myId || !otherId) return;
    const { data } = await supabase
      .from('blocked_users')
      .select('blocker_id, blocked_id')
      .or(
        `and(blocker_id.eq.${myId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${myId})`
      );

    const rows = data || [];
    setIBlockedOther(rows.some((r) => r.blocker_id === myId && r.blocked_id === otherId));
    setOtherBlockedMe(rows.some((r) => r.blocker_id === otherId && r.blocked_id === myId));
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let channel;
    let blockChannel;
    let authSub;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') markAsRead();
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

      const { data: me } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('id', authUser.id)
        .maybeSingle();
      setMyProfile(me);

      const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession) router.replace('/login');
        else setCurrentUser(newSession.user);
      });
      authSub = listener?.subscription;

      const { data: otherMember } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId)
        .neq('user_id', authUser.id)
        .maybeSingle();

      let opponent = null;
      if (otherMember?.user_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, username, display_name, bio, status_text, location, avatar_url, created_at, last_seen')
          .eq('id', otherMember.user_id)
          .maybeSingle();
        opponent = prof || { id: otherMember.user_id, username: 'pengguna', display_name: 'Pengguna' };
        setOtherUser(opponent);
        await refreshBlockStatus(authUser.id, opponent.id);
      }

      const { data: initialMsgs } = await supabase
        .from('messages')
        .select(
          'id, room_id, sender_id, content, created_at, read_at, media_url, media_type, reply_to_id, edited_at, is_deleted, reactions, is_view_once, view_once_opened_at, is_pinned, pinned_at, pinned_by, is_forwarded, file_name, file_size'
        )
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      setMessages(initialMsgs || []);
      setLoading(false);
      scrollToBottom();
      await markAsRead();

      // Realtime pesan + typing broadcast
      channel = supabase
        .channel(`room-${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            const newMsg = payload.new;
            setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
            scrollToBottom();
            if (newMsg.sender_id !== authUser.id) {
              setIsOtherTyping(false);
              if (document.visibilityState === 'visible') markAsRead();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            const updated = payload.new;
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
          }
        )
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (!payload || payload.userId === authUser.id) return;
          if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
          if (payload.typing) {
            setIsOtherTyping(true);
            otherTypingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3500);
          } else {
            setIsOtherTyping(false);
          }
        })
        .subscribe();

      roomChannelRef.current = channel;

      // Realtime status blokir
      if (opponent?.id) {
        blockChannel = supabase
          .channel(`room-block-${roomId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_users' }, () => {
            refreshBlockStatus(authUser.id, opponent.id);
          })
          .subscribe();
      }

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleVisibility);
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (blockChannel) supabase.removeChannel(blockChannel);
      if (authSub) authSub.unsubscribe();
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [roomId, router, markAsRead, refreshBlockStatus]);

  const emitTyping = (typing) => {
    if (!roomChannelRef.current || !currentUser || iBlockedOther || otherBlockedMe) return;
    const now = Date.now();
    if (typing && now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    roomChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, typing },
    });
  };

  const handleTextChange = (val) => {
    setText(val);
    emitTyping(val.trim().length > 0);
  };

  // Pilih foto, video, audio, atau dokumen lewat Android System File Picker
  const handleMediaSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const check = validateUploadFile(file, 25);
    if (!check.valid) {
      alert(check.error);
      return;
    }

    const type = check.category;
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    const previewUrl = type === 'image' || type === 'video' ? URL.createObjectURL(file) : '';
    setPendingMedia({ file, type, previewUrl });
    setIsViewOnce(false);
  };

  const clearPendingMedia = () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
    setIsViewOnce(false);
  };

  // Kirim pesan baru / simpan edit pesan
  const handleSend = async (e) => {
    e?.preventDefault();
    if (iBlockedOther || otherBlockedMe) return;
    const content = sanitizeText(text, 4000);

    // Mode Edit Pesan
    if (editingMsg) {
      if (!content) return;
      setSending(true);
      try {
        const { error } = await supabase.rpc('edit_own_message', {
          p_message_id: editingMsg.id,
          p_content: content,
        });
        if (error) throw error;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMsg.id
              ? { ...m, content, edited_at: new Date().toISOString() }
              : m
          )
        );
        setEditingMsg(null);
        setText('');
        emitTyping(false);
      } catch (err) {
        alert('Gagal mengedit pesan: ' + err.message);
      } finally {
        setSending(false);
      }
      return;
    }

    if ((!content && !pendingMedia) || !currentUser || sending) return;

    setSending(true);
    emitTyping(false);
    let uploadedUrl = '';
    let uploadedType = '';
    const sendViewOnce = Boolean(
      pendingMedia && (pendingMedia.type === 'image' || pendingMedia.type === 'video') && isViewOnce
    );

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
          reply_to_id: replyingTo?.id || null,
          is_view_once: sendViewOnce,
          file_name: pendingMedia ? sanitizeText(pendingMedia.file.name, 160) : '',
          file_size: pendingMedia ? pendingMedia.file.size : 0,
        })
        .select(
          'id, room_id, sender_id, content, created_at, read_at, media_url, media_type, reply_to_id, edited_at, is_deleted, reactions, is_view_once, view_once_opened_at, is_pinned, pinned_at, pinned_by, is_forwarded, file_name, file_size'
        )
        .single();

      if (error) throw error;

      setText('');
      setReplyingTo(null);
      clearPendingMedia();

      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
        scrollToBottom();

        // Kirim True Web Push ke lawan bicara
        const senderTitle = myProfile?.display_name || myProfile?.username || 'Pesan Baru';
        const pushBody = sendViewOnce
          ? uploadedType === 'video'
            ? '🎬 Mengirim video 1x lihat'
            : '📷 Mengirim foto 1x lihat'
          : uploadedType === 'image'
            ? content
              ? `📷 ${content}`
              : '📷 Mengirim foto'
            : uploadedType === 'video'
              ? content
                ? `🎬 ${content}`
                : '🎬 Mengirim video'
              : uploadedType === 'file'
                ? `📄 ${pendingMedia?.file?.name || 'Mengirim dokumen'}`
                : uploadedType === 'audio'
                  ? '🎵 Mengirim audio'
                  : content;

        sendPushNotification({
          roomId,
          title: senderTitle,
          body: pushBody,
          url: `/chat/${roomId}`,
          tag: `room-${roomId}`,
        });
      }
    } catch (err) {
      alert('Gagal mengirim: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setSending(false);
    }
  };

  // Reaksi Emoji
  const handleToggleReaction = async (msgId, emoji) => {
    setSelectedMsg(null);
    const { data, error } = await supabase.rpc('toggle_message_reaction', {
      p_message_id: msgId,
      p_emoji: emoji,
    });
    if (!error && data) {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, reactions: data } : m)));
    }
  };

  // Hapus pesan sendiri (+ hapus file dari storage)
  const handleDeleteMessage = async (msg) => {
    setSelectedMsg(null);
    const { data: oldMediaUrl, error } = await supabase.rpc('delete_own_message', {
      p_message_id: msg.id,
    });
    if (error) {
      alert('Gagal menghapus pesan: ' + error.message);
      return;
    }

    if (oldMediaUrl) {
      const storagePath = extractStoragePath(oldMediaUrl);
      if (storagePath) {
        supabase.storage.from('chat-media').remove([storagePath]).catch(() => {});
      }
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              is_deleted: true,
              content: '',
              media_url: '',
              media_type: '',
              reactions: {},
              is_view_once: false,
            }
          : m
      )
    );
  };

  // Buka & Tutup Foto/Video 1x Lihat (terkunci server-side)
  const handleOpenViewOnce = async (msg) => {
    if (!msg.media_url || msg.view_once_opened_at) return;
    const { data: allowed, error } = await supabase.rpc('mark_view_once_opened', {
      p_message_id: msg.id,
    });
    if (error || allowed === false) {
      alert('Media 1x lihat ini sudah pernah dibuka dan terkunci.');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, media_url: '', view_once_opened_at: new Date().toISOString() }
            : m
        )
      );
      return;
    }
    setViewOnceViewer({
      id: msg.id,
      url: msg.media_url,
      type: msg.media_type,
      caption: msg.content,
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, view_once_opened_at: new Date().toISOString() } : m
      )
    );
  };

  const handleCloseViewOnce = async () => {
    if (!viewOnceViewer) return;
    const msgId = viewOnceViewer.id;
    setViewOnceViewer(null);
    const { data: oldUrl } = await supabase.rpc('consume_view_once_media', {
      p_message_id: msgId,
    });
    if (oldUrl) {
      const path = extractStoragePath(oldUrl);
      if (path) supabase.storage.from('chat-media').remove([path]).catch(() => {});
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, media_url: '', view_once_opened_at: m.view_once_opened_at || new Date().toISOString() }
          : m
      )
    );
  };

  // Lompat & sorot pesan tertentu (untuk Pin & Pencarian)
  const scrollToMessage = useCallback((msgId) => {
    if (!msgId) return;
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => {
        setHighlightedMsgId((cur) => (cur === msgId ? null : cur));
      }, 2200);
    }
  }, []);

  // Sematkan / Lepas Sematan Pesan
  const handleTogglePinMessage = async (msg) => {
    setSelectedMsg(null);
    const { data: nowPinned, error } = await supabase.rpc('toggle_pin_message', {
      p_message_id: String(msg.id),
    });
    if (error) {
      alert('Gagal menyematkan pesan: ' + error.message);
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              is_pinned: Boolean(nowPinned),
              pinned_at: nowPinned ? new Date().toISOString() : null,
              pinned_by: nowPinned ? currentUser?.id : null,
            }
          : m
      )
    );
  };

  // Simpan foto/video/dokumen ke perangkat HP
  const handleSaveMedia = async (msg) => {
    if (!msg?.media_url || msg.is_view_once) return;
    setSavingMediaId(msg.id);
    try {
      await saveMediaToDevice({
        url: msg.media_url,
        fileName: msg.file_name || '',
        mediaType: msg.media_type,
        isViewOnce: msg.is_view_once,
      });
    } catch (err) {
      alert(err.message || 'Gagal menyimpan media.');
    } finally {
      setSavingMediaId(null);
    }
  };

  // Buka Modal Teruskan Pesan
  const openForwardModal = async (msg) => {
    if (!msg || msg.is_deleted || msg.is_view_once || !currentUser) return;
    setSelectedMsg(null);
    setForwardingMsg(msg);
    setLoadingForwardRooms(true);
    try {
      const { data: myMem } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', currentUser.id);
      const rIds = (myMem || []).map((m) => m.room_id);
      if (rIds.length === 0) {
        setForwardRooms([]);
        return;
      }
      const { data: otherMem } = await supabase
        .from('room_members')
        .select('room_id, user_id')
        .in('room_id', rIds)
        .neq('user_id', currentUser.id);
      const uIds = [...new Set((otherMem || []).map((m) => m.user_id))];
      const { data: profs } =
        uIds.length > 0
          ? await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .in('id', uIds)
          : { data: [] };
      const pMap = {};
      (profs || []).forEach((p) => {
        pMap[p.id] = p;
      });
      const list = (otherMem || []).map((m) => ({
        roomId: m.room_id,
        user: pMap[m.user_id] || { id: m.user_id, username: 'pengguna', display_name: 'Pengguna', avatar_url: '' },
      }));
      setForwardRooms(list);
    } finally {
      setLoadingForwardRooms(false);
    }
  };

  // Kirim Pesan Terusan ke Ruang Tujuan
  const handleForwardToRoom = async (target) => {
    if (!forwardingMsg || !currentUser || forwardingToRoomId) return;
    setForwardingToRoomId(target.roomId);
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: target.roomId,
          sender_id: currentUser.id,
          content: forwardingMsg.content || '',
          media_url: forwardingMsg.media_url || '',
          media_type: forwardingMsg.media_type || '',
          file_name: forwardingMsg.file_name || '',
          file_size: forwardingMsg.file_size || 0,
          is_view_once: false,
          is_forwarded: true,
        })
        .select(
          'id, room_id, sender_id, content, created_at, read_at, media_url, media_type, reply_to_id, edited_at, is_deleted, reactions, is_view_once, view_once_opened_at, is_pinned, pinned_at, pinned_by, is_forwarded, file_name, file_size'
        )
        .single();
      if (error) throw error;

      if (String(target.roomId) === String(roomId) && data) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
        scrollToBottom();
      }

      const senderTitle = myProfile?.display_name || myProfile?.username || 'Pesan Diteruskan';
      sendPushNotification({
        roomId: target.roomId,
        title: senderTitle,
        body: `↪ ${snippetOf(forwardingMsg)}`,
        url: `/chat/${target.roomId}`,
        tag: `room-${target.roomId}`,
      });
      setForwardingMsg(null);
    } catch (err) {
      alert('Gagal meneruskan pesan: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setForwardingToRoomId(null);
    }
  };

  const pinnedMessages = messages
    .filter((m) => m.is_pinned && !m.is_deleted)
    .sort((a, b) => new Date(b.pinned_at || b.created_at) - new Date(a.pinned_at || a.created_at));
  const latestPinned = pinnedMessages[0] || null;

  const trimmedSearch = chatSearchQuery.trim().toLowerCase();
  const searchMatches = trimmedSearch
    ? messages.filter(
        (m) =>
          !m.is_deleted &&
          ((m.content || '').toLowerCase().includes(trimmedSearch) ||
            (m.file_name || '').toLowerCase().includes(trimmedSearch))
      )
    : [];

  useEffect(() => {
    setSearchIdx(0);
    if (trimmedSearch && searchMatches.length > 0) {
      scrollToMessage(searchMatches[searchMatches.length - 1].id);
      setSearchIdx(searchMatches.length - 1);
    }
  }, [trimmedSearch]);

  const jumpSearch = (dir) => {
    if (searchMatches.length === 0) return;
    const next = (searchIdx + dir + searchMatches.length) % searchMatches.length;
    setSearchIdx(next);
    scrollToMessage(searchMatches[next].id);
  };

  const renderHighlightedText = (textVal) => {
    if (!trimmedSearch || !textVal) return textVal;
    const lower = textVal.toLowerCase();
    const qLen = trimmedSearch.length;
    const parts = [];
    let lastIdx = 0;
    let idx = lower.indexOf(trimmedSearch, lastIdx);
    let k = 0;
    while (idx !== -1) {
      if (idx > lastIdx) parts.push(textVal.slice(lastIdx, idx));
      parts.push(
        <mark key={k++} className="bg-amber-300 text-zinc-900 rounded px-0.5">
          {textVal.slice(idx, idx + qLen)}
        </mark>
      );
      lastIdx = idx + qLen;
      idx = lower.indexOf(trimmedSearch, lastIdx);
    }
    if (lastIdx < textVal.length) parts.push(textVal.slice(lastIdx));
    return parts;
  };

  // Blokir & Buka Blokir
  const handleBlockUser = async () => {
    if (!currentUser || !otherUser?.id) return;
    const { error } = await supabase.from('blocked_users').insert({
      blocker_id: currentUser.id,
      blocked_id: otherUser.id,
    });
    if (!error) {
      setIBlockedOther(true);
      setShowProfileModal(false);
    }
  };

  const handleUnblockUser = async () => {
    if (!currentUser || !otherUser?.id) return;
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', currentUser.id)
      .eq('blocked_id', otherUser.id);
    if (!error) {
      setIBlockedOther(false);
    }
  };

  // Voice Note
  const startRecording = async () => {
    if (isRecording || uploadingVoice || iBlockedOther || otherBlockedMe) return;
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
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
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
          const ext = finalMime.includes('mp4') ? 'm4a' : finalMime.includes('ogg') ? 'ogg' : 'webm';
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
              reply_to_id: replyingTo?.id || null,
            })
            .select(
              'id, room_id, sender_id, content, created_at, read_at, media_url, media_type, reply_to_id, edited_at, is_deleted, reactions, is_view_once, view_once_opened_at, is_pinned, pinned_at, pinned_by, is_forwarded, file_name, file_size'
            )
            .single();
          if (msgErr) throw msgErr;

          setReplyingTo(null);
          if (msgData) {
            setMessages((prev) => (prev.some((m) => m.id === msgData.id) ? prev : [...prev, msgData]));
            scrollToBottom();
            sendPushNotification({
              roomId,
              title: myProfile?.display_name || myProfile?.username || 'Voice Note',
              body: '🎤 Mengirim voice note',
              url: `/chat/${roomId}`,
              tag: `room-${roomId}`,
            });
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
      timerRef.current = setInterval(() => setRecordingSec((s) => s + 1), 1000);
    } catch {
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
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
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

  const isOtherOnline = Boolean(otherUser?.id && onlineUsers.has(otherUser.id));
  const isBlocked = iBlockedOther || otherBlockedMe;

  return (
    <div
      className={`w-full h-[100dvh] flex flex-col transition-colors ${
        isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      {/* Header Chat (Status Online / Mengetik + Tombol Telepon & Video Call) */}
      <header
        className={`px-2.5 py-2.5 border-b flex items-center justify-between gap-1 shrink-0 ${
          isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
            <div className="relative shrink-0">
              <Avatar
                src={otherUser?.avatar_url}
                name={otherUser?.display_name || otherUser?.username}
                size="sm"
              />
              {isOtherOnline && !isBlocked && (
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ${
                    isDark ? 'ring-[#09090B]' : 'ring-white'
                  }`}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">
                {otherUser?.display_name || otherUser?.username || 'Obrolan'}
              </p>
              <p
                className={`text-[11px] truncate ${
                  isOtherTyping
                    ? 'text-blue-500 font-semibold'
                    : isOtherOnline && !isBlocked
                      ? 'text-emerald-500 font-medium'
                      : isDark
                        ? 'text-zinc-400'
                        : 'text-zinc-500'
                }`}
              >
                {isBlocked
                  ? 'Diblokir'
                  : isOtherTyping
                    ? 'Sedang mengetik...'
                    : isOtherOnline
                      ? 'Online'
                      : formatLastSeen(otherUser?.last_seen)}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isBlocked && otherUser?.id && (
            <>
              <button
                onClick={() => callCtx?.startCall({ roomId, targetUser: otherUser, callType: 'audio' })}
                title="Telepon Suara"
                className={`p-2 rounded-xl transition ${
                  isDark ? 'hover:bg-zinc-800 text-zinc-200' : 'hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                onClick={() => callCtx?.startCall({ roomId, targetUser: otherUser, callType: 'video' })}
                title="Video Call"
                className={`p-2 rounded-xl transition ${
                  isDark ? 'hover:bg-zinc-800 text-zinc-200' : 'hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => {
              setShowSearch((s) => !s);
              setChatSearchQuery('');
              setSearchIdx(0);
            }}
            title="Cari Pesan di Chat"
            className={`p-2 rounded-xl transition ${
              showSearch
                ? 'bg-blue-600 text-white'
                : isDark
                  ? 'hover:bg-zinc-800 text-zinc-200'
                  : 'hover:bg-zinc-100 text-zinc-700'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>
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
        </div>
      </header>

      {/* Bar Pencarian Pesan di Dalam Chat */}
      {showSearch && (
        <div
          className={`px-3 py-2 border-b flex items-center gap-2 shrink-0 ${
            isDark ? 'bg-[#121215] border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={chatSearchQuery}
            onChange={(e) => setChatSearchQuery(e.target.value)}
            placeholder="Cari kata kunci atau nama file..."
            className={`flex-1 bg-transparent text-xs focus:outline-none ${
              isDark ? 'text-white placeholder-zinc-500' : 'text-zinc-900 placeholder-zinc-400'
            }`}
          />
          {trimmedSearch && (
            <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
              {searchMatches.length > 0 ? `${searchIdx + 1}/${searchMatches.length}` : '0/0'}
            </span>
          )}
          <button
            type="button"
            onClick={() => jumpSearch(-1)}
            disabled={searchMatches.length === 0}
            className="p-1 rounded-lg disabled:opacity-30 hover:bg-zinc-500/15"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => jumpSearch(1)}
            disabled={searchMatches.length === 0}
            className="p-1 rounded-lg disabled:opacity-30 hover:bg-zinc-500/15"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              setChatSearchQuery('');
            }}
            className="p-1 rounded-lg text-zinc-400 hover:text-red-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Banner Pesan Disematkan */}
      {latestPinned && (
        <div
          className={`px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'bg-blue-950/30 border-zinc-800' : 'bg-blue-50/90 border-blue-100'
          }`}
        >
          <button
            type="button"
            onClick={() => scrollToMessage(latestPinned.id)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            <Pin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">
                Pesan Disematkan {pinnedMessages.length > 1 ? `(${pinnedMessages.length})` : ''}
              </p>
              <p className={`text-xs truncate ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {snippetOf(latestPinned)}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleTogglePinMessage(latestPinned)}
            title="Lepas sematan"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 shrink-0"
          >
            <PinOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
            const repliedMsg = msg.reply_to_id
              ? messages.find((m) => m.id === msg.reply_to_id)
              : null;
            const reactionEntries = Object.entries(msg.reactions || {}).filter(
              ([, users]) => Array.isArray(users) && users.length > 0
            );

            return (
              <div
                id={`msg-${msg.id}`}
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div className={`flex items-end gap-2 max-w-[85%] ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && (
                    <Avatar
                      src={otherUser?.avatar_url}
                      name={otherUser?.display_name || otherUser?.username}
                      size="xs"
                      className="mb-0.5"
                    />
                  )}

                  <div
                    onClick={() => {
                      if (!msg.is_deleted) setSelectedMsg(msg);
                    }}
                    className={`px-3 py-2 rounded-2xl text-sm break-words shadow-xs cursor-pointer select-text ${
                      msg.is_deleted
                        ? isDark
                          ? 'bg-zinc-900 text-zinc-500 italic border border-zinc-800'
                          : 'bg-zinc-200/70 text-zinc-500 italic'
                        : isMine
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : isDark
                            ? 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                            : 'bg-white text-zinc-900 border border-zinc-200 rounded-bl-sm'
                    }`}
                  >
                    {/* Quote Reply */}
                    {repliedMsg && !msg.is_deleted && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          document
                            .getElementById(`msg-${repliedMsg.id}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className={`mb-1.5 pl-2.5 pr-2 py-1 rounded-lg border-l-2 text-xs ${
                          isMine
                            ? 'bg-blue-700/60 border-blue-200 text-blue-50'
                            : isDark
                              ? 'bg-zinc-900/70 border-blue-400 text-zinc-300'
                              : 'bg-zinc-100 border-blue-600 text-zinc-600'
                        }`}
                      >
                        <p className="font-bold text-[11px] truncate">
                          {repliedMsg.sender_id === currentUser?.id
                            ? 'Anda'
                            : otherUser?.display_name || otherUser?.username}
                        </p>
                        <p className="truncate opacity-85">{snippetOf(repliedMsg)}</p>
                      </div>
                    )}

                    <span id={`msg-${msg.id}`} className="scroll-mt-28 block h-0" />
                    {highlightedMsgId === msg.id && (
                      <div className="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/25 text-amber-300 text-[10px] font-semibold">
                        Pesan ditemukan
                      </div>
                    )}
                    {!msg.is_deleted && (msg.is_forwarded || msg.is_pinned) && (
                      <div
                        className={`flex items-center gap-2 mb-1 text-[10px] font-medium ${
                          isMine ? 'text-blue-100/85' : 'text-zinc-400'
                        }`}
                      >
                        {msg.is_forwarded && (
                          <span className="inline-flex items-center gap-1 italic">
                            <Forward className="w-3 h-3" /> Diteruskan
                          </span>
                        )}
                        {msg.is_pinned && (
                          <span className="inline-flex items-center gap-1">
                            <Pin className="w-3 h-3" /> Disematkan
                          </span>
                        )}
                      </div>
                    )}
                    {/* Pesan Dihapus */}
                    {msg.is_deleted ? (
                      <p className="text-xs">🚫 Pesan ini telah dihapus</p>
                    ) : msg.is_view_once ? (
                      /* Media 1x Lihat */
                      <div onClick={(e) => e.stopPropagation()}>
                        {isMine ? (
                          <div className="flex items-center gap-2 py-0.5 text-xs font-medium text-blue-100">
                            <span className="w-6 h-6 rounded-full border border-dashed border-blue-200 flex items-center justify-center text-[10px] font-bold">
                              1
                            </span>
                            <span>
                              {msg.media_type === 'video' ? 'Video' : 'Foto'} 1x lihat •{' '}
                              {msg.view_once_opened_at ? 'Sudah dibuka' : 'Belum dibuka'}
                            </span>
                          </div>
                        ) : msg.view_once_opened_at || !msg.media_url ? (
                          <div className="flex items-center gap-2 py-0.5 text-xs opacity-60 italic">
                            <EyeOff className="w-4 h-4" />
                            <span>
                              {msg.media_type === 'video' ? 'Video' : 'Foto'} 1x lihat sudah dibuka
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenViewOnce(msg)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                              isDark
                                ? 'bg-blue-600/25 text-blue-300 hover:bg-blue-600/35'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                          >
                            <Eye className="w-4 h-4" />
                            <span>
                              Buka {msg.media_type === 'video' ? 'Video' : 'Foto'} (1x Lihat)
                            </span>
                          </button>
                        )}
                        {msg.content && !msg.view_once_opened_at && (
                          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Foto Normal + Tombol Simpan */}
                        {msg.media_type === 'image' && msg.media_url && (
                          <div className="relative mb-1.5 group">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxImage(msg.media_url);
                              }}
                              className="block overflow-hidden rounded-xl"
                            >
                              <img
                                src={msg.media_url}
                                alt="Foto"
                                className="max-h-64 w-auto max-w-full rounded-xl object-cover"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveMedia(msg);
                              }}
                              title="Simpan Foto"
                              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition"
                            >
                              {savingMediaId === msg.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}

                        {/* Video Normal + Tombol Simpan */}
                        {msg.media_type === 'video' && msg.media_url && (
                          <div onClick={(e) => e.stopPropagation()} className="mb-1.5 space-y-1">
                            <video
                              src={msg.media_url}
                              controls
                              playsInline
                              preload="metadata"
                              className="max-h-64 w-full rounded-xl bg-black"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveMedia(msg)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                                isMine
                                  ? 'bg-white/15 hover:bg-white/25 text-white'
                                  : isDark
                                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                              }`}
                            >
                              {savingMediaId === msg.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              Simpan Video
                            </button>
                          </div>
                        )}

                        {/* Voice Note / Audio */}
                        {msg.media_type === 'audio' && msg.media_url && (
                          <div onClick={(e) => e.stopPropagation()} className="min-w-[210px] py-0.5">
                            <audio src={msg.media_url} controls preload="metadata" className="w-full h-9" />
                          </div>
                        )}

                        {/* Dokumen & File Umum */}
                        {msg.media_type === 'file' && msg.media_url && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`mb-1.5 p-2.5 rounded-xl border flex items-center justify-between gap-2.5 min-w-[210px] ${
                              isMine
                                ? 'bg-black/15 border-white/20 text-white'
                                : isDark
                                  ? 'bg-zinc-900/80 border-zinc-700 text-zinc-100'
                                  : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  isMine ? 'bg-white/15' : 'bg-blue-600/15 text-blue-600'
                                }`}
                              >
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">
                                  {renderHighlightedText(msg.file_name || 'Dokumen')}
                                </p>
                                {msg.file_size > 0 && (
                                  <p className={`text-[10px] ${isMine ? 'text-blue-100/80' : 'text-zinc-400'}`}>
                                    {formatFileSize(msg.file_size)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveMedia(msg)}
                              title="Unduh Dokumen"
                              className={`p-2 rounded-lg shrink-0 transition ${
                                isMine
                                  ? 'bg-white/15 hover:bg-white/25 text-white'
                                  : isDark
                                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                                    : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
                              }`}
                            >
                              {savingMediaId === msg.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        )}

                        {msg.content && (
                          <>
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {renderHighlightedText(msg.content)}
                            </p>
                            <LinkPreviewCard text={msg.content} isMe={isMine} isDark={isDark} />
                          </>
                        )}
                      </>
                    )}

                    {/* Waktu, Label Diedit & Tanda Baca */}
                    <div
                      className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                        msg.is_deleted
                          ? 'text-zinc-500'
                          : isMine
                            ? 'text-blue-100'
                            : 'text-zinc-400'
                      }`}
                    >
                      {msg.edited_at && !msg.is_deleted && <span className="italic">diedit</span>}
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isMine &&
                        !msg.is_deleted &&
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

                {/* Baris Reaksi Emoji */}
                {reactionEntries.length > 0 && !msg.is_deleted && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'mr-1' : 'ml-9'}`}>
                    {reactionEntries.map(([emoji, users]) => {
                      const reactedByMe = users.includes(currentUser?.id);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleToggleReaction(msg.id, emoji)}
                          className={`px-1.5 py-0.5 rounded-full text-xs border flex items-center gap-1 transition ${
                            reactedByMe
                              ? 'bg-blue-600/15 border-blue-500 text-blue-600'
                              : isDark
                                ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                                : 'bg-white border-zinc-200 text-zinc-700'
                          }`}
                        >
                          <span>{emoji}</span>
                          {users.length > 1 && <span className="text-[10px] font-bold">{users.length}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Indikator Sedang Mengetik */}
        {isOtherTyping && !isBlocked && (
          <div className="flex items-center gap-2">
            <Avatar
              src={otherUser?.avatar_url}
              name={otherUser?.display_name || otherUser?.username}
              size="xs"
            />
            <div
              className={`px-3.5 py-2 rounded-2xl text-xs italic ${
                isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-white text-zinc-500 border border-zinc-200'
              }`}
            >
              Sedang mengetik...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Banner Reply atau Edit */}
      {(replyingTo || editingMsg) && !isBlocked && (
        <div
          className={`px-3 py-2 border-t flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="min-w-0 border-l-2 border-blue-600 pl-2.5">
            <p className="text-[11px] font-bold text-blue-600">
              {editingMsg
                ? 'Mengedit pesan'
                : `Membalas ${
                    replyingTo.sender_id === currentUser?.id
                      ? 'diri sendiri'
                      : otherUser?.display_name || otherUser?.username
                  }`}
            </p>
            <p className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {editingMsg ? editingMsg.content : snippetOf(replyingTo)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyingTo(null);
              if (editingMsg) {
                setEditingMsg(null);
                setText('');
              }
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Preview Foto/Video + Toggle 1x Lihat */}
      {pendingMedia && !isBlocked && (
        <div
          className={`px-3 py-2 border-t flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {pendingMedia.type === 'image' ? (
              <img
                src={pendingMedia.previewUrl}
                alt="Preview"
                className="w-11 h-11 rounded-lg object-cover shrink-0 border border-black/10"
              />
            ) : pendingMedia.type === 'video' ? (
              <video src={pendingMedia.previewUrl} className="w-11 h-11 rounded-lg object-cover shrink-0 bg-black" />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-blue-600/15 text-blue-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{pendingMedia.file.name}</p>
              <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {isViewOnce
                  ? 'Mode 1x Lihat aktif'
                  : `${formatFileSize(pendingMedia.file.size)} · Siap dikirim`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {(pendingMedia.type === 'image' || pendingMedia.type === 'video') && (
              <button
                type="button"
                onClick={() => setIsViewOnce((v) => !v)}
                title="Aktifkan Foto/Video 1x Lihat"
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                  isViewOnce
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : isDark
                      ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                      : 'bg-white border-zinc-300 text-zinc-700'
                }`}
              >
                1x
              </button>
            )}
            <button
              type="button"
              onClick={clearPendingMedia}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Footer: Banner Blokir ATAU Input Bar */}
      {isBlocked ? (
        <div
          className={`p-3.5 border-t text-center shrink-0 ${
            isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          {iBlockedOther ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-xs text-zinc-500">Anda memblokir pengguna ini.</span>
              <button
                onClick={handleUnblockUser}
                className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
              >
                Buka Blokir
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Anda tidak dapat mengirim pesan ke pengguna ini.</p>
          )}
        </div>
      ) : isRecording ? (
        <div
          className={`p-2.5 border-t flex items-center justify-between gap-3 shrink-0 ${
            isDark ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          <button
            type="button"
            onClick={cancelRecording}
            className="p-2.5 rounded-xl bg-red-500/15 text-red-500"
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
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center gap-1.5"
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
            accept={ANDROID_MEDIA_ACCEPT}
            onChange={handleMediaSelect}
            className="hidden"
          />

          {!editingMsg && (
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={sending || uploadingVoice}
              title="Kirim Foto, Video, Audio, atau Dokumen"
              className={`p-2.5 rounded-xl border transition shrink-0 ${
                isDark
                  ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-700'
              }`}
            >
              <Paperclip className="w-5 h-5" />
            </button>
          )}

          <textarea
            rows={1}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              editingMsg
                ? 'Edit pesan...'
                : uploadingVoice
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

          {text.trim() || pendingMedia || editingMsg ? (
            <button
              type="submit"
              disabled={sending || (editingMsg && !text.trim())}
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
              {uploadingVoice ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
        </form>
      )}

      {/* Bottom Sheet Aksi Pesan (Reaksi Emoji, Balas, Edit, Hapus) */}
      {selectedMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center p-3"
          onClick={() => setSelectedMsg(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-2xl p-4 shadow-xl space-y-3 ${
              isDark ? 'bg-[#121215] border border-zinc-800 text-zinc-100' : 'bg-white text-zinc-900'
            }`}
          >
            {/* Reaksi Cepat */}
            <div className="flex items-center justify-around py-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleToggleReaction(selectedMsg.id, emoji)}
                  className="text-2xl p-1.5 rounded-full hover:scale-125 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className={`border-t pt-2 space-y-1 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <button
                onClick={() => {
                  setReplyingTo(selectedMsg);
                  setEditingMsg(null);
                  setSelectedMsg(null);
                }}
                className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                  isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                }`}
              >
                <Reply className="w-4 h-4 text-blue-600" /> Balas Pesan
              </button>

              {!selectedMsg.is_deleted && (
                <button
                  onClick={() => handleTogglePinMessage(selectedMsg)}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                    isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                  }`}
                >
                  {selectedMsg.is_pinned ? (
                    <>
                      <PinOff className="w-4 h-4 text-amber-500" /> Lepas Sematan
                    </>
                  ) : (
                    <>
                      <Pin className="w-4 h-4 text-blue-600" /> Sematkan Pesan
                    </>
                  )}
                </button>
              )}

              {!selectedMsg.is_deleted && !selectedMsg.is_view_once && (
                <button
                  onClick={() => openForwardModal(selectedMsg)}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                    isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                  }`}
                >
                  <Forward className="w-4 h-4 text-emerald-500" /> Teruskan Pesan
                </button>
              )}

              {selectedMsg.media_url && !selectedMsg.is_view_once && !selectedMsg.is_deleted && (
                <button
                  onClick={() => {
                    const target = selectedMsg;
                    setSelectedMsg(null);
                    handleSaveMedia(target);
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                    isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                  }`}
                >
                  <Download className="w-4 h-4 text-blue-500" /> Simpan ke Perangkat
                </button>
              )}

              {selectedMsg.sender_id === currentUser?.id &&
                !selectedMsg.media_url &&
                !selectedMsg.is_view_once &&
                selectedMsg.content && (
                  <button
                    onClick={() => {
                      setEditingMsg(selectedMsg);
                      setReplyingTo(null);
                      setText(selectedMsg.content);
                      setSelectedMsg(null);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                    }`}
                  >
                    <Pencil className="w-4 h-4 text-amber-500" /> Edit Pesan
                  </button>
                )}

              {selectedMsg.sender_id === currentUser?.id && (
                <button
                  onClick={() => handleDeleteMessage(selectedMsg)}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-red-500 ${
                    isDark ? 'hover:bg-zinc-800' : 'hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="w-4 h-4" /> Hapus untuk Semua Orang
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Fullscreen Foto/Video 1x Lihat */}
      {viewOnceViewer && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4 select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/15">
              1x Lihat — akan hilang setelah ditutup
            </span>
            <button
              onClick={handleCloseViewOnce}
              className="p-2 rounded-full bg-white/15 hover:bg-white/25"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {viewOnceViewer.type === 'video' ? (
            <video
              src={viewOnceViewer.url}
              controls
              controlsList="nodownload"
              disablePictureInPicture
              autoPlay
              playsInline
              className="max-w-full max-h-[80vh] rounded-xl"
            />
          ) : (
            <img
              src={viewOnceViewer.url}
              alt="1x lihat"
              className="max-w-full max-h-[80vh] rounded-xl object-contain pointer-events-none"
            />
          )}

          {viewOnceViewer.caption && (
            <p className="mt-4 text-sm text-white text-center max-w-md">{viewOnceViewer.caption}</p>
          )}
        </div>
      )}

      {/* Modal Fullscreen Foto Biasa */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                saveMediaToDevice({ url: lightboxImage, mediaType: 'image', isViewOnce: false }).catch(
                  () => {}
                );
              }}
              title="Simpan Foto ke HP"
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={() => setLightboxImage(null)}
              className="p-2 rounded-full bg-white/15 text-white"
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

      {/* Modal Teruskan Pesan */}
      {forwardingMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setForwardingMsg(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 shadow-xl max-h-[75vh] flex flex-col ${
              isDark ? 'bg-[#121215] text-zinc-100 border border-zinc-800' : 'bg-white text-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <Forward className="w-4 h-4 text-emerald-500" /> Teruskan ke...
              </h2>
              <button
                type="button"
                onClick={() => setForwardingMsg(null)}
                className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              className={`mb-3 p-2.5 rounded-xl text-xs truncate ${
                isDark ? 'bg-zinc-900 text-zinc-300' : 'bg-zinc-100 text-zinc-700'
              }`}
            >
              {snippetOf(forwardingMsg)}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/30">
              {loadingForwardRooms ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                </div>
              ) : forwardRooms.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-500">Belum ada obrolan tujuan.</p>
              ) : (
                forwardRooms.map((target) => (
                  <button
                    key={target.roomId}
                    type="button"
                    disabled={forwardingToRoomId === target.roomId}
                    onClick={() => handleForwardToRoom(target)}
                    className={`w-full py-2.5 px-2 flex items-center justify-between gap-3 text-left rounded-xl transition ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={target.user.avatar_url}
                        name={target.user.display_name || target.user.username}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {target.user.display_name || target.user.username}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">@{target.user.username}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 shrink-0">
                      {forwardingToRoomId === target.roomId ? 'Mengirim...' : 'Kirim'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Info Profil Lawan Bicara + Tombol Blokir / Buka Blokir */}
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
                  className={`mt-2 inline-flex items-center text-xs px-3 py-1 rounded-full ${
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
                  <p className="text-[11px] text-zinc-400">Bio</p>
                  <p className="text-sm">{otherUser.bio || 'Belum menambahkan bio.'}</p>
                </div>
              </div>

              {otherUser.location && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-zinc-400">Lokasi</p>
                    <p className="text-sm">{otherUser.location}</p>
                  </div>
                </div>
              )}

              {otherUser.created_at && (
                <div className="flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-zinc-400">Bergabung Sejak</p>
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

            <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              {iBlockedOther ? (
                <button
                  onClick={handleUnblockUser}
                  className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" /> Buka Blokir Pengguna
                </button>
              ) : (
                <button
                  onClick={handleBlockUser}
                  className="w-full py-2.5 rounded-xl bg-red-500/15 text-red-500 hover:bg-red-500/25 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" /> Blokir Pengguna
                </button>
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
