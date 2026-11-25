'use client';

import { supabase } from './supabase';

function urlBase64ToUint8Array(base64String) {
  const clean = String(base64String || '').replace(/[^A-Za-z0-9_-]/g, '');
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushStatus() {
  if (!isPushSupported()) return { supported: false, enabled: false, permission: 'unsupported' };
  const permission = Notification.permission;
  if (permission !== 'granted') return { supported: true, enabled: false, permission };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return { supported: true, enabled: Boolean(sub), permission };
  } catch {
    return { supported: true, enabled: false, permission };
  }
}

export async function subscribeUserToPush(userId) {
  if (!isPushSupported()) throw new Error('Browser ini belum mendukung Web Push Notification.');
  const vapidPublicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
  if (!vapidPublicKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY belum dipasang di Vercel.');
  }

  const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
  if (appServerKey.length !== 65 || appServerKey[0] !== 4) {
    throw new Error(
      `Kunci VAPID tidak valid (${appServerKey.length} byte, wajib 65 byte). Cek kembali NEXT_PUBLIC_VAPID_PUBLIC_KEY di Vercel.`
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Izin notifikasi ditolak. Aktifkan di pengaturan browser HP Anda.');
  }

  let reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await sub.unsubscribe();
    } catch {}
    sub = null;
  }

  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('push service') || err?.name === 'AbortError') {
      throw new Error(
        'Layanan Push ditolak jaringan/browser (push service error). Pastikan memakai Google Chrome / PWA Chrome biasa dan matikan sementara VPN atau Private DNS pemblokir iklan.'
      );
    }
    throw err;
  }

  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
    },
    { onConflict: 'endpoint' }
  );

  if (error) throw error;
  return true;
}

export async function unsubscribeUserFromPush() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function sendPushNotification({ roomId, title, body, url, tag }) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ roomId, title, body, url, tag }),
    });
  } catch {
    // Jangan ganggu pengiriman chat bila push gagal sementara
  }
}
