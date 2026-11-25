'use client';

import { useRef } from 'react';
import { X, Download, Maximize2 } from 'lucide-react';
import { saveMediaToDevice } from '../lib/mediaHelper';

export default function VideoLightbox({ src, fileName = '', onClose }) {
  const videoRef = useRef(null);

  const requestNativeFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/95 flex flex-col justify-between p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between gap-2 text-white"
      >
        <p className="text-xs font-semibold truncate">{fileName || 'Pemutar Video'}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={requestNativeFullscreen}
            title="Layar Penuh Penuh"
            className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              saveMediaToDevice({ url: src, fileName, mediaType: 'video', isViewOnce: false }).catch(
                () => {}
              )
            }
            title="Simpan Video"
            className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white"
          >
            <Download className="w-4 h-4" />
          </button>
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

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-1 flex items-center justify-center my-3 overflow-hidden"
      >
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          playsInline
          className="w-full max-w-4xl max-h-[82vh] rounded-xl bg-black shadow-2xl"
        />
      </div>
    </div>
  );
}
