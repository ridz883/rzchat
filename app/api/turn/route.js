import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export async function GET() {
  const meteredUrl = process.env.METERED_TURN_URL;

  if (meteredUrl) {
    try {
      const res = await fetch(meteredUrl, { cache: 'no-store' });
      if (res.ok) {
        const turnServers = await res.json();
        if (Array.isArray(turnServers) && turnServers.length > 0) {
          return NextResponse.json({
            iceServers: [...DEFAULT_ICE_SERVERS, ...turnServers],
          });
        }
      }
    } catch {
      // Fallback ke STUN default jika Metered gagal diakses
    }
  }

  return NextResponse.json({ iceServers: DEFAULT_ICE_SERVERS });
}
