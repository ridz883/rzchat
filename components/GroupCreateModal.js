'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Users, Camera, Search, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ANDROID_IMAGE_ACCEPT } from '../lib/security';
import Avatar from './Avatar';

function compressGroupAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca foto grup.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar valid.'));
      img.onload = () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function GroupCreateModal({ currentUser, isDark, onClose, onCreated }) {
  const fileRef = useRef(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) return;
    const timer = setTimeout(async () => {
      const q = query.trim().replace(/^@+/, '').toLowerCase();
      let req = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .neq('id', currentUser.id)
        .limit(20);
      if (q) {
        req = req.ilike('username', `%${q}%`);
      }
      const { data } = await req;
      setCandidates(data || []);
    }, 220);
    return () => clearTimeout(timer);
  }, [query, currentUser?.id]);

  const toggleUser = (u) => {
    setSelectedUsers((prev) =>
      prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]
    );
  };

  const handlePickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await compressGroupAvatar(file);
      setAvatarUrl(url);
    } catch (err) {
      alert(err.message || 'Gagal memproses foto.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const { data: roomId, error } = await supabase.rpc('create_group_room', {
        p_name: name.trim(),
        p_description: description.trim(),
        p_avatar_url: avatarUrl,
        p_member_ids: selectedUsers.map((u) => u.id),
      });
      if (error) throw error;
      onCreated?.(roomId);
    } catch (err) {
      alert('Gagal membuat grup: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] flex flex-col gap-3.5 ${
          isDark ? 'bg-[#121215] text-zinc-100 border border-zinc-800' : 'bg-white text-zinc-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Buat Grup Baru
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar src={avatarUrl} name={name || 'Grup'} size="lg" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-blue-600 text-white shadow"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ANDROID_IMAGE_ACCEPT}
              onChange={handlePickAvatar}
              className="hidden"
            />
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama grup (wajib)..."
              className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                isDark
                  ? 'bg-zinc-900 border-zinc-700 text-white'
                  : 'bg-zinc-50 border-zinc-300 text-zinc-900'
              }`}
            />
            <input
              type="text"
              maxLength={140}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi grup (opsional)..."
              className={`w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none ${
                isDark
                  ? 'bg-zinc-900 border-zinc-700 text-white'
                  : 'bg-zinc-50 border-zinc-300 text-zinc-900'
              }`}
            />
          </div>
        </div>

        {selectedUsers.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {selectedUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleUser(u)}
                className="px-2.5 py-1 rounded-full bg-blue-600/15 text-blue-500 text-[11px] font-semibold flex items-center gap-1 shrink-0"
              >
                <span>@{u.username}</span>
                <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari @username anggota untuk ditambahkan..."
            className={`w-full pl-8 pr-3 py-2 rounded-xl text-xs border focus:outline-none ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-white'
                : 'bg-zinc-50 border-zinc-300 text-zinc-900'
            }`}
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 max-h-52 pr-1">
          {candidates.map((u) => {
            const picked = selectedUsers.some((x) => x.id === u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleUser(u)}
                className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left transition ${
                  picked
                    ? 'bg-blue-600/15'
                    : isDark
                      ? 'hover:bg-zinc-900'
                      : 'hover:bg-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={u.avatar_url} name={u.display_name || u.username} size="xs" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{u.display_name || u.username}</p>
                    <p className="text-[10px] text-zinc-400 truncate">@{u.username}</p>
                  </div>
                </div>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                    picked
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-zinc-500/40'
                  }`}
                >
                  {picked && <Check className="w-3 h-3" />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
          Buat Grup ({selectedUsers.length + 1} Anggota)
        </button>
      </form>
    </div>
  );
}
