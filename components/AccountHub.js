'use client';

import { useEffect, useRef, useState } from 'react';
import {
  KeyRound,
  Lock,
  BookUser,
  MessageSquareText,
  Palette,
  CalendarDays,
  Bell,
  Smartphone,
  Plus,
  Pencil,
  Share2,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Star,
  Archive,
  Users,
  ShieldCheck,
  Sun,
  Moon,
  BellOff,
  LogOut,
  CheckCircle2,
  ImagePlus,
  Download,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import { ANDROID_IMAGE_ACCEPT } from '../lib/security';

export default function AccountHub({
  user,
  profile,
  isDark,
  toggleTheme,
  rooms,
  blockedList,
  pushState,
  pushBusy,
  onTogglePush,
  onLogout,
  onOpenStarred,
  onOpenArchived,
  onOpenCreateGroup,
  onOpenFilter,
  onZoomAvatar,
  fileInputRef,
  onPhotoSelect,
  editDisplayName,
  setEditDisplayName,
  editUsername,
  setEditUsername,
  editBio,
  setEditBio,
  editStatus,
  setEditStatus,
  editLocation,
  setEditLocation,
  editAvatar,
  setEditAvatar,
  editBannerUrl,
  setEditBannerUrl,
  editBannerType,
  setEditBannerType,
  savingProfile,
  onSaveProfile,
  onUnblockUser,
  isPwaInstalled,
  pwaReady,
  onInstallPwa,
}) {
  const [section, setSection] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [savingEv, setSavingEv] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerInputRef = useRef(null);

  // Kontrol VVIP khusus @dev
  const isDevOwner = String(profile?.username || '').toLowerCase() === 'dev';
  const [vvipUsername, setVvipUsername] = useState('');
  const [vvipBusy, setVvipBusy] = useState(false);
  const [vvipMsg, setVvipMsg] = useState('');
  const [vvipList, setVvipList] = useState([]);

  const loadEvents = async () => {
    if (!user?.id) return;
    setLoadingEvents(true);
    const { data } = await supabase
      .from('user_events')
      .select('id, title, event_date, location, notes')
      .eq('user_id', user.id)
      .order('event_date', { ascending: true });
    setEvents(data || []);
    setLoadingEvents(false);
  };

  const loadVvipUsers = async () => {
    if (!isDevOwner) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, badge_type')
      .eq('is_verified', true)
      .order('username', { ascending: true });
    setVvipList(data || []);
  };

  useEffect(() => {
    if (section === 'events') loadEvents();
    if (section === 'account' && isDevOwner) loadVvipUsers();
  }, [section, isDevOwner]);

  const handleBannerSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;

    const isVideo = file.type.startsWith('video/');
    if (file.size > 18 * 1024 * 1024) {
      alert('Ukuran maksimal sampul foto/video adalah 18 MB.');
      return;
    }

    setUploadingBanner(true);
    try {
      const ext = isVideo
        ? (file.name.split('.').pop() || 'mp4').toLowerCase()
        : (file.name.split('.').pop() || 'jpg').toLowerCase();
      const filePath = `banners/${user.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      const nextUrl = urlData.publicUrl;
      const nextType = isVideo ? 'video' : 'image';

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ banner_url: nextUrl, banner_type: nextType })
        .eq('id', user.id);
      if (dbErr) throw dbErr;

      setEditBannerUrl?.(nextUrl);
      setEditBannerType?.(nextType);
    } catch (err) {
      alert('Gagal mengunggah sampul profil: ' + (err.message || 'Coba lagi.'));
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveBanner = async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ banner_url: '', banner_type: '' })
      .eq('id', user.id);
    setEditBannerUrl?.('');
    setEditBannerType?.('');
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!evTitle.trim() || !evDate || savingEv) return;
    setSavingEv(true);
    const { error } = await supabase.from('user_events').insert({
      user_id: user.id,
      title: evTitle.trim(),
      event_date: new Date(evDate).toISOString(),
      location: evLocation.trim(),
    });
    setSavingEv(false);
    if (error) {
      alert('Gagal menyimpan acara: ' + error.message);
      return;
    }
    setEvTitle('');
    setEvDate('');
    setEvLocation('');
    loadEvents();
  };

  const handleDeleteEvent = async (id) => {
    await supabase.from('user_events').delete().eq('id', id);
    setEvents((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSetVvip = async (targetUname, enable, badgeType = 'vvip') => {
    const clean = String(targetUname || '').trim().replace(/^@/, '');
    if (!clean || vvipBusy) return;
    setVvipBusy(true);
    setVvipMsg('');
    const { data, error } = await supabase.rpc('dev_set_user_badge', {
      p_target_username: clean,
      p_is_verified: enable,
      p_badge_type: enable ? badgeType : '',
    });
    setVvipBusy(false);
    if (error) {
      setVvipMsg('Gagal: ' + error.message);
      return;
    }
    setVvipUsername('');
    setVvipMsg(
      enable
        ? `@${data.username} berhasil diberi Centang Biru & ${(data.badge_type || 'verified').toUpperCase()}`
        : `Centang Biru & VVIP untuk @${data.username} telah dicabut`
    );
    loadVvipUsers();
  };

  const handleShareProfile = async () => {
    const text = `Ayo chat saya di rzchat: @${profile?.username || ''}`;
    if (navigator.share) {
      navigator.share({ title: 'rzchat', text, url: window.location.origin }).catch(() => {});
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      alert('Username disalin ke clipboard!');
    }
  };

  const cardClass = isDark
    ? 'bg-[#121216] border border-zinc-800/90 text-zinc-100'
    : 'bg-white border border-zinc-200 text-zinc-900';
  const inputClass = isDark
    ? 'w-full px-3.5 py-2.5 rounded-xl text-sm bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500'
    : 'w-full px-3.5 py-2.5 rounded-xl text-sm bg-zinc-50 border border-zinc-300 text-zinc-900 focus:outline-none focus:border-emerald-600';

  const groupCount = rooms.filter((r) => r.isGroup).length;
  const favCount = rooms.filter((r) => r.isFavorite).length;
  const archivedCount = rooms.filter((r) => r.isArchived).length;

  const activeBannerUrl = editBannerUrl !== null && editBannerUrl !== undefined ? editBannerUrl : (profile?.banner_url || '');
  const activeBannerType = editBannerType !== null && editBannerType !== undefined ? editBannerType : (profile?.banner_type || '');

  const menuItems = [
    {
      id: 'account',
      icon: KeyRound,
      title: 'Akun',
      desc: isDevOwner
        ? 'Sampul foto/video, edit profil & kontrol VVIP'
        : 'Sampul foto/video, edit profil, bio & status',
    },
    {
      id: 'privacy',
      icon: Lock,
      title: 'Privasi',
      desc: `Akun diblokir (${blockedList.length}), kontrol keamanan`,
    },
    {
      id: 'lists',
      icon: BookUser,
      title: 'Daftar',
      desc: `Kelola orang, favorit (${favCount}) & grup (${groupCount})`,
    },
    {
      id: 'chat',
      icon: MessageSquareText,
      title: 'Chat',
      desc: `Pesan berbintang, arsip obrolan (${archivedCount})`,
    },
    {
      id: 'appearance',
      icon: Palette,
      title: 'Tampilan',
      desc: isDark ? 'Tema Gelap aktif · Ubah tema aplikasi' : 'Tema Terang aktif · Ubah tema aplikasi',
    },
    {
      id: 'events',
      icon: CalendarDays,
      title: 'Acara',
      desc: 'Lihat, buat, dan kelola jadwal acara',
    },
    {
      id: 'notifications',
      icon: Bell,
      title: 'Notifikasi',
      desc: pushState?.enabled ? 'Notifikasi push aktif' : 'Aktifkan notifikasi pesan & panggilan',
    },
    {
      id: 'pwa',
      icon: Smartphone,
      title: 'Aplikasi PWA',
      desc: isPwaInstalled
        ? 'Terpasang sebagai aplikasi di perangkat ini'
        : pwaReady
          ? 'Siap di-install langsung ke layar utama'
          : 'Pasang rzchat sebagai aplikasi asli di HP',
    },
  ];

  // SUB-HALAMAN DETAIL KETIKA MENU DIKLIK
  if (section) {
    const activeItem = menuItems.find((m) => m.id === section);
    return (
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto space-y-4 pb-8">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSection(null)}
              className={`p-2 rounded-xl transition ${
                isDark ? 'hover:bg-zinc-800 text-zinc-200' : 'hover:bg-zinc-200/70 text-zinc-800'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-bold text-base leading-tight">{activeItem?.title}</h2>
              <p className="text-[11px] text-zinc-400">{activeItem?.desc}</p>
            </div>
          </div>

          {section === 'account' && (
            <div className="space-y-4">
              {/* Pengaturan Sampul Foto / Video Profil */}
              <div className={`rounded-2xl p-4 space-y-3 ${cardClass}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Sampul Atas Profil (Foto / Video)
                  </h3>
                  {activeBannerUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveBanner}
                      className="text-[11px] font-semibold text-red-500"
                    >
                      Hapus Sampul
                    </button>
                  )}
                </div>
                <div className="relative h-28 rounded-xl overflow-hidden border border-zinc-700/40 bg-emerald-500/10 flex items-center justify-center">
                  {activeBannerUrl ? (
                    activeBannerType === 'video' ? (
                      <video
                        src={activeBannerUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={activeBannerUrl}
                        alt="Sampul Profil"
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <p className="text-xs text-zinc-400">Belum ada foto atau video sampul</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={uploadingBanner}
                  onClick={() => bannerInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-500 text-xs font-bold flex items-center justify-center gap-2 transition"
                >
                  {uploadingBanner ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Mengunggah Sampul...
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-4 h-4" /> Pilih Foto atau Video Sampul
                    </>
                  )}
                </button>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleBannerSelect}
                  className="hidden"
                />
              </div>

              {/* Kontrol VVIP Khusus @dev */}
              {isDevOwner && (
                <div className={`rounded-2xl p-4 space-y-3 ${cardClass}`}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sky-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Kontrol Developer · VVIP & Centang Biru
                    </h3>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Masukkan @username untuk memberi atau mencabut Centang Biru + tag VVIP.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={vvipUsername}
                      onChange={(e) => setVvipUsername(e.target.value)}
                      placeholder="@username target..."
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={vvipBusy || !vvipUsername.trim()}
                      onClick={() => handleSetVvip(vvipUsername, true, 'vvip')}
                      className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold shrink-0"
                    >
                      {vvipBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Beri VVIP'}
                    </button>
                  </div>
                  {vvipMsg && (
                    <p className="text-xs font-medium text-emerald-500 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {vvipMsg}
                    </p>
                  )}
                  {vvipList.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800/40 space-y-2">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        Akun Terverifikasi ({vvipList.length})
                      </p>
                      {vvipList.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between gap-2 py-1"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar src={u.avatar_url} name={u.display_name || u.username} size="xs" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate flex items-center gap-1">
                                <span>@{u.username}</span>
                                <VerifiedBadge user={u} size="xs" />
                              </p>
                            </div>
                          </div>
                          {String(u.username).toLowerCase() !== 'dev' && (
                            <button
                              type="button"
                              onClick={() => handleSetVvip(u.username, false, '')}
                              className="text-[11px] font-semibold text-red-500 px-2 py-1 rounded-lg hover:bg-red-500/10"
                            >
                              Cabut
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Form Edit Profil */}
              <form onSubmit={onSaveProfile} className={`rounded-2xl p-4 space-y-3 ${cardClass}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Informasi Profil
                  </h3>
                  {editAvatar && (
                    <button
                      type="button"
                      onClick={() => setEditAvatar('')}
                      className="text-[11px] font-semibold text-red-500"
                    >
                      Hapus Foto
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Nama Tampilan
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Status Singkat (Tampil tebal di atas foto profil)
                  </label>
                  <input
                    type="text"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    placeholder="Contoh: Sibuk, Tersedia, Coding..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Bio</label>
                  <textarea
                    rows={2}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tulis bio singkat..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Lokasi</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Kota / Negara"
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold"
                >
                  {savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </form>

              <button
                type="button"
                onClick={onLogout}
                className="w-full py-3 rounded-2xl border border-red-500/30 text-red-500 text-xs font-bold flex items-center justify-center gap-2 hover:bg-red-500/10 transition"
              >
                <LogOut className="w-4 h-4" /> Keluar dari Akun
              </button>
            </div>
          )}

          {section === 'privacy' && (
            <div className={`rounded-2xl p-4 space-y-3 ${cardClass}`}>
              <p className="text-xs font-bold">Pengguna Diblokir ({blockedList.length})</p>
              {blockedList.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">
                  Tidak ada pengguna yang diblokir.
                </p>
              ) : (
                <div className="space-y-2">
                  {blockedList.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between gap-2 py-2 border-b border-zinc-800/30 last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={u.avatar_url} name={u.display_name || u.username} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {u.display_name || u.username}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">@{u.username}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUnblockUser(u.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/15 text-emerald-500 text-xs font-semibold shrink-0"
                      >
                        Buka Blokir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === 'lists' && (
            <div className={`rounded-2xl divide-y ${isDark ? 'divide-zinc-800' : 'divide-zinc-200'} ${cardClass}`}>
              <button
                type="button"
                onClick={() => {
                  setSection(null);
                  onOpenFilter('favorites');
                }}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold">Obrolan Favorit</p>
                    <p className="text-xs text-zinc-400">{favCount} obrolan ditandai favorit</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSection(null);
                  onOpenFilter('groups');
                }}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold">Daftar Grup</p>
                    <p className="text-xs text-zinc-400">{groupCount} grup aktif</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSection(null);
                  onOpenCreateGroup();
                }}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <Plus className="w-5 h-5 text-sky-500" />
                  <div>
                    <p className="text-sm font-semibold">Buat Grup Baru</p>
                    <p className="text-xs text-zinc-400">Undang teman dengan tautan grup</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          )}

          {section === 'chat' && (
            <div className={`rounded-2xl divide-y ${isDark ? 'divide-zinc-800' : 'divide-zinc-200'} ${cardClass}`}>
              <button
                type="button"
                onClick={onOpenStarred}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold">Pesan Berbintang</p>
                    <p className="text-xs text-zinc-400">Lihat semua pesan penting tersimpan</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSection(null);
                  onOpenArchived();
                }}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <Archive className="w-5 h-5 text-zinc-400" />
                  <div>
                    <p className="text-sm font-semibold">Obrolan Diarsipkan</p>
                    <p className="text-xs text-zinc-400">{archivedCount} obrolan di arsip</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          )}

          {section === 'appearance' && (
            <div className={`rounded-2xl p-4 space-y-3 ${cardClass}`}>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tema Aplikasi</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isDark) toggleTheme();
                  }}
                  className={`p-3.5 rounded-xl border text-left transition ${
                    !isDark
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-700 hover:bg-zinc-800/60'
                  }`}
                >
                  <Sun className="w-5 h-5 text-amber-500 mb-2" />
                  <p className="text-sm font-bold">Mode Terang</p>
                  <p className="text-[11px] text-zinc-400">Bersih & nyaman siang hari</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isDark) toggleTheme();
                  }}
                  className={`p-3.5 rounded-xl border text-left transition ${
                    isDark
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-300 hover:bg-zinc-100'
                  }`}
                >
                  <Moon className="w-5 h-5 text-sky-400 mb-2" />
                  <p className="text-sm font-bold">Mode Gelap</p>
                  <p className="text-[11px] text-zinc-400">Obsidian hemat baterai</p>
                </button>
              </div>
            </div>
          )}

          {section === 'events' && (
            <div className="space-y-4">
              <form onSubmit={handleAddEvent} className={`rounded-2xl p-4 space-y-2.5 ${cardClass}`}>
                <p className="text-xs font-bold">Buat Acara Baru</p>
                <input
                  type="text"
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="Nama acara (misal: Nongkrong, Meeting)"
                  className={inputClass}
                  required
                />
                <input
                  type="datetime-local"
                  value={evDate}
                  onChange={(e) => setEvDate(e.target.value)}
                  className={inputClass}
                  required
                />
                <input
                  type="text"
                  value={evLocation}
                  onChange={(e) => setEvLocation(e.target.value)}
                  placeholder="Lokasi (opsional)"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={savingEv}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  {savingEv ? 'Menyimpan...' : 'Simpan Acara'}
                </button>
              </form>

              <div className={`rounded-2xl p-4 space-y-2.5 ${cardClass}`}>
                <p className="text-xs font-bold">Daftar Acara ({events.length})</p>
                {loadingEvents ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-4 text-center">Belum ada jadwal acara.</p>
                ) : (
                  events.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-2 py-2 border-b border-zinc-800/30 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{ev.title}</p>
                        <p className="text-[11px] text-emerald-500 font-medium">
                          {new Date(ev.event_date).toLocaleString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        {ev.location && <p className="text-[11px] text-zinc-400">{ev.location}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {section === 'notifications' && (
            <div className={`rounded-2xl p-4 space-y-3 ${cardClass}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {pushState?.enabled ? (
                    <Bell className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <BellOff className="w-5 h-5 text-zinc-400" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">Notifikasi Push</p>
                    <p className="text-xs text-zinc-400">
                      {pushState?.supported
                        ? pushState.enabled
                          ? 'Aktif untuk pesan & panggilan masuk'
                          : 'Belum aktif di perangkat ini'
                        : 'Browser tidak mendukung push notification'}
                    </p>
                  </div>
                </div>
                {pushState?.supported && (
                  <button
                    type="button"
                    disabled={pushBusy}
                    onClick={onTogglePush}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold text-white shrink-0 ${
                      pushState.enabled ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {pushBusy ? '...' : pushState.enabled ? 'Matikan' : 'Aktifkan'}
                  </button>
                )}
              </div>
            </div>
          )}

          {section === 'pwa' && (
            <div className={`rounded-2xl p-4 space-y-3.5 ${cardClass}`}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">Install rzchat sebagai Aplikasi (PWA)</p>
                  <p className="text-xs text-zinc-400">
                    {isPwaInstalled
                      ? 'Aplikasi sudah terpasang dan berjalan dalam mode standalone.'
                      : 'Pasang langsung ke layar utama HP tanpa perlu lewat Play Store.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onInstallPwa}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-4 h-4" />
                {isPwaInstalled
                  ? 'Sudah Terpasang di Perangkat'
                  : pwaReady
                    ? 'Install Sekarang'
                    : 'Buka & Install Aplikasi'}
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // TAMPILAN UTAMA TAB AKUN (SAMPUL FULL-BLEED + TINGGI + AVATAR HALF-OVERLAP + STATUS SOFT BLUR)
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full pb-8">
        {/* Banner Sampul Full-Bleed Ujung ke Ujung Tanpa Celah Putih */}
        <div
          className={`relative w-full h-52 px-4 pt-3 flex items-start justify-end overflow-hidden ${
            isDark
              ? 'bg-gradient-to-b from-zinc-900 to-[#09090B]'
              : 'bg-gradient-to-b from-emerald-500/15 to-zinc-100/80'
          }`}
        >
          {activeBannerUrl && (
            activeBannerType === 'video' ? (
              <video
                src={activeBannerUrl}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <img
                src={activeBannerUrl}
                alt="Sampul Profil"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )
          )}
          {activeBannerUrl && (
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/25 pointer-events-none" />
          )}

          {/* Ikon Share & Edit Minimalis di Pojok Kanan Atas */}
          <div className="relative z-10 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleShareProfile}
              title="Bagikan Profil"
              className="p-2 rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur-md transition"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setSection('account')}
              title="Edit Profil & Sampul"
              className="p-2 rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur-md transition"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bagian Profil (Avatar Masuk Setengah ke Sampul + Kapsul Status Soft-Blur di Atasnya) */}
        <div className="max-w-lg mx-auto px-5 flex flex-col items-center text-center relative z-10 -mt-[78px]">
          {/* Kapsul Status Tetap di Atas Foto Profil dengan Efek Lembut / Agak Blur */}
          <button
            type="button"
            onClick={() => setSection('account')}
            className={`mb-2 px-3.5 py-1 rounded-full text-xs font-medium backdrop-blur-md border shadow-sm transition ${
              isDark
                ? 'bg-zinc-900/65 border-white/15 text-zinc-200/80'
                : 'bg-white/75 border-black/10 text-zinc-700/80'
            }`}
          >
            <span className="blur-[0.35px] opacity-90 tracking-normal">
              {editStatus || profile?.status_text || 'Tersedia'}
            </span>
          </button>

          {/* Avatar Masuk Setengah ke Area Sampul */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                onZoomAvatar({
                  url: editAvatar || '',
                  title: editDisplayName || editUsername || 'Foto Profil',
                  subtitle: editUsername ? `@${editUsername}` : '',
                })
              }
              className={`rounded-full cursor-zoom-in ring-4 ${
                isDark ? 'ring-[#09090B]' : 'ring-white'
              }`}
            >
              <Avatar
                src={editAvatar}
                name={editDisplayName || editUsername}
                size="xl"
              />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Ubah Foto Profil"
              className={`absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center ring-2 ${
                isDark ? 'ring-[#09090B]' : 'ring-white'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[2.6]" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ANDROID_IMAGE_ACCEPT}
              onChange={onPhotoSelect}
              className="hidden"
            />
          </div>

          <h2 className="mt-3 text-xl font-bold tracking-tight flex items-center justify-center gap-1.5">
            <span>{editDisplayName || profile?.display_name || editUsername}</span>
          </h2>
          <p
            className={`text-xs font-mono mt-0.5 flex items-center justify-center gap-1.5 ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            <span>@{editUsername || profile?.username}</span>
            <VerifiedBadge user={profile} size="sm" />
          </p>
        </div>

        {/* Daftar Menu Pengaturan */}
        <div className="max-w-lg mx-auto px-2 pt-3 space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full px-4 py-3.5 rounded-2xl flex items-center gap-4 text-left transition ${
                  isDark ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100/80'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 stroke-[1.7] ${
                    isDark ? 'text-zinc-300' : 'text-zinc-700'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-tight">{item.title}</p>
                  <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
