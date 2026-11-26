import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Flame, RefreshCw, X, Zap } from 'lucide-react';
import { api } from '../api';
import { fmtTry, type ProductDetail } from '../types';

export const MiniHud: React.FC = () => {
  const [items, setItems] = useState<ProductDetail[]>([]);

  const load = () => {
    api.getProducts().then((list) => setItems(list.slice(0, 3))).catch(() => {});
  };

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const startDrag = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button === 0) {
      try {
        await getCurrentWindow().startDragging();
      } catch {
        // Ignore outside Tauri
      }
    }
  };

  return (
    <div
      onMouseDown={startDrag}
      className="w-screen h-screen p-2 select-none"
      style={{ background: 'transparent' }}
    >
      <div
        className="w-full h-full rounded-2xl p-3 flex flex-col justify-between shadow-2xl"
        style={{
          background: 'rgba(12, 14, 19, 0.84)',
          backdropFilter: 'blur(22px)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          color: '#F5F2EB',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <img src="/hayye-icon.png" alt="H" className="w-4 h-4 rounded" />
            <span>Hayye HUD</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} className="p-1 rounded-full hover:bg-white/10 cursor-pointer" title="Yenile">
              <RefreshCw className="w-3 h-3 text-[#8F96A3]" />
            </button>
            <button
              onClick={() => getCurrentWindow().close().catch(() => {})}
              className="p-1 rounded-full hover:bg-white/10 cursor-pointer"
              title="Kapat"
            >
              <X className="w-3 h-3 text-[#8F96A3]" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5 my-1 overflow-hidden">
          {items.length === 0 ? (
            <div className="text-[11px] text-[#8F96A3] text-center py-3">Takip edilen ürün yok</div>
          ) : (
            items.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate flex items-center gap-1">
                  {p.discount_verdict.status.includes('GENUINE') && (
                    <Flame className="w-3 h-3 text-[#10B981] shrink-0" />
                  )}
                  {p.title}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono-num font-bold text-[#10B981]">{fmtTry(p.best_new_try)}</span>
                  <button
                    onClick={() => api.openExternal(p.quick_checkout_url || p.primary_url)}
                    className="p-0.5 rounded bg-[#10B981]/20 text-[#10B981] cursor-pointer"
                    title="Hızlı Alım"
                  >
                    <Zap className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="text-[9px] text-[#8F96A3] flex justify-between">
          <span>Sürükleyip konumlandır</span>
          <span>Otonom Nöbet Aktif</span>
        </div>
      </div>
    </div>
  );
};
