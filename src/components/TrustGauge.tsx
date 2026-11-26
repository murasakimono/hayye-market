import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import type { TrustFactor } from '../types';

interface TrustGaugeProps {
  score: number;
  reasons?: TrustFactor[];
  compact?: boolean;
}

export const TrustGauge: React.FC<TrustGaugeProps> = ({ score, reasons = [], compact = false }) => {
  const [open, setOpen] = useState(false);
  const segments = 10;
  const filled = Math.round((score / 100) * segments);
  const color = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#F43F5E';

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => reasons.length > 0 && setOpen((v) => !v)}
        className={`flex items-center gap-2.5 text-left ${reasons.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {score >= 60 ? (
          <ShieldCheck className="w-4 h-4 shrink-0" style={{ color }} />
        ) : (
          <ShieldAlert className="w-4 h-4 shrink-0" style={{ color }} />
        )}
        <div className="flex items-center gap-0.5">
          {Array.from({ length: segments }).map((_, i) => (
            <span
              key={i}
              style={{
                backgroundColor: i < filled ? color : '#242930',
                transitionDelay: `${i * 18}ms`,
              }}
              className={`${compact ? 'w-1.5 h-2.5' : 'w-2 h-3.5'} transition-colors duration-300`}
            />
          ))}
        </div>
        <span className="font-mono-num text-xs font-semibold" style={{ color }}>
          %{score}
        </span>
        {reasons.length > 0 && !compact && (
          <span className="text-[11px] text-[#9AA2AC] flex items-center gap-0.5">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </button>

      {open && reasons.length > 0 && (
        <div className="p-2.5 bg-[#0E1012] border border-[#242930] space-y-1 text-[11px]">
          {reasons.map((r, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3">
              <span className="text-[#9AA2AC]">{r.label}</span>
              <span className={`font-mono-num font-semibold shrink-0 ${r.positive ? 'text-[#10B981]' : 'text-[#F43F5E]'}`}>
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
