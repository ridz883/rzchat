'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { saveMediaToDevice } from '../lib/mediaHelper';

function getTouchDistance(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

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
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const lastTapRef = useRef(0);

  useEffect(() => {
    setIndex(initialIndex);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [initialIndex, images]);

  const currentUrl = images[index] || '';
  const total = images.length;

  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const goPrev = (e) => {
    e.stopPropagation();
    if (total <= 1) return;
    setIndex((i) => (i - 1 + total) % total);
    resetZoom();
  };

  const goNext = (e) => {
    e.stopPropagation();
    if (total <= 1) return;
    setIndex((i) => (i + 1) % total);
    resetZoom();
  };

  const handleTouchStart = (e) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      pinchRef.current = {
        active: true,
        startDist: getTouchDistance(e.touches[0], e.touches[1]),
        startScale: scale,
      };
      dragRef.current.active = false;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        if (scale > 1.05) {
          resetZoom();
        } else {
          setScale(2.4);
          setOffset({ x: 0, y: 0 });
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (scale > 1.02) {
        dragRef.current = {
          active: true,
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          baseX: offset.x,
          baseY: offset.y,
        };
      }
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current.active) {
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      if (pinchRef.current.startDist > 0) {
        const nextScale = Math.min(
          4.5,
          Math.max(1, pinchRef.current.startScale * (dist / pinchRef.current.startDist))
        );
        setScale(nextScale);
        if (nextScale <= 1.02) setOffset({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && dragRef.current.active && scale > 1.02) {
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      setOffset({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy });
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      pinchRef.current.active = false;
    }
    if (e.touches.length === 0) {
      dragRef.current.active = false;
      if (scale <= 1.03) resetZoom();
    }
  };

  const handleWheel = (e) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale((prev) => {
      const next = Math.min(4.5, Math.max(1, Number((prev + delta).toFixed(2))));
      if (next <= 1.02) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black flex flex-col justify-between select-none"
      onClick={onClose}
    >
      {/* Top Bar (tanpa tombol zoom in / zoom out) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-4 py-3.5 flex items-center justify-between gap-2 bg-gradient-to-b from-black/85 to-transparent z-20"
      >
        <div className="min-w-0 text-white">
          {title && <p className="text-sm font-bold truncate">{title}</p>}
          <p className="text-[11px] text-zinc-300 truncate">
            {total > 1 ? `Foto ${index + 1} dari ${total}` : subtitle || 'Cubit 2 jari untuk zoom'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

      {/* Fullscreen Pinch-to-Zoom Area */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'none' }}
        className="relative flex-1 w-full overflow-hidden flex items-center justify-center"
      >
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
            draggable={false}
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              transformOrigin: 'center center',
            }}
            className="w-full h-full max-w-[100vw] max-h-[84vh] object-contain [image-rendering:high-quality] transition-transform duration-75 will-change-transform"
          />
        ) : (
          <div className="w-64 h-64 rounded-full bg-blue-600 text-white flex items-center justify-center text-7xl font-bold shadow-2xl">
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

      {/* Thumbnail Strip untuk Album */}
      {total > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-4 py-3 flex items-center justify-center gap-2 overflow-x-auto bg-black/80 z-20"
        >
          {images.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setIndex(idx);
                resetZoom();
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
