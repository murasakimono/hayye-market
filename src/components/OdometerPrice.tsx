import React from 'react';

interface OdometerPriceProps {
  value: number;
  currency: 'TRY' | 'USD';
  className?: string;
}

export const OdometerPrice: React.FC<OdometerPriceProps> = ({ value, currency, className = '' }) => {
  const formatted =
    currency === 'TRY'
      ? `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(value))} ₺`
      : `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))}`;

  return (
    <span key={`${currency}-${Math.round(value)}`} className={`inline-block font-mono-num odometer-pop ${className}`}>
      {formatted}
    </span>
  );
};
