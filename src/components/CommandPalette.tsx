import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  Compass,
  Gift,
  Layers,
  LayoutGrid,
  Monitor,
  Package,
  Palette,
  Search,
  Settings,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { sound } from '../sound';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  actions: PaletteAction[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onClose, actions }) => {
  const [q, setQ] = useState('');
  const filtered = actions.filter((a) =>
    (a.label + ' ' + (a.hint || '')).toLowerCase().includes(q.trim().toLowerCase())
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-start justify-center pt-[14vh] p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className="w-full max-w-lg glass-card rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface-solid)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Komut ara (tema, Mini HUD, gizli hediye, keşfet, ses, dondur)..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-[10px] font-mono-num px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
            ESC
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                sound.playClick();
                a.run();
                onClose();
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer transition hover:opacity-95"
              style={{ background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="flex items-center gap-2.5 text-xs font-medium">
                <span style={{ color: 'var(--accent)' }}>{a.icon}</span>
                <span>{a.label}</span>
              </div>
              {a.hint && (
                <span className="text-[10px] font-mono-num" style={{ color: 'var(--muted)' }}>
                  {a.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export const PaletteIcons = {
  Camera,
  Compass,
  Gift,
  Layers,
  LayoutGrid,
  Monitor,
  Package,
  Palette,
  Settings,
  Users,
  Volume2,
  VolumeX,
};
