import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Copy,
  ExternalLink,
  FolderPlus,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Store,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api } from './api';
import {
  fmtTry,
  fmtUsd,
  type FolderItem,
  type MarketRates,
  type ProductDetail,
  type SearchCandidate,
} from './types';
import { OdometerPrice } from './components/OdometerPrice';
import { TrustGauge } from './components/TrustGauge';
import { Sparkline } from './components/Sparkline';
import { PriceChart } from './components/PriceChart';
import { SettingsModal } from './components/SettingsModal';

export function App() {
  const [rates, setRates] = useState<MarketRates>({ usd_try: 35.2, eur_try: 38.4, updated_at: '' });
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<number | 'all'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [currency, setCurrency] = useState<'TRY' | 'USD'>('TRY');
  const [detailTab, setDetailTab] = useState<'offers' | 'used' | 'alert'>('offers');

  // Search / URL Bar
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // New folder inline
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Manual 2nd-hand listing form
  const [showAddUsed, setShowAddUsed] = useState(false);
  const [uPlatform, setUPlatform] = useState('Sahibinden');
  const [uTitle, setUTitle] = useState('');
  const [uPrice, setUPrice] = useState('');
  const [uCity, setUCity] = useState('İstanbul');
  const [uUrl, setUUrl] = useState('');
  const [uParamGuvende, setUParamGuvende] = useState(true);
  const [uInvoiceBox, setUInvoiceBox] = useState(true);

  // Target price input
  const [targetInput, setTargetInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [savedTotal, setSavedTotal] = useState(0);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4200);
  };

  const reloadAll = async (selectProductId?: number) => {
    try {
      const [fList, pList] = await Promise.all([api.getFolders(), api.getProducts()]);
      setFolders(fList);
      setProducts(pList);
      if (selectProductId) {
        setSelectedId(selectProductId);
      } else if (!selectedId && pList.length > 0) {
        setSelectedId(pList[0].id);
      }
    } catch (e) {
      showToast(String(e));
    }
  };

  useEffect(() => {
    api.getMarketRates().then(setRates).catch(() => {});
    api.getSavedTotal().then(setSavedTotal).catch(() => {});
    reloadAll();
    const poll = setInterval(() => reloadAll(), 15000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowCandidates(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filteredProducts = useMemo(() => {
    if (activeFolderId === 'all') return products;
    return products.filter((p) => p.folder_id === activeFolderId);
  }, [products, activeFolderId]);

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? filteredProducts[0] ?? null,
    [products, filteredProducts, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setTargetInput(selected.target_price_try ? String(Math.round(selected.target_price_try)) : '');
      setSizeInput(selected.tracked_sizes || '');
    }
  }, [selected?.id]);

  const activeBasketTotals = useMemo(() => {
    const list = filteredProducts;
    const totalNew = list.reduce((s, p) => s + p.best_new_try, 0);
    const totalUsed = list.reduce((s, p) => s + (p.best_used_try ?? p.best_new_try), 0);
    return { totalNew, totalUsed, savings: Math.max(0, totalNew - totalUsed) };
  }, [filteredProducts]);

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const targetFolder = activeFolderId === 'all' ? folders[0]?.id ?? 1 : activeFolderId;

    if (q.startsWith('http://') || q.startsWith('https://')) {
      setSearching(true);
      try {
        const pid = await api.trackFromUrl(targetFolder, q);
        setQuery('');
        await reloadAll(pid);
        showToast('Ürün linkten eklendi ve fiyat geçmişi başlatıldı.');
      } catch (err) {
        showToast(String(err));
      } finally {
        setSearching(false);
      }
      return;
    }

    setSearching(true);
    setShowCandidates(true);
    try {
      const res = await api.searchLiveTr(q);
      setCandidates(res);
      if (res.length === 0) {
        showToast('Canlı aramada eşleşme çıkmadı — farklı kelime dene veya direkt ürün linki yapıştır.');
      }
    } catch (err) {
      showToast(String(err));
    } finally {
      setSearching(false);
    }
  };

  const handlePickCandidate = async (c: SearchCandidate) => {
    const targetFolder = activeFolderId === 'all' ? folders[0]?.id ?? 1 : activeFolderId;
    setShowCandidates(false);
    setSearching(true);
    try {
      const pid = await api.trackFromCandidate(targetFolder, c);
      setQuery('');
      await reloadAll(pid);
      showToast(`Takibe alındı: ${c.title}`);
    } catch (err) {
      showToast(String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleRefreshSelected = async () => {
    if (!selected) return;
    setRefreshingId(selected.id);
    try {
      const msg = await api.refreshProduct(selected.id);
      await reloadAll(selected.id);
      showToast(msg);
    } catch (err) {
      showToast(String(err));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const fid = await api.createFolder(newFolderName.trim());
      setNewFolderName('');
      setAddingFolder(false);
      await reloadAll();
      setActiveFolderId(fid);
    } catch (err) {
      showToast(String(err));
    }
  };

  const handleAddUsed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !uPrice) return;
    const priceNum = Number(uPrice.replace(/[^0-9.]/g, ''));
    if (!priceNum || priceNum <= 0) return;
    try {
      await api.addManualUsed({
        product_id: selected.id,
        platform: uPlatform,
        title: uTitle.trim() || `${selected.title} (2. El)`,
        price_try: priceNum,
        city: uCity.trim() || 'İstanbul',
        seller_name: 'Bireysel Satıcı',
        param_guvende: uParamGuvende,
        has_invoice_box: uInvoiceBox,
        photo_count: 5,
        url: uUrl.trim(),
      });
      setUTitle('');
      setUPrice('');
      setUUrl('');
      setShowAddUsed(false);
      await reloadAll(selected.id);
      showToast('2. el ilan eklendi ve güvenilirlik skoru hesaplandı.');
    } catch (err) {
      showToast(String(err));
    }
  };

  const copyNegotiationMessage = (listingPrice: number, newPrice: number) => {
    const offer = Math.round((listingPrice * 0.9) / 50) * 50;
    const text = `Merhaba, ilanınızı inceledim. Ürünün sıfır güncel piyasa fiyatı ${fmtTry(newPrice)} civarında. Kutu/fatura durumu temizse ${fmtTry(offer)} nakit / Param Güvende ile bugün alabilirim, uygun mudur?`;
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Pazarlık mesajı kopyalandı (Teklif: ${fmtTry(offer)})`);
    });
  };

  const verdictStyle = (status: string) => {
    if (status === 'GENUINE_DIP' || status === 'GENUINE_DROP') {
      return 'border-[#10B981]/60 bg-[#10B981]/10 text-[#10B981]';
    }
    if (status === 'INFLATED_FAKE') {
      return 'border-[#F43F5E]/60 bg-[#F43F5E]/10 text-[#F43F5E]';
    }
    return 'border-[#323942] bg-[#1A1E23] text-[#9AA2AC]';
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0E1012] text-[#F2EFE9] overflow-hidden">
      {/* 1. Thin Live Market Ticker */}
      <div className="h-8 px-4 border-b border-[#242930] bg-[#0B0D0F] flex items-center justify-between text-[11px] font-mono-num shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-sans font-bold tracking-wide text-[#F2EFE9]">
            <img src="/hayye-logo.svg" alt="Hayye" className="w-4 h-4" />
            Hayye Market
          </div>
          <span className="text-[#323942]">|</span>
          <span className="text-[#9AA2AC]">
            USD/TRY <strong className="text-[#F2EFE9]">{rates.usd_try.toFixed(2)}</strong>
          </span>
          <span className="text-[#9AA2AC]">
            EUR/TRY <strong className="text-[#F2EFE9]">{rates.eur_try.toFixed(2)}</strong>
          </span>
          <span className="hidden md:inline text-[#323942]">|</span>
          <span className="hidden md:flex items-center gap-1.5 text-[#10B981]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] live-dot" />
            Brave & iOS :47821
          </span>
          {savedTotal > 0 && (
            <>
              <span className="hidden lg:inline text-[#323942]">|</span>
              <span className="hidden lg:inline text-[#10B981]">
                Kurtarılan: <strong>{fmtTry(savedTotal)}</strong>
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrency((c) => (c === 'TRY' ? 'USD' : 'TRY'))}
            className="px-2 py-0.5 border border-[#323942] hover:border-[#10B981] text-[#F2EFE9] cursor-pointer transition"
            title="TL ve Dolar bazlı görünüm arasında geçiş yap"
          >
            Para Birimi: <strong className={currency === 'USD' ? 'text-[#3B82F6]' : 'text-[#10B981]'}>{currency}</strong>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-[#9AA2AC] hover:text-[#F2EFE9] flex items-center gap-1 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" /> Bildirimler & Eklenti
          </button>
        </div>
      </div>

      {/* 2. Smart Search & Direct Link Bar */}
      <div className="px-4 py-2.5 border-b border-[#242930] bg-[#14171A] relative z-30 shrink-0">
        <form onSubmit={handleCommandSubmit} className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center bg-[#0E1012] border border-[#323942] focus-within:border-[#10B981] px-3 py-2">
            {query.startsWith('http') ? (
              <Link2 className="w-4 h-4 text-[#10B981] mr-2.5 shrink-0" />
            ) : (
              <Search className="w-4 h-4 text-[#656E78] mr-2.5 shrink-0" />
            )}
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün adı ara (Akakçe + Amazon TR + Vatan canlı) veya ürün linki yapıştır...  [Ctrl+K]"
              className="flex-1 bg-transparent text-sm text-[#F2EFE9] placeholder-[#656E78] focus:outline-none"
            />
            {searching && (
              <RefreshCw className="w-4 h-4 text-[#10B981] animate-spin ml-2 shrink-0" />
            )}
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 bg-[#10B981] hover:bg-[#0EA472] text-[#0E1012] text-xs font-semibold cursor-pointer transition disabled:opacity-50"
          >
            {query.startsWith('http') ? 'Linki Takibe Al' : 'Piyasada Ara'}
          </button>
        </form>

        {/* Live Search Dropdown */}
        {showCandidates && candidates.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-[#14171A] border border-[#323942] shadow-2xl max-h-96 overflow-y-auto z-40">
            <div className="px-3 py-2 border-b border-[#242930] flex items-center justify-between text-[11px] text-[#9AA2AC]">
              <span>Canlı Türkiye Piyasa Sonuçları ({candidates.length}) — Takibe almak için tıkla</span>
              <button onClick={() => setShowCandidates(false)} className="hover:text-white cursor-pointer">
                Kapat [Esc]
              </button>
            </div>
            {candidates.map((c, idx) => (
              <button
                key={idx}
                onClick={() => handlePickCandidate(c)}
                className="w-full px-3.5 py-2.5 border-b border-[#242930]/60 hover:bg-[#1A1E23] flex items-center justify-between gap-4 text-left cursor-pointer transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="w-9 h-9 object-contain bg-white p-0.5 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-[#0E1012] border border-[#242930] flex items-center justify-center shrink-0">
                      <Tag className="w-4 h-4 text-[#656E78]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#F2EFE9] truncate">{c.title}</div>
                    <div className="text-[11px] text-[#9AA2AC]">{c.store_name}</div>
                  </div>
                </div>
                <div className="font-mono-num text-sm font-semibold text-[#10B981] shrink-0">
                  {fmtTry(c.price_try)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Asymmetric Master–Detail Market Stage */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* LEFT RAIL: Folder Basket + Watchlist Rows */}
        <section className="col-span-5 border-r border-[#242930] flex flex-col overflow-hidden">
          {/* Folder Strip */}
          <div className="px-3 py-2 border-b border-[#242930] flex items-center gap-1.5 overflow-x-auto shrink-0">
            <button
              onClick={() => setActiveFolderId('all')}
              className={`px-2.5 py-1 text-xs border shrink-0 cursor-pointer transition ${
                activeFolderId === 'all'
                  ? 'bg-[#F2EFE9] text-[#0E1012] border-[#F2EFE9] font-semibold'
                  : 'border-[#242930] text-[#9AA2AC] hover:text-[#F2EFE9]'
              }`}
            >
              Tümü ({products.length})
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFolderId(f.id)}
                className={`px-2.5 py-1 text-xs border shrink-0 cursor-pointer transition ${
                  activeFolderId === f.id
                    ? 'bg-[#F2EFE9] text-[#0E1012] border-[#F2EFE9] font-semibold'
                    : 'border-[#242930] text-[#9AA2AC] hover:text-[#F2EFE9]'
                }`}
              >
                {f.name} ({f.item_count})
              </button>
            ))}
            {addingFolder ? (
              <div className="flex items-center gap-1 shrink-0">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  placeholder="Klasör adı"
                  className="w-28 px-2 py-0.5 text-xs bg-[#0E1012] border border-[#10B981] text-[#F2EFE9] focus:outline-none"
                />
                <button onClick={handleCreateFolder} className="text-xs text-[#10B981] px-1 cursor-pointer">
                  Ekle
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingFolder(true)}
                className="p-1 text-[#656E78] hover:text-[#F2EFE9] cursor-pointer shrink-0"
                title="Yeni sepet klasörü oluştur"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Folder Basket Summary Bar */}
          <div className="px-4 py-2.5 border-b border-[#242930] bg-[#14171A] grid grid-cols-3 gap-2 text-xs shrink-0">
            <div>
              <div className="text-[10px] text-[#656E78]">Sepet Sıfır En Ucuz</div>
              <div className="font-mono-num font-semibold text-[#F2EFE9]">
                {currency === 'TRY'
                  ? fmtTry(activeBasketTotals.totalNew)
                  : fmtUsd(activeBasketTotals.totalNew / rates.usd_try)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#656E78]">2. El Karma Toplam</div>
              <div className="font-mono-num font-semibold text-[#3B82F6]">
                {currency === 'TRY'
                  ? fmtTry(activeBasketTotals.totalUsed)
                  : fmtUsd(activeBasketTotals.totalUsed / rates.usd_try)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#656E78]">2. El Tasarrufu</div>
              <div className="font-mono-num font-semibold text-[#10B981]">
                {activeBasketTotals.savings > 0 ? `-${fmtTry(activeBasketTotals.savings)}` : '—'}
              </div>
            </div>
          </div>

          {/* Watchlist Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#242930]/80">
            {filteredProducts.length === 0 ? (
              <div className="p-10 text-center space-y-2.5">
                <div className="text-sm font-medium text-[#F2EFE9]">Henüz takip edilen ürün yok</div>
                <p className="text-xs text-[#9AA2AC] max-w-xs mx-auto leading-relaxed">
                  Yukarıdaki arama çubuğuna bir ürün adı yaz (örn. <strong>MacBook Air M4</strong>, <strong>RTX 5070</strong>, <strong>Ninja Blender</strong>) veya doğrudan mağaza linki yapıştır.
                </p>
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = selected?.id === p.id;
                const priceDisplay =
                  currency === 'TRY' ? fmtTry(p.best_new_try) : fmtUsd(p.best_new_try / rates.usd_try);
                const hitTarget = p.target_price_try !== null && p.best_new_try > 0 && p.best_new_try <= p.target_price_try;
                const sparkColor =
                  p.discount_verdict.status === 'INFLATED_FAKE' ? '#F43F5E' : '#10B981';

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 cursor-pointer transition border-l-2 ${
                      isSelected
                        ? 'bg-[#1A1E23] border-l-[#10B981]'
                        : 'bg-transparent border-l-transparent hover:bg-[#14171A]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs font-medium text-[#F2EFE9] truncate">{p.title}</div>
                      <div className="flex items-center gap-2 text-[10px] font-mono-num">
                        <span className={`px-1.5 py-0.5 border ${verdictStyle(p.discount_verdict.status)}`}>
                          {p.discount_verdict.badge}
                        </span>
                        {p.best_used_try && (
                          <span className="text-[#3B82F6]">2. El {fmtTry(p.best_used_try)}</span>
                        )}
                        {hitTarget && <span className="text-[#F59E0B] font-semibold">HEDEF TUTTU</span>}
                      </div>
                    </div>

                    <Sparkline points={p.history} color={sparkColor} />

                    <div className="text-right shrink-0">
                      <div className="font-mono-num text-sm font-semibold text-[#F2EFE9]">{priceDisplay}</div>
                      <div className="font-mono-num text-[10px] text-[#9AA2AC]">
                        Güven %{p.avg_trust_score}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* RIGHT STAGE: Deep Product Intelligence Panel */}
        <section className="col-span-7 flex flex-col overflow-y-auto bg-[#0E1012]">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
              <div className="text-base font-semibold text-[#F2EFE9]">Türkiye Piyasa & 2. El Analiz Ekranı</div>
              <p className="text-xs text-[#9AA2AC] max-w-md leading-relaxed">
                Soldan bir ürün seçtiğinde sıfır mağaza fiyatları, sahte indirim dedektörü, TL/USD enflasyon arındırmalı grafik, 2. el piyasa bandı ve satıcı güvenilirlik yüzdeleri burada açılır.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-5">
              {/* Product Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#242930]">
                <div className="flex items-start gap-4 min-w-0">
                  {selected.image_url && (
                    <img
                      src={selected.image_url}
                      alt=""
                      className="w-16 h-16 object-contain bg-white p-1 shrink-0 border border-[#323942]"
                    />
                  )}
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-[#9AA2AC]">
                      <span>{selected.folder_name}</span>
                      <span>•</span>
                      <span>{selected.offers.length} sıfır mağaza</span>
                      <span>•</span>
                      <span className="text-[#3B82F6]">{selected.used_listings.length} adet 2. el ilan</span>
                    </div>
                    <h1 className="text-lg font-semibold leading-snug text-[#F2EFE9]">{selected.title}</h1>
                    <TrustGauge
                      score={selected.avg_trust_score}
                      reasons={selected.offers[0]?.trust_reasons ?? selected.used_listings[0]?.trust_reasons ?? []}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => api.openExternal(selected.quick_checkout_url || selected.primary_url)}
                    className="px-3 py-1.5 bg-[#10B981] hover:bg-[#0EA472] text-[#0E1012] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    title="Doğrudan sepet/ödeme veya ürün sayfasına sıçra"
                  >
                    ⚡ Hızlı Alım
                  </button>
                  <button
                    onClick={handleRefreshSelected}
                    disabled={refreshingId === selected.id}
                    className="px-3 py-1.5 border border-[#323942] hover:border-[#10B981] text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === selected.id ? 'animate-spin text-[#10B981]' : ''}`} />
                    Güncelle
                  </button>
                  <button
                    onClick={async () => {
                      await api.deleteProduct(selected.id);
                      setSelectedId(null);
                      await reloadAll();
                      showToast('Ürün takipten çıkarıldı.');
                    }}
                    className="p-1.5 border border-[#323942] hover:border-[#F43F5E] text-[#9AA2AC] hover:text-[#F43F5E] cursor-pointer"
                    title="Ürünü sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Optional Size Availability Strip (Fashion/Inditex/ikas/Shopify) & Cosmetics Unit ml/gr */}
              {(selected.sizes.length > 0 || selected.unit_price) && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-[#14171A] border border-[#242930] text-xs">
                  {selected.sizes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-[#9AA2AC] mr-1">Beden Stoğu:</span>
                      {selected.sizes.slice(0, 12).map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => s.in_stock && api.openExternal(s.cart_url || selected.primary_url)}
                          disabled={!s.in_stock}
                          className={`px-2 py-0.5 font-mono-num text-[11px] border transition ${
                            s.in_stock
                              ? 'border-[#10B981]/70 text-[#10B981] hover:bg-[#10B981] hover:text-[#0E1012] cursor-pointer'
                              : 'border-[#242930] text-[#656E78] line-through cursor-not-allowed'
                          }`}
                          title={s.in_stock ? `${s.size} stokta — Hızlı alım için tıkla` : `${s.size} tükendi`}
                        >
                          {s.size}
                        </button>
                      ))}
                    </div>
                  )}
                  {selected.unit_price && (
                    <div className="font-mono-num text-[11px] text-[#F2EFE9] bg-[#0E1012] border border-[#323942] px-2.5 py-1">
                      Birim ({selected.unit_price.amount}{selected.unit_price.unit}):{' '}
                      <strong className="text-[#10B981]">
                        {selected.unit_price.price_per_10_try.toFixed(1)} ₺ / 10{selected.unit_price.unit}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* Price Hero + Fake Discount Verdict + New vs Used Range */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-5 p-4 bg-[#14171A] border border-[#242930] space-y-2">
                  <div className="text-[11px] text-[#9AA2AC]">En Ucuz Sıfır Net Fiyat</div>
                  <OdometerPrice
                    value={currency === 'TRY' ? selected.best_new_try : selected.best_new_try / rates.usd_try}
                    currency={currency}
                    className="text-3xl font-bold text-[#F2EFE9]"
                  />
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono-num border ${verdictStyle(selected.discount_verdict.status)}`}>
                    {selected.discount_verdict.status === 'INFLATED_FAKE' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {selected.discount_verdict.badge}
                  </div>
                  <p className="text-[11px] text-[#9AA2AC] leading-relaxed">
                    {selected.discount_verdict.explanation}
                  </p>
                </div>

                {/* New vs 2nd-Hand Market Band */}
                <div className="col-span-7 p-4 bg-[#14171A] border border-[#242930] flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#9AA2AC]">Sıfır vs 2. El Piyasa Kıyaslaması</span>
                    {selected.best_used_try && selected.best_new_try > 0 && (
                      <span className="font-mono-num text-xs font-semibold text-[#3B82F6]">
                        2. Elde %{Math.round(((selected.best_new_try - selected.best_used_try) / selected.best_new_try) * 100)} Tasarruf
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 font-mono-num">
                    <div className="p-2.5 bg-[#0E1012] border border-[#242930]">
                      <div className="text-[10px] text-[#656E78]">2. El En Ucuz</div>
                      <div className="text-sm font-semibold text-[#3B82F6] mt-0.5">
                        {selected.best_used_try ? fmtTry(selected.best_used_try) : 'İlan yok'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#0E1012] border border-[#242930]">
                      <div className="text-[10px] text-[#656E78]">2. El Medyan</div>
                      <div className="text-sm font-semibold text-[#F2EFE9] mt-0.5">
                        {selected.used_median_try ? fmtTry(selected.used_median_try) : '—'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#0E1012] border border-[#242930]">
                      <div className="text-[10px] text-[#656E78]">30g Sıfır Ort.</div>
                      <div className="text-sm font-semibold text-[#10B981] mt-0.5">
                        {fmtTry(selected.discount_verdict.avg_30d_try)}
                      </div>
                    </div>
                  </div>

                  {/* Quick open Sahibinden / Dolap search in Brave for 1-click extension import */}
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#656E78]">2. El Tara (Brave Eklentisi ile aktar):</span>
                    <button
                      onClick={() =>
                        api.openExternal(`https://www.sahibinden.com/kelime-ile-arama?query_text=${encodeURIComponent(selected.title)}`)
                      }
                      className="px-2 py-1 border border-[#323942] hover:border-[#3B82F6] text-[#F2EFE9] cursor-pointer"
                    >
                      Sahibinden ↗
                    </button>
                    <button
                      onClick={() =>
                        api.openExternal(`https://dolap.com/ara?q=${encodeURIComponent(selected.title)}`)
                      }
                      className="px-2 py-1 border border-[#323942] hover:border-[#10B981] text-[#F2EFE9] cursor-pointer"
                    >
                      Dolap ↗
                    </button>
                  </div>
                </div>
              </div>

              {/* Dual-Mode Morphing Price Chart (TL <-> USD) */}
              <PriceChart
                history={selected.history}
                currency={currency}
                currentUsdRate={rates.usd_try}
                targetPriceTry={selected.target_price_try}
              />

              {/* Sub-tabs: Retail Offers / 2nd-Hand Listings / Alerts & Folder */}
              <div className="space-y-3">
                <div className="flex items-center gap-1 border-b border-[#242930]">
                  {[
                    { k: 'offers' as const, label: `Sıfır Mağazalar (${selected.offers.length})`, icon: Store },
                    { k: 'used' as const, label: `2. El İlanlar (${selected.used_listings.length})`, icon: Tag },
                    { k: 'alert' as const, label: 'Hedef Fiyat & Klasör', icon: Bell },
                  ].map((t) => {
                    const Icon = t.icon;
                    const active = detailTab === t.k;
                    return (
                      <button
                        key={t.k}
                        onClick={() => setDetailTab(t.k)}
                        className={`px-3.5 py-2 text-xs flex items-center gap-1.5 border-b-2 cursor-pointer transition ${
                          active
                            ? 'border-[#10B981] text-[#F2EFE9] font-semibold'
                            : 'border-transparent text-[#9AA2AC] hover:text-[#F2EFE9]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {detailTab === 'offers' && (
                  <div className="space-y-2">
                    {selected.offers.length === 0 ? (
                      <div className="p-4 border border-dashed border-[#242930] text-xs text-[#656E78]">
                        Henüz sıfır mağaza teklifi yok. Yukarıdan Güncelle butonuna basabilirsin.
                      </div>
                    ) : (
                      selected.offers.map((o) => (
                        <div
                          key={o.id}
                          className="p-3 bg-[#14171A] border border-[#242930] flex items-center justify-between gap-4"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="text-xs font-semibold text-[#F2EFE9]">{o.store_name}</div>
                            <TrustGauge score={o.trust_score} reasons={o.trust_reasons} />
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right font-mono-num">
                              <div className="text-sm font-bold text-[#10B981]">
                                {currency === 'TRY'
                                  ? fmtTry(o.price_try + o.shipping_try)
                                  : fmtUsd((o.price_try + o.shipping_try) / rates.usd_try)}
                              </div>
                              <div className="text-[10px] text-[#656E78]">
                                {o.in_stock ? 'Stokta' : 'Tükendi'}
                              </div>
                            </div>
                            <button
                              onClick={() => api.openExternal(o.url)}
                              className="px-2.5 py-1.5 border border-[#323942] hover:border-[#10B981] text-xs flex items-center gap-1 cursor-pointer"
                            >
                              Git <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {detailTab === 'used' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#9AA2AC]">
                        Brave eklentisiyle Sahibinden/Dolap&apos;tan toplu çekebilir veya elle ilan ekleyebilirsin.
                      </span>
                      <button
                        onClick={() => setShowAddUsed((v) => !v)}
                        className="px-3 py-1.5 bg-[#3B82F6] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> 2. El İlan Ekle
                      </button>
                    </div>

                    {showAddUsed && (
                      <form onSubmit={handleAddUsed} className="p-4 bg-[#14171A] border border-[#323942] space-y-3 text-xs">
                        <div className="grid grid-cols-3 gap-2.5">
                          <select
                            value={uPlatform}
                            onChange={(e) => setUPlatform(e.target.value)}
                            className="bg-[#0E1012] border border-[#242930] px-2.5 py-1.5 text-[#F2EFE9]"
                          >
                            <option value="Sahibinden">Sahibinden</option>
                            <option value="Dolap">Dolap</option>
                            <option value="Letgo">Letgo</option>
                            <option value="Gardrops">Gardrops</option>
                          </select>
                          <input
                            value={uPrice}
                            onChange={(e) => setUPrice(e.target.value)}
                            placeholder="Fiyat (TL) örn. 24500"
                            required
                            className="bg-[#0E1012] border border-[#242930] px-2.5 py-1.5 font-mono-num text-[#F2EFE9]"
                          />
                          <input
                            value={uCity}
                            onChange={(e) => setUCity(e.target.value)}
                            placeholder="Şehir"
                            className="bg-[#0E1012] border border-[#242930] px-2.5 py-1.5 text-[#F2EFE9]"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <input
                            value={uTitle}
                            onChange={(e) => setUTitle(e.target.value)}
                            placeholder="İlan başlığı (opsiyonel)"
                            className="bg-[#0E1012] border border-[#242930] px-2.5 py-1.5 text-[#F2EFE9]"
                          />
                          <input
                            value={uUrl}
                            onChange={(e) => setUUrl(e.target.value)}
                            placeholder="İlan linki (opsiyonel)"
                            className="bg-[#0E1012] border border-[#242930] px-2.5 py-1.5 text-[#F2EFE9]"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={uParamGuvende} onChange={(e) => setUParamGuvende(e.target.checked)} />
                              Param Güvende / Alıcı Koruması
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={uInvoiceBox} onChange={(e) => setUInvoiceBox(e.target.checked)} />
                              Kutu & Fatura / Garanti
                            </label>
                          </div>
                          <button type="submit" className="px-4 py-1.5 bg-[#10B981] text-[#0E1012] font-semibold cursor-pointer">
                            Kaydet
                          </button>
                        </div>
                      </form>
                    )}

                    {selected.used_listings.length === 0 ? (
                      <div className="p-5 border border-dashed border-[#242930] text-xs text-[#656E78]">
                        Bu ürün için henüz 2. el ilan yok. Yukarıdan <strong>Sahibinden ↗</strong> veya <strong>Dolap ↗</strong> açıp Brave eklentisindeki <strong>Hayye&apos;ye At</strong> butonuna basarak tüm ilanları tek tıkla çekebilirsin.
                      </div>
                    ) : (
                      selected.used_listings.map((u) => (
                        <div
                          key={u.id}
                          className={`p-3.5 bg-[#14171A] border space-y-2 ${
                            u.scam_risk ? 'border-[#F43F5E]/80' : 'border-[#242930]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 text-[10px] font-mono-num">
                                <span className="px-1.5 py-0.5 bg-[#3B82F6]/20 text-[#3B82F6] font-semibold">
                                  {u.platform}
                                </span>
                                <span className="text-[#9AA2AC]">{u.city}</span>
                                {u.param_guvende && <span className="text-[#10B981]">Param Güvende ✓</span>}
                                {u.has_invoice_box && <span className="text-[#F2EFE9]">Kutulu/Faturalı</span>}
                                {u.scam_risk && (
                                  <span className="text-[#F43F5E] font-bold flex items-center gap-1">
                                    <ShieldAlert className="w-3 h-3" /> ŞÜPHELİ UCUZLUK
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-medium text-[#F2EFE9]">{u.title}</div>
                            </div>

                            <div className="text-right font-mono-num shrink-0">
                              <div className="text-sm font-bold text-[#3B82F6]">{fmtTry(u.price_try)}</div>
                              {u.savings_pct > 0 && (
                                <div className="text-[10px] text-[#10B981]">
                                  Sıfırından -{u.savings_pct.toFixed(0)}%
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <TrustGauge score={u.trust_score} reasons={u.trust_reasons} />
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => copyNegotiationMessage(u.price_try, selected.best_new_try)}
                                className="px-2 py-1 border border-[#323942] hover:border-[#10B981] text-[11px] flex items-center gap-1 cursor-pointer"
                                title="Satıcıya gerçekçi pazarlık mesajı kopyala"
                              >
                                <Copy className="w-3 h-3" /> Pazarlık Mesajı
                              </button>
                              {u.url && (
                                <button
                                  onClick={() => api.openExternal(u.url)}
                                  className="px-2 py-1 border border-[#323942] hover:border-[#3B82F6] text-[11px] cursor-pointer"
                                >
                                  İlan ↗
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  await api.deleteUsedListing(u.id);
                                  await reloadAll(selected.id);
                                }}
                                className="p-1 text-[#656E78] hover:text-[#F43F5E] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {detailTab === 'alert' && (
                  <div className="p-4 bg-[#14171A] border border-[#242930] space-y-4 text-xs">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-[#9AA2AC] block">Hedef Fiyat Alarmı (TL)</label>
                        <div className="flex gap-1.5">
                          <input
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            placeholder="Örn: 2400"
                            className="w-full bg-[#0E1012] border border-[#242930] px-2.5 py-2 font-mono-num text-[#F2EFE9]"
                          />
                          <button
                            onClick={async () => {
                              const num = targetInput.trim() ? Number(targetInput) : null;
                              await api.setTargetPrice(selected.id, num);
                              await reloadAll(selected.id);
                              showToast(num ? `Hedef fiyat ${fmtTry(num)} olarak ayarlandı.` : 'Hedef alarm kaldırıldı.');
                            }}
                            className="px-3 py-2 bg-[#10B981] text-[#0E1012] font-semibold cursor-pointer shrink-0"
                          >
                            Kaydet
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[#9AA2AC] block">Beden Stoğu Alarmı</label>
                        <div className="flex gap-1.5">
                          <input
                            value={sizeInput}
                            onChange={(e) => setSizeInput(e.target.value)}
                            placeholder="Örn: M, L veya 43"
                            className="w-full bg-[#0E1012] border border-[#242930] px-2.5 py-2 font-mono-num text-[#F2EFE9]"
                          />
                          <button
                            onClick={async () => {
                              await api.setTrackedSizes(selected.id, sizeInput);
                              await reloadAll(selected.id);
                              showToast('Beden stoğu alarmı kaydedildi.');
                            }}
                            className="px-3 py-2 border border-[#323942] hover:border-[#10B981] text-[#F2EFE9] cursor-pointer shrink-0"
                          >
                            Ayarla
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[#9AA2AC] block">Sepet Klasörü</label>
                        <select
                          value={selected.folder_id}
                          onChange={async (e) => {
                            await api.moveProductFolder(selected.id, Number(e.target.value));
                            await reloadAll(selected.id);
                            showToast('Ürün klasörü güncellendi.');
                          }}
                          className="w-full bg-[#0E1012] border border-[#242930] px-2.5 py-2 text-[#F2EFE9]"
                        >
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#242930] flex items-center justify-between">
                      <span className="text-[#9AA2AC]">
                        Dip fiyattan aldıysan veya sahte indirimi pas geçtiysen tasarrufunu kaydet:
                      </span>
                      <button
                        onClick={async () => {
                          const diff = Math.max(
                            100,
                            Math.round(selected.discount_verdict.max_all_try - selected.best_new_try)
                          );
                          const next = await api.recordSavings(diff);
                          setSavedTotal(next);
                          showToast(`Tasarruf karnesine +${fmtTry(diff)} eklendi!`);
                        }}
                        className="px-3 py-1.5 border border-[#10B981]/60 text-[#10B981] hover:bg-[#10B981]/10 font-mono-num cursor-pointer"
                      >
                        + Kurtarılan Paraya İşle
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onToast={showToast} />}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 bg-[#14171A] border-l-2 border-l-[#10B981] border border-[#323942] text-xs text-[#F2EFE9] shadow-2xl max-w-md">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
