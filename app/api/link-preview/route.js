import { NextResponse } from 'next/server';

function isBlockedHost(hostname) {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^0\./.test(h)) return true;
  if (/^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

function decodeHtml(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

function extractMeta(html, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    );
    const m = html.match(re1) || html.match(re2);
    if (m?.[1]) return decodeHtml(m[1]);
  }
  return '';
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url');
    if (!rawUrl) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    let target;
    try {
      target = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }

    if ((target.protocol !== 'http:' && target.protocol !== 'https:') || isBlockedHost(target.hostname)) {
      return NextResponse.json({ error: 'Blocked url' }, { status: 403 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RzChatPreview/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({ error: 'Fetch failed' }, { status: 404 });
    }

    const finalUrl = new URL(res.url || target.toString());
    if (isBlockedHost(finalUrl.hostname)) {
      return NextResponse.json({ error: 'Blocked redirect' }, { status: 403 });
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json({
        url: finalUrl.toString(),
        siteName: finalUrl.hostname.replace(/^www\./, ''),
        title: finalUrl.hostname,
        description: '',
        image: '',
      });
    }

    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let total = 0;
      while (total < 150000) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (html.includes('</head>')) break;
      }
      reader.cancel().catch(() => {});
    } else {
      html = (await res.text()).slice(0, 150000);
    }

    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
    const title = extractMeta(html, ['og:title', 'twitter:title']) || decodeHtml(titleTag) || finalUrl.hostname;
    const description = extractMeta(html, ['og:description', 'twitter:description', 'description']);
    const siteName =
      extractMeta(html, ['og:site_name']) || finalUrl.hostname.replace(/^www\./, '');
    let image = extractMeta(html, ['og:image', 'twitter:image']);

    if (image) {
      try {
        image = new URL(image, finalUrl).toString();
      } catch {
        image = '';
      }
    }

    return NextResponse.json(
      {
        url: finalUrl.toString(),
        title: title.slice(0, 140),
        description: description.slice(0, 220),
        siteName: siteName.slice(0, 60),
        image,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      }
    );
  } catch {
    return NextResponse.json({ error: 'Preview unavailable' }, { status: 404 });
  }
}
