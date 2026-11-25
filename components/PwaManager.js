'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export default function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true;
    if (isStandalone) return;

    if (window.__rzchatInstallPrompt) {
      setDeferredPrompt(window.__rzchatInstallPrompt);
    }

    const onReady = () => {
      if (window.__rzchatInstallPrompt) {
        setDeferredPrompt(window.__rzchatInstallPrompt);
      }
    };

    const onBeforeInstall = (e) => {
      e.preventDefault();
      window.__rzchatInstallPrompt = e;
      setDeferredPrompt(e);
    };

    const onInstalled = () => {
      window.__rzchatInstallPrompt = null;
      setDeferredPrompt(null);
    };

    window.addEventListener('rzchat-pwa-ready', onReady);
    window.addEventListener('rzchat-pwa-installed', onInstalled);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('rzchat-pwa-ready', onReady);
      window.removeEventListener('rzchat-pwa-installed', onInstalled);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const promptEvent = deferredPrompt || window.__rzchatInstallPrompt;
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      window.__rzchatInstallPrompt = null;
    }
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-16 left-3 right-3 z-40 max-w-md mx-auto bg-blue-600 text-white rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold leading-tight">Install rzchat di HP</p>
        <p className="text-[11px] text-blue-100 truncate">Buka lebih cepat seperti aplikasi asli</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 rounded-xl bg-white text-blue-600 text-xs font-bold flex items-center gap-1"
        >
          <Download className="w-3.5 h-3.5" /> Install
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg hover:bg-blue-700 text-blue-100"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
