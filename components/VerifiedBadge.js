'use client';

export function BlueCheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Terverifikasi"
      className={`inline-block shrink-0 ${className}`}
    >
      <path
        d="M12 1.8l2.15 1.85 2.83-.28 1.07 2.63 2.63 1.07-.28 2.83L22.2 12l-1.85 2.15.28 2.83-2.63 1.07-1.07 2.63-2.83-.28L12 22.2l-2.15-1.85-2.83.28-1.07-2.63-2.63-1.07.28-2.83L1.8 12l1.85-2.15-.28-2.83 2.63-1.07 1.07-2.63 2.83.28L12 1.8z"
        fill="#0095F6"
      />
      <path
        d="M8.6 12.2l2.3 2.35 4.7-4.85"
        stroke="#FFFFFF"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GroupBadge({ className = '' }) {
  return (
    <span
      title="Obrolan Grup"
      className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-[5px] text-[9px] font-extrabold tracking-[0.14em] uppercase bg-emerald-500/12 text-emerald-500 border border-emerald-500/35 shrink-0 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-[2px] bg-emerald-500 inline-block" />
      GRUP
    </span>
  );
}

export default function VerifiedBadge({
  user,
  size = 'sm',
  showTag = true,
  className = '',
}) {
  if (!user) return null;
  const uname = String(user.username || '').toLowerCase();
  const isDev = uname === 'dev' || user.badge_type === 'dev';
  const isVerified = Boolean(user.is_verified) || isDev;
  const badgeType = isDev ? 'dev' : String(user.badge_type || '').toLowerCase();

  if (!isVerified && !badgeType) return null;

  const iconSize = size === 'xs' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <span className={`inline-flex items-center gap-1 align-middle shrink-0 ${className}`}>
      {isVerified && <BlueCheckIcon className={iconSize} />}
      {showTag && badgeType === 'dev' && (
        <span
          title="Official Developer"
          className="inline-flex items-center px-1.5 py-[1px] rounded-[5px] text-[9px] font-extrabold tracking-[0.14em] uppercase bg-zinc-900 text-zinc-100 border border-zinc-600/80 shadow-xs"
        >
          DEV
        </span>
      )}
      {showTag && badgeType === 'vvip' && (
        <span
          title="VVIP Member"
          className="inline-flex items-center px-1.5 py-[1px] rounded-[5px] text-[9px] font-extrabold tracking-[0.14em] uppercase bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-500 border border-amber-500/45 shadow-xs"
        >
          VVIP
        </span>
      )}
    </span>
  );
}
