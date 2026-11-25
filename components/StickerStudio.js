'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Smile, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

function renderStickerBlob(file, captionText, shape = 'rounded') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar valid.'));
      img.onload = () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        ctx.save();
        if (shape === 'circle') {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
        } else if (shape === 'rounded') {
          const r = 72;
          const pad = 10;
          const w = size - pad * 2;
          ctx.beginPath();
          ctx.moveTo(pad + r, pad);
          ctx.lineTo(pad + w - r, pad);
          ctx.quadraticCurveTo(pad + w, pad, pad + w, pad + r);
          ctx.lineTo(pad + w, pad + w - r);
          ctx.quadraticCurveTo(pad + w, pad + w, pad + w - r, pad + w);
          ctx.lineTo(pad + r, pad + w);
          ctx.quadraticCurveTo(pad, pad + w, pad, pad + w - r);
          ctx.lineTo(pad, pad + r);
          ctx.quadraticCurveTo(pad, pad, pad + r, pad);
          ctx.closePath();
          ctx.clip();
        }

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        ctx.restore();

        // Garis tepi putih khas stiker
        if (shape === 'circle') {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2);
          ctx.lineWidth = 10;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }

        // Teks meme stiker di bagian bawah (opsional)
        const text = (captionText || '').trim().toUpperCase().slice(0, 32);
        if (text) {
          ctx.font = '900 48px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.lineWidth = 10;
          ctx.strokeStyle = '#000000';
          ctx.fillStyle = '#ffffff';
          ctx.strokeText(text, size / 2, size - 26, size - 44);
          ctx.fillText(text, size / 2, size - 26, size - 44);
        }

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Gagal membuat file stiker.'));
          },
          'image/webp',
          0.9
        );
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function StickerStudio({
  userId,
  isDark,
  stickers = [],
  onStickersChange,
  onSelectSticker,
  compact = false,
}) {
  const inputRef = useRef(null);
  const [draftFile, setDraftFile] = useState(null);
  const [draftPreview, setDraftPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [shape, setShape] = useState('rounded');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handlePickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Pilih file gambar untuk dibuat stiker.');
      return;
    }
    if (draftPreview) URL.revokeObjectURL(draftPreview);
    setDraftFile(file);
    setDraftPreview(URL.createObjectURL(file));
    setCaption('');
  };

  const resetDraft = () => {
    if (draftPreview) URL.revokeObjectURL(draftPreview);
    setDraftFile(null);
    setDraftPreview('');
    setCaption('');
  };

  const handleSaveSticker = async () => {
    if (!draftFile || !userId || creating) return;
    setCreating(true);
    try {
      const blob = await renderStickerBlob(draftFile, caption, shape);
      const filePath = `stickers/${userId}/${Date.now()}.webp`;

      const { error: upErr } = await supabase.storage
        .from('chat-media')
        .upload(filePath, blob, { contentType: 'image/webp', upsert: false });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      const { data: inserted, error: dbErr } = await supabase
        .from('stickers')
        .insert({
          user_id: userId,
          image_url: urlData.publicUrl,
          label: caption.trim().slice(0, 40),
        })
        .select('id, user_id, image_url, label, created_at')
        .single();
      if (dbErr) throw dbErr;

      const updated = [inserted, ...stickers];
      onStickersChange?.(updated);
      resetDraft();
    } catch (err) {
      alert('Gagal membuat stiker: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSticker = async (sticker) => {
    if (deletingId) return;
    setDeletingId(sticker.id);
    try {
      const { error } = await supabase.from('stickers').delete().eq('id', sticker.id);
      if (error) throw error;
      if (sticker.image_url?.includes('/chat-media/')) {
        const path = decodeURIComponent(sticker.image_url.split('/chat-media/')[1].split('?')[0]);
        supabase.storage.from('chat-media').remove([path]).catch(() => {});
      }
      onStickersChange?.(stickers.filter((s) => s.id !== sticker.id));
    } catch (err) {
      alert('Gagal menghapus stiker: ' + (err.message || 'Error'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handlePickPhoto}
        className="hidden"
      />

      {/* Header & Tombol Buat */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smile className="w-4 h-4 text-blue-600" />
          <p className="text-xs font-bold">
            {compact ? `Stiker Saya (${stickers.length})` : `Koleksi Stiker Kustom (${stickers.length})`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Buat Stiker
        </button>
      </div>

      {/* Editor Stiker Mini saat foto dipilih */}
      {draftFile && (
        <div
          className={`p-3 rounded-2xl border space-y-3 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center bg-black/10 rounded-xl overflow-hidden">
              <img
                src={draftPreview}
                alt="Preview stiker"
                className={`w-full h-full object-cover ${
                  shape === 'circle' ? 'rounded-full border-2 border-white' : shape === 'rounded' ? 'rounded-2xl' : ''
                }`}
              />
              {caption.trim() && (
                <span className="absolute bottom-1 left-1 right-1 text-center text-[9px] font-black text-white uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] truncate">
                  {caption}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <input
                type="text"
                maxLength={32}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Tambah teks stiker (opsional)..."
                className={`w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none ${
                  isDark
                    ? 'bg-zinc-950 border-zinc-700 text-white placeholder-zinc-500'
                    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                }`}
              />
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'rounded', label: 'Kotak Bulat' },
                  { id: 'circle', label: 'Lingkaran' },
                  { id: 'square', label: 'Penuh' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setShape(opt.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition ${
                      shape === opt.id
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : isDark
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                          : 'bg-white border-zinc-300 text-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetDraft}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-red-500 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Batal
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={handleSaveSticker}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Simpan Stiker
            </button>
          </div>
        </div>
      )}

      {/* Grid Stiker */}
      {stickers.length === 0 ? (
        <div
          className={`py-6 text-center rounded-2xl border border-dashed ${
            isDark ? 'border-zinc-800 text-zinc-400' : 'border-zinc-300 text-zinc-500'
          }`}
        >
          <p className="text-xs font-medium">Belum ada stiker kustom</p>
          <p className="text-[11px] opacity-75 mt-0.5">
            Ketuk <b>Buat Stiker</b> untuk ubah foto galeri jadi stiker WebP.
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-2.5 ${
            compact ? 'grid-cols-4 max-h-48 overflow-y-auto pr-1' : 'grid-cols-3 sm:grid-cols-4'
          }`}
        >
          {stickers.map((st) => (
            <div
              key={st.id}
              className={`relative group rounded-2xl p-1.5 border flex items-center justify-center transition ${
                isDark
                  ? 'bg-zinc-900/70 border-zinc-800 hover:border-blue-500'
                  : 'bg-zinc-50 border-zinc-200 hover:border-blue-500'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSticker?.(st)}
                className="w-full aspect-square flex items-center justify-center"
                title={onSelectSticker ? 'Ketuk untuk kirim stiker' : st.label || 'Stiker'}
              >
                <img
                  src={st.image_url}
                  alt={st.label || 'Stiker'}
                  loading="lazy"
                  className="w-full h-full object-contain rounded-xl"
                />
              </button>
              {!compact && (
                <button
                  type="button"
                  disabled={deletingId === st.id}
                  onClick={() => handleDeleteSticker(st)}
                  title="Hapus stiker"
                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/65 text-white hover:bg-red-600 transition"
                >
                  {deletingId === st.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
