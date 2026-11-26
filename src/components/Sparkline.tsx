import React from 'react';
import type { PricePoint } from '../types';

interface SparklineProps {
  points: PricePoint[];
  color?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({ points, color = '#10B981' }) => {
  const vals = points.map((p) => p.price_try).filter((v) => v > 0);
  if (vals.length < 2) {
    return (
      <svg width="68" height="22" viewBox="0 0 68 22" className="shrink-0">
        <line x1="2" y1="11" x2="66" y2="11" stroke="#323942" strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    );
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const coords = vals.map((v, i) => {
    const x = 2 + (i / (vals.length - 1)) * 64;
    const y = 19 - ((v - min) / span) * 16;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width="68" height="22" viewBox="0 0 68 22" className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.7" points={coords.join(' ')} />
    </svg>
  );
};
