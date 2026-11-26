import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  Check,
  Clock,
  CreditCard,
  ExternalLink,
  Flame,
  FolderPlus,
  Heart,
  LayoutGrid,
  Package,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingDown,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api } from './api';
import { PriceChart } from './components/PriceChart';
import { SettingsModal } from './components/SettingsModal';
import {
  type FolderItem,
  type MarketRates,
  type ProductDetail,
  type SearchCandidate,
  fmtTry,
  fmtUsd,
} from './types';

type DockTab = 'gallery' | 'radar' | 'shared' | 'orders';

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function voteLabel(v: string): { text: string; cls: string } {
  if (v === 'buy') return { text: 'Al', cls: 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40' };
  if (v === 'wait') return { text: 'Bekle', cls: 'bg-amber-400/15 text-amber-300 border-amber-400/35' };
  if (v === 'pass') return { text: 'Pas', cls: 'bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/35' };
  return { text: '—', cls: 'bg-white/[0.04] text-[#8F96A3] border-white/[0.08]' };
}

export default function App() {
  const [rates, setRates] = useState<MarketRates>({ usd_try: 35.2, eur_try: 38.4, updated_at: '' });
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [activeTab, setActiveTab] = useState<DockTab>('gallery');
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [currency, setCurrency] = useState<'TRY' | 'USD'>('TRY');
  const [savedTotal, setSavedTotal] = useState<number>(0);

  // Search & add
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Modals & status
  const [showSettings, setShowSettings] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [targetInput, setTargetInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [installmentRate, setInstallmentRate] = useState(3.2);
  const [showManualUsed, setShowManualUsed] = useState(false);
  const [manualUsed, setManualUsed] = useState({
    platform: 'Sahibinden',
    title: '',
    price_try: '',
    city: 'İstanbul',
    seller_name: '',
    param_guvende: true,
    has_invoice_box: true,
    photo_count: 6,
    url: '',
  });
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3200);
  };

  const loadAll = async () => {
    try {
      const [f, p, sv] = await Promise.all([api.getFolders(), api.getProducts(), api.getSavedTotal()]);
      setFolders(f);
      setProducts(p);
      setSavedTotal(sv);
    } catch {
      // Outside Tauri preview
    }
  };

  useEffect(() => {
    api.getMarketRates().then(setRates).catch(() => {});
    loadAll();
    const timer = setInterval(loadAll, 15000);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowCandidates(false);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setTargetInput(selected.target_price_try ? String(Math.round(selected.target_price_try)) : '');
      setNoteInput(selected.shared_note || '');
    }
  }, [selected?.id]);

  // Derived collections
  const folderProducts = useMemo(() => {
    if (activeFolder === null) return products;
    return products.filter((p) => p.folder_id === activeFolder);
  }, [products, activeFolder]);

  const radarProducts = useMemo(() => {
    return products.filter((p) => {
      const isDip =
        p.discount_verdict.status === 'GENUINE_DIP' || p.discount_verdict.status === 'GENUINE_DROP';
      const wanted = p.tracked_sizes
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const sizeInStock = p.sizes.some(
        (s) => s.in_stock && wanted.includes(s.size.toUpperCase())
      );
      const hotUsed =
        p.best_used_try !== null && p.best_new_try > 0 && p.best_used_try <= p.best_new_try * 0.8;
      const refundDrop =
        p.purchased_price_try !== null &&
        daysSince(p.purchased_at) <= 14 &&
        p.best_new_try > 0 &&
        p.best_new_try < p.purchased_price_try - 25;
      const snapDrop =
        p.snapshot_price_try !== null &&
        p.best_new_try > 0 &&
        p.best_new_try <= p.snapshot_price_try * 0.94;
      return isDip || sizeInStock || hotUsed || refundDrop || snapDrop;
    });
  }, [products]);

  const purchasedProducts = useMemo(
    () => products.filter((p) => p.purchased_price_try !== null),
    [products]
  );

  const basketTotals = useMemo(() => {
    const newSum = folderProducts.reduce((acc, p) => acc + (p.best_new_try || 0), 0);
    const mixedSum = folderProducts.reduce(
      (acc, p) => acc + (p.best_used_try && p.best_used_try < p.best_new_try ? p.best_used_try : p.best_new_try || 0),
      0
    );
    return { newSum, mixedSum, diff: Math.max(0, newSum - mixedSum) };
  }, [folderProducts]);

  const fmtPrice = (tryVal: number) =>
    currency === 'TRY' ? fmtTry(tryVal) : fmtUsd(tryVal / Math.max(1, rates.usd_try));

  const handleSearchOrUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const targetFolder = activeFolder ?? 1;
    if (q.startsWith('http://') || q.startsWith('https://')) {
      setSearching(true);
      try {
        const pid = await api.trackFromUrl(targetFolder, q);
        setQuery('');
        setShowCandidates(false);
        await loadAll();
        setSelectedId(pid);
        notify('Ürün analiz edilip galeriye eklendi.');
      } catch (err) {
        notify(String(err));
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
    } catch (err) {
      notify(String(err));
    } finally {
      setSearching(false);
    }
  };

  const handlePickCandidate = async (c: SearchCandidate) => {
    try {
      const pid = await api.trackFromCandidate(activeFolder ?? 1, c);
      setShowCandidates(false);
      setQuery('');
      await loadAll();
      setSelectedId(pid);
      notify(`Takibe alındı: ${c.title.slice(0, 42)}`);
    } catch (err) {
      notify(String(err));
    }
  };

  const handleRefresh = async (p: ProductDetail) => {
    setRefreshingId(p.id);
    try {
      const msg = await api.refreshProduct(p.id);
      await loadAll();
      notify(msg);
    } catch (err) {
      notify(String(err));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleSnapshotAll = async () => {
    try {
      const n = await api.freezePriceSnapshots();
      await loadAll();
      notify(`${n} ürünün referans fiyatı donduruldu (İndirim Snapshot).`);
    } catch (err) {
      notify(String(err));
    }
  };

  const handleVote = async (pid: number, who: 'metehan' | 'ilayda', vote: string, note?: string) => {
    try {
      await api.setProductVote(pid, who, vote, note);
      await loadAll();
    } catch (err) {
      notify(String(err));
    }
  };

  const handleToggleSize = async (p: ProductDetail, sz: string) => {
    const cur = p.tracked_sizes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = cur.some((s) => s.toUpperCase() === sz.toUpperCase());
    const next = exists
      ? cur.filter((s) => s.toUpperCase() !== sz.toUpperCase())
      : [...cur, sz];
    await api.setTrackedSizes(p.id, next.join(', '));
    await loadAll();
    notify(exists ? `${sz} beden takibi kaldırıldı.` : `${sz} beden stoğa girince haber verilecek.`);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const id = await api.createFolder(newFolderName.trim());
      setNewFolderName('');
      setNewFolderOpen(false);
      await loadAll();
      setActiveFolder(id);
    } catch (err) {
      notify(String(err));
    }
  };

  const handleMarkPurchased = async (p: ProductDetail) => {
    if (p.purchased_price_try !== null) {
      await api.markPurchased(p.id, null);
      await loadAll();
      notify('Sipariş işareti kaldırıldı.');
    } else {
      await api.markPurchased(p.id, p.best_new_try);
      if (p.discount_verdict.avg_30d_try > p.best_new_try) {
        await api.recordSavings(p.discount_verdict.avg_30d_try - p.best_new_try);
      }
      await loadAll();
      notify('14 günlük iade & fiyat düşüşü koruması başlatıldı.');
    }
  };

  const handleAddManualUsed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !manualUsed.title || !manualUsed.price_try) return;
    try {
      await api.addManualUsed({
        product_id: selected.id,
        platform: manualUsed.platform,
        title: manualUsed.title,
        price_try: Number(manualUsed.price_try),
        city: manualUsed.city,
        seller_name: manualUsed.seller_name || 'Bireysel',
        param_guvende: manualUsed.param_guvende,
        has_invoice_box: manualUsed.has_invoice_box,
        photo_count: Number(manualUsed.photo_count) || 3,
        url: manualUsed.url || selected.primary_url,
      });
      setShowManualUsed(false);
      setManualUsed({ ...manualUsed, title: '', price_try: '', url: '' });
      await loadAll();
      notify('2. el ilan eklendi.');
    } catch (err) {
      notify(String(err));
    }
  };

  const displayedList =
    activeTab === 'radar'
      ? radarProducts
      : activeTab === 'orders'
      ? purchasedProducts
      : folderProducts;

  return (
    <div className="min-h-screen flex flex-col text-[#F5F2EB] pb-28">
      {/* Editorial Minimal Header */}
      <header className="sticky top-0 z-30 px-6 py-4 bg-[#090A0C]/80 backdrop-blur-2xl border-b border-white/[0.05]">
        <div className="max-w-[1440px] mx-auto flex items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <img
              src="/hayye-icon.png"
              alt="Hayye Market"
              className="w-9 h-9 rounded-xl shadow-lg ring-1 ring-white/10"
            />
            <div>
              <div className="font-editorial text-2xl leading-none tracking-tight text-[#F5F2EB]">
                Hayye Market
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#8F96A3] font-mono-num">
                <span className="inline-flex items-center gap-1 text-[#10B981]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                  CANLI
                </span>
                <span>$ {rates.usd_try.toFixed(2)}</span>
                <span>€ {rates.eur_try.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Raycast-style Centered Floating Search Pill */}
          <div className="relative flex-1 max-w-2xl mx-auto">
            <form onSubmit={handleSearchOrUrl} className="relative flex items-center">
              <Search className="w-4 h-4 text-[#8F96A3] absolute left-4 pointer-events-none" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara (Zara, Flaw, RTX 5070, Dyson...) veya link yapıştır  ⌘K"
                className="w-full rounded-full bg-white/[0.05] hover:bg-white/[0.07] focus:bg-white/[0.08] border border-white/[0.08] focus:border-[#10B981]/60 pl-11 pr-28 py-2.5 text-sm text-[#F5F2EB] placeholder:text-[#747B87] focus:outline-none transition"
              />
              <button
                type="submit"
                disabled={searching}
                className="absolute right-1.5 px-4 py-1.5 rounded-full bg-[#F5F2EB] hover:bg-white text-[#090A0C] text-xs font-semibold cursor-pointer disabled:opacity-50 transition"
              >
                {searching ? 'Arıyor...' : query.startsWith('http') ? 'Ekle' : 'Ara'}
              </button>
            </form>

            {showCandidates && (
              <div className="absolute left-0 right-0 top-13 z-50 rounded-3xl bg-[#111317]/95 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden max-h-[62vh] overflow-y-auto">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between text-xs text-[#8F96A3]">
                  <span>Canlı Türkiye Piyasa Sonuçları ({candidates.length})</span>
                  <button
                    onClick={() => setShowCandidates(false)}
                    className="text-[#8F96A3] hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {searching ? (
                  <div className="p-8 text-center text-xs text-[#8F96A3]">
                    Akakçe, Amazon TR ve Vatan canlı taranıyor...
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#8F96A3]">
                    Sonuç bulunamadı. Doğrudan ürün linki de yapıştırabilirsin.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {candidates.map((c, idx) => (
                      <div
                        key={idx}
                        onClick={() => handlePickCandidate(c)}
                        className="px-5 py-3.5 hover:bg-white/[0.04] flex items-center gap-4 cursor-pointer transition"
                      >
                        {c.image_url ? (
                          <img
                            src={c.image_url}
                            alt=""
                            className="w-12 h-12 rounded-xl object-cover bg-white/5 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-[#8F96A3] shrink-0">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[#F5F2EB] truncate">{c.title}</div>
                          <div className="text-[11px] text-[#8F96A3] mt-0.5">
                            {c.store_name} • {c.source}
                          </div>
                        </div>
                        <div className="font-mono-num text-sm font-semibold text-[#10B981] shrink-0">
                          {fmtPrice(c.price_try)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Action Pills */}
          <div className="flex items-center gap-2 shrink-0">
            {savedTotal > 0 && (
              <div
                title="Gerçek indirimlerden kurtarılan toplam tutar"
                className="hidden xl:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#10B981]/10 border border-[#10B981]/25 text-xs font-mono-num text-[#10B981]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {fmtTry(savedTotal)}
              </div>
            )}
            <button
              onClick={handleSnapshotAll}
              title="Black Friday / Sezon indirimi öncesi tüm fiyatları dondur"
              className="px-3.5 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.07] text-xs font-medium text-[#F5F2EB] flex items-center gap-1.5 cursor-pointer transition"
            >
              <Camera className="w-3.5 h-3.5 text-[#10B981]" />
              <span className="hidden lg:inline">Fiyat Dondur</span>
            </button>
            <button
              onClick={() => setCurrency((c) => (c === 'TRY' ? 'USD' : 'TRY'))}
              className="px-3.5 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.07] font-mono-num text-xs font-medium cursor-pointer transition"
            >
              {currency}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="max-w-[1440px] w-full mx-auto px-6 pt-6 flex-1">
        {/* Editorial Hero Strip & Folder Pills */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-editorial text-4xl text-[#F5F2EB] leading-none">
              {activeTab === 'gallery' && 'Koleksiyon & Lookbook'}
              {activeTab === 'radar' && 'Canlı Fırsat Radarı'}
              {activeTab === 'shared' && 'Metehan × İlayda Ortak Pano'}
              {activeTab === 'orders' && 'Siparişler & 14 Gün İade Koruması'}
            </h1>
            <p className="text-xs text-[#8F96A3] mt-1.5">
              {activeTab === 'gallery' &&
                `${folderProducts.length} takip edilen parça • Sepet Sıfır ${fmtPrice(basketTotals.newSum)}${
                  basketTotals.diff > 0 ? ` • 2. El Karma ile ${fmtPrice(basketTotals.diff)} tasarruf` : ''
                }`}
              {activeTab === 'radar' &&
                'Gerçek dip yapanlar, stoğa dönen bedenler, ucuz 2. el fırsatları ve 14 gün iade düşüşleri.'}
              {activeTab === 'shared' &&
                'Telefondan veya PC’den eklenen parçalara tek tıkla Al / Bekle / Pas oyu verin.'}
              {activeTab === 'orders' &&
                'Aldığın ürün 14 gün içinde indirime girerse anında iade + yeniden alım kârını hesaplar.'}
            </p>
          </div>

          {(activeTab === 'gallery' || activeTab === 'shared') && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              <button
                onClick={() => setActiveFolder(null)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer transition shrink-0 ${
                  activeFolder === null
                    ? 'bg-[#F5F2EB] text-[#090A0C]'
                    : 'bg-white/[0.05] text-[#9AA2AC] hover:text-white hover:bg-white/[0.09]'
                }`}
              >
                Tümü ({products.length})
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolder(f.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer transition shrink-0 ${
                    activeFolder === f.id
                      ? 'bg-[#F5F2EB] text-[#090A0C]'
                      : 'bg-white/[0.05] text-[#9AA2AC] hover:text-white hover:bg-white/[0.09]'
                  }`}
                >
                  {f.name} ({f.item_count})
                </button>
              ))}
              {newFolderOpen ? (
                <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Koleksiyon adı..."
                    className="rounded-full bg-white/[0.07] border border-white/15 px-3 py-1 text-xs text-white focus:outline-none w-36"
                  />
                  <button
                    type="submit"
                    className="w-7 h-7 rounded-full bg-[#10B981] text-[#090A0C] flex items-center justify-center cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setNewFolderOpen(true)}
                  className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-[#9AA2AC] hover:text-white cursor-pointer transition shrink-0"
                  title="Yeni Koleksiyon"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Empty States */}
        {displayedList.length === 0 ? (
          <div className="rounded-3xl bg-[#111317]/70 border border-white/[0.06] py-20 px-6 text-center max-w-xl mx-auto mt-10">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-4 text-[#10B981]">
              {activeTab === 'radar' ? (
                <Flame className="w-6 h-6" />
              ) : activeTab === 'orders' ? (
                <Package className="w-6 h-6" />
              ) : (
                <Sparkles className="w-6 h-6" />
              )}
            </div>
            <div className="font-editorial text-2xl text-[#F5F2EB]">
              {activeTab === 'radar'
                ? 'Şu an acil fırsat yok'
                : activeTab === 'orders'
                ? 'Henüz “Aldım” dediğin ürün yok'
                : 'Koleksiyonun henüz boş'}
            </div>
            <p className="text-xs text-[#8F96A3] mt-2 leading-relaxed max-w-sm mx-auto">
              {activeTab === 'radar'
                ? 'Gerçek fiyat düşüşü, takip ettiğin bedenin stoğa girmesi veya 14 gün iade fırsatı yakalandığında otomatik buraya düşer.'
                : activeTab === 'orders'
                ? 'Bir ürün kartına tıklayıp “Aldım (14 Gün İade Koruması)” dediğinde burada takip edilir.'
                : 'Yukarıdaki arama çubuğuna bir ürün adı yaz (örn. MacBook Air M4, Ninja Blender) ya da Zara / Flaw / Amazon / Sahibinden linki yapıştır.'}
            </p>
          </div>
        ) : (
          /* Editorial Visual Lookbook Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {displayedList.map((p) => {
              const isDip =
                p.discount_verdict.status === 'GENUINE_DIP' ||
                p.discount_verdict.status === 'GENUINE_DROP';
              const isFake = p.discount_verdict.status === 'INFLATED_FAKE';
              const snapDiffPct =
                p.snapshot_price_try && p.snapshot_price_try > 0 && p.best_new_try > 0
                  ? ((p.best_new_try - p.snapshot_price_try) / p.snapshot_price_try) * 100
                  : null;
              const refundDaysLeft =
                p.purchased_at !== null ? Math.max(0, 14 - daysSince(p.purchased_at)) : null;
              const refundProfit =
                p.purchased_price_try !== null && p.best_new_try > 0
                  ? p.purchased_price_try - p.best_new_try
                  : 0;
              const mv = voteLabel(p.vote_metehan);
              const iv = voteLabel(p.vote_ilayda);
              const bothBuy = p.vote_metehan === 'buy' && p.vote_ilayda === 'buy';

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className="group rounded-3xl bg-[#111317] border border-white/[0.06] hover:border-white/[0.16] overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col shadow-lg shadow-black/30"
                >
                  {/* Hero Visual Image */}
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-[#181C23] to-[#0E1014] overflow-hidden">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/15">
                        <ShoppingBag className="w-12 h-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#111317] via-transparent to-black/35" />

                    {/* Top Left Verdict Pill */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold backdrop-blur-md border ${
                          isDip
                            ? 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40'
                            : isFake
                            ? 'bg-[#F43F5E]/20 text-[#F43F5E] border-[#F43F5E]/40'
                            : 'bg-black/50 text-[#F5F2EB] border-white/15'
                        }`}
                      >
                        {p.discount_verdict.badge}
                      </span>
                      {bothBuy && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#10B981] text-[#090A0C]">
                          İKİMİZ DE AL ✓
                        </span>
                      )}
                    </div>

                    {/* Top Right Folder Micro-Tag */}
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] bg-black/55 backdrop-blur-md text-[#C7CCD4] border border-white/10">
                      {p.folder_name}
                    </span>

                    {/* Bottom Image Overlay: Price */}
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                      <div>
                        <div className="font-mono-num text-xl font-bold text-[#F5F2EB] leading-none">
                          {p.best_new_try > 0 ? fmtPrice(p.best_new_try) : '—'}
                        </div>
                        {p.unit_price && (
                          <div className="text-[10px] font-mono-num text-[#10B981] mt-1">
                            10 {p.unit_price.unit}: {p.unit_price.price_per_10_try} ₺
                          </div>
                        )}
                      </div>
                      {p.best_used_try && (
                        <span className="px-2.5 py-1 rounded-full bg-[#3B82F6]/20 border border-[#3B82F6]/40 backdrop-blur-md font-mono-num text-[10px] font-semibold text-[#60A5FA]">
                          2. El {fmtPrice(p.best_used_try)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <div className="text-sm font-medium text-[#F5F2EB] line-clamp-2 leading-snug">
                      {p.title}
                    </div>

                    {/* Snapshot Comparison */}
                    {snapDiffPct !== null && Math.abs(snapDiffPct) >= 1 && (
                      <div
                        className={`text-[11px] font-mono-num px-2.5 py-1 rounded-xl w-fit ${
                          snapDiffPct < 0
                            ? 'bg-[#10B981]/10 text-[#10B981]'
                            : 'bg-[#F43F5E]/10 text-[#F43F5E]'
                        }`}
                      >
                        Snapshot’a göre {snapDiffPct > 0 ? '+' : ''}
                        {snapDiffPct.toFixed(1)}%
                      </div>
                    )}

                    {/* 14-Day Refund Protection Banner */}
                    {refundDaysLeft !== null && (
                      <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.06] space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#8F96A3] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#10B981]" />
                            İade koruması: <strong className="text-[#F5F2EB]">{refundDaysLeft} gün</strong>
                          </span>
                          <span className="font-mono-num text-[#8F96A3]">
                            Alış: {fmtTry(p.purchased_price_try || 0)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#10B981]"
                            style={{ width: `${Math.min(100, (refundDaysLeft / 14) * 100)}%` }}
                          />
                        </div>
                        {refundProfit > 25 && (
                          <div className="text-[11px] font-semibold text-[#10B981]">
                            ⚡ İade edip yeniden alırsan {fmtTry(refundProfit)} kârdasın!
                          </div>
                        )}
                      </div>
                    )}

                    {/* Size Bubbles Preview */}
                    {p.sizes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.sizes.slice(0, 6).map((s) => (
                          <span
                            key={s.size}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono-num ${
                              s.in_stock
                                ? 'bg-[#10B981]/15 text-[#10B981]'
                                : 'bg-white/[0.04] text-[#606774] line-through'
                            }`}
                          >
                            {s.size}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Shared Board Inline Voting */}
                    {activeTab === 'shared' ? (
                      <div
                        className="mt-auto pt-2 border-t border-white/[0.06] space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-[#8F96A3]">Metehan:</span>
                          <div className="flex gap-1">
                            {(['buy', 'wait', 'pass'] as const).map((v) => (
                              <button
                                key={v}
                                onClick={() => handleVote(p.id, 'metehan', p.vote_metehan === v ? '' : v)}
                                className={`px-2.5 py-0.5 rounded-full border text-[10px] font-medium cursor-pointer transition ${
                                  p.vote_metehan === v
                                    ? voteLabel(v).cls
                                    : 'border-white/10 text-[#8F96A3] hover:text-white'
                                }`}
                              >
                                {voteLabel(v).text}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-[#8F96A3]">İlayda:</span>
                          <div className="flex gap-1">
                            {(['buy', 'wait', 'pass'] as const).map((v) => (
                              <button
                                key={v}
                                onClick={() => handleVote(p.id, 'ilayda', p.vote_ilayda === v ? '' : v)}
                                className={`px-2.5 py-0.5 rounded-full border text-[10px] font-medium cursor-pointer transition ${
                                  p.vote_ilayda === v
                                    ? voteLabel(v).cls
                                    : 'border-white/10 text-[#8F96A3] hover:text-white'
                                }`}
                              >
                                {voteLabel(v).text}
                              </button>
                            ))}
                          </div>
                        </div>
                        {p.shared_note && (
                          <div className="text-[11px] text-[#C7CCD4] italic truncate">“{p.shared_note}”</div>
                        )}
                      </div>
                    ) : (
                      /* Subtle Footer Meta */
                      <div className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#8F96A3]">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                          Güven %{p.avg_trust_score}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {p.vote_metehan && (
                            <span className={`px-2 py-0.5 rounded-full border text-[9px] ${mv.cls}`}>
                              M: {mv.text}
                            </span>
                          )}
                          {p.vote_ilayda && (
                            <span className={`px-2 py-0.5 rounded-full border text-[9px] ${iv.cls}`}>
                              İ: {iv.text}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Floating Glass Pill Dock */}
      <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-1 p-1.5 rounded-full bg-[#121419]/85 backdrop-blur-2xl border border-white/12 shadow-2xl shadow-black/60">
          {(
            [
              { id: 'gallery', label: 'Galeri', icon: LayoutGrid, badge: 0 },
              { id: 'radar', label: 'Radar', icon: Flame, badge: radarProducts.length },
              { id: 'shared', label: 'Ortak', icon: Users, badge: 0 },
              { id: 'orders', label: 'Sipariş', icon: Package, badge: purchasedProducts.length },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative px-4 py-2 rounded-full text-xs font-medium flex items-center gap-2 cursor-pointer transition ${
                  active
                    ? 'bg-[#F5F2EB] text-[#090A0C] shadow-md'
                    : 'text-[#9AA2AC] hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono-num font-bold ${
                      active ? 'bg-[#090A0C]/15 text-[#090A0C]' : 'bg-[#10B981]/20 text-[#10B981]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button
            onClick={() => setShowSettings(true)}
            className="px-3.5 py-2 rounded-full text-xs font-medium text-[#9AA2AC] hover:text-white hover:bg-white/[0.06] flex items-center gap-1.5 cursor-pointer transition"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Ayarlar</span>
          </button>
        </div>
      </nav>

      {/* Cinematic Editorial Product Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] bg-[#101216] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Bar */}
            <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="px-3 py-1 rounded-full bg-white/[0.06] text-[11px] text-[#C7CCD4] shrink-0">
                  {selected.folder_name}
                </span>
                <span className="text-sm font-medium text-[#F5F2EB] truncate">{selected.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRefresh(selected)}
                  disabled={refreshingId === selected.id}
                  className="px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === selected.id ? 'animate-spin' : ''}`} />
                  Tara
                </button>
                <button
                  onClick={async () => {
                    await api.deleteProduct(selected.id);
                    setSelectedId(null);
                    await loadAll();
                    notify('Ürün takipten çıkarıldı.');
                  }}
                  className="w-8 h-8 rounded-full bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 text-[#F43F5E] flex items-center justify-center cursor-pointer transition"
                  title="Takipten Çıkar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSelectedId(null)}
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#9AA2AC] hover:text-white flex items-center justify-center cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Hero Image + Primary Actions + Votes + Sizes */}
              <div className="lg:col-span-5 space-y-4">
                <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-[#181C23] border border-white/[0.06]">
                  {selected.image_url ? (
                    <img src={selected.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/15">
                      <ShoppingBag className="w-16 h-16" />
                    </div>
                  )}
                </div>

                {/* Primary CTAs */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() =>
                      api.openExternal(selected.quick_checkout_url || selected.primary_url)
                    }
                    className="py-3 px-4 rounded-2xl bg-[#10B981] hover:bg-[#0EA472] text-[#090A0C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <Zap className="w-4 h-4" />
                    Hızlı Alım / Sepet
                  </button>
                  <button
                    onClick={() => handleMarkPurchased(selected)}
                    className={`py-3 px-4 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border transition ${
                      selected.purchased_price_try !== null
                        ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/10 text-[#F5F2EB]'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    {selected.purchased_price_try !== null ? '14 Gün Korumada ✓' : 'Aldım (14 Gün Koru)'}
                  </button>
                </div>

                {/* Metehan × İlayda Collaborative Voting */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                  <div className="text-xs font-semibold text-[#F5F2EB] flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-[#F43F5E]" />
                    Metehan × İlayda Ortak Karar
                  </div>
                  {(['metehan', 'ilayda'] as const).map((who) => {
                    const cur = who === 'metehan' ? selected.vote_metehan : selected.vote_ilayda;
                    return (
                      <div key={who} className="flex items-center justify-between text-xs">
                        <span className="text-[#8F96A3] capitalize">{who === 'ilayda' ? 'İlayda' : 'Metehan'}</span>
                        <div className="flex gap-1.5">
                          {(['buy', 'wait', 'pass'] as const).map((v) => (
                            <button
                              key={v}
                              onClick={() => handleVote(selected.id, who, cur === v ? '' : v)}
                              className={`px-3 py-1 rounded-full border text-[11px] font-medium cursor-pointer transition ${
                                cur === v
                                  ? voteLabel(v).cls
                                  : 'border-white/10 text-[#8F96A3] hover:text-white'
                              }`}
                            >
                              {voteLabel(v).text}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-2 pt-1">
                    <input
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Kısa ortak not (örn. M beden indirimde alalım)..."
                      className="flex-1 rounded-xl bg-[#090A0C] border border-white/[0.08] px-3 py-1.5 text-xs text-[#F5F2EB] focus:outline-none focus:border-[#10B981]"
                    />
                    <button
                      onClick={() => {
                        handleVote(selected.id, 'metehan', selected.vote_metehan, noteInput);
                        notify('Ortak not kaydedildi.');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium cursor-pointer"
                    >
                      Kaydet
                    </button>
                  </div>
                </div>

                {/* Size Stock Tracker */}
                {selected.sizes.length > 0 && (
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
                    <div className="text-xs font-semibold text-[#F5F2EB]">
                      Beden Stok Takibi (Alarm için tıkla)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.sizes.map((s) => {
                        const tracked = selected.tracked_sizes
                          .toUpperCase()
                          .split(',')
                          .map((x) => x.trim())
                          .includes(s.size.toUpperCase());
                        return (
                          <button
                            key={s.size}
                            onClick={() => handleToggleSize(selected, s.size)}
                            className={`px-3 py-1 rounded-full text-xs font-mono-num border cursor-pointer transition ${
                              tracked
                                ? 'bg-[#10B981] text-[#090A0C] border-[#10B981] font-bold'
                                : s.in_stock
                                ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30 hover:bg-[#10B981]/20'
                                : 'bg-white/[0.03] text-[#606774] border-white/[0.07] line-through hover:text-white'
                            }`}
                          >
                            {s.size}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Price Intelligence, Chart, Installment Calculator, Offers, 2nd-Hand */}
              <div className="lg:col-span-7 space-y-5">
                {/* Big Price + Verdict + Target */}
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[#8F96A3]">
                      En Ucuz Sıfır Piyasa
                    </div>
                    <div className="font-mono-num text-3xl font-bold text-[#F5F2EB] mt-1">
                      {selected.best_new_try > 0 ? fmtPrice(selected.best_new_try) : '—'}
                    </div>
                    <div className="text-xs text-[#8F96A3] mt-1.5">{selected.discount_verdict.explanation}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-full bg-[#090A0C] border border-white/10 px-3 py-1.5">
                      <Bell className="w-3.5 h-3.5 text-[#10B981]" />
                      <input
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        placeholder="Hedef ₺"
                        className="w-20 bg-transparent text-xs font-mono-num text-[#F5F2EB] focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        const v = targetInput.trim() ? Number(targetInput) : null;
                        await api.setTargetPrice(selected.id, v);
                        await loadAll();
                        notify(v ? `Hedef fiyat ${fmtTry(v)} olarak ayarlandı.` : 'Hedef fiyat temizlendi.');
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-[#F5F2EB] text-[#090A0C] text-xs font-semibold cursor-pointer"
                    >
                      Alarm Kur
                    </button>
                  </div>
                </div>

                {/* Price History Chart */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#F5F2EB] flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-[#10B981]" />
                      Fiyat Geçmişi ({currency})
                    </span>
                    <span className="text-[11px] font-mono-num text-[#8F96A3]">
                      Dip: {fmtPrice(selected.discount_verdict.min_all_try)} • Ort:{' '}
                      {fmtPrice(selected.discount_verdict.avg_30d_try)}
                    </span>
                  </div>
                  <PriceChart
                    history={selected.history}
                    currency={currency}
                    targetPriceTry={selected.target_price_try}
                    currentUsdRate={rates.usd_try}
                  />
                </div>

                {/* Installment + Shipping Real Cost Calculator */}
                {selected.best_new_try > 0 && (
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F5F2EB] flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-[#3B82F6]" />
                        Taksit & Kargo Gerçek Maliyet
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-[#8F96A3]">
                        <span>Kargo ₺:</span>
                        <input
                          type="number"
                          value={shippingCost}
                          onChange={(e) => setShippingCost(Number(e.target.value) || 0)}
                          className="w-16 rounded-lg bg-[#090A0C] border border-white/10 px-2 py-0.5 font-mono-num text-[#F5F2EB]"
                        />
                        <span>Aylık %:</span>
                        <input
                          type="number"
                          step="0.2"
                          value={installmentRate}
                          onChange={(e) => setInstallmentRate(Number(e.target.value) || 0)}
                          className="w-14 rounded-lg bg-[#090A0C] border border-white/10 px-2 py-0.5 font-mono-num text-[#F5F2EB]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 3, 6, 9].map((m) => {
                        const base = selected.best_new_try + shippingCost;
                        const total = m === 1 ? base : base * (1 + (installmentRate / 100) * (m - 1));
                        const monthly = total / m;
                        return (
                          <div
                            key={m}
                            className="p-2.5 rounded-xl bg-[#090A0C]/70 border border-white/[0.06] text-center"
                          >
                            <div className="text-[10px] text-[#8F96A3]">{m === 1 ? 'Peşin' : `${m} Taksit`}</div>
                            <div className="font-mono-num text-xs font-bold text-[#F5F2EB] mt-0.5">
                              {fmtTry(monthly)}
                              {m > 1 ? '/ay' : ''}
                            </div>
                            <div className="font-mono-num text-[10px] text-[#8F96A3] mt-0.5">
                              Top: {fmtTry(total)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Retail Offers */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#F5F2EB]">
                    Mağaza Teklifleri ({selected.offers.length})
                  </div>
                  {selected.offers.map((o) => (
                    <div
                      key={o.id}
                      className="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F5F2EB]">{o.store_name}</div>
                        <div className="text-[11px] text-[#8F96A3]">
                          {o.seller_name} • Güven %{o.trust_score}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono-num text-sm font-bold text-[#10B981]">
                          {fmtPrice(o.price_try + o.shipping_try)}
                        </span>
                        <button
                          onClick={() => api.openExternal(o.url)}
                          className="p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-[#F5F2EB] cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 2nd Hand Market */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#60A5FA]">
                      2. El Piyasa ({selected.used_listings.length})
                    </span>
                    <button
                      onClick={() => setShowManualUsed((v) => !v)}
                      className="text-[11px] text-[#60A5FA] hover:underline cursor-pointer"
                    >
                      + Manuel 2. El İlan Ekle
                    </button>
                  </div>

                  {showManualUsed && (
                    <form
                      onSubmit={handleAddManualUsed}
                      className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 grid grid-cols-2 gap-2 text-xs"
                    >
                      <input
                        placeholder="İlan başlığı"
                        value={manualUsed.title}
                        onChange={(e) => setManualUsed({ ...manualUsed, title: e.target.value })}
                        className="col-span-2 rounded-xl bg-[#090A0C] border border-white/10 px-3 py-1.5 text-white"
                      />
                      <input
                        placeholder="Fiyat (₺)"
                        type="number"
                        value={manualUsed.price_try}
                        onChange={(e) => setManualUsed({ ...manualUsed, price_try: e.target.value })}
                        className="rounded-xl bg-[#090A0C] border border-white/10 px-3 py-1.5 text-white"
                      />
                      <input
                        placeholder="Şehir"
                        value={manualUsed.city}
                        onChange={(e) => setManualUsed({ ...manualUsed, city: e.target.value })}
                        className="rounded-xl bg-[#090A0C] border border-white/10 px-3 py-1.5 text-white"
                      />
                      <button
                        type="submit"
                        className="col-span-2 py-2 rounded-xl bg-[#3B82F6] text-white font-semibold cursor-pointer"
                      >
                        2. El İlanı Kaydet
                      </button>
                    </form>
                  )}

                  {selected.used_listings.map((u) => (
                    <div
                      key={u.id}
                      className="px-4 py-3 rounded-2xl bg-[#3B82F6]/[0.06] border border-[#3B82F6]/20 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#F5F2EB] truncate">{u.title}</div>
                        <div className="text-[11px] text-[#8F96A3]">
                          {u.platform} • {u.city} • Güven %{u.trust_score}
                          {u.param_guvende ? ' • Param Güvende' : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono-num text-sm font-bold text-[#60A5FA]">
                          {fmtPrice(u.price_try)}
                        </span>
                        <button
                          onClick={() => {
                            const offer = Math.round((u.price_try * 0.9) / 50) * 50;
                            navigator.clipboard.writeText(
                              `Merhaba, ilanınızla ilgileniyorum. ${fmtTry(offer)} nakit / Param Güvende ile hemen alabilirim, uygun mudur?`
                            );
                            notify('Pazarlık mesajı kopyalandı.');
                          }}
                          className="px-2.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[10px] cursor-pointer"
                        >
                          Pazarlık
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onToast={notify} />}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#F5F2EB] text-[#090A0C] text-xs font-semibold shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
