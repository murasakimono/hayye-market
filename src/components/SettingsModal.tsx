import React, { useEffect, useState } from 'react';
import { Bell, Copy, CreditCard, Palette, Play, Puzzle, Send, Smartphone, Square, Wallet, X } from 'lucide-react';
import { api } from '../api';
import { THEMES, applyThemeToDom } from '../themes';
import type { AlertSettings, MobileAccessInfo } from '../types';

interface SettingsModalProps {
  onClose: () => void;
  onToast: (msg: string) => void;
  onThemeChange: (themeId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onToast, onThemeChange }) => {
  const [settings, setSettings] = useState<AlertSettings>({
    discord_webhook: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    ntfy_topic: '',
    refresh_interval_min: 45,
    cloudflare_tunnel_url: '',
    cloudflare_tunnel_token: '',
    cloudflare_worker_key: '',
    active_theme: 'obsidian-aurora',
    monthly_budget_try: 15000,
    user_cards: 'Bonus, World, Maximum',
  });
  const [mobile, setMobile] = useState<MobileAccessInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);

  const refreshMobile = () => {
    api.getMobileAccessInfo().then(setMobile).catch(() => {});
  };

  useEffect(() => {
    api.getAlertSettings().then(setSettings).catch(() => {});
    refreshMobile();
  }, []);

  useEffect(() => {
    if (mobile?.tunnel.state !== 'starting') return;
    const t = setInterval(refreshMobile, 1500);
    return () => clearInterval(t);
  }, [mobile?.tunnel.state]);

  const handleSave = async () => {
    await api.saveAlertSettings(settings);
    applyThemeToDom(settings.active_theme);
    onThemeChange(settings.active_theme);
    onToast('Ayarlar ve tema tüm cihazlara senkronlandı.');
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const msg = await api.testAlertChannels(settings);
      onToast(msg);
    } catch (e) {
      onToast(String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    try {
      await api.startCloudflareTunnel(settings);
      refreshMobile();
      onToast('Cloudflare tüneli başlatıldı.');
    } catch (e) {
      onToast(String(e));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopTunnel = async () => {
    setTunnelBusy(true);
    try {
      await api.stopCloudflareTunnel();
      refreshMobile();
      onToast('Cloudflare tüneli durduruldu.');
    } finally {
      setTunnelBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl glass-card rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface-solid)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
            >
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">Ayarlar, Tema & Bağlantılar</div>
              <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                Masaüstü + Brave Yan Panel + iPhone/iPad Tek Merkezden Senkron
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition"
            style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
          {/* 5 Atmospheric Themes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              <Palette className="w-4 h-4" />
              Atmosferik Tema Motoru (Masaüstü + Eklenti + iPhone/iPad)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {THEMES.map((t) => {
                const active = settings.active_theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSettings({ ...settings, active_theme: t.id });
                      applyThemeToDom(t.id);
                      onThemeChange(t.id);
                    }}
                    className="p-3 rounded-2xl text-left flex items-center gap-3 cursor-pointer transition"
                    style={{
                      background: 'var(--surface-2)',
                      border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    }}
                  >
                    <div className="flex -space-x-1.5 shrink-0">
                      {t.swatch.map((c, i) => (
                        <span
                          key={i}
                          className="w-5 h-5 rounded-full ring-2 ring-black/20"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{t.name}</div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>
                        {t.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monthly Budget & Bank Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <label className="space-y-1 block">
              <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                Ortak Aylık Bütçe Limiti (₺)
              </span>
              <input
                type="number"
                value={settings.monthly_budget_try}
                onChange={(e) => setSettings({ ...settings, monthly_budget_try: Number(e.target.value) || 0 })}
                className="w-full rounded-xl px-3 py-2 font-mono-num text-xs focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                <CreditCard className="w-3.5 h-3.5" style={{ color: 'var(--accent-2)' }} />
                Sahip Olduğun Kartlar (Kampanya Notu)
              </span>
              <input
                value={settings.user_cards}
                onChange={(e) => setSettings({ ...settings, user_cards: e.target.value })}
                placeholder="Bonus, World, Axess, Maximum"
                className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
            </label>
          </div>

          {/* Mobile & Cloudflare */}
          <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                <Smartphone className="w-4 h-4" />
                iPhone & iPad Safari Uygulaması (Metehan & İlayda)
              </div>
              {mobile && (
                <span
                  className="font-mono-num text-[10px] px-2.5 py-0.5 rounded-full"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: mobile.tunnel.state === 'on' ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {mobile.tunnel.state === 'on' ? 'TÜNEL AKTİF' : mobile.tunnel.state === 'starting' ? 'BAĞLANIYOR...' : 'HAZIR'}
                </span>
              )}
            </div>

            {mobile && (
              <div className="p-4 rounded-2xl space-y-3 text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span style={{ color: 'var(--muted)' }}>Ev Wi-Fi Adresi</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(mobile.lan_url);
                      onToast('Ev Wi-Fi adresi kopyalandı.');
                    }}
                    className="font-mono-num hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    {mobile.lan_url} <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                {mobile.tunnel.active_url && (
                  <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>Sabit Dış Erişim (5G / Wi-Fi)</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(mobile.tunnel.active_url);
                        onToast('Sabit iOS adresi kopyalandı.');
                      }}
                      className="font-mono-num hover:underline flex items-center gap-1.5 cursor-pointer truncate max-w-[330px]"
                      style={{ color: 'var(--accent)' }}
                    >
                      {mobile.tunnel.active_url} <Copy className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <label className="space-y-1 block">
                    <span className="text-[11px] block" style={{ color: 'var(--muted)' }}>Sabit Cloudflare Adresi</span>
                    <input
                      value={settings.cloudflare_tunnel_url}
                      onChange={(e) => setSettings({ ...settings, cloudflare_tunnel_url: e.target.value })}
                      className="w-full rounded-xl px-3 py-2 font-mono-num text-[11px] focus:outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[11px] block" style={{ color: 'var(--muted)' }}>Worker Parolası</span>
                    <input
                      type="password"
                      value={settings.cloudflare_worker_key}
                      onChange={(e) => setSettings({ ...settings, cloudflare_worker_key: e.target.value })}
                      className="w-full rounded-xl px-3 py-2 font-mono-num text-[11px] focus:outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                    {mobile.tunnel.error || 'Açılışta otomatik bağlanır; iPhone ve İlayda şifresiz girer.'}
                  </div>
                  {mobile.tunnel.state === 'on' || mobile.tunnel.state === 'starting' ? (
                    <button
                      onClick={handleStopTunnel}
                      disabled={tunnelBusy}
                      className="px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer shrink-0"
                      style={{ background: 'rgba(244,63,94,0.16)', color: 'var(--danger)' }}
                    >
                      <Square className="w-3 h-3" /> Durdur
                    </button>
                  ) : (
                    <button
                      onClick={handleStartTunnel}
                      disabled={tunnelBusy || !mobile.cloudflared_installed}
                      className="px-3.5 py-1.5 rounded-full font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
                      style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                    >
                      <Play className="w-3 h-3" /> Tüneli Başlat
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold">Anlık İndirim & Beden Restock Bildirimleri</div>
            <div className="grid grid-cols-1 gap-2.5 text-xs">
              <input
                value={settings.discord_webhook}
                onChange={(e) => setSettings({ ...settings, discord_webhook: e.target.value })}
                placeholder="Discord Webhook URL"
                className="w-full rounded-xl px-3 py-2 font-mono-num text-xs focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  value={settings.telegram_bot_token}
                  onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                  placeholder="Telegram Bot Token"
                  className="w-full rounded-xl px-3 py-2 font-mono-num text-xs focus:outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                />
                <input
                  value={settings.telegram_chat_id}
                  onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                  placeholder="Telegram Chat ID"
                  className="w-full rounded-xl px-3 py-2 font-mono-num text-xs focus:outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                />
              </div>
              <input
                value={settings.ntfy_topic}
                onChange={(e) => setSettings({ ...settings, ntfy_topic: e.target.value })}
                placeholder="ntfy.sh Konu Adı (Ücretsiz iOS Push)"
                className="w-full rounded-xl px-3 py-2 font-mono-num text-xs focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <Send className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                {testing ? 'Gönderiliyor...' : 'Test Gönder'}
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 rounded-full text-xs font-semibold cursor-pointer ml-auto"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Kaydet & Senkronla
              </button>
            </div>
          </div>

          {/* Extension v3 */}
          <div className="pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent-2)' }}>
              <Puzzle className="w-4 h-4" />
              Brave Eklentisi v3.0 (Side Panel + Görsel Fiyat Seçici)
            </div>
            <div
              className="p-2.5 rounded-xl font-mono-num text-[11px] select-all"
              style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
            >
              C:\Users\fluvoksamine\Projeler\hayye-market\extension
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
