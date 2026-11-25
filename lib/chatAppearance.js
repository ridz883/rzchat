export const CHAT_ACCENTS = [
  { id: 'blue', name: 'Biru', bubble: 'bg-blue-600 text-white', swatch: '#2563eb' },
  { id: 'violet', name: 'Ungu', bubble: 'bg-violet-600 text-white', swatch: '#7c3aed' },
  { id: 'emerald', name: 'Hijau', bubble: 'bg-emerald-600 text-white', swatch: '#059669' },
  { id: 'rose', name: 'Merah Muda', bubble: 'bg-rose-600 text-white', swatch: '#e11d48' },
  { id: 'amber', name: 'Oranye', bubble: 'bg-amber-600 text-white', swatch: '#d97706' },
  { id: 'slate', name: 'Gelap', bubble: 'bg-zinc-700 text-white', swatch: '#3f3f46' },
];

export const CHAT_WALLPAPERS = [
  { id: 'default', name: 'Polos', darkBg: '', lightBg: '' },
  {
    id: 'midnight',
    name: 'Malam',
    darkBg: 'linear-gradient(160deg, #09090b 0%, #172554 55%, #0f172a 100%)',
    lightBg: 'linear-gradient(160deg, #eff6ff 0%, #dbeafe 55%, #e0e7ff 100%)',
  },
  {
    id: 'sunset',
    name: 'Senja',
    darkBg: 'linear-gradient(160deg, #18181b 0%, #4c1d95 50%, #831843 100%)',
    lightBg: 'linear-gradient(160deg, #fff1f2 0%, #fce7f3 50%, #ffedd5 100%)',
  },
  {
    id: 'forest',
    name: 'Hutan',
    darkBg: 'linear-gradient(160deg, #09090b 0%, #064e3b 55%, #0f172a 100%)',
    lightBg: 'linear-gradient(160deg, #ecfdf5 0%, #d1fae5 55%, #f0fdfa 100%)',
  },
  {
    id: 'dots',
    name: 'Pola Titik',
    darkBg: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
    lightBg: 'radial-gradient(rgba(0,0,0,0.08) 1px, transparent 1px)',
    bgSize: '18px 18px',
  },
];

export function loadChatAppearance(roomId) {
  if (typeof window === 'undefined') return { accent: 'blue', wallpaper: 'default', customBg: '' };
  try {
    const raw =
      localStorage.getItem(`rzchat_appearance_${roomId}`) ||
      localStorage.getItem('rzchat_appearance_global');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        accent: parsed.accent || 'blue',
        wallpaper: parsed.wallpaper || 'default',
        customBg: parsed.customBg || '',
      };
    }
  } catch {}
  return { accent: 'blue', wallpaper: 'default', customBg: '' };
}

export function saveChatAppearance(roomId, prefs) {
  if (typeof window === 'undefined') return;
  try {
    const data = JSON.stringify(prefs);
    localStorage.setItem(`rzchat_appearance_${roomId}`, data);
    localStorage.setItem('rzchat_appearance_global', data);
  } catch {}
}

export function getAccentClass(accentId) {
  return (CHAT_ACCENTS.find((a) => a.id === accentId) || CHAT_ACCENTS[0]).bubble;
}

export function getWallpaperStyle(prefs, isDark) {
  if (!prefs) return {};
  if (prefs.wallpaper === 'custom' && prefs.customBg) {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,${isDark ? 0.55 : 0.25}), rgba(0,0,0,${isDark ? 0.55 : 0.25})), url(${prefs.customBg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const preset = CHAT_WALLPAPERS.find((w) => w.id === prefs.wallpaper);
  if (!preset || preset.id === 'default') return {};
  const bg = isDark ? preset.darkBg : preset.lightBg;
  return preset.bgSize ? { backgroundImage: bg, backgroundSize: preset.bgSize } : { backgroundImage: bg };
}

export function compressWallpaperFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca gambar wallpaper.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar valid.'));
      img.onload = () => {
        const maxSide = 960;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxSide) {
          h = Math.round((h * maxSide) / w);
          w = maxSide;
        } else if (h >= w && h > maxSide) {
          w = Math.round((w * maxSide) / h);
          h = maxSide;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
