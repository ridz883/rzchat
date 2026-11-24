const BLOCKED_EXTENSIONS = new Set([
  'html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'cjs',
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif',
  'sh', 'bash', 'ps1', 'vbs', 'php', 'jsp', 'asp', 'aspx',
]);

export const ANDROID_MEDIA_ACCEPT =
  'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z';

export function sanitizeText(input, maxLength = 4000) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeUsername(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export function validatePasswordStrength(password) {
  const pw = typeof password === 'string' ? password : '';
  if (pw.length < 8) {
    return { valid: false, score: 1, label: 'Terlalu pendek (min. 8 karakter)' };
  }
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbolOrUpper = /[^a-zA-Z0-9]/.test(pw) || /[A-Z]/.test(pw);

  if (!hasLetter || !hasNumber) {
    return { valid: false, score: 2, label: 'Wajib kombinasi huruf & angka' };
  }
  if (pw.length >= 10 && hasSymbolOrUpper) {
    return { valid: true, score: 4, label: 'Sangat kuat' };
  }
  return { valid: true, score: 3, label: 'Kuat' };
}

export function validateUploadFile(file, maxSizeMB = 25) {
  if (!file) return { valid: false, error: 'File tidak ditemukan.' };
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, error: `Ukuran file maksimal ${maxSizeMB} MB.` };
  }
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Format .${ext} diblokir demi keamanan.` };
  }
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('html') || mime.includes('javascript') || mime.includes('svg')) {
    return { valid: false, error: 'Tipe file ini tidak diizinkan demi keamanan.' };
  }
  let category = 'file';
  if (mime.startsWith('image/')) category = 'image';
  else if (mime.startsWith('video/')) category = 'video';
  else if (mime.startsWith('audio/')) category = 'audio';

  return { valid: true, category, ext };
}

export function extractFirstUrl(text) {
  if (typeof text !== 'string' || !text) return null;
  const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  try {
    const cleaned = match[0].replace(/[),.;!?]+$/, '');
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
