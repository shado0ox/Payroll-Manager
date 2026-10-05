import React from 'react';

interface WafrBrandProps {
  compact?: boolean;
  inverse?: boolean;
  showTagline?: boolean;
  className?: string;
}

export const WafrMark: React.FC<{ className?: string; inverse?: boolean }> = ({ className = 'h-11 w-11', inverse = true }) => (
  <span
    className={`${className} inline-flex shrink-0 items-end justify-center gap-[7%] rounded-[24%] p-[19%] shadow-sm ${inverse ? 'bg-[#0a1628]' : 'border border-slate-200 bg-white'}`}
    aria-hidden="true"
  >
    <span className="h-[43%] w-[22%] rounded-[30%] bg-gradient-to-tr from-emerald-700 to-emerald-300" />
    <span className="h-[66%] w-[22%] rounded-[30%] bg-gradient-to-tr from-emerald-700 to-emerald-300" />
    <span className="h-[89%] w-[22%] rounded-[30%] bg-gradient-to-tr from-emerald-700 to-emerald-300" />
  </span>
);

export const WafrBrand: React.FC<WafrBrandProps> = ({ compact = false, inverse = true, showTagline = true, className = '' }) => (
  <div className={`inline-flex min-w-0 items-center gap-3 ${className}`} aria-label="WAFR - وفر">
    <WafrMark className={compact ? 'h-10 w-10' : 'h-12 w-12'} inverse={inverse} />
    <div className="min-w-0 leading-none">
      <div className={`${compact ? 'text-lg' : 'text-2xl'} truncate font-black tracking-tight ${inverse ? 'text-white' : 'text-[#0a1628]'}`}>
        WAFR <span className="font-bold text-emerald-400">وفر</span>
      </div>
      {showTagline && <div className={`mt-1.5 truncate text-[9px] font-extrabold tracking-[.19em] ${inverse ? 'text-slate-400' : 'text-slate-500'}`}>PAYROLL &amp; PEOPLE</div>}
    </div>
  </div>
);
