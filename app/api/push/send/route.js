import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!vapidPublicKey || !vapidPrivateKey || !supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ ok: false, skipped: 'VAPID atau Supabase env belum lengkap' });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { roomId, title, body, url, tag } = await request.json();
    if (!roomId) {
      return NextResponse.json({ error: 'roomId wajib diisi' }, { status: 400 });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@rzchat.app',
      vapidPublicKey,
      vapidPrivateKey
    );

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: subs, error } = await supabase.rpc('get_room_recipient_push_subscriptions', {
      p_room_id: roomId,
    });

    if (error || !subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const payload = JSON.stringify({
      title: title || 'rzchat',
      body: body || 'Pesan baru',
      url: url || `/chat/${roomId}`,
      tag: tag || `room-${roomId}`,
    });

    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          sent += 1;
        } catch (err) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.rpc('delete_stale_push_subscription', {
              p_endpoint: sub.endpoint,
            });
          }
        }
      })
    );

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || 'Push error' }, { status: 500 });
  }
}
