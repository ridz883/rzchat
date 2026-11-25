'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

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
    <div className="space-y-2.5">
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
          placeholder="Cari GIF (mis. lucu, semangat, kaget)..."
          className={`w-full bg-transparent text-xs focus:outline-none ${
            isDark ? 'text-white placeholder-zinc-500' : 'text-zinc-900 placeholder-zinc-400'
          }`}
        />
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        </div>
      ) : gifs.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">GIF tidak ditemukan.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
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
