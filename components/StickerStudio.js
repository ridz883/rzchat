'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Smile, Check, X, Move, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ANDROID_IMAGE_ACCEPT } from '../lib/security';

const TEXT_COLORS = [
  '#ffffff',
  '#111111',
  '#facc15',
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#ec4899',
  '#06b6d4',
];

const OUTLINE_OPTIONS = [
  { id: '#000000', label: 'Hitam' },
  { id: '#ffffff', label: 'Putih' },
  { id: 'none', label: 'Tanpa' },
];

function drawStickerToCanvas(canvas, img, opts) {
  if (!canvas || !img) return;
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  if (opts.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  } else if (opts.shape === 'rounded') {
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

  if (opts.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  const rawText = String(opts.caption || '').trim();
  if (rawText) {
    const display = opts.uppercase ? rawText.toUpperCase() : rawText;
    const lines = display.split('\n').slice(0, 3);
    const fontWeight = opts.fontStyle === 'bold' ? '900' : '600';
    const fontSlope = opts.fontStyle === 'italic' ? 'italic ' : '';
    const fontSize = Number(opts.fontSize) || 48;
    ctx.font = `${fontSlope}${fontWeight} ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = Math.max(40, Math.min(size - 40, (opts.textX / 100) * size));
    const cy = Math.max(40, Math.min(size - 40, (opts.textY / 100) * size));
    const lineHeight = fontSize * 1.15;
    const startY = cy - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      const ly = startY + i * lineHeight;
      if (opts.outline !== 'none') {
        ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.2));
        ctx.lineJoin = 'round';
        ctx.strokeStyle = opts.outline;
        ctx.strokeText(line, cx, ly, size - 44);
      }
      ctx.fillStyle = opts.textColor;
      ctx.fillText(line, cx, ly, size - 44);
    });
  }
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
  const canvasRef = useRef(null);
  const loadedImgRef = useRef(null);
  const draggingRef = useRef(false);

  const [draftFile, setDraftFile] = useState(null);
  const [draftPreview, setDraftPreview] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  const [caption, setCaption] = useState('');
  const [shape, setShape] = useState('rounded');
  const [textColor, setTextColor] = useState('#ffffff');
  const [outline, setOutline] = useState('#000000');
  const [fontSize, setFontSize] = useState(50);
  const [fontStyle, setFontStyle] = useState('bold');
  const [uppercase, setUppercase] = useState(true);
  const [textX, setTextX] = useState(50);
  const [textY, setTextY] = useState(84);

  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!draftPreview) {
      loadedImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedImgRef.current = img;
      drawStickerToCanvas(canvasRef.current, img, {
        caption,
        shape,
        textColor,
        outline,
        fontSize,
        fontStyle,
        uppercase,
        textX,
        textY,
      });
    };
    img.src = draftPreview;
  }, [draftPreview, editorOpen]);

  useEffect(() => {
    if (!loadedImgRef.current || !canvasRef.current) return;
    drawStickerToCanvas(canvasRef.current, loadedImgRef.current, {
      caption,
      shape,
      textColor,
      outline,
      fontSize,
      fontStyle,
      uppercase,
      textX,
      textY,
    });
  }, [caption, shape, textColor, outline, fontSize, fontStyle, uppercase, textX, textY, editorOpen]);

  const handlePickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Pilih file gambar/foto untuk dibuat stiker.');
      return;
    }
    if (draftPreview) URL.revokeObjectURL(draftPreview);
    setDraftFile(file);
    setDraftPreview(URL.createObjectURL(file));
    setCaption('');
    setTextX(50);
    setTextY(84);
    setFontSize(50);
    setTextColor('#ffffff');
    setOutline('#000000');
    setFontStyle('bold');
    setUppercase(true);
    setEditorOpen(true);
  };

  const resetDraft = () => {
    if (draftPreview) URL.revokeObjectURL(draftPreview);
    loadedImgRef.current = null;
    setDraftFile(null);
    setDraftPreview('');
    setCaption('');
    setEditorOpen(false);
  };

  const updatePosFromPointer = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 100;
    const ny = ((clientY - rect.top) / rect.height) * 100;
    setTextX(Math.max(12, Math.min(88, Math.round(nx))));
    setTextY(Math.max(12, Math.min(90, Math.round(ny))));
  };

  const handleSaveSticker = async () => {
    if (!draftFile || !userId || creating || !loadedImgRef.current) return;
    setCreating(true);
    try {
      const offscreen = document.createElement('canvas');
      drawStickerToCanvas(offscreen, loadedImgRef.current, {
        caption,
        shape,
        textColor,
        outline,
        fontSize,
        fontStyle,
        uppercase,
        textX,
        textY,
      });

      const blob = await new Promise((resolve, reject) => {
        offscreen.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Gagal membuat file WebP stiker.'))),
          'image/webp',
          0.9
        );
      });

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

      onStickersChange?.([inserted, ...stickers]);
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
        const pathInBucket = decodeURIComponent(sticker.image_url.split('/chat-media/')[1].split('?')[0]);
        supabase.storage.from('chat-media').remove([pathInBucket]).catch(() => {});
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
        accept={ANDROID_IMAGE_ACCEPT}
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

      {/* Ringkasan Draft (bila editor diminimize, klik foto untuk buka ulang editor penuh) */}
      {draftFile && !editorOpen && (
        <div
          className={`p-2.5 rounded-2xl border flex items-center justify-between gap-3 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="flex items-center gap-2.5 min-w-0 text-left"
          >
            <img src={draftPreview} alt="Draft" className="w-12 h-12 rounded-xl object-cover shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">Ketuk foto untuk edit stiker & teks</p>
              <p className="text-[11px] text-zinc-400 truncate">{caption || 'Belum ada teks'}</p>
            </div>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-blue-600 text-white text-[11px] font-semibold flex items-center gap-1"
            >
              <SlidersHorizontal className="w-3 h-3" /> Edit
            </button>
            <button type="button" onClick={resetDraft} className="p-1.5 text-zinc-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal Editor Stiker Interaktif (Klik Foto / Geser Teks Bebas dengan Jari) */}
      {draftFile && editorOpen && (
        <div
          className="fixed inset-0 z-[75] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditorOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-4 shadow-2xl max-h-[92vh] overflow-y-auto space-y-3.5 ${
              isDark ? 'bg-[#121215] text-zinc-100 border border-zinc-800' : 'bg-white text-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" /> Editor Stiker Kustom
              </h3>
              <button
                type="button"
                onClick={resetDraft}
                className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                aria-label="Tutup editor stiker"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Canvas Interaktif: Ketuk / Geser teks langsung dengan jari */}
            <div className="flex flex-col items-center">
              <div
                className={`relative p-2 rounded-2xl border ${
                  isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                }`}
              >
                <canvas
                  ref={canvasRef}
                  onPointerDown={(e) => {
                    draggingRef.current = true;
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    updatePosFromPointer(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (!draggingRef.current) return;
                    updatePosFromPointer(e.clientX, e.clientY);
                  }}
                  onPointerUp={() => {
                    draggingRef.current = false;
                  }}
                  style={{ touchAction: 'none' }}
                  className="w-56 h-56 rounded-xl cursor-move block"
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1.5 flex items-center gap-1">
                <Move className="w-3 h-3" /> Sentuh & geser langsung pada foto untuk atur posisi teks
              </p>
            </div>

            {/* Input Teks Bebas */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-zinc-400">Teks Stiker (bisa 3 baris)</label>
                <button
                  type="button"
                  onClick={() => setUppercase((u) => !u)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    uppercase
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : isDark
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                  }`}
                >
                  {uppercase ? 'AA (Kapital)' : 'Aa (Normal)'}
                </button>
              </div>
              <textarea
                rows={2}
                maxLength={60}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Ketik teks stiker sesuka hati..."
                className={`w-full px-3 py-2 rounded-xl text-xs border resize-none focus:outline-none ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                    : 'bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400'
                }`}
              />
            </div>

            {/* Posisi Cepat + Ukuran Teks */}
            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <p className="text-[11px] font-semibold text-zinc-400 mb-1">Posisi Cepat</p>
                <div className="flex items-center gap-1">
                  {[
                    { label: 'Atas', y: 18 },
                    { label: 'Tengah', y: 50 },
                    { label: 'Bawah', y: 84 },
                  ].map((pos) => (
                    <button
                      key={pos.label}
                      type="button"
                      onClick={() => {
                        setTextX(50);
                        setTextY(pos.y);
                      }}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-semibold border ${
                        Math.abs(textY - pos.y) <= 8
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : isDark
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                            : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 mb-1">
                  <span>Ukuran</span>
                  <span>{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={84}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>

            {/* Warna Teks */}
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 mb-1.5">Warna Teks</p>
              <div className="flex items-center gap-2 flex-wrap">
                {TEXT_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setTextColor(col)}
                    style={{ backgroundColor: col }}
                    className={`w-7 h-7 rounded-full border-2 transition ${
                      textColor === col ? 'border-blue-500 scale-110' : 'border-zinc-500/40'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Garis Tepi, Gaya Huruf & Bentuk */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold text-zinc-400 mb-1">Garis Tepi</p>
                <div className="flex items-center gap-1">
                  {OUTLINE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOutline(opt.id)}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-semibold border ${
                        outline === opt.id
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : isDark
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                            : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-zinc-400 mb-1">Gaya Huruf</p>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'bold', label: 'Tebal' },
                    { id: 'normal', label: 'Biasa' },
                    { id: 'italic', label: 'Miring' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setFontStyle(st.id)}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-semibold border ${
                        fontStyle === st.id
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : isDark
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                            : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-zinc-400 mb-1">Bentuk Stiker</p>
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
                    className={`flex-1 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                      shape === opt.id
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : isDark
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                          : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                  isDark ? 'border-zinc-700 text-zinc-300' : 'border-zinc-300 text-zinc-700'
                }`}
              >
                Ganti Foto
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetDraft}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-red-500"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={handleSaveSticker}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Simpan Stiker
                </button>
              </div>
            </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
