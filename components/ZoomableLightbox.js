'use client';

import { useState, useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { saveMediaToDevice } from '../lib/mediaHelper';

export default function ZoomableLightbox({
  images = [],
  initialIndex = 0,
  title = '',
  subtitle = '',
  fallbackInitial = '',
  canSave = true,
  onClose,
}) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setIndex(initialIndex);
    setScale(1);
  }, [initialIndex, images]);

  const currentUrl = images[index] || '';
  const total = images.length;

  const zoomIn = () => setScale((s) => Math.min(3, Number((s + 0.5).toFixed(1))));
  const zoomOut = () => setScale((s) => Math.max(1, Number((s - 0.5).toFixed(1))));
  const toggleZoom = () => setScale((s) => (s > 1 ? 1 : 2.2));

  const goPrev = (e) => {
    e.stopPropagation();
    if (total <= 1) return;
    setIndex((i) => (i - 1 + total) % total);
    setScale(1);
  };

  const goNext = (e) => {
    e.stopPropagation();
    if (total <= 1) return;
    setIndex((i) => (i + 1) % total);
    setScale(1);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/95 flex flex-col justify-between select-none"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-4 py-3.5 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent z-10"
      >
        <div className="min-w-0 text-white">
          {title && <p className="text-sm font-bold truncate">{title}</p>}
          <p className="text-[11px] text-zinc-300 truncate">
            {total > 1 ? `Foto ${index + 1} dari ${total}` : subtitle || 'Ketuk foto untuk zoom'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {currentUrl && (
            <>
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= 1}
                title="Perkecil"
                className="p-2 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-35 text-white"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleZoom}
                className="px-2 py-1 rounded-full bg-white/15 text-white text-[11px] font-bold tabular-nums"
              >
                {scale.toFixed(1)}x
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 3}
                title="Perbesar"
                className="p-2 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-35 text-white"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          )}

          {canSave && currentUrl && (
            <button
              type="button"
              onClick={() =>
                saveMediaToDevice({ url: currentUrl, mediaType: 'image', isViewOnce: false }).catch(
                  () => {}
                )
              }
              title="Simpan Foto"
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Tutup"
            className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Zoomable Area */}
      <div className="relative flex-1 overflow-auto flex items-center justify-center p-4">
        {total > 1 && (
          <button
            type="button"
            onClick={goPrev}
            className="fixed left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {currentUrl ? (
          <img
            src={currentUrl}
            alt={title || 'Foto'}
            onClick={(e) => {
              e.stopPropagation();
              toggleZoom();
            }}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
            className="max-w-full max-h-[80vh] rounded-xl object-contain transition-transform duration-200 cursor-zoom-in"
          />
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-56 h-56 rounded-full bg-blue-600 text-white flex items-center justify-center text-7xl font-bold shadow-2xl"
          >
            {(fallbackInitial || title || '?').slice(0, 1).toUpperCase()}
          </div>
        )}

        {total > 1 && (
          <button
            type="button"
            onClick={goNext}
            className="fixed right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip for Album */}
      {total > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-4 py-3 flex items-center justify-center gap-2 overflow-x-auto bg-black/70"
        >
          {images.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setIndex(idx);
                setScale(1);
              }}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition ${
                idx === index ? 'border-blue-500 scale-105' : 'border-transparent opacity-60'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
