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

  const handleSave = async () => {
    await api.saveAlertSettings(settings);
    onToast('Bildirim kanalları kaydedildi.');
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

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-[#14171A] border border-[#323942] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#242930] flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="w-4 h-4 text-[#10B981]" />
            Bildirim Hatları & Brave Eklentisi
          </div>
          <button onClick={onClose} className="text-[#9AA2AC] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[78vh] overflow-y-auto">
          <div className="space-y-3">
            <div className="text-xs font-medium text-[#F2EFE9]">Telefon & Masaüstü Anlık Bildirimleri</div>
            <div className="grid grid-cols-1 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[#9AA2AC] block">Discord Webhook URL</span>
                <input
                  value={settings.discord_webhook}
                  onChange={(e) => setSettings({ ...settings, discord_webhook: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full bg-[#0E1012] border border-[#242930] px-3 py-2 font-mono-num text-xs text-[#F2EFE9] focus:outline-none focus:border-[#10B981]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[#9AA2AC] block">Telegram Bot Token</span>
                  <input
                    value={settings.telegram_bot_token}
                    onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                    placeholder="123456:ABC-..."
                    className="w-full bg-[#0E1012] border border-[#242930] px-3 py-2 font-mono-num text-xs text-[#F2EFE9] focus:outline-none focus:border-[#10B981]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#9AA2AC] block">Telegram Chat ID</span>
                  <input
                    value={settings.telegram_chat_id}
                    onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                    placeholder="987654321"
                    className="w-full bg-[#0E1012] border border-[#242930] px-3 py-2 font-mono-num text-xs text-[#F2EFE9] focus:outline-none focus:border-[#10B981]"
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-[#9AA2AC] block">ntfy.sh Konu Adı (Ücretsiz iOS/Android Push)</span>
                <input
                  value={settings.ntfy_topic}
                  onChange={(e) => setSettings({ ...settings, ntfy_topic: e.target.value })}
                  placeholder="hayye-metehan-gizli"
                  className="w-full bg-[#0E1012] border border-[#242930] px-3 py-2 font-mono-num text-xs text-[#F2EFE9] focus:outline-none focus:border-[#10B981]"
                />
              </label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3.5 py-2 border border-[#323942] bg-[#0E1012] hover:border-[#10B981] text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 text-[#10B981]" />
                {testing ? 'Gönderiliyor...' : 'Test Bildirimi Gönder'}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[#10B981] hover:bg-[#0EA472] text-[#0E1012] text-xs font-semibold cursor-pointer ml-auto"
              >
                Ayarları Kaydet
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-[#242930] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[#10B981]">
                <Smartphone className="w-4 h-4" />
                iPhone & iPad Safari Uygulaması (Sabit Cloudflare Linki)
              </div>
              {mobile && (
                <span className={`font-mono-num text-[10px] px-2 py-0.5 border ${
                  mobile.tunnel.state === 'on'
                    ? 'border-[#10B981] text-[#10B981]'
                    : mobile.tunnel.state === 'starting'
                    ? 'border-[#3B82F6] text-[#3B82F6]'
                    : 'border-[#323942] text-[#9AA2AC]'
                }`}>
                  {mobile.tunnel.state === 'on'
                    ? `TÜNEL AKTİF (${mobile.tunnel.mode.toUpperCase()})`
                    : mobile.tunnel.state === 'starting'
                    ? 'BAĞLANIYOR...'
                    : mobile.cloudflared_installed
                    ? 'CLOUDFLARED HAZIR'
                    : 'CLOUDFLARED YOK'}
                </span>
              )}
            </div>
            {mobile && (
              <div className="p-3 bg-[#0E1012] border border-[#242930] space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#9AA2AC]">Ev Wi-Fi Adresi:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(mobile.lan_url);
                      onToast('Ev Wi-Fi adresi kopyalandı.');
                    }}
                    className="font-mono-num text-[#10B981] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {mobile.lan_url} <Copy className="w-3 h-3" />
                  </button>
                </div>

                {mobile.tunnel.active_url && (
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#242930]">
                    <span className="text-[#9AA2AC]">Aktif Dış Erişim (iPhone/iPad):</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(mobile.tunnel.active_url);
                        onToast('Sabit/Canlı iOS adresi kopyalandı.');
                      }}
                      className="font-mono-num text-[#10B981] hover:underline flex items-center gap-1 cursor-pointer truncate max-w-[340px]"
                    >
                      {mobile.tunnel.active_url} <Copy className="w-3 h-3 shrink-0" />
                    </button>
                  </div>
                )}

                <label className="space-y-1 block pt-1">
                  <span className="text-[#9AA2AC] block">Sabit Adres (Kendi Domain&apos;in veya Cloudflare Worker URL)</span>
                  <input
                    value={settings.cloudflare_tunnel_url}
                    onChange={(e) => setSettings({ ...settings, cloudflare_tunnel_url: e.target.value })}
                    placeholder="https://hayye.senindomainin.com  veya  https://hayye-market.ad.workers.dev"
                    className="w-full bg-[#14171A] border border-[#242930] px-2.5 py-1.5 font-mono-num text-[11px] text-[#F2EFE9] focus:outline-none focus:border-[#10B981]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="space-y-1 block">
                    <span className="text-[#9AA2AC] block">Seçenek A: Zero Trust Tunnel Token</span>
                    <input
                      type="password"
                      value={settings.cloudflare_tunnel_token}
                      onChange={(e) => setSettings({ ...settings, cloudflare_tunnel_token: e.target.value })}
                      placeholder="eyJhIjoi..."
                      className="w-full bg-[#14171A] border border-[#242930] px-2.5 py-1.5 font-mono-num text-[11px] text-[#F2EFE9] focus:outline-none focus:border-[#10B981]"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[#9AA2AC] block">Seçenek B: Worker Gizli Anahtarı</span>
                    <input
                      type="password"
                      value={settings.cloudflare_worker_key}
                      onChange={(e) => setSettings({ ...settings, cloudflare_worker_key: e.target.value })}
                      placeholder="HAYYE_KEY parolan"
                      className="w-full bg-[#14171A] border border-[#242930] px-2.5 py-1.5 font-mono-num text-[11px] text-[#F2EFE9] focus:outline-none focus:border-[#10B981]"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] text-[#656E78] truncate">
                    {mobile.tunnel.error
                      ? mobile.tunnel.error
                      : mobile.cloudflared_installed
                      ? 'Mevcut cloudflared.exe otomatik bulundu; açılışta tünel kendi bağlanır.'
                      : 'cloudflared.exe bulunamadı.'}
                  </div>
                  {mobile.tunnel.state === 'on' || mobile.tunnel.state === 'starting' ? (
                    <button
                      onClick={handleStopTunnel}
                      disabled={tunnelBusy}
                      className="px-3 py-1.5 border border-[#F43F5E]/50 text-[#F43F5E] hover:bg-[#F43F5E]/10 text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Square className="w-3 h-3" /> Durdur
                    </button>
                  ) : (
                    <button
                      onClick={handleStartTunnel}
                      disabled={tunnelBusy || !mobile.cloudflared_installed}
                      className="px-3 py-1.5 bg-[#10B981] hover:bg-[#0EA472] text-[#0E1012] font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      <Play className="w-3 h-3" /> Tüneli Başlat
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#242930] space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[#3B82F6]">
              <Puzzle className="w-4 h-4" />
              Brave Eklentisi (Inditex, Flaw, Sephora, Gratis, Sahibinden, Dolap)
            </div>
            <ol className="text-xs text-[#9AA2AC] space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Brave tarayıcıda <code className="text-[#F2EFE9]">brave://extensions</code> adresini aç.</li>
              <li>Sağ üstten <strong>Geliştirici modu</strong> anahtarını aç.</li>
              <li><strong>Paketlenmemiş öğe yükle</strong> butonuna basıp şu klasörü seç:</li>
            </ol>
            <div className="p-2.5 bg-[#0E1012] border border-[#242930] font-mono-num text-[11px] text-[#10B981] select-all">
              C:\Users\fluvoksamine\Projeler\hayye-market\extension
            </div>
            <p className="text-[11px] text-[#656E78]">
              Yerel köprü <span className="font-mono-num text-[#9AA2AC]">127.0.0.1:47821</span> üzerinden çalışır. Sahibinden arama sayfasındayken sağ alttaki <strong>Hayye&apos;ye At</strong> düğmesi sayfadaki tüm 2. el ilanları toplu aktarır.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
