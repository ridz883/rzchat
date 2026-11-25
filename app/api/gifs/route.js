import { NextResponse } from 'next/server';

const FALLBACK_GIFS = [
  { id: 'f1', title: 'Haha', url: 'https://media.tenor.com/x8v1oNUOmg4AAAAd/rickroll-roll.gif', preview: 'https://media.tenor.com/x8v1oNUOmg4AAAAM/rickroll-roll.gif' },
  { id: 'f2', title: 'Ok', url: 'https://media.tenor.com/1sL5h8b4k2sAAAAd/thumbs-up-ok.gif', preview: 'https://media.tenor.com/1sL5h8b4k2sAAAAM/thumbs-up-ok.gif' },
  { id: 'f3', title: 'Love', url: 'https://media.tenor.com/2roX3uxz_68AAAAd/cat-heart.gif', preview: 'https://media.tenor.com/2roX3uxz_68AAAAM/cat-heart.gif' },
  { id: 'f4', title: 'Sad', url: 'https://media.tenor.com/8v7Z2X8t5QAAAAAd/sad-cat.gif', preview: 'https://media.tenor.com/8v7Z2X8t5QAAAAAM/sad-cat.gif' },
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().slice(0, 60);

  try {
    const endpoint = q
      ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=18&media_filter=minimal`
      : `https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=18&media_filter=minimal`;

    const res = await fetch(endpoint, { next: { revalidate: 120 } });
    if (!res.ok) throw new Error('Tenor HTTP ' + res.status);
    const data = await res.json();

    const results = (data?.results || [])
      .map((item) => {
        const media = item?.media?.[0] || {};
        const fullUrl = media?.gif?.url || media?.tinygif?.url || '';
        const previewUrl = media?.tinygif?.url || media?.nanogif?.url || fullUrl;
        if (!fullUrl) return null;
        return {
          id: String(item.id),
          title: item.content_description || item.title || 'GIF',
          url: fullUrl,
          preview: previewUrl,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ results: results.length > 0 ? results : FALLBACK_GIFS });
  } catch {
    return NextResponse.json({ results: FALLBACK_GIFS });
  }
}
