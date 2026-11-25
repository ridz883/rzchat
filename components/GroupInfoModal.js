'use client';

import { useRef, useState } from 'react';
import {
  X,
  Users,
  Camera,
  Link2,
  Copy,
  RefreshCw,
  Shield,
  UserPlus,
  UserMinus,
  LogOut,
  Trash2,
  Check,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ANDROID_IMAGE_ACCEPT } from '../lib/security';
import Avatar from './Avatar';

export default function GroupInfoModal({
  roomId,
  roomMeta,
  members = [],
  currentUser,
  myRole,
  isDark,
  onClose,
  onRefreshGroup,
  onDeletedOrLeft,
  onZoomAvatar,
}) {
  const fileRef = useRef(null);
  const isAdmin = myRole === 'admin' || roomMeta?.created_by === currentUser?.id;

  const [editName, setEditName] = useState(roomMeta?.name || '');
  const [editDesc, setEditDesc] = useState(roomMeta?.description || '');
  const [onlyAdmins, setOnlyAdmins] = useState(Boolean(roomMeta?.only_admins_can_send));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchAdd, setSearchAdd] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [busyUid, setBusyUid] = useState(null);

  const inviteUrl =
    typeof window !== 'undefined' && roomMeta?.invite_code
      ? `${window.location.origin}/join/${roomMeta.invite_code}`
      : '';

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(inviteUrl);
    }
  };

  const handleRegenerateInvite = async () => {
    if (!isAdmin) return;
    const { error } = await supabase.rpc('regenerate_group_invite', { p_room_id: String(roomId) });
    if (error) alert(error.message);
    else onRefreshGroup?.();
  };

  const handleSaveSettings = async () => {
    if (!isAdmin || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_group_settings', {
        p_room_id: String(roomId),
        p_name: editName.trim() || roomMeta?.name,
        p_description: editDesc.trim(),
        p_avatar_url: null,
        p_only_admins_can_send: onlyAdmins,
      });
      if (error) throw error;
      onRefreshGroup?.();
      alert('Pengaturan grup disimpan.');
    } catch (err) {
      alert(err.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const minSide = Math.min(img.width, img.height);
        canvas
          .getContext('2d')
          .drawImage(
            img,
            (img.width - minSide) / 2,
            (img.height - minSide) / 2,
            minSide,
            minSide,
            0,
            0,
            size,
            size
          );
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        await supabase.rpc('update_group_settings', {
          p_room_id: String(roomId),
          p_avatar_url: dataUrl,
        });
        onRefreshGroup?.();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSearchUser = async (val) => {
    setSearchAdd(val);
    const q = val.trim().replace(/^@+/, '').toLowerCase();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const existingIds = new Set(members.map((m) => m.user_id));
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', `%${q}%`)
      .limit(8);
    setSearchResults((data || []).filter((u) => !existingIds.has(u.id)));
  };

  const handleAddMember = async (u) => {
    setBusyUid(u.id);
    try {
      const { error } = await supabase.rpc('add_group_member', {
        p_room_id: String(roomId),
        p_target_user_id: u.id,
      });
      if (error) throw error;
      setSearchAdd('');
      setSearchResults([]);
      onRefreshGroup?.();
    } catch (err) {
      alert(err.message || 'Gagal menambah anggota.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleRole = async (m) => {
    const nextRole = m.role === 'admin' ? 'member' : 'admin';
    setBusyUid(m.user_id);
    try {
      const { error } = await supabase.rpc('set_group_member_role', {
        p_room_id: String(roomId),
        p_target_user_id: m.user_id,
        p_role: nextRole,
      });
      if (error) throw error;
      onRefreshGroup?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyUid(null);
    }
  };

  const handleKickOrLeave = async (targetUserId, isSelf) => {
    const ok = window.confirm(
      isSelf ? 'Keluar dari grup ini?' : 'Keluarkan anggota ini dari grup?'
    );
    if (!ok) return;
    setBusyUid(targetUserId);
    try {
      const { error } = await supabase.rpc('remove_group_member', {
        p_room_id: String(roomId),
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      if (isSelf) onDeletedOrLeft?.();
      else onRefreshGroup?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyUid(null);
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm('Hapus grup ini secara permanen untuk semua anggota?')) return;
    const { error } = await supabase.rpc('delete_group_room', { p_room_id: String(roomId) });
    if (error) alert(error.message);
    else onDeletedOrLeft?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 ${
          isDark ? 'bg-[#121215] text-zinc-100 border border-zinc-800' : 'bg-white text-zinc-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Info & Pengaturan Grup
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar & Nama Grup */}
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                onZoomAvatar?.({
                  images: roomMeta?.avatar_url ? [roomMeta.avatar_url] : [],
                  title: roomMeta?.name || 'Grup',
                  subtitle: `${members.length} anggota`,
                  canSave: Boolean(roomMeta?.avatar_url),
                })
              }
              className="rounded-full cursor-zoom-in"
            >
              <Avatar src={roomMeta?.avatar_url} name={roomMeta?.name || 'Grup'} size="xl" />
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-blue-600 text-white shadow"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ANDROID_IMAGE_ACCEPT}
                  onChange={handleChangeAvatar}
                  className="hidden"
                />
              </>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1.5">{members.length} Anggota</p>
        </div>

        {/* Kontrol Admin: Edit Nama, Deskripsi & Saklar Hanya Admin Kirim Pesan */}
        {isAdmin ? (
          <div
            className={`p-3.5 rounded-2xl border space-y-2.5 ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nama grup"
              className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                isDark ? 'bg-zinc-950 border-zinc-700 text-white' : 'bg-white border-zinc-300 text-zinc-900'
              }`}
            />
            <textarea
              rows={2}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Deskripsi grup..."
              className={`w-full px-3 py-1.5 rounded-xl text-xs border resize-none focus:outline-none ${
                isDark ? 'bg-zinc-950 border-zinc-700 text-white' : 'bg-white border-zinc-300 text-zinc-900'
              }`}
            />
            <label className="flex items-center justify-between gap-2 text-xs cursor-pointer py-1">
              <span className="font-medium">Hanya Admin yang Bisa Kirim Pesan</span>
              <input
                type="checkbox"
                checked={onlyAdmins}
                onChange={(e) => setOnlyAdmins(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSettings}
              className="w-full py-2 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Simpan Pengaturan Grup
            </button>
          </div>
        ) : (
          roomMeta?.description && (
            <p className="text-xs text-center text-zinc-400 px-3">{roomMeta.description}</p>
          )
        )}

        {/* Link Undangan Grup */}
        {inviteUrl && (
          <div
            className={`p-3 rounded-2xl border space-y-2 ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-blue-500" /> Tautan Undangan Grup
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleRegenerateInvite}
                  className="text-[11px] text-blue-500 font-semibold flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reset Link
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] border ${
                  isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-700'
                }`}
              />
              <button
                type="button"
                onClick={handleCopyInvite}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Disalin' : 'Salin'}
              </button>
            </div>
          </div>
        )}

        {/* Tambah Anggota (Admin) */}
        {isAdmin && (
          <div className="space-y-1.5">
            <div className="relative">
              <UserPlus className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchAdd}
                onChange={(e) => handleSearchUser(e.target.value)}
                placeholder="Tambah anggota via @username..."
                className={`w-full pl-8 pr-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                }`}
              />
            </div>
            {searchResults.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-blue-600/10"
              >
                <span className="text-xs font-semibold">
                  {u.display_name || u.username} (@{u.username})
                </span>
                <button
                  type="button"
                  disabled={busyUid === u.id}
                  onClick={() => handleAddMember(u)}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold"
                >
                  + Tambah
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Daftar Anggota & Peran Admin */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-zinc-400">Daftar Anggota ({members.length})</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {members.map((m) => {
              const p = m.profile || {};
              const isMemberAdmin = m.role === 'admin' || m.user_id === roomMeta?.created_by;
              const isMe = m.user_id === currentUser?.id;
              return (
                <div
                  key={m.user_id}
                  className={`p-2 rounded-xl flex items-center justify-between gap-2 ${
                    isDark ? 'bg-zinc-900/80' : 'bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={p.avatar_url} name={p.display_name || p.username} size="xs" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold truncate">
                          {p.display_name || p.username} {isMe ? '(Anda)' : ''}
                        </p>
                        {isMemberAdmin && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[9px] font-bold">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 truncate">@{p.username}</p>
                    </div>
                  </div>

                  {isAdmin && !isMe && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={busyUid === m.user_id}
                        onClick={() => handleToggleRole(m)}
                        title={isMemberAdmin ? 'Turunkan jadi anggota' : 'Jadikan Admin'}
                        className="p-1.5 rounded-lg bg-blue-600/15 text-blue-500 hover:bg-blue-600/25"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyUid === m.user_id}
                        onClick={() => handleKickOrLeave(m.user_id, false)}
                        title="Keluarkan dari grup"
                        className="p-1.5 rounded-lg bg-red-500/15 text-red-500 hover:bg-red-500/25"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Keluar Grup & Hapus Grup */}
        <div className="pt-2 border-t border-zinc-500/20 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => handleKickOrLeave(currentUser?.id, true)}
            className="w-full py-2.5 rounded-xl bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" /> Keluar dari Grup
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={handleDeleteGroup}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Hapus Grup Permanen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
