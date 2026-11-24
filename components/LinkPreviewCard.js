'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { extractFirstUrl } from '../lib/security';

const previewCache = new Map();

export default function LinkPreviewCard({ text, isMe, isDark }) {
  const url = extractFirstUrl(text);
  const [data, setData] = useState(() => (url ? previewCache.get(url) || null : null));

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    if (previewCache.has(url)) {
      setData(previewCache.get(url));
      return;
    }

    let cancelled = false;
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        const val = json && json.title ? json : false;
        previewCache.set(url, val);
        setData(val);
      })
      .catch(() => {
        if (!cancelled) {
          previewCache.set(url, false);
          setData(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url || !data) return null;

  return (
    <a
      href={data.url || url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`mt-2 block overflow-hidden rounded-xl border text-left transition ${
        isMe
          ? 'border-white/20 bg-black/15 hover:bg-black/25 text-white'
          : isDark
          ? 'border-zinc-700/80 bg-zinc-900/70 hover:bg-zinc-900 text-zinc-100'
          : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-900'
      }`}
    >
      {data.image && (
        <div className="w-full max-h-36 overflow-hidden bg-black/10">
          <img
            src={data.image}
            alt={data.title}
            loading="lazy"
            className="w-full h-32 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="p-2.5 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[10px] font-medium truncate ${
              isMe ? 'text-blue-100/80' : isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {data.siteName}
          </span>
          <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
        </div>
        <p className="text-xs font-semibold leading-snug line-clamp-2">{data.title}</p>
        {data.description && (
          <p
            className={`text-[11px] leading-snug line-clamp-2 ${
              isMe ? 'text-blue-100/85' : isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}
