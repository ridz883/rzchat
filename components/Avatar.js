'use client';

export default function Avatar({ src, name, size = 'md', className = '' }) {
  const sizes = {
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-sm',
    md: 'w-11 h-11 text-base',
    lg: 'w-20 h-20 text-2xl',
    xl: 'w-24 h-24 text-3xl',
  };

  const sizeClass = sizes[size] || sizes.md;
  const initial = (name || 'U').trim().charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-black/10 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 select-none ${className}`}
    >
      {initial}
    </div>
  );
}
