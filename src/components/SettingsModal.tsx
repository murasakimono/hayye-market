import React, { useEffect, useState } from 'react';
import { Bell, Copy, Play, Puzzle, Send, Smartphone, Square, X } from 'lucide-react';
import { api } from '../api';
import type { AlertSettings, MobileAccessInfo } from '../types';

interface SettingsModalProps {
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onToast }) => {
  const [settings, setSettings] = useState<AlertSettings>({
    discord_webhook: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    ntfy_topic: '',
    refresh_interval_min: 45,
    cloudflare_tunnel_url: '',
    cloudflare_tunnel_token: '',
    cloudflare_worker_key: '',
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
    onToast('Ayarlar kaydedildi.');
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
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#111317] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#10B981]/15 flex items-center justify-center text-[#10B981]">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#F5F2EB]">Ayarlar & Bağlantılar</div>
              <div className="text-[11px] text-[#8F96A3]">Bildirimler, iOS/iPadOS Sabit Link & Brave Eklentisi</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-[#8F96A3] hover:text-white cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
          {/* Mobile & Cloudflare */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#10B981]">
                <Smartphone className="w-4 h-4" />
                iPhone & iPad Safari Uygulaması (Metehan & İlayda)
              </div>
              {mobile && (
                <span
                  className={`font-mono-num text-[10px] px-2.5 py-0.5 rounded-full border ${
                    mobile.tunnel.state === 'on'
                      ? 'border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]'
                      : mobile.tunnel.state === 'starting'
                      ? 'border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#3B82F6]'
                      : 'border-white/10 bg-white/[0.03] text-[#8F96A3]'
                  }`}
                >
                  {mobile.tunnel.state === 'on'
                    ? `AKTİF (${mobile.tunnel.mode.toUpperCase()})`
                    : mobile.tunnel.state === 'starting'
                    ? 'BAĞLANIYOR...'
                    : mobile.cloudflared_installed
                    ? 'HAZIR'
                    : 'CLOUDFLARED YOK'}
                </span>
              )}
            </div>

            {mobile && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#8F96A3]">Ev Wi-Fi Adresi</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(mobile.lan_url);
                      onToast('Ev Wi-Fi adresi kopyalandı.');
                    }}
                    className="font-mono-num text-[#F5F2EB] hover:text-[#10B981] flex items-center gap-1.5 cursor-pointer"
                  >
                    {mobile.lan_url} <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                {mobile.tunnel.active_url && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                    <span className="text-[#8F96A3]">Sabit Dış Erişim (5G / Wi-Fi)</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(mobile.tunnel.active_url);
                        onToast('Sabit iOS adresi kopyalandı.');
                      }}
                      className="font-mono-num text-[#10B981] hover:underline flex items-center gap-1.5 cursor-pointer truncate max-w-[340px]"
                    >
                      {mobile.tunnel.active_url} <Copy className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <label className="space-y-1 block">
                    <span className="text-[11px] text-[#8F96A3] block">Sabit Cloudflare Adresi</span>
                    <input
                      value={settings.cloudflare_tunnel_url}
                      onChange={(e) => setSettings({ ...settings, cloudflare_tunnel_url: e.target.value })}
                      placeholder="https://hayye-market.kami-metehan.workers.dev"
                      className="w-full rounded-xl bg-[#090A0C] border border-white/[0.08] px-3 py-2 font-mono-num text-[11px] text-[#F5F2EB] focus:outline-none focus:border-[#10B981]"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[11px] text-[#8F96A3] block">Worker Parolası (HAYYE_KEY)</span>
                    <input
                      type="password"
                      value={settings.cloudflare_worker_key}
                      onChange={(e) => setSettings({ ...settings, cloudflare_worker_key: e.target.value })}
                      placeholder="hayye2026"
                      className="w-full rounded-xl bg-[#090A0C] border border-white/[0.08] px-3 py-2 font-mono-num text-[11px] text-[#F5F2EB] focus:outline-none focus:border-[#10B981]"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] text-[#8F96A3] truncate">
                    {mobile.tunnel.error || 'Açılışta otomatik bağlanır; iPhone ve İlayda şifresiz girer.'}
                  </div>
                  {mobile.tunnel.state === 'on' || mobile.tunnel.state === 'starting' ? (
                    <button
                      onClick={handleStopTunnel}
                      disabled={tunnelBusy}
                      className="px-3.5 py-1.5 rounded-full bg-[#F43F5E]/15 text-[#F43F5E] hover:bg-[#F43F5E]/25 text-xs font-medium flex items-center gap-1.5 cursor-pointer shrink-0 transition"
                    >
                      <Square className="w-3 h-3" /> Durdur
                    </button>
                  ) : (
                    <button
                      onClick={handleStartTunnel}
                      disabled={tunnelBusy || !mobile.cloudflared_installed}
                      className="px-3.5 py-1.5 rounded-full bg-[#10B981] hover:bg-[#0EA472] text-[#090A0C] font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0 transition"
                    >
                      <Play className="w-3 h-3" /> Tüneli Başlat
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="space-y-3 pt-2 border-t border-white/[0.07]">
            <div className="text-xs font-semibold text-[#F5F2EB]">Anlık İndirim & Beden Restock Bildirimleri</div>
            <div className="grid grid-cols-1 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[11px] text-[#8F96A3] block">Discord Webhook URL</span>
                <input
                  value={settings.discord_webhook}
                  onChange={(e) => setSettings({ ...settings, discord_webhook: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full rounded-xl bg-[#090A0C] border border-white/[0.08] px-3 py-2 font-mono-num text-xs text-[#F5F2EB] focus:outline-none focus:border-[#10B981]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[11px] text-[#8F96A3] block">Telegram Bot Token</span>
                  <input
                    value={settings.telegram_bot_token}
                    onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                    placeholder="123456:ABC-..."
                    className="w-full rounded-xl bg-[#090A0C] border border-white/[0.08] px-3 py-2 font-mono-num text-xs text-[#F5F2EB] focus:outline-none focus:border-[#10B981]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-[#8F96A3] block">Telegram Chat ID</span>
                  <input
                    value={settings.telegram_chat_id}
                    onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                    placeholder="987654321"
                    className="w-full rounded-xl bg-[#090A0C] border border-white/[0.08] px-3 py-2 font-mono-num text-xs text-[#F5F2EB] focus:outline-none focus:border-[#10B981]"
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-[11px] text-[#8F96A3] block">ntfy.sh Konu Adı (Ücretsiz iOS Push)</span>
                <input
                  value={settings.ntfy_topic}
                  onChange={(e) => setSettings({ ...settings, ntfy_topic: e.target.value })}
                  placeholder="hayye-metehan-gizli"
                  className="w-full rounded-xl bg-[#090A0C] border border-white/[0.08] px-3 py-2 font-mono-num text-xs text-[#F5F2EB] focus:outline-none focus:border-[#10B981]"
                />
              </label>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
              >
                <Send className="w-3.5 h-3.5 text-[#10B981]" />
                {testing ? 'Gönderiliyor...' : 'Test Gönder'}
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 rounded-full bg-[#10B981] hover:bg-[#0EA472] text-[#090A0C] text-xs font-semibold cursor-pointer ml-auto transition"
              >
                Kaydet
              </button>
            </div>
          </div>

          {/* Extension */}
          <div className="pt-3 border-t border-white/[0.07] space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#3B82F6]">
              <Puzzle className="w-4 h-4" />
              Brave Eklentisi v2.0 (29 Mağaza + Canlı Fiyat Hapı)
            </div>
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] font-mono-num text-[11px] text-[#10B981] select-all">
              C:\Users\fluvoksamine\Projeler\hayye-market\extension
            </div>
            <p className="text-[11px] text-[#8F96A3]">
              Yeni logoyu ve canlı fiyat hapını görmek için <code className="text-[#F5F2EB]">brave://extensions</code> sayfasından Hayye Bridge kartındaki yenile simgesine basman yeterli.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
