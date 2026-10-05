import React from 'react';

interface WafrBrandProps {
  compact?: boolean;
  inverse?: boolean;
  showTagline?: boolean;
  className?: string;
}

export const WafrMark: React.FC<{ className?: string; inverse?: boolean }> = ({ className = 'h-11 w-11', inverse = true }) => (
  <span
    className={`${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[24%] shadow-sm ${inverse ? 'bg-[#0a1628]' : 'border border-slate-200 bg-white'}`}
    aria-hidden="true"
  >
    <svg viewBox="0 0 64 64" className="block h-full w-full" focusable="false">
      <defs>
        <linearGradient id="wafr-mark-gradient" x1="10" y1="54" x2="54" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#047857" />
          <stop offset="1" stopColor="#6ee7b7" />
        </linearGradient>
      </defs>
      <rect x="12" y="34" width="10" height="18" rx="5" fill="url(#wafr-mark-gradient)" />
      <rect x="27" y="24" width="10" height="28" rx="5" fill="url(#wafr-mark-gradient)" />
      <rect x="42" y="12" width="10" height="40" rx="5" fill="url(#wafr-mark-gradient)" />
    </svg>
  </span>
);

export const WafrBrand: React.FC<WafrBrandProps> = ({ compact = false, inverse = true, showTagline = true, className = '' }) => (
  <div className={`inline-flex flex-none items-center gap-3 whitespace-nowrap ${className}`} aria-label="WAFR - وفر">
    <WafrMark className={compact ? 'h-10 w-10' : 'h-12 w-12'} inverse={inverse} />
    <div className="flex-none leading-none">
      <div className={`${compact ? 'text-lg' : 'text-2xl'} whitespace-nowrap font-black tracking-tight ${inverse ? 'text-white' : 'text-[#0a1628]'}`}>
        WAFR <span className="font-bold text-emerald-400">وفر</span>
      </div>
      {showTagline && <div className={`mt-1.5 whitespace-nowrap text-[9px] font-extrabold tracking-[.19em] ${inverse ? 'text-slate-400' : 'text-slate-500'}`}>PAYROLL &amp; PEOPLE</div>}
    </div>
  </div>
);
