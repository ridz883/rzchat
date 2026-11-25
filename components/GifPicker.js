'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';

const QUICK_CATEGORIES = [
  { label: '🔥 Populer', q: '' },
  { label: '😂 Ketawa', q: 'ketawa' },
  { label: '😢 Sedih', q: 'sedih' },
  { label: '❤️ Cinta', q: 'cinta' },
  { label: '😮 Kaget', q: 'kaget' },
  { label: '😡 Marah', q: 'marah' },
  { label: '🤗 Peluk', q: 'peluk' },
  { label: '👋 Halo', q: 'halo' },
  { label: '😴 Tidur', q: 'tidur' },
  { label: '🐱 Kucing', q: 'kucing' },
  { label: '🎉 Semangat', q: 'semangat' },
];

export default function GifPicker({ isDark, onSelectGif }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gifs?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        if (!cancelled) setGifs(json.results || []);
      } catch {
        if (!cancelled) setGifs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
          isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-100 border-zinc-300'
        }`}
      >
        <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari GIF (mis. sedih, ketawa, marah, peluk)..."
          className={`w-full bg-transparent text-xs focus:outline-none ${
            isDark ? 'text-white placeholder-zinc-500' : 'text-zinc-900 placeholder-zinc-400'
          }`}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-zinc-400 hover:text-zinc-200"
            aria-label="Hapus pencarian GIF"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Kategori Cepat ala Telegram */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {QUICK_CATEGORIES.map((cat) => {
          const active = query.trim().toLowerCase() === cat.q;
          return (
            <button
              key={cat.label}
              type="button"
              onClick={() => setQuery(cat.q)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                active
                  ? 'bg-blue-600 text-white'
                  : isDark
                    ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        </div>
      ) : gifs.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">GIF tidak ditemukan. Coba kata lain.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
          {gifs.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectGif?.(g)}
              className="aspect-square rounded-xl overflow-hidden bg-black/20 hover:ring-2 hover:ring-blue-500 transition"
            >
              <img
                src={g.preview || g.url}
                alt={g.title || 'GIF'}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
