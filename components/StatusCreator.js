'use client';

import { useRef, useState } from 'react';
import { X, Image as ImageIcon, Type, Shield, Send, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ANDROID_MEDIA_ACCEPT, validateUploadFile } from '../lib/security';

const BG_PRESETS = [
  'linear-gradient(135deg, #2563eb, #7c3aed)',
  'linear-gradient(135deg, #059669, #0284c7)',
  'linear-gradient(135deg, #e11d48, #f59e0b)',
  'linear-gradient(135deg, #18181b, #3f3f46)',
  'linear-gradient(135deg, #7e22ce, #ec4899)',
];

function compressStatusHD(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca foto.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar valid.'));
      img.onload = () => {
        const maxSide = 1600; // HD tajam
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxSide) {
          h = Math.round((h * maxSide) / w);
          w = maxSide;
        } else if (h >= w && h > maxSide) {
          w = Math.round((w * maxSide) / h);
          h = maxSide;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Gagal kompres HD.'))),
          'image/jpeg',
          0.92
        );
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function StatusCreator({ currentUser, contacts = [], isDark, onClose, onPublished }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('text'); // 'text' | 'media'
  const [bgStyle, setBgStyle] = useState(BG_PRESETS[0]);
  const [caption, setCaption] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState('image');
  const [mediaPreview, setMediaPreview] = useState('');

  // Privasi Status: 'all' | 'except' | 'only'
  const [privacyMode, setPrivacyMode] = useState('all');
  const [privacyUsers, setPrivacyUsers] = useState([]);
  const [showPrivacyPicker, setShowPrivacyPicker] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const handlePickMedia = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const chk = validateUploadFile(file, 25);
    if (!chk.valid || (chk.category !== 'image' && chk.category !== 'video')) {
      alert('Pilih foto atau video untuk Status HD.');
      return;
    }
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaType(chk.category);
    setMediaPreview(URL.createObjectURL(file));
    setMode('media');
  };

  const togglePrivacyUser = (uid) => {
    setPrivacyUsers((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const handlePublish = async () => {
    if (!currentUser?.id || publishing) return;
    if (mode === 'text' && !caption.trim()) return;
    if (mode === 'media' && !mediaFile) return;

    setPublishing(true);
    try {
      let uploadedUrl = '';
      let finalType = 'text';

      if (mode === 'media' && mediaFile) {
        if (mediaType === 'image') {
          const hdBlob = await compressStatusHD(mediaFile);
          const filePath = `statuses/${currentUser.id}-${Date.now()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from('chat-media')
            .upload(filePath, hdBlob, { contentType: 'image/jpeg', upsert: false });
          if (upErr) throw upErr;
          uploadedUrl = supabase.storage.from('chat-media').getPublicUrl(filePath).data.publicUrl;
          finalType = 'image';
        } else {
          const ext = (mediaFile.name.split('.').pop() || 'mp4').toLowerCase();
          const filePath = `statuses/${currentUser.id}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('chat-media')
            .upload(filePath, mediaFile, { contentType: mediaFile.type || 'video/mp4', upsert: false });
          if (upErr) throw upErr;
          uploadedUrl = supabase.storage.from('chat-media').getPublicUrl(filePath).data.publicUrl;
          finalType = 'video';
        }
      }

      const { error } = await supabase.from('statuses').insert({
        user_id: currentUser.id,
        media_type: finalType,
        media_url: uploadedUrl,
        caption: caption.trim().slice(0, 300),
        bg_style: bgStyle,
        privacy_mode: privacyMode,
        privacy_user_ids: privacyMode === 'all' ? [] : privacyUsers,
      });
      if (error) throw error;

      onPublished?.();
      onClose?.();
    } catch (err) {
      alert('Gagal mengunggah status: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black text-white flex flex-col justify-between">
      {/* Top Controls */}
      <div className="px-4 py-3.5 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent z-10">
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/15">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 ${
              mode === 'text' ? 'bg-white text-black' : 'bg-white/15 text-white'
            }`}
          >
            <Type className="w-3.5 h-3.5" /> Teks
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 ${
              mode === 'media' ? 'bg-blue-600 text-white' : 'bg-white/15 text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" /> Foto/Video HD
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ANDROID_MEDIA_ACCEPT}
            onChange={handlePickMedia}
            className="hidden"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowPrivacyPicker((v) => !v)}
          className="px-2.5 py-1.5 rounded-full bg-white/15 text-xs font-semibold flex items-center gap-1"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          {privacyMode === 'all' ? 'Publik' : privacyMode === 'except' ? 'Kecuali' : 'Khusus'}
        </button>
      </div>

      {/* Privacy Drawer */}
      {showPrivacyPicker && (
        <div className="mx-4 p-3.5 rounded-2xl bg-zinc-900/95 border border-zinc-700 space-y-2.5 z-20">
          <p className="text-xs font-bold">Privasi Status (Siapa yang bisa melihat)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'except', label: 'Kecuali...' },
              { id: 'only', label: 'Hanya...' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPrivacyMode(opt.id)}
                className={`py-1.5 rounded-xl text-xs font-bold ${
                  privacyMode === opt.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {privacyMode !== 'all' && (
            <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
              {contacts.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-zinc-800 text-xs cursor-pointer"
                >
                  <span>{c.display_name || c.username} (@{c.username})</span>
                  <input
                    type="checkbox"
                    checked={privacyUsers.includes(c.id)}
                    onChange={() => togglePrivacyUser(c.id)}
                    className="accent-blue-600"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Center Canvas */}
      <div
        style={mode === 'text' ? { backgroundImage: bgStyle } : undefined}
        className="flex-1 flex items-center justify-center p-6 overflow-hidden relative"
      >
        {mode === 'text' ? (
          <textarea
            rows={4}
            maxLength={260}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Ketik status 24 jam kamu..."
            className="w-full max-w-md bg-transparent text-white placeholder-white/60 text-center text-2xl font-bold resize-none focus:outline-none"
          />
        ) : mediaType === 'video' ? (
          <video
            src={mediaPreview}
            controls
            playsInline
            className="max-h-[70vh] max-w-full rounded-2xl"
          />
        ) : (
          <img
            src={mediaPreview}
            alt="Preview Status HD"
            className="max-h-[72vh] max-w-full object-contain rounded-2xl"
          />
        )}
      </div>

      {/* Bottom Caption & Publish */}
      <div className="p-4 bg-gradient-to-t from-black/90 to-transparent space-y-3">
        {mode === 'text' && (
          <div className="flex items-center justify-center gap-2">
            {BG_PRESETS.map((bg) => (
              <button
                key={bg}
                type="button"
                onClick={() => setBgStyle(bg)}
                style={{ backgroundImage: bg }}
                className={`w-7 h-7 rounded-full border-2 ${
                  bgStyle === bg ? 'border-white scale-110' : 'border-white/30'
                }`}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 max-w-lg mx-auto">
          {mode === 'media' && (
            <input
              type="text"
              maxLength={220}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Tambah keterangan status HD..."
              className="flex-1 px-4 py-2.5 rounded-full bg-white/15 text-white placeholder-white/60 text-xs focus:outline-none"
            />
          )}
          <button
            type="button"
            disabled={publishing || (mode === 'text' ? !caption.trim() : !mediaFile)}
            onClick={handlePublish}
            className="ml-auto px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Bagikan (HD)
          </button>
        </div>
      </div>
    </div>
  );
}
