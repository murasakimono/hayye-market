import React, { useState } from 'react';
import { fmtTry, fmtUsd, type PricePoint } from '../types';

interface PriceChartProps {
  history: PricePoint[];
  currency: 'TRY' | 'USD';
  currentUsdRate: number;
  targetPriceTry: number | null;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  history,
  currency,
  currentUsdRate,
  targetPriceTry,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = history.map((h) => ({
    ts: h.ts,
    val: currency === 'TRY' ? h.price_try : h.price_try / (h.usd_rate || currentUsdRate || 35),
    source: h.source,
  }));

  if (series.length === 0) {
    return (
      <div className="h-44 border border-[#242930] bg-[#0E1012] flex items-center justify-center text-xs text-[#656E78]">
        Fiyat geçmişi ilk taramalarla oluşuyor
      </div>
    );
  }

  const pts = series.length === 1 ? [series[0], series[0]] : series;
  const vals = pts.map((p) => p.val);
  const targetVal =
    targetPriceTry !== null
      ? currency === 'TRY'
        ? targetPriceTry
        : targetPriceTry / (currentUsdRate || 35)
      : null;

  const minV = Math.min(...vals, ...(targetVal ? [targetVal] : [])) * 0.96;
  const maxV = Math.max(...vals, ...(targetVal ? [targetVal] : [])) * 1.04;
  const span = Math.max(1, maxV - minV);

  const W = 560;
  const H = 170;
  const padX = 14;
  const padY = 16;

  const toX = (i: number) => padX + (i / (pts.length - 1)) * (W - padX * 2);
  const toY = (v: number) => H - padY - ((v - minV) / span) * (H - padY * 2);

  const linePoints = pts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.val).toFixed(1)}`).join(' ');
  const areaPoints = `${padX},${H - padY} ${linePoints} ${W - padX},${H - padY}`;
  const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
  const accent = currency === 'TRY' ? '#10B981' : '#3B82F6';
  const hovered = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <div className="border border-[#242930] bg-[#0E1012] p-3">
      <div className="flex items-center justify-between text-[11px] mb-2">
        <span className="text-[#9AA2AC]">
          {currency === 'TRY' ? 'Gerçek TL Fiyat Seyri' : 'Dolar Bazlı Enflasyonsuz Seyir ($)'}
        </span>
        <span className="font-mono-num text-[#F2EFE9]">
          {hovered
            ? `${hovered.ts.slice(0, 10)} • ${currency === 'TRY' ? fmtTry(hovered.val) : fmtUsd(hovered.val)}`
            : `Ort: ${currency === 'TRY' ? fmtTry(avgVal) : fmtUsd(avgVal)}`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-40 overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="hayyeArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.24" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Average dashed line */}
        <line
          x1={padX}
          y1={toY(avgVal)}
          x2={W - padX}
          y2={toY(avgVal)}
          stroke="#323942"
          strokeDasharray="4 4"
          strokeWidth="1"
        />

        {/* Target price alert line */}
        {targetVal !== null && (
          <line
            x1={padX}
            y1={toY(targetVal)}
            x2={W - padX}
            y2={toY(targetVal)}
            stroke="#F59E0B"
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />
        )}

        <polygon points={areaPoints} fill="url(#hayyeArea)" className="transition-all duration-300" />
        <polyline
          fill="none"
          stroke={accent}
          strokeWidth="2.2"
          points={linePoints}
          className="transition-all duration-300"
        />

        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHoverIdx(i)} className="cursor-pointer">
            <circle cx={toX(i)} cy={toY(p.val)} r={hoverIdx === i ? 5 : 3} fill={accent} />
            <circle cx={toX(i)} cy={toY(p.val)} r={12} fill="transparent" />
          </g>
        ))}
      </svg>
    </div>
  );
};
