import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ID_TO_EN = {
  sedih: 'sad crying',
  nangis: 'crying sad',
  galau: 'sad lonely',
  kecewa: 'disappointed sad',
  ketawa: 'laughing funny',
  ngakak: 'laughing hard lol',
  wkwk: 'laughing lol',
  wkwkwk: 'laughing lol',
  lucu: 'funny comedy',
  kocak: 'hilarious funny',
  marah: 'angry mad',
  kesel: 'annoyed angry',
  kesal: 'annoyed frustrated',
  emosi: 'angry rage',
  cinta: 'love heart',
  sayang: 'love cute heart',
  kangen: 'miss you love',
  rindu: 'miss you',
  peluk: 'hug cute',
  cium: 'kiss love',
  kaget: 'shocked surprised',
  terkejut: 'surprised omg',
  semangat: 'cheering fighting motivation',
  tidur: 'sleepy good night',
  ngantuk: 'sleepy tired',
  malu: 'shy blushing',
  lapar: 'hungry eating',
  makan: 'eating food',
  minum: 'drinking coffee',
  gabut: 'bored waiting',
  bosan: 'bored',
  maaf: 'sorry apologize',
  makasih: 'thank you',
  terimakasih: 'thank you',
  halo: 'hello wave',
  hai: 'hi wave',
  pagi: 'good morning',
  malam: 'good night',
  dadah: 'bye wave',
  oke: 'ok thumbs up',
  siap: 'yes salute ok',
  mantap: 'awesome cool thumbs up',
  keren: 'cool awesome',
  bingung: 'confused thinking',
  capek: 'tired exhausted',
  lelah: 'tired',
  senang: 'happy excited',
  bahagia: 'happy dance',
  joget: 'dance party',
  kucing: 'cute cat',
  anjing: 'cute dog',
  tepuk: 'clapping applause',
  setuju: 'agree nod yes',
  tidak: 'no nope',
  santai: 'chill relax',
  kepo: 'curious',
  baper: 'emotional heart',
  sakit: 'sick',
  hujan: 'rain',
  kopi: 'coffee',
  selamat: 'congratulations party',
  ultah: 'happy birthday',
};

const CURATED_GIFS = [
  { id: 'c1', tags: 'sad sedih nangis galau', url: 'https://media.tenor.com/8v7Z2X8t5QAAAAAd/sad-cat.gif' },
  { id: 'c2', tags: 'sad sedih nangis crying', url: 'https://media.tenor.com/t7_iTN0iYekAAAAd/sad-crying.gif' },
  { id: 'c3', tags: 'laugh ketawa ngakak lucu funny', url: 'https://media.tenor.com/5BYK-f0__gAAAAAd/laughing-cat.gif' },
  { id: 'c4', tags: 'love cinta sayang heart', url: 'https://media.tenor.com/2roX3uxz_68AAAAd/cat-heart.gif' },
  { id: 'c5', tags: 'hug peluk love kangen', url: 'https://media.tenor.com/J7eGDvGeP9IAAAAd/peach-cat-hug.gif' },
  { id: 'c6', tags: 'ok oke siap mantap thumbs up', url: 'https://media.tenor.com/1sL5h8b4k2sAAAAd/thumbs-up-ok.gif' },
  { id: 'c7', tags: 'hello halo hai wave', url: 'https://media.tenor.com/SNL9_JuEOoAAAAAd/hi-wave.gif' },
  { id: 'c8', tags: 'angry marah kesel mad', url: 'https://media.tenor.com/1m2c2v2p8MAAAAAd/angry-cat.gif' },
  { id: 'c9', tags: 'shocked kaget omg', url: 'https://media.tenor.com/8t8x0x7n8kAAAAAd/shocked-cat.gif' },
  { id: 'c10', tags: 'happy senang bahagia dance joget', url: 'https://media.tenor.com/lCKwsD2OW1kAAAAd/happy-cat-happy-happy-cat.gif' },
  { id: 'c11', tags: 'sleep tidur ngantuk malam', url: 'https://media.tenor.com/7zKZu8W9oYAAAAAd/sleepy-cat.gif' },
  { id: 'c12', tags: 'thank you makasih terimakasih', url: 'https://media.tenor.com/N6vS9g9h2PAAAAAd/thank-you.gif' },
];

function translateQuery(raw) {
  const cleaned = String(raw || '').trim().toLowerCase();
  if (!cleaned) return '';
  if (ID_TO_EN[cleaned]) return ID_TO_EN[cleaned];
  const mapped = cleaned
    .split(/\s+/)
    .map((w) => ID_TO_EN[w] || w)
    .join(' ');
  return mapped;
}

async function fetchKlipy(q) {
  const key = (process.env.KLIPY_API_KEY || '').trim();
  if (!key) return [];
  const url = q
    ? `https://api.klipy.com/api/v1/${key}/gifs/search?q=${encodeURIComponent(q)}&per_page=24&locale=id`
    : `https://api.klipy.com/api/v1/${key}/gifs/trending?per_page=24&locale=id`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const list = json?.data?.data || json?.results || [];
  return list
    .map((item) => {
      const f = item?.file || item?.files || item?.media_formats || {};
      const full = f?.hd?.gif?.url || f?.md?.gif?.url || f?.gif?.url || '';
      const prev = f?.sm?.gif?.url || f?.xs?.gif?.url || f?.tinygif?.url || full;
      if (!full) return null;
      return { id: String(item.id || item.slug || full), title: item.title || 'GIF', url: full, preview: prev };
    })
    .filter(Boolean);
}

async function fetchGiphyApi(q) {
  const key = (process.env.GIPHY_API_KEY || '').trim();
  if (!key) return [];
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.data || [])
    .map((item) => {
      const full = item?.images?.downsized_medium?.url || item?.images?.original?.url || '';
      const prev = item?.images?.fixed_width_small?.url || item?.images?.fixed_width?.url || full;
      if (!full) return null;
      return { id: String(item.id), title: item.title || 'GIF', url: full, preview: prev };
    })
    .filter(Boolean);
}

async function fetchTenorWeb(q) {
  const slug = (q || 'trending reactions')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const pageUrl = q
    ? `https://tenor.com/search/${encodeURIComponent(slug)}-gifs`
    : 'https://tenor.com/search/trending-gifs';

  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const html = await res.text();

  const matches = html.match(/https:\/\/media[0-9]*\.tenor\.com\/[^"'\\<>\s]+\.gif/gi) || [];
  const seen = new Set();
  const out = [];
  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/\\u002F/g, '/').split('?')[0];
    if (cleanUrl.includes('favicon') || cleanUrl.includes('logo')) continue;
    const key = cleanUrl.split('/').slice(-2).join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: 't-' + out.length + '-' + key.slice(0, 12),
      title: q || 'Trending GIF',
      url: cleanUrl,
      preview: cleanUrl,
    });
    if (out.length >= 24) break;
  }
  return out;
}

async function fetchGiphyWeb(q) {
  const slug = (q || 'funny reactions')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const pageUrl = q
    ? `https://giphy.com/search/${encodeURIComponent(slug)}`
    : 'https://giphy.com/trending-gifs';

  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const html = await res.text();

  const idRegex = /media[0-9]*\.giphy\.com\/media\/(?:v1\.[^/"']+\/)?([A-Za-z0-9]{10,22})\//g;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = idRegex.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id: 'g-' + id,
      title: q || 'GIF',
      url: `https://media.giphy.com/media/${id}/giphy.gif`,
      preview: `https://media.giphy.com/media/${id}/200w.gif`,
    });
    if (out.length >= 24) break;
  }
  return out;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get('q') || '').trim().slice(0, 60);
  const enQ = translateQuery(rawQ);

  try {
    let results = await fetchKlipy(enQ || rawQ);
    if (results.length < 6) {
      const gApi = await fetchGiphyApi(enQ || rawQ);
      if (gApi.length > results.length) results = gApi;
    }
    if (results.length < 6) {
      const tWeb = await fetchTenorWeb(enQ || rawQ);
      if (tWeb.length > results.length) results = tWeb;
    }
    if (results.length < 6) {
      const gWeb = await fetchGiphyWeb(enQ || rawQ);
      if (gWeb.length > results.length) results = gWeb;
    }

    if (results.length > 0) {
      return NextResponse.json({ results, query: rawQ });
    }
  } catch {}

  const qLower = (rawQ + ' ' + enQ).toLowerCase();
  const matched = rawQ
    ? CURATED_GIFS.filter((g) => qLower.split(/\s+/).some((w) => w && g.tags.includes(w)))
    : CURATED_GIFS;

  return NextResponse.json({
    results: (matched.length > 0 ? matched : CURATED_GIFS).map((g) => ({
      id: g.id,
      title: rawQ || 'GIF',
      url: g.url,
      preview: g.url,
    })),
  });
}
