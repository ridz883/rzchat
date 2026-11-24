'use client';

export async function saveMediaToDevice({ url, fileName, mediaType, isViewOnce }) {
  if (isViewOnce) {
    throw new Error('Media 1x lihat terkunci dan tidak dapat disimpan.');
  }
  if (!url) {
    throw new Error('URL media tidak tersedia.');
  }

  const fallbackExt =
    mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'webm' : mediaType === 'image' ? 'jpg' : 'bin';
  const safeName = (fileName || `rzzchat-${Date.now()}.${fallbackExt}`)
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 120);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Gagal mengunduh file');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return true;
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }
}
