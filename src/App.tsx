import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  Bot,
  Calendar,
  Check,
  Clock,
  Compass,
  CreditCard,
  ExternalLink,
  Flame,
  FolderPlus,
  Gift,
  Globe,
  Heart,
  Layers,
  LayoutGrid,
  Minus,
  Package,
  Palette,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Square,
  Ticket,
  Trash2,
  TrendingDown,
  Truck,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { api } from './api';
import { extractAmbientColor } from './colorExtract';
import { CommandPalette, PaletteIcons } from './components/CommandPalette';
import { OdometerPrice } from './components/OdometerPrice';
import { PriceChart } from './components/PriceChart';
import { SettingsModal } from './components/SettingsModal';
import {
  FREE_SHIPPING_THRESHOLDS,
  findPerfumeDupe,
  getCargoTrackUrl,
  getUpcomingCampaigns,
} from './data/campaigns';
import { sound } from './sound';
import { THEMES, applyThemeToDom } from './themes';
import {
  type DiscoverArchiveItem,
  type DiscoverItem,
  type EventItem,
  type FolderItem,
  type MarketRates,
  type ProductDetail,
  type SearchCandidate,
  type UsedAiAnalysis,
  fmtTry,
  fmtUsd,
} from './types';

type DockTab = 'discover' | 'stage' | 'gallery' | 'radar' | 'shared' | 'moodboard' | 'orders';
type DiscoverCategory = 'all' | 'personal' | 'flash' | 'tech' | 'fashion' | 'cosmetics' | 'home';
type StageCategory = 'all' | 'radar' | 'konser' | 'tiyatro' | 'standup' | 'tickets';
type CurrencyMode = 'TRY' | 'USD' | 'GOLD';

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function voteLabel(v: string): { text: string; color: string; bg: string } {
  if (v === 'buy') return { text: 'Al', color: '#10B981', bg: 'rgba(16,185,129,0.18)' };
  if (v === 'wait') return { text: 'Bekle', color: '#F59E0B', bg: 'rgba(245,158,11,0.16)' };
  if (v === 'pass') return { text: 'Pas', color: '#F43F5E', bg: 'rgba(244,63,94,0.16)' };
  return { text: '—', color: 'var(--muted)', bg: 'var(--surface-2)' };
}

function inditexWaveHint(p: ProductDetail): { wave: string; advice: string } | null {
  const isFashion =
    /zara|bershka|stradivarius|pullandbear|massimo|oysho|flaw|hype|nike|beymen|boyner/i.test(
      p.primary_url + ' ' + p.folder_name
    ) || p.sizes.length > 0;
  if (!isFashion) return null;
  const inStockCount = p.sizes.filter((s) => s.in_stock).length;
  const totalSizes = p.sizes.length;
  const drop = p.discount_verdict.pct_vs_avg;
  if (drop <= -40) {
    return {
      wave: '3. Dalga Final İndirim',
      advice: 'Maksimum indirim bandında — beden tükenmeden hemen değerlendir.',
    };
  }
  if (drop <= -18) {
    return {
      wave: '2. Dalga İndirim (%20–40)',
      advice:
        totalSizes > 0 && inStockCount <= 2
          ? 'Sadece 1–2 beden kaldı; sonraki dalgayı beklemek riskli.'
          : '2. dalgada; stok bolsa 2–3 hafta içinde ek düşüş gelebilir.',
    };
  }
  return {
    wave: 'Sezon / SINT İzleme (07:00–09:00)',
    advice:
      totalSizes > 0 && inStockCount === 0
        ? 'İade kaynaklı tekil beden stokları sabah 07:00–09:00 arasında düşer.'
        : 'Normal sezon fiyatı — hedef fiyat veya sezon başlangıcı için takipte.',
  };
}

export default function App() {
  const [rates, setRates] = useState<MarketRates>({
    usd_try: 35.2,
    eur_try: 38.4,
    gold_gram_try: 3050,
    updated_at: '',
  });
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [discoverItems, setDiscoverItems] = useState<DiscoverItem[]>([]);
  const [archiveDeals, setArchiveDeals] = useState<DiscoverArchiveItem[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverCat, setDiscoverCat] = useState<DiscoverCategory>('all');
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverMin, setDiscoverMin] = useState('');
  const [discoverMax, setDiscoverMax] = useState('');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [stageCat, setStageCat] = useState<StageCategory>('all');
  const [stageQuery, setStageQuery] = useState('');
  const [modalTab, setModalTab] = useState<'overview' | 'vault' | 'used'>('overview');
  const [travelRewardPct, setTravelRewardPct] = useState(12);
  const [travelServicePct, setTravelServicePct] = useState(7);
  const [travelTaxFree, setTravelTaxFree] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>('gallery');
  const [showSecretOnly, setShowSecretOnly] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [modalAmbientGlow, setModalAmbientGlow] = useState('rgba(16, 185, 129, 0.22)');
  const [vaultDraft, setVaultDraft] = useState({
    cargo_company: 'HepsiJet',
    cargo_tracking_no: '',
    warranty_months: 24,
    receipt_note: '',
    batch_code: '',
    pao_months: 24,
    foreign_eur_price: '',
  });
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [currency, setCurrency] = useState<CurrencyMode>('TRY');
  const [savedTotal, setSavedTotal] = useState<number>(0);
  const [activeTheme, setActiveTheme] = useState<string>('obsidian-aurora');
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(15000);
  const [userCards, setUserCards] = useState<string>('Bonus, World, Maximum');
  const [moodIds, setMoodIds] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('hayye_mood_ids') || '[]');
    } catch {
      return [];
    }
  });

  // Search & add
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Modals & tools
  const [showSettings, setShowSettings] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [targetInput, setTargetInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [installmentRate, setInstallmentRate] = useState(3.2);
  const [aiResult, setAiResult] = useState<Record<number, UsedAiAnalysis>>({});
  const [aiLoadingId, setAiLoadingId] = useState<number | null>(null);
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
      const [f, p, sv, st] = await Promise.all([
        api.getFolders(),
        api.getProducts(),
        api.getSavedTotal(),
        api.getAlertSettings(),
      ]);
      setFolders(f);
      setProducts(p);
      setSavedTotal(sv);
      if (st?.active_theme) {
        setActiveTheme(st.active_theme);
        applyThemeToDom(st.active_theme);
      }
      if (st?.monthly_budget_try) setMonthlyBudget(st.monthly_budget_try);
      if (st?.user_cards) setUserCards(st.user_cards);
      if (typeof st?.sound_enabled === 'boolean') {
        setSoundOn(st.sound_enabled);
        sound.enabled = st.sound_enabled;
      }
      api.getDiscoverArchive().then(setArchiveDeals).catch(() => {});
    } catch {
      applyThemeToDom(activeTheme);
    }
  };

  useEffect(() => {
    api.getMarketRates().then(setRates).catch(() => {});
    loadAll();
    const timer = setInterval(loadAll, 20000);
    // Live SSE real-time sync (instant update when İlayda votes/adds from iPhone)
    let es: EventSource | null = null;
    try {
      es = new EventSource('http://127.0.0.1:47821/api/events');
      es.onmessage = (ev) => {
        const msg = String(ev.data || '');
        if (msg.startsWith('events_updated')) {
          const parts = msg.split(':');
          api.fetchLiveEvents().then(setEvents).catch(() => {});
          notify(
            parts.length >= 3
              ? `✓ ${parts[1]}: ${parts[2]} canlı etkinlik çekilip Sahne'ye eklendi!`
              : 'Arka plan bilet taraması yeni etkinlikler yakaladı!'
          );
          return;
        }
        if (msg.startsWith('search_updated')) {
          const cnt = msg.split(':')[1] || '';
          api.getWebviewSearchResults().then((wv) => {
            if (wv.length > 0) {
              setCandidates((prev) => {
                const urls = new Set(prev.map((x) => x.url));
                const merged = [...wv.filter((x) => !urls.has(x.url)), ...prev];
                return merged.sort((a, b) => a.price_try - b.price_try);
              });
              if (cnt) notify(`✓ Dahili oturum araması ${cnt} canlı ürün çekti.`);
            }
          }).catch(() => {});
          return;
        }
        if (msg.startsWith('session_status:')) {
          const [, src, st, note] = msg.split(':');
          if (st === 'verified') notify(`✓ ${src} oturumu doğrulandı!`);
          else if (st === 'blocked') notify(`✕ ${src}: ${note || 'WAF engeli — Brave eklentisini kullan'}`);
          return;
        }
        if (msg.startsWith('webview_attention:')) {
          const site = msg.replace('webview_attention:', '');
          notify(`⚠ ${site} oturum/doğrulama istiyor — Ayarlar → Bağlı Hesaplar'dan 1 kez giriş yap.`);
          return;
        }
        sound.playChime();
        loadAll();
      };
    } catch {
      // Outside bridge
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        sound.playClick();
        setShowPalette((v) => !v);
      }
      if (e.key === 'Escape') {
        setShowCandidates(false);
        setShowThemeMenu(false);
        setShowPalette(false);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      es?.close();
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
      setVaultDraft({
        cargo_company: selected.cargo_company || 'HepsiJet',
        cargo_tracking_no: selected.cargo_tracking_no || '',
        warranty_months: selected.warranty_months || 24,
        receipt_note: selected.receipt_note || '',
        batch_code: selected.batch_code || '',
        pao_months: selected.pao_months || 24,
        foreign_eur_price: selected.foreign_eur_price ? String(selected.foreign_eur_price) : '',
      });
      extractAmbientColor(selected.image_url, selected.title).then(setModalAmbientGlow);
    }
  }, [selected?.id]);

  const toggleMood = (id: number) => {
    setMoodIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-8);
      localStorage.setItem('hayye_mood_ids', JSON.stringify(next));
      return next;
    });
  };

  const handleSelectTheme = async (themeId: string) => {
    setActiveTheme(themeId);
    applyThemeToDom(themeId);
    setShowThemeMenu(false);
    try {
      await api.setActiveTheme(themeId);
      const t = THEMES.find((x) => x.id === themeId);
      notify(`Tema güncellendi: ${t?.name} (iPhone & Eklenti senkron)`);
    } catch {
      // Preview mode
    }
  };

  const loadDiscover = async () => {
    setDiscoverLoading(true);
    try {
      const items = await api.fetchDiscoverDeals();
      setDiscoverItems(items);
    } catch (err) {
      notify(String(err));
    } finally {
      setDiscoverLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    try {
      const list = await api.fetchLiveEvents();
      setEvents(list);
    } catch (err) {
      notify(String(err));
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'discover' && discoverItems.length === 0 && !discoverLoading) {
      loadDiscover();
    }
    if (activeTab === 'stage' && events.length === 0 && !eventsLoading) {
      loadEvents();
    }
  }, [activeTab]);

  const handleEventVote = async (
    eventId: string,
    who: 'metehan' | 'ilayda',
    vote: string,
    ticketBought?: boolean | null
  ) => {
    try {
      sound.playClick();
      await api.setEventVote(eventId, who, vote, ticketBought);
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId
            ? {
                ...ev,
                vote_metehan: who === 'metehan' ? vote : ev.vote_metehan,
                vote_ilayda: who === 'ilayda' ? vote : ev.vote_ilayda,
                ticket_bought:
                  ticketBought !== undefined && ticketBought !== null ? ticketBought : ev.ticket_bought,
              }
            : ev
        )
      );
    } catch (err) {
      notify(String(err));
    }
  };

  const filteredEvents = useMemo(() => {
    const q = stageQuery.trim().toLowerCase();
    return events.filter((ev) => {
      if (stageCat === 'radar' && !ev.matches_radar) return false;
      if (stageCat === 'tickets' && !ev.ticket_bought) return false;
      if (stageCat === 'konser' && !['concert', 'festival', 'konser'].includes(ev.category.toLowerCase())) return false;
      if (stageCat === 'tiyatro' && !['theater', 'tiyatro'].includes(ev.category.toLowerCase())) return false;
      if (stageCat === 'standup' && !['standup', 'stand-up'].includes(ev.category.toLowerCase())) return false;
      if (q && !(ev.title + ' ' + ev.venue + ' ' + ev.source).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, stageCat, stageQuery]);

  const radarEventCount = useMemo(
    () => events.filter((ev) => ev.matches_radar).length,
    [events]
  );

  const filteredDiscover = useMemo(() => {
    const q = discoverQuery.trim().toLowerCase();
    const minV = discoverMin.trim() ? Number(discoverMin) : null;
    const maxV = discoverMax.trim() ? Number(discoverMax) : null;
    return discoverItems.filter((d) => {
      if (discoverCat === 'personal' && !d.matches_personal) return false;
      if (discoverCat === 'flash' && !(d.is_flash_error || d.drop_pct >= 25)) return false;
      if (
        discoverCat !== 'all' &&
        discoverCat !== 'personal' &&
        discoverCat !== 'flash' &&
        d.category !== discoverCat
      ) {
        return false;
      }
      if (q && !(d.title + ' ' + d.brand).toLowerCase().includes(q)) return false;
      if (minV !== null && Number.isFinite(minV) && d.price_try < minV) return false;
      if (maxV !== null && Number.isFinite(maxV) && d.price_try > maxV) return false;
      return true;
    });
  }, [discoverItems, discoverCat, discoverQuery, discoverMin, discoverMax]);

  const handleDiscoverRangeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = discoverQuery.trim();
    if (!q) return;
    setDiscoverLoading(true);
    sound.playClick();
    try {
      const live = await api.searchLiveTr(q);
      const minV = discoverMin.trim() ? Number(discoverMin) : 0;
      const maxV = discoverMax.trim() ? Number(discoverMax) : 99_999_999;
      const mapped: DiscoverItem[] = live
        .filter((c) => c.price_try >= minV && c.price_try <= maxV)
        .map((c, i) => ({
          id: `live-${Date.now()}-${i}`,
          title: c.title,
          brand: c.store_name,
          category: 'all',
          price_try: c.price_try,
          drop_pct: 12,
          heat_score: 78,
          image_url: c.image_url,
          url: c.url,
          source: `${c.source} (Canlı Arama)`,
          is_flash_error: false,
          matches_personal: true,
          offer_count: c.offer_count || 1,
        }));
      if (mapped.length > 0) {
        setDiscoverItems((prev) => [...mapped, ...prev.filter((x) => !x.id.startsWith('live-'))]);
        setDiscoverCat('all');
        notify(`${mapped.length} canlı ürün fiyat bandında bulundu.`);
      } else {
        notify('Bu fiyat aralığında canlı sonuç bulunamadı.');
      }
    } catch (err) {
      notify(String(err));
    } finally {
      setDiscoverLoading(false);
    }
  };

  const top5Drops = useMemo(
    () => [...discoverItems].sort((a, b) => b.drop_pct - a.drop_pct).slice(0, 5),
    [discoverItems]
  );

  const handleSaveDiscover = async (d: DiscoverItem, askIlayda: boolean) => {
    try {
      const folderId =
        d.category === 'fashion' ? 2 : d.category === 'cosmetics' ? 3 : d.category === 'home' ? 5 : 1;
      const pid = await api.trackFromCandidate(folderId, {
        title: d.title,
        price_try: d.price_try,
        store_name: d.brand || 'Akakçe',
        url: d.url,
        image_url: d.image_url,
        source: d.source,
        offer_count: d.offer_count,
      });
      if (askIlayda) {
        await api.setProductVote(pid, 'metehan', 'buy', `Keşfet'te -%${Math.round(d.drop_pct)} düşmüş!`);
      }
      await loadAll();
      notify(askIlayda ? 'Ortak Panoya gönderildi (İlayda telefondan görebilir)!' : 'Koleksiyona eklendi!');
    } catch (err) {
      notify(String(err));
    }
  };

  const folderProducts = useMemo(() => {
    const base = showSecretOnly ? products.filter((p) => p.is_secret_gift) : products;
    if (activeFolder === null) return base;
    return base.filter((p) => p.folder_id === activeFolder);
  }, [products, activeFolder, showSecretOnly]);

  // Free shipping bundle opportunity detector (same store >= 2 items)
  const shippingBundles = useMemo(() => {
    const byStore = new Map<string, { count: number; total: number }>();
    for (const p of products) {
      const st = p.offers[0]?.store_name;
      if (!st || p.best_new_try <= 0) continue;
      const cur = byStore.get(st) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += p.best_new_try;
      byStore.set(st, cur);
    }
    return Array.from(byStore.entries())
      .filter(([, v]) => v.count >= 2)
      .map(([store, v]) => {
        const thresh = FREE_SHIPPING_THRESHOLDS[store] ?? 1000;
        const missing = Math.max(0, thresh - v.total);
        return { store, count: v.count, total: v.total, thresh, missing };
      })
      .slice(0, 3);
  }, [products]);

  const upcomingCampaigns = useMemo(() => getUpcomingCampaigns(), []);

  const radarProducts = useMemo(() => {
    return products.filter((p) => {
      const isDip =
        p.discount_verdict.status === 'GENUINE_DIP' || p.discount_verdict.status === 'GENUINE_DROP';
      const wanted = p.tracked_sizes
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const sizeInStock = p.sizes.some((s) => s.in_stock && wanted.includes(s.size.toUpperCase()));
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

  const moodProducts = useMemo(() => {
    const picked = products.filter((p) => moodIds.includes(p.id));
    return picked.length > 0 ? picked : products.slice(0, 6);
  }, [products, moodIds]);

  const committedSharedSpend = useMemo(() => {
    return products
      .filter((p) => p.purchased_price_try !== null || (p.vote_metehan === 'buy' && p.vote_ilayda === 'buy'))
      .reduce((acc, p) => acc + (p.purchased_price_try ?? p.best_new_try ?? 0), 0);
  }, [products]);

  const basketTotals = useMemo(() => {
    const newSum = folderProducts.reduce((acc, p) => acc + (p.best_new_try || 0), 0);
    const mixedSum = folderProducts.reduce(
      (acc, p) =>
        acc + (p.best_used_try && p.best_used_try < p.best_new_try ? p.best_used_try : p.best_new_try || 0),
      0
    );
    return { newSum, mixedSum, diff: Math.max(0, newSum - mixedSum) };
  }, [folderProducts]);

  const fmtPrice = (tryVal: number) => {
    if (currency === 'USD') return fmtUsd(tryVal / Math.max(1, rates.usd_try));
    if (currency === 'GOLD') return `${(tryVal / Math.max(100, rates.gold_gram_try)).toFixed(2)} gr`;
    return fmtTry(tryVal);
  };

  const cycleCurrency = () =>
    setCurrency((c) => (c === 'TRY' ? 'USD' : c === 'USD' ? 'GOLD' : 'TRY'));

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
      notify(`${n} ürünün referans fiyatı donduruldu.`);
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
    const next = exists ? cur.filter((s) => s.toUpperCase() !== sz.toUpperCase()) : [...cur, sz];
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

  const handleAnalyzeUsed = async (uId: number, title: string, price: number, newRetail: number) => {
    setAiLoadingId(uId);
    try {
      const res = await api.analyzeUsedWithOllama(title, title, price, newRetail);
      setAiResult((prev) => ({ ...prev, [uId]: res }));
    } catch (err) {
      notify(String(err));
    } finally {
      setAiLoadingId(null);
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
      : activeTab === 'moodboard'
      ? moodProducts
      : folderProducts;

  const waveInfo = selected ? inditexWaveHint(selected) : null;

  return (
    <div className="min-h-screen flex flex-col pb-28 relative">
      {/* Live Animated Atmospheric Mesh Background + Tactile Grain */}
      <div className="hayye-mesh-bg" aria-hidden="true">
        <div className="hayye-orb hayye-orb-1" />
        <div className="hayye-orb hayye-orb-2" />
        <div className="hayye-orb hayye-orb-3" />
      </div>
      <div className="hayye-grain" aria-hidden="true" />

      {/* Editorial Liquid Glass Header (Unified Custom Frameless Titlebar) */}
      <header
        onMouseDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, a, form')) {
            api.windowStartDragging().catch(() => {});
          }
        }}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, input, a, form')) {
            api.windowToggleMaximize().catch(() => {});
          }
        }}
        className="sticky top-0 z-30 px-5 py-3 glass-panel select-none"
        style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
      >
        <div className="max-w-[1440px] mx-auto flex items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <motion.img
              whileHover={{ rotate: -4, scale: 1.06 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              src="/hayye-icon.png"
              alt="Hayye Market"
              className="w-10 h-10 rounded-xl shadow-lg"
              style={{ border: '1px solid var(--border-strong)' }}
            />
            <div>
              <div className="font-editorial text-2xl leading-none tracking-tight">Hayye Market</div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono-num" style={{ color: 'var(--muted)' }}>
                <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                  CANLI
                </span>
                <span>$ {rates.usd_try.toFixed(2)}</span>
                <span>Au {Math.round(rates.gold_gram_try)}₺</span>
              </div>
            </div>
          </div>

          {/* Centered Floating Search Pill */}
          <div className="relative flex-1 max-w-2xl mx-auto">
            <form onSubmit={handleSearchOrUrl} className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-4 pointer-events-none" style={{ color: 'var(--muted)' }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara (Zara, Flaw, RTX 5070, Dyson...) veya link yapıştır  ⌘K"
                className="w-full rounded-full pl-11 pr-28 py-2.5 text-sm focus:outline-none transition"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="submit"
                disabled={searching}
                className="absolute right-1.5 px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--ink)', color: 'var(--bg)' }}
              >
                {searching ? 'Arıyor...' : query.startsWith('http') ? 'Ekle' : 'Ara'}
              </motion.button>
            </form>

            <AnimatePresence>
              {showCandidates && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute left-0 right-0 top-13 z-50 rounded-3xl glass-card shadow-2xl overflow-hidden max-h-[62vh] overflow-y-auto"
                  style={{ background: 'var(--surface-solid)' }}
                >
                  <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                    <span>Canlı Türkiye Piyasa Sonuçları ({candidates.length})</span>
                    <div className="flex items-center gap-2">
                      {query.trim().length >= 2 && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const msg = await api.deepSearchViaWebview(query.trim());
                              notify(msg);
                            } catch (e) {
                              notify(String(e));
                            }
                          }}
                          className="px-3 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
                        >
                          <Zap className="w-3 h-3" /> Derin Tara (Trendyol • Zara • Sahibinden)
                        </button>
                      )}
                      <button onClick={() => setShowCandidates(false)} className="cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {searching ? (
                    <div className="p-8 text-center text-xs" style={{ color: 'var(--muted)' }}>
                      Akakçe, Amazon TR ve Vatan canlı taranıyor...
                    </div>
                  ) : candidates.length === 0 ? (
                    <div className="p-8 text-center text-xs" style={{ color: 'var(--muted)' }}>
                      Sonuç bulunamadı. Doğrudan ürün linki de yapıştırabilirsin.
                    </div>
                  ) : (
                    <div>
                      {candidates.map((c, idx) => (
                        <div
                          key={idx}
                          onClick={() => handlePickCandidate(c)}
                          className="px-5 py-3.5 flex items-center gap-4 cursor-pointer transition"
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          {c.image_url ? (
                            <img src={c.image_url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{c.title}</div>
                            <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                              {c.store_name} • {c.source}
                            </div>
                          </div>
                          <div className="font-mono-num text-sm font-semibold shrink-0" style={{ color: 'var(--accent)' }}>
                            {fmtPrice(c.price_try)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Controls: Theme Swatch, Snapshot, Currency */}
          <div className="flex items-center gap-2 shrink-0 relative">
            {savedTotal > 0 && (
              <div
                className="hidden xl:flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-mono-num"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  color: 'var(--accent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {fmtTry(savedTotal)}
              </div>
            )}

            {/* Quick Theme Switcher */}
            <button
              onClick={() => setShowThemeMenu((v) => !v)}
              title="Canlı Tema Değiştir (Masaüstü + Eklenti + iOS)"
              className="px-3 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <Palette className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span className="hidden lg:inline">Tema</span>
            </button>

            <AnimatePresence>
              {showThemeMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="absolute right-0 top-12 w-64 p-2 rounded-2xl glass-card shadow-2xl z-50 space-y-1"
                  style={{ background: 'var(--surface-solid)' }}
                >
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTheme(t.id)}
                      className="w-full px-3 py-2 rounded-xl flex items-center gap-2.5 text-left cursor-pointer transition"
                      style={{
                        background: activeTheme === t.id ? 'var(--surface-2)' : 'transparent',
                        border: activeTheme === t.id ? '1px solid var(--accent)' : '1px solid transparent',
                      }}
                    >
                      <div className="flex -space-x-1">
                        {t.swatch.map((c, i) => (
                          <span key={i} className="w-4 h-4 rounded-full ring-1 ring-black/20" style={{ background: c }} />
                        ))}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{t.name}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{t.subtitle}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => {
                sound.playClick();
                setShowPalette(true);
              }}
              title="Komut Paleti: Mini HUD, Ses, Fiyat Dondur, Gizli Hediye (Ctrl+K)"
              className="px-3 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
              style={{
                background: showSecretOnly ? 'var(--accent)' : 'var(--surface-2)',
                color: showSecretOnly ? 'var(--accent-ink)' : 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: showSecretOnly ? 'var(--accent-ink)' : 'var(--accent)' }} />
              <span className="hidden lg:inline">{showSecretOnly ? 'Gizli Hediye' : 'Araçlar'}</span>
              <span className="text-[10px] font-mono-num opacity-65">⌘K</span>
            </button>

            <button
              onClick={cycleCurrency}
              title="TL / USD / Gram Altın geçişi"
              className="px-3.5 py-2 rounded-full font-mono-num text-xs font-semibold cursor-pointer transition"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {currency === 'GOLD' ? 'ALTIN' : currency}
            </button>

            {/* Integrated Theme-Matched Window Controls */}
            <div className="w-px h-5 mx-1" style={{ background: 'var(--border-strong)' }} />
            <div className="flex items-center gap-1">
              <button
                onClick={() => api.windowMinimize().catch(() => {})}
                title="Küçült"
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition hover:opacity-100 opacity-75"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => api.windowToggleMaximize().catch(() => {})}
                title="Büyüt / Geri Yükle"
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition hover:opacity-100 opacity-75"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              >
                <Square className="w-3 h-3" />
              </button>
              <button
                onClick={() => api.windowClose().catch(() => {})}
                title="Kapat"
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition hover:bg-rose-500/85 hover:text-white hover:border-rose-400/60 opacity-85 hover:opacity-100"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="relative z-10 max-w-[1440px] w-full mx-auto px-6 pt-7 flex-1">
        {/* Hero Strip & Folder Pills */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <motion.h1
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="font-editorial text-4xl sm:text-5xl leading-none"
            >
              {activeTab === 'discover' && 'Keşfet — Gerçek İndirim Akışı'}
              {activeTab === 'stage' && 'Sahne — İstanbul Etkinlik & Konser Radarı'}
              {activeTab === 'gallery' && 'Koleksiyon & Lookbook'}
              {activeTab === 'radar' && 'Canlı Fırsat Radarı'}
              {activeTab === 'shared' && 'Metehan × İlayda Ortak Pano'}
              {activeTab === 'moodboard' && 'Kombin & Ev Moodboard'}
              {activeTab === 'orders' && 'Siparişler & 14 Gün Koruması'}
            </motion.h1>
            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              {activeTab === 'discover' &&
                `${discoverItems.length} doğrulanmış canlı düşüş • Anti-çöp filtreli, sahte bindirimden arındırılmış fırsatlar.`}
              {activeTab === 'stage' &&
                `${events.length} canlı İstanbul etkinliği • Kişisel sanatçı radarı aktif, kara liste filtrelendi • Metehan × İlayda ortak oylama.`}
              {activeTab === 'gallery' &&
                `${folderProducts.length} takip edilen parça • Sepet Sıfır ${fmtPrice(basketTotals.newSum)}${
                  basketTotals.diff > 0 ? ` • 2. El Karma ile ${fmtPrice(basketTotals.diff)} tasarruf` : ''
                }`}
              {activeTab === 'radar' &&
                'Gerçek dip yapanlar, stoğa dönen bedenler, ucuz 2. el fırsatları ve 14 gün iade düşüşleri.'}
              {activeTab === 'shared' &&
                'İkiniz de telefondan/PC’den tek dokunuşla Al / Bekle / Pas oyu verin; bütçe çubuğu canlı güncellenir.'}
              {activeTab === 'moodboard' &&
                `Görsel stil & bütçe kolajı • ${moodProducts.length} parça toplam: ${fmtPrice(
                  moodProducts.reduce((a, b) => a + (b.best_new_try || 0), 0)
                )}`}
              {activeTab === 'orders' &&
                'Aldığın ürün 14 gün içinde ucuzlarsa anında iade + yeniden alım kârını hesaplar.'}
            </p>
          </div>

          {(activeTab === 'gallery' || activeTab === 'shared') && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {[
                { id: null as number | null, name: 'Tümü', count: products.length },
                ...folders.map((f) => ({ id: f.id as number | null, name: f.name, count: f.item_count })),
              ].map((item) => {
                const isAct = activeFolder === item.id;
                return (
                  <button
                    key={String(item.id)}
                    onClick={() => setActiveFolder(item.id)}
                    className="relative px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer shrink-0 transition"
                    style={{ color: isAct ? 'var(--bg)' : 'var(--muted)' }}
                  >
                    {isAct && (
                      <motion.span
                        layoutId="folder-active-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        className="absolute inset-0 rounded-full -z-10"
                        style={{ background: 'var(--ink)' }}
                      />
                    )}
                    {!isAct && (
                      <span
                        className="absolute inset-0 rounded-full -z-10"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      />
                    )}
                    {item.name} ({item.count})
                  </button>
                );
              })}

              {newFolderOpen ? (
                <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Koleksiyon..."
                    className="rounded-full px-3 py-1 text-xs focus:outline-none w-32"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                  />
                  <button
                    type="submit"
                    className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setNewFolderOpen(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shrink-0"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                  title="Yeni Koleksiyon"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Free Shipping Bundle Opportunity Strip */}
        {activeTab === 'gallery' && shippingBundles.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {shippingBundles.map((b) => (
              <div
                key={b.store}
                className="px-3.5 py-2 rounded-2xl glass-card text-xs flex items-center gap-2"
              >
                <Truck className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>
                  <strong>{b.store}</strong> ({b.count} ürün • {fmtTry(b.total)}):{' '}
                  {b.missing === 0
                    ? 'Ücretsiz kargo eşiğini geçtin ✓'
                    : `Ücretsiz kargo için ${fmtTry(b.missing)} kaldı`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Shared Monthly Budget Bar */}
        {activeTab === 'shared' && (
          <div className="mb-6 p-4 rounded-3xl glass-card flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
              >
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold">Ortak Aylık Bütçe Çubuğu</div>
                <div className="text-[11px] font-mono-num" style={{ color: 'var(--muted)' }}>
                  Onaylanan / Alınan: <strong style={{ color: 'var(--ink)' }}>{fmtTry(committedSharedSpend)}</strong> /{' '}
                  {fmtTry(monthlyBudget)}
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-[220px] max-w-md">
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (committedSharedSpend / Math.max(1, monthlyBudget)) * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                  className="h-full rounded-full"
                  style={{
                    background: committedSharedSpend > monthlyBudget ? 'var(--danger)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Moodboard Selector Strip */}
        {activeTab === 'moodboard' && products.length > 0 && (
          <div className="mb-6 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Panoya Ekle/Çıkar:</span>
            {products.map((p) => {
              const pinned = moodIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleMood(p.id)}
                  className="px-3 py-1.5 rounded-full text-xs shrink-0 cursor-pointer transition"
                  style={{
                    background: pinned ? 'var(--accent)' : 'var(--surface-2)',
                    color: pinned ? 'var(--accent-ink)' : 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {pinned ? '✓ ' : '+ '}
                  {p.title.slice(0, 26)}
                </button>
              );
            })}
          </div>
        )}

        {/* Stage & Live Events View */}
        {activeTab === 'stage' ? (
          <div className="space-y-6">
            {/* Search & Quick Ticket Portals */}
            <div className="p-3 rounded-3xl glass-card flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                <input
                  value={stageQuery}
                  onChange={(e) => setStageQuery(e.target.value)}
                  placeholder="Sanatçı, oyun veya mekan ara (örn. Joker, Hidra, DKTT, Zorlu, Kadıköy)..."
                  className="w-full rounded-full pl-9 pr-3 py-2 text-xs focus:outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {[
                  { label: 'Bubilet ↗', url: 'https://www.bubilet.com.tr/istanbul' },
                  { label: 'Biletix ↗', url: 'https://www.biletix.com/anasayfa/TURKIYE/tr' },
                  { label: 'Passo ↗', url: 'https://www.passo.com.tr/tr/kategori/muzik-konser-festival-biletleri/8615' },
                  { label: 'Paribu Pass ↗', url: 'https://www.paribucineverse.com' },
                  { label: 'Zorlu PSM ↗', url: 'https://www.zorlupsm.com/tr/etkinlikler' },
                ].map((site) => (
                  <button
                    key={site.label}
                    onClick={() => api.openExternal(site.url)}
                    className="px-3 py-1.5 rounded-full cursor-pointer transition"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                  >
                    {site.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage Category Pills & Refresh */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {(
                  [
                    { id: 'all', label: `🎟 Tümü (${events.length})` },
                    { id: 'radar', label: `✦ Radarım (${radarEventCount})` },
                    { id: 'konser', label: '🎤 Konser & Müzik' },
                    { id: 'tiyatro', label: '🎭 Tiyatro' },
                    { id: 'standup', label: '🎙 Stand-Up' },
                    { id: 'tickets', label: `✓ Biletlerim (${events.filter((e) => e.ticket_bought).length})` },
                  ] as const
                ).map((c) => {
                  const act = stageCat === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setStageCat(c.id)}
                      className="px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer shrink-0 transition"
                      style={{
                        background: act ? 'var(--ink)' : 'var(--surface-2)',
                        color: act ? 'var(--bg)' : 'var(--muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    try {
                      sound.playClick();
                      const msg = await api.scanEventsViaWebview();
                      notify(msg);
                    } catch (e) {
                      notify(String(e));
                    }
                  }}
                  className="px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Arka Planda Tara (Bubilet • Biletix • Passo • Zorlu)
                </button>
                <button
                  onClick={loadEvents}
                  disabled={eventsLoading}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${eventsLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--accent)' }} />
                  {eventsLoading ? 'Taranıyor...' : 'Canlı Yenile'}
                </button>
              </div>
            </div>

            {eventsLoading && events.length === 0 ? (
              <div className="rounded-3xl glass-card py-20 text-center text-xs" style={{ color: 'var(--muted)' }}>
                Biletinial ve Mobilet İstanbul etkinlikleri canlı taranıyor, kara liste temizleniyor...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="rounded-3xl glass-card py-16 text-center text-xs" style={{ color: 'var(--muted)' }}>
                Bu filtrede etkinlik bulunamadı. Tümünü görebilir veya üstteki Bubilet/Biletix/Passo kısayollarından Brave eklentisiyle ekleyebilirsin.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredEvents.map((ev, idx) => {
                  const bothGo = ev.vote_metehan === 'go' && ev.vote_ilayda === 'go';
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 28, delay: Math.min(idx * 0.02, 0.2) }}
                      whileHover={{ y: -5 }}
                      className="rounded-3xl glass-card overflow-hidden flex flex-col"
                      style={{
                        border: ev.matches_radar ? '1px solid color-mix(in srgb, var(--accent) 55%, transparent)' : undefined,
                      }}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                        {ev.image_url ? (
                          <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-20">
                            <Ticket className="w-10 h-10" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/35" />
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 text-white/90 border border-white/15">
                            {ev.source} • {ev.category === 'concert' ? 'Konser' : ev.category === 'theater' ? 'Tiyatro' : ev.category === 'standup' ? 'Stand-Up' : ev.category === 'festival' ? 'Festival' : ev.category}
                          </span>
                          {ev.matches_radar && (
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                            >
                              ✦ RADARIM
                            </span>
                          )}
                          {ev.ticket_bought && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/90 text-black">
                              🎟 BİLET ALINDI
                            </span>
                          )}
                          {bothGo && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/90 text-black">
                              ♥ İKİMİZ DE GİDELİM
                            </span>
                          )}
                        </div>
                        <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-end justify-between gap-2 text-white">
                          <span className="text-[11px] font-mono-num font-semibold truncate">
                            {ev.date_label || ev.city}
                          </span>
                          {ev.price_label && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-num bg-black/60 border border-white/15 shrink-0">
                              {ev.price_label}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col gap-3">
                        <div>
                          <div className="text-sm font-semibold line-clamp-2 leading-snug">{ev.title}</div>
                          <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--muted)' }}>
                            {ev.venue || ev.city}
                          </div>
                        </div>

                        {/* Shared Metehan x Ilayda Event Voting */}
                        <div className="space-y-1.5 pt-2 text-[11px]" style={{ borderTop: '1px solid var(--border)' }}>
                          {(['metehan', 'ilayda'] as const).map((who) => {
                            const cur = who === 'metehan' ? ev.vote_metehan : ev.vote_ilayda;
                            return (
                              <div key={who} className="flex items-center justify-between gap-2">
                                <span style={{ color: 'var(--muted)' }}>{who === 'ilayda' ? 'İlayda' : 'Metehan'}</span>
                                <div className="flex gap-1">
                                  {(
                                    [
                                      { id: 'go', label: 'Gidelim', c: '#10B981', bg: 'rgba(16,185,129,0.18)' },
                                      { id: 'maybe', label: 'Belki', c: '#F59E0B', bg: 'rgba(245,158,11,0.16)' },
                                      { id: 'pass', label: 'Pas', c: '#F43F5E', bg: 'rgba(244,63,94,0.16)' },
                                    ] as const
                                  ).map((opt) => {
                                    const act = cur === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        onClick={() => handleEventVote(ev.id, who, act ? '' : opt.id, null)}
                                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition"
                                        style={{
                                          background: act ? opt.bg : 'transparent',
                                          color: act ? opt.c : 'var(--muted)',
                                          border: `1px solid ${act ? opt.c : 'var(--border)'}`,
                                        }}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-auto pt-2 flex items-center gap-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={() => api.openExternal(ev.url)}
                            className="flex-1 py-2 px-2.5 rounded-xl text-[11px] font-bold cursor-pointer transition flex items-center justify-center gap-1"
                            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                          >
                            <Zap className="w-3 h-3" /> Bilet Ekranı
                          </button>
                          <button
                            onClick={() => handleEventVote(ev.id, 'metehan', ev.vote_metehan, !ev.ticket_bought)}
                            className="py-2 px-3 rounded-xl text-[11px] font-semibold cursor-pointer transition"
                            style={{
                              background: ev.ticket_bought
                                ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                                : 'var(--surface-2)',
                              color: ev.ticket_bought ? 'var(--accent)' : 'var(--ink)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {ev.ticket_bought ? 'Alındı ✓' : 'Aldım'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'discover' ? (
          <div className="space-y-6">
            {/* Price Range + Keyword Live Filter & Market Search */}
            <form
              onSubmit={handleDiscoverRangeSearch}
              className="p-3 rounded-3xl glass-card flex flex-wrap items-center gap-2.5"
            >
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                <input
                  value={discoverQuery}
                  onChange={(e) => setDiscoverQuery(e.target.value)}
                  placeholder="Keşfette filtrele veya canlı ara (örn. kulaklık, parfüm, airfryer)..."
                  className="w-full rounded-full pl-9 pr-3 py-2 text-xs focus:outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                />
              </div>
              <input
                type="number"
                value={discoverMin}
                onChange={(e) => setDiscoverMin(e.target.value)}
                placeholder="Min ₺"
                className="w-28 rounded-full px-3.5 py-2 text-xs font-mono-num focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              <input
                type="number"
                value={discoverMax}
                onChange={(e) => setDiscoverMax(e.target.value)}
                placeholder="Max ₺"
                className="w-28 rounded-full px-3.5 py-2 text-xs font-mono-num focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              <button
                type="submit"
                disabled={discoverLoading || !discoverQuery.trim()}
                className="px-4 py-2 rounded-full text-xs font-bold cursor-pointer disabled:opacity-45 shrink-0"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Bu Aralıkta Canlı Ara
              </button>
              {(discoverQuery || discoverMin || discoverMax) && (
                <button
                  type="button"
                  onClick={() => {
                    setDiscoverQuery('');
                    setDiscoverMin('');
                    setDiscoverMax('');
                  }}
                  className="px-3 py-2 rounded-full text-xs cursor-pointer"
                  style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
                >
                  Temizle
                </button>
              )}
            </form>

            {/* Discover Category Pills & Refresh */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {(
                  [
                    { id: 'all', label: '🔥 En Sıcaklar' },
                    { id: 'personal', label: '✦ Sana Özel' },
                    { id: 'flash', label: '⚡ Flaş / %25+' },
                    { id: 'tech', label: '💻 Teknoloji & PC' },
                    { id: 'fashion', label: '🧥 Giyim & Sneaker' },
                    { id: 'cosmetics', label: '✨ Kozmetik' },
                    { id: 'home', label: '🍳 Ev & Mutfak' },
                  ] as const
                ).map((c) => {
                  const act = discoverCat === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setDiscoverCat(c.id)}
                      className="px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer shrink-0 transition"
                      style={{
                        background: act ? 'var(--ink)' : 'var(--surface-2)',
                        color: act ? 'var(--bg)' : 'var(--muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={loadDiscover}
                disabled={discoverLoading}
                className="px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${discoverLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--accent)' }} />
                {discoverLoading ? 'Taranıyor...' : 'Canlı Yenile'}
              </button>
            </div>

            {/* Season & Campaign Calendar Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {upcomingCampaigns.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-2xl glass-card space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                      <Calendar className="w-3 h-3" /> {ev.badge}
                    </span>
                    <span className="font-mono-num font-bold" style={{ color: 'var(--ink)' }}>
                      {ev.daysLeft === 0 ? 'BUGÜN!' : `${ev.daysLeft} gün`}
                    </span>
                  </div>
                  <div className="text-xs font-semibold leading-snug">{ev.title}</div>
                  <div className="text-[10px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                    {ev.advice}
                  </div>
                </div>
              ))}
            </div>

            {/* Archive of Missed Big Drops */}
            {archiveDeals.length > 0 && discoverCat === 'all' && (
              <div className="p-3.5 rounded-2xl glass-card flex items-center gap-3 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--muted)' }}>
                  Son Kaydedilen Büyük Düşüşler:
                </span>
                {archiveDeals.slice(0, 6).map((a) => (
                  <button
                    key={a.deal_id}
                    onClick={() => api.openExternal(a.url)}
                    className="px-3 py-1 rounded-full text-[11px] shrink-0 cursor-pointer flex items-center gap-1.5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <span className="font-mono-num font-bold" style={{ color: 'var(--accent)' }}>
                      -%{Math.round(a.drop_pct)}
                    </span>
                    <span className="max-w-[160px] truncate">{a.title}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Top 5 Biggest Drops Showcase Strip */}
            {discoverCat === 'all' && top5Drops.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                  ✦ Günün En Büyük 5 Gerçek Düşüşü
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                  {top5Drops.map((d) => (
                    <motion.div
                      key={d.id}
                      whileHover={{ y: -4 }}
                      className="rounded-2xl glass-card overflow-hidden flex flex-col cursor-pointer"
                      onClick={() => api.openExternal(d.url)}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                        {d.image_url && <img src={d.image_url} alt="" className="w-full h-full object-cover" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
                        <span
                          className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono-num font-bold"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          -%{Math.round(d.drop_pct)}
                        </span>
                        <div className="absolute bottom-2.5 left-3 right-3 font-mono-num text-base font-bold text-white">
                          {fmtPrice(d.price_try)}
                        </div>
                      </div>
                      <div className="p-3 text-xs font-medium line-clamp-2 leading-snug">{d.title}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Main Discover Editorial Grid */}
            {discoverLoading && discoverItems.length === 0 ? (
              <div className="rounded-3xl glass-card py-20 text-center text-xs" style={{ color: 'var(--muted)' }}>
                Canlı Türkiye indirim kaynakları taranıyor ve sahte indirimler eleniyor...
              </div>
            ) : filteredDiscover.length === 0 ? (
              <div className="rounded-3xl glass-card py-16 text-center text-xs" style={{ color: 'var(--muted)' }}>
                Bu kategoride şu an eşleşen canlı düşüş yok. “En Sıcaklar” sekmesine bakabilir veya Yenile’ye basabilirsin.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredDiscover.map((d, idx) => (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28, delay: Math.min(idx * 0.02, 0.2) }}
                    whileHover={{ y: -5 }}
                    className="rounded-3xl glass-card overflow-hidden flex flex-col"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      {d.image_url ? (
                        <img src={d.image_url} alt={d.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-20">
                          <ShoppingBag className="w-10 h-10" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-mono-num font-bold"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          -%{Math.round(d.drop_pct)} GERÇEK DÜŞÜŞ
                        </span>
                        {d.matches_personal && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/60 text-amber-300 border border-amber-400/40">
                            ✦ SANA ÖZEL
                          </span>
                        )}
                      </div>
                      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-mono-num bg-black/55 text-white/90 border border-white/15">
                        Isı {d.heat_score}
                      </span>
                      <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                        <div className="font-mono-num text-xl font-bold text-white drop-shadow">
                          {fmtPrice(d.price_try)}
                        </div>
                        <span className="text-[10px] text-white/80 font-mono-num">+{d.offer_count} satıcı</span>
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <div className="text-sm font-medium line-clamp-2 leading-snug">{d.title}</div>
                      <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                        {d.brand || 'Piyasa'} • {d.source}
                      </div>
                      <div className="mt-auto pt-2 flex items-center gap-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                        <button
                          onClick={() => handleSaveDiscover(d, false)}
                          className="flex-1 py-2 px-2.5 rounded-xl text-[11px] font-bold cursor-pointer transition"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          + Koleksiyon
                        </button>
                        <button
                          onClick={() => handleSaveDiscover(d, true)}
                          className="flex-1 py-2 px-2.5 rounded-xl text-[11px] font-semibold cursor-pointer transition"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                        >
                          ♥ İlayda’ya Sor
                        </button>
                        <button
                          onClick={() => api.openExternal(d.url)}
                          className="p-2 rounded-xl cursor-pointer"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                          title="Mağazaya Git"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : displayedList.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="rounded-3xl glass-card py-20 px-6 text-center max-w-xl mx-auto mt-10"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                color: 'var(--accent)',
                border: '1px solid var(--border)',
              }}
            >
              {activeTab === 'radar' ? (
                <Flame className="w-6 h-6" />
              ) : activeTab === 'orders' ? (
                <Package className="w-6 h-6" />
              ) : (
                <Sparkles className="w-6 h-6" />
              )}
            </div>
            <div className="font-editorial text-3xl">
              {activeTab === 'radar'
                ? 'Şu an acil fırsat yok'
                : activeTab === 'orders'
                ? 'Henüz “Aldım” dediğin ürün yok'
                : 'Koleksiyonun henüz boş'}
            </div>
            <p className="text-xs mt-2 leading-relaxed max-w-sm mx-auto" style={{ color: 'var(--muted)' }}>
              {activeTab === 'radar'
                ? 'Gerçek fiyat düşüşü, stoğa dönen beden veya 14 gün iade fırsatı yakalandığında otomatik buraya düşer.'
                : activeTab === 'orders'
                ? 'Bir ürüne tıklayıp “Aldım (14 Gün Koru)” dediğinde burada geri sayımla takip edilir.'
                : 'Yukarıdaki arama çubuğuna bir ürün adı yaz (örn. MacBook Air M4, Ninja Blender) ya da Zara / Flaw / Amazon / Sahibinden linki yapıştır.'}
            </p>
          </motion.div>
        ) : (
          /* Spring-Animated Editorial Lookbook Grid */
          <div
            className={`grid gap-5 ${
              activeTab === 'moodboard'
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            }`}
          >
            {displayedList.map((p, idx) => {
              const isDip =
                p.discount_verdict.status === 'GENUINE_DIP' || p.discount_verdict.status === 'GENUINE_DROP';
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
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 320,
                    damping: 26,
                    delay: Math.min(idx * 0.035, 0.28),
                  }}
                  whileHover={{ y: -6, scale: 1.012 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setSelectedId(p.id)}
                  className="group rounded-3xl glass-card overflow-hidden cursor-pointer flex flex-col"
                >
                  {/* Hero Image */}
                  <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-20">
                        <ShoppingBag className="w-12 h-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />

                    {/* Top Left Badges */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-semibold backdrop-blur-md"
                        style={{
                          background: isDip
                            ? 'rgba(16,185,129,0.28)'
                            : isFake
                            ? 'rgba(244,63,94,0.28)'
                            : 'rgba(0,0,0,0.5)',
                          color: isDip ? '#6EE7B7' : isFake ? '#FDA4AF' : '#F5F2EB',
                          border: '1px solid rgba(255,255,255,0.16)',
                        }}
                      >
                        {p.discount_verdict.badge}
                      </span>
                      {bothBuy && (
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          İKİMİZ DE AL ✓
                        </span>
                      )}
                    </div>

                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] bg-black/50 backdrop-blur-md text-white/90 border border-white/15">
                      {p.folder_name}
                    </span>

                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                      <div>
                        <div className="font-mono-num text-xl font-bold text-white leading-none drop-shadow">
                          {p.best_new_try > 0 ? fmtPrice(p.best_new_try) : '—'}
                        </div>
                        {p.unit_price && (
                          <div className="text-[10px] font-mono-num text-emerald-300 mt-1">
                            10 {p.unit_price.unit}: {p.unit_price.price_per_10_try} ₺
                          </div>
                        )}
                      </div>
                      {p.best_used_try && (
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/25 border border-blue-400/40 backdrop-blur-md font-mono-num text-[10px] font-semibold text-blue-200">
                          2. El {fmtPrice(p.best_used_try)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <div className="text-sm font-medium line-clamp-2 leading-snug">{p.title}</div>

                    {snapDiffPct !== null && Math.abs(snapDiffPct) >= 1 && (
                      <div
                        className="text-[11px] font-mono-num px-2.5 py-1 rounded-xl w-fit"
                        style={{
                          background: snapDiffPct < 0 ? 'rgba(16,185,129,0.14)' : 'rgba(244,63,94,0.14)',
                          color: snapDiffPct < 0 ? 'var(--accent)' : 'var(--danger)',
                        }}
                      >
                        Snapshot’a göre {snapDiffPct > 0 ? '+' : ''}
                        {snapDiffPct.toFixed(1)}%
                      </div>
                    )}

                    {refundDaysLeft !== null && (
                      <div className="p-2.5 rounded-2xl space-y-1.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                            <Clock className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                            İade: <strong style={{ color: 'var(--ink)' }}>{refundDaysLeft} gün</strong>
                          </span>
                          <span className="font-mono-num" style={{ color: 'var(--muted)' }}>
                            Alış: {fmtTry(p.purchased_price_try || 0)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (refundDaysLeft / 14) * 100)}%`,
                              background: 'var(--accent)',
                            }}
                          />
                        </div>
                        {refundProfit > 25 && (
                          <div className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
                            ⚡ İade edip yeniden alırsan {fmtTry(refundProfit)} kâr!
                          </div>
                        )}
                      </div>
                    )}

                    {p.sizes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.sizes.slice(0, 6).map((s) => (
                          <span
                            key={s.size}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono-num ${!s.in_stock ? 'line-through opacity-45' : ''}`}
                            style={{
                              background: s.in_stock
                                ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                                : 'var(--surface-2)',
                              color: s.in_stock ? 'var(--accent)' : 'var(--muted)',
                            }}
                          >
                            {s.size}
                          </span>
                        ))}
                      </div>
                    )}

                    {activeTab === 'shared' ? (
                      <div
                        className="mt-auto pt-2.5 space-y-2"
                        style={{ borderTop: '1px solid var(--border)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(['metehan', 'ilayda'] as const).map((who) => {
                          const cur = who === 'metehan' ? p.vote_metehan : p.vote_ilayda;
                          return (
                            <div key={who} className="flex items-center justify-between gap-2 text-[11px]">
                              <span style={{ color: 'var(--muted)' }}>{who === 'ilayda' ? 'İlayda' : 'Metehan'}</span>
                              <div className="flex gap-1">
                                {(['buy', 'wait', 'pass'] as const).map((v) => {
                                  const vl = voteLabel(v);
                                  const act = cur === v;
                                  return (
                                    <button
                                      key={v}
                                      onClick={() => handleVote(p.id, who, act ? '' : v)}
                                      className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition"
                                      style={{
                                        background: act ? vl.bg : 'transparent',
                                        color: act ? vl.color : 'var(--muted)',
                                        border: `1px solid ${act ? vl.color : 'var(--border)'}`,
                                      }}
                                    >
                                      {vl.text}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {p.shared_note && (
                          <div className="text-[11px] italic truncate" style={{ color: 'var(--muted)' }}>
                            “{p.shared_note}”
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="mt-auto pt-2.5 flex items-center justify-between text-[11px]"
                        style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}
                      >
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                          Güven %{p.avg_trust_score}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {p.vote_metehan && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: mv.bg, color: mv.color }}>
                              M: {mv.text}
                            </span>
                          )}
                          {p.vote_ilayda && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: iv.bg, color: iv.color }}>
                              İ: {iv.text}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Floating Liquid Glass Pill Dock with Framer Motion layoutId */}
      <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-1 p-1.5 rounded-full glass-panel shadow-2xl">
          {(
            [
              { id: 'discover', label: 'Keşfet', icon: Compass, badge: 0 },
              { id: 'stage', label: 'Sahne', icon: Ticket, badge: radarEventCount },
              { id: 'gallery', label: 'Galeri', icon: LayoutGrid, badge: 0 },
              { id: 'radar', label: 'Radar', icon: Flame, badge: radarProducts.length },
              { id: 'shared', label: 'Ortak', icon: Users, badge: 0 },
              { id: 'moodboard', label: 'Moodboard', icon: Layers, badge: 0 },
              { id: 'orders', label: 'Sipariş', icon: Package, badge: purchasedProducts.length },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className="relative px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                style={{ color: active ? 'var(--bg)' : 'var(--muted)' }}
              >
                {active && (
                  <motion.span
                    layoutId="dock-active-pill"
                    transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                    className="absolute inset-0 rounded-full -z-10 shadow-md"
                    style={{ background: 'var(--ink)' }}
                  />
                )}
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span
                    className="px-1.5 rounded-full text-[10px] font-mono-num font-bold"
                    style={{
                      background: active ? 'rgba(0,0,0,0.18)' : 'color-mix(in srgb, var(--accent) 22%, transparent)',
                      color: active ? 'var(--bg)' : 'var(--accent)',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
          <div className="w-px h-5 mx-1" style={{ background: 'var(--border-strong)' }} />
          <button
            onClick={() => setShowSettings(true)}
            className="px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
            style={{ color: 'var(--muted)' }}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Ayarlar</span>
          </button>
        </div>
      </nav>

      {/* Spring-Animated Cinematic Product Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            onClick={() => setSelectedId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 14 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="w-full max-w-5xl max-h-[90vh] glass-card rounded-3xl overflow-hidden shadow-2xl flex flex-col"
              style={{
                background: `radial-gradient(circle at 18% 0%, ${modalAmbientGlow}, transparent 52%), var(--surface-solid)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-3 py-1 rounded-full text-[11px] shrink-0" style={{ background: 'var(--surface-2)' }}>
                    {selected.folder_name}
                  </span>
                  <span className="text-sm font-medium truncate">{selected.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRefresh(selected)}
                    disabled={refreshingId === selected.id}
                    className="px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
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
                    className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ background: 'rgba(244,63,94,0.14)', color: 'var(--danger)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    {selected.image_url ? (
                      <img src={selected.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-20">
                        <ShoppingBag className="w-16 h-16" />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => api.openExternal(selected.quick_checkout_url || selected.primary_url)}
                      className="py-3 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                    >
                      <Zap className="w-4 h-4" />
                      Hızlı Alım / Sepet
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleMarkPurchased(selected)}
                      className="py-3 px-4 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      style={{
                        background:
                          selected.purchased_price_try !== null
                            ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                            : 'var(--surface-2)',
                        color: selected.purchased_price_try !== null ? 'var(--accent)' : 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Package className="w-4 h-4" />
                      {selected.purchased_price_try !== null ? '14 Gün Korumada ✓' : 'Aldım (14 Gün Koru)'}
                    </motion.button>
                  </div>

                  {/* Inditex Wave & SINT Timing Card */}
                  {waveInfo && (
                    <div className="p-3.5 rounded-2xl space-y-1" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)' }}>
                      <div className="text-[11px] font-bold" style={{ color: 'var(--accent)' }}>
                        ✦ {waveInfo.wave}
                      </div>
                      <div className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                        {waveInfo.advice}
                      </div>
                    </div>
                  )}

                  {/* Collaborative Voting */}
                  <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />
                      Metehan × İlayda Ortak Karar
                    </div>
                    {(['metehan', 'ilayda'] as const).map((who) => {
                      const cur = who === 'metehan' ? selected.vote_metehan : selected.vote_ilayda;
                      return (
                        <div key={who} className="flex items-center justify-between text-xs">
                          <span style={{ color: 'var(--muted)' }}>{who === 'ilayda' ? 'İlayda' : 'Metehan'}</span>
                          <div className="flex gap-1.5">
                            {(['buy', 'wait', 'pass'] as const).map((v) => {
                              const vl = voteLabel(v);
                              const act = cur === v;
                              return (
                                <button
                                  key={v}
                                  onClick={() => handleVote(selected.id, who, act ? '' : v)}
                                  className="px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition"
                                  style={{
                                    background: act ? vl.bg : 'transparent',
                                    color: act ? vl.color : 'var(--muted)',
                                    border: `1px solid ${act ? vl.color : 'var(--border)'}`,
                                  }}
                                >
                                  {vl.text}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex gap-2 pt-1">
                      <input
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Kısa ortak not..."
                        className="flex-1 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                      />
                      <button
                        onClick={() => {
                          handleVote(selected.id, 'metehan', selected.vote_metehan, noteInput);
                          notify('Ortak not kaydedildi.');
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                        style={{ background: 'var(--ink)', color: 'var(--bg)' }}
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>

                  {selected.sizes.length > 0 && (
                    <div className="p-4 rounded-2xl space-y-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div className="text-xs font-semibold">Beden Stok Takibi (Alarm için tıkla)</div>
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
                              className={`px-3 py-1 rounded-full text-xs font-mono-num cursor-pointer transition ${
                                !s.in_stock && !tracked ? 'line-through opacity-50' : ''
                              }`}
                              style={{
                                background: tracked
                                  ? 'var(--accent)'
                                  : s.in_stock
                                  ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                                  : 'transparent',
                                color: tracked ? 'var(--accent-ink)' : s.in_stock ? 'var(--accent)' : 'var(--muted)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {s.size}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Clean 3-Tab Layout */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Modal Right Sub-Tabs */}
                  <div className="flex items-center gap-1.5 p-1 rounded-full w-fit" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    {(
                      [
                        { id: 'overview', label: 'Fiyat, Grafik & Mağaza' },
                        { id: 'vault', label: 'Kasa, Dolap & Yurt Dışı' },
                        { id: 'used', label: `2. El & AI (${selected.used_listings.length})` },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          sound.playClick();
                          setModalTab(t.id);
                        }}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition"
                        style={{
                          background: modalTab === t.id ? 'var(--ink)' : 'transparent',
                          color: modalTab === t.id ? 'var(--bg)' : 'var(--muted)',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {modalTab === 'overview' && (
                    <div className="space-y-4">
                  <div className="p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                        En Ucuz Sıfır Piyasa
                      </div>
                      <div className="font-mono-num text-3xl font-bold mt-1">
                        {selected.best_new_try > 0 ? (
                          currency === 'TRY' ? (
                            <OdometerPrice value={selected.best_new_try} currency="TRY" />
                          ) : (
                            fmtPrice(selected.best_new_try)
                          )
                        ) : (
                          '—'
                        )}
                      </div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                        {selected.discount_verdict.explanation}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <Bell className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                        <input
                          value={targetInput}
                          onChange={(e) => setTargetInput(e.target.value)}
                          placeholder="Hedef ₺"
                          className="w-20 bg-transparent text-xs font-mono-num focus:outline-none"
                          style={{ color: 'var(--ink)' }}
                        />
                      </div>
                      <button
                        onClick={async () => {
                          const v = targetInput.trim() ? Number(targetInput) : null;
                          await api.setTargetPrice(selected.id, v);
                          await loadAll();
                          notify(v ? `Hedef fiyat ${fmtTry(v)} olarak ayarlandı.` : 'Hedef fiyat temizlendi.');
                        }}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                        style={{ background: 'var(--ink)', color: 'var(--bg)' }}
                      >
                        Alarm Kur
                      </button>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="p-4 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                        Fiyat Geçmişi ({currency === 'GOLD' ? 'TRY' : currency})
                      </span>
                      <span className="text-[11px] font-mono-num" style={{ color: 'var(--muted)' }}>
                        Dip: {fmtPrice(selected.discount_verdict.min_all_try)} • Ort:{' '}
                        {fmtPrice(selected.discount_verdict.avg_30d_try)}
                      </span>
                    </div>
                    <PriceChart
                      history={selected.history}
                      currency={currency === 'USD' ? 'USD' : 'TRY'}
                      targetPriceTry={selected.target_price_try}
                      currentUsdRate={rates.usd_try}
                    />
                  </div>

                  {/* Installment + TR Bank Cards */}
                  {selected.best_new_try > 0 && (
                    <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" style={{ color: 'var(--accent-2)' }} />
                          Taksit, Kargo & Kart Kampanyası
                        </span>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                          <span>Kargo ₺:</span>
                          <input
                            type="number"
                            value={shippingCost}
                            onChange={(e) => setShippingCost(Number(e.target.value) || 0)}
                            className="w-16 rounded-lg px-2 py-0.5 font-mono-num"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                          />
                          <span>Aylık %:</span>
                          <input
                            type="number"
                            step="0.2"
                            value={installmentRate}
                            onChange={(e) => setInstallmentRate(Number(e.target.value) || 0)}
                            className="w-14 rounded-lg px-2 py-0.5 font-mono-num"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
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
                              className="p-2.5 rounded-xl text-center"
                              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                            >
                              <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                                {m === 1 ? 'Peşin' : `${m} Taksit`}
                              </div>
                              <div className="font-mono-num text-xs font-bold mt-0.5">
                                {fmtTry(monthly)}
                                {m > 1 ? '/ay' : ''}
                              </div>
                              <div className="font-mono-num text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
                                Top: {fmtTry(total)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {userCards && (
                        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                          Kartların ({userCards}): Peşin fiyatına 3 taksit / puan kampanyasını ödeme öncesi BonusFlaş / World Mobil’den aktive etmeyi unutma.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Retail Offers (in Overview Tab) */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold">Mağaza Teklifleri ({selected.offers.length})</div>
                    {selected.offers.map((o) => (
                      <div
                        key={o.id}
                        className="px-4 py-3 rounded-2xl flex items-center justify-between gap-3"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold">{o.store_name}</div>
                          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                            {o.seller_name} • Güven %{o.trust_score}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono-num text-sm font-bold" style={{ color: 'var(--accent)' }}>
                            {fmtPrice(o.price_try + o.shipping_try)}
                          </span>
                          <button
                            onClick={() => api.openExternal(o.url)}
                            className="p-2 rounded-full cursor-pointer"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                    </div>
                  )}

                  {/* Vault Tab: Cargo, 2Y Warranty, Digital Closet CPW, Batch/Dupe, Secret Gift & Glocalzone/Grabr Travel */}
                  {modalTab === 'vault' && (
                  <div className="p-4 rounded-2xl space-y-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                        Kargo, Garanti Kasası, Dolap (CPW) & Yurt Dışı
                      </span>
                      <button
                        onClick={async () => {
                          const next = !selected.is_secret_gift;
                          await api.updateVaultMeta({ product_id: selected.id, is_secret_gift: next });
                          sound.playToggle(next);
                          await loadAll();
                          notify(next ? 'Gizli Sürpriz Hediye kasasına alındı (İlayda göremez).' : 'Gizli hediye işareti kaldırıldı.');
                        }}
                        className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                        style={{
                          background: selected.is_secret_gift ? 'var(--accent)' : 'var(--bg)',
                          color: selected.is_secret_gift ? 'var(--accent-ink)' : 'var(--muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <Gift className="w-3 h-3" />
                        {selected.is_secret_gift ? 'Gizli Hediye ✓' : 'Gizli Hediye Yap'}
                      </button>
                    </div>

                    {/* Digital Closet CPW & 2nd-Hand Resale Assistant */}
                    <div className="p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <Shirt className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                        <div>
                          <div className="font-semibold">
                            Dijital Dolap: {selected.wear_count} kez kullanıldı
                          </div>
                          <div className="text-[10px] font-mono-num" style={{ color: 'var(--muted)' }}>
                            {selected.wear_count > 0 && selected.best_new_try > 0
                              ? `Kullanım başı maliyet: ${fmtTry((selected.purchased_price_try || selected.best_new_try) / selected.wear_count)}`
                              : 'Giyim/kullanım sayacını artırdıkça gerçek maliyet düşer'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            await api.incrementWearCount(selected.id, 1);
                            sound.playClick();
                            await loadAll();
                          }}
                          className="px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          +1 Kullanım
                        </button>
                        <button
                          onClick={() => {
                            const fair = Math.round(((selected.best_new_try || 1000) * 0.68) / 50) * 50;
                            navigator.clipboard.writeText(
                              `${selected.title} — Temiz kullanıldı (${selected.wear_count} kullanım). Güncel sıfırı ${fmtTry(selected.best_new_try)}. Adil fiyat: ${fmtTry(fair)}, Param Güvende ile kargolanır.`
                            );
                            sound.playChime();
                            notify(`2. Elde Sat ilan metni kopyalandı (Öneri: ${fmtTry(fair)}).`);
                          }}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                        >
                          2. Elde Sat ↗
                        </button>
                      </div>
                    </div>

                    {/* Cargo + 2Y Warranty + Batch + Foreign EUR inputs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                      <select
                        value={vaultDraft.cargo_company}
                        onChange={(e) => setVaultDraft({ ...vaultDraft, cargo_company: e.target.value })}
                        className="rounded-xl px-2.5 py-1.5"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                      >
                        {['HepsiJet', 'Yurtiçi Kargo', 'Trendyol Express', 'Kolay Gelsin', 'Aras Kargo', 'MNG Kargo'].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        placeholder="Kargo Takip No"
                        value={vaultDraft.cargo_tracking_no}
                        onChange={(e) => setVaultDraft({ ...vaultDraft, cargo_tracking_no: e.target.value })}
                        className="rounded-xl px-2.5 py-1.5 font-mono-num"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                      />
                      <input
                        placeholder="Fatura / Garanti Notu"
                        value={vaultDraft.receipt_note}
                        onChange={(e) => setVaultDraft({ ...vaultDraft, receipt_note: e.target.value })}
                        className="rounded-xl px-2.5 py-1.5"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                      />
                      <input
                        placeholder="Kozmetik Batch Code"
                        value={vaultDraft.batch_code}
                        onChange={(e) => setVaultDraft({ ...vaultDraft, batch_code: e.target.value })}
                        className="rounded-xl px-2.5 py-1.5 font-mono-num"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                      />
                      <input
                        type="number"
                        placeholder="Avrupa Fiyatı (€)"
                        value={vaultDraft.foreign_eur_price}
                        onChange={(e) => setVaultDraft({ ...vaultDraft, foreign_eur_price: e.target.value })}
                        className="rounded-xl px-2.5 py-1.5 font-mono-num"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                      />
                      <button
                        onClick={async () => {
                          await api.updateVaultMeta({
                            product_id: selected.id,
                            cargo_company: vaultDraft.cargo_company,
                            cargo_tracking_no: vaultDraft.cargo_tracking_no,
                            warranty_months: vaultDraft.warranty_months,
                            receipt_note: vaultDraft.receipt_note,
                            batch_code: vaultDraft.batch_code,
                            pao_months: vaultDraft.pao_months,
                            foreign_eur_price: vaultDraft.foreign_eur_price ? Number(vaultDraft.foreign_eur_price) : 0,
                          });
                          sound.playChime();
                          await loadAll();
                          notify('Kasa bilgileri kaydedildi.');
                        }}
                        className="rounded-xl px-3 py-1.5 font-semibold cursor-pointer"
                        style={{ background: 'var(--ink)', color: 'var(--bg)' }}
                      >
                        Kasayı Kaydet
                      </button>
                    </div>

                    {vaultDraft.cargo_tracking_no && (
                      <button
                        onClick={() => api.openExternal(getCargoTrackUrl(vaultDraft.cargo_company, vaultDraft.cargo_tracking_no))}
                        className="text-[11px] font-semibold hover:underline cursor-pointer"
                        style={{ color: 'var(--accent)' }}
                      >
                        📦 {vaultDraft.cargo_company} Canlı Kargo Takip ({vaultDraft.cargo_tracking_no}) ↗
                      </button>
                    )}

                    {/* Glocalzone / Grabr / Amazon.de / Idealo.de Travel-Carry Calculator */}
                    <div className="p-3.5 rounded-xl space-y-2.5 text-[11px]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent-2)' }}>
                          <Globe className="w-3.5 h-3.5" />
                          Yurt Dışı Yolcu Beraberi (Glocalzone / Grabr / Seyahat)
                        </span>
                        <label className="flex items-center gap-1 cursor-pointer" style={{ color: 'var(--muted)' }}>
                          <input
                            type="checkbox"
                            checked={travelTaxFree}
                            onChange={(e) => setTravelTaxFree(e.target.checked)}
                          />
                          Tax-Free (-%10)
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--muted)' }}>
                        <span>Yolcu Ödülü %:</span>
                        <input
                          type="number"
                          value={travelRewardPct}
                          onChange={(e) => setTravelRewardPct(Number(e.target.value) || 0)}
                          className="w-12 rounded-lg px-1.5 py-0.5 font-mono-num"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                        />
                        <span>Platform Hizmet %:</span>
                        <input
                          type="number"
                          value={travelServicePct}
                          onChange={(e) => setTravelServicePct(Number(e.target.value) || 0)}
                          className="w-12 rounded-lg px-1.5 py-0.5 font-mono-num"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                        />
                      </div>

                      {Number(vaultDraft.foreign_eur_price) > 0 && selected.best_new_try > 0 && (() => {
                        const eur = Number(vaultDraft.foreign_eur_price);
                        const selfEur = travelTaxFree ? eur * 0.9 : eur;
                        const selfTry = selfEur * rates.eur_try;
                        const glocalTry = eur * (1 + (travelRewardPct + travelServicePct) / 100) * rates.eur_try;
                        const isPhone = /iphone|galaxy s|pixel|telefon|xiaomi 1/i.test(selected.title);
                        return (
                          <div className="space-y-1.5 pt-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Kendi Seyahatinle</div>
                                <div className="font-mono-num font-bold text-xs">{fmtTry(selfTry)}</div>
                                <div className="text-[10px]" style={{ color: selected.best_new_try > selfTry ? 'var(--accent)' : 'var(--danger)' }}>
                                  TR farkı: {fmtTry(selected.best_new_try - selfTry)}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Glocalzone / Grabr Tahmini</div>
                                <div className="font-mono-num font-bold text-xs">{fmtTry(glocalTry)}</div>
                                <div className="text-[10px]" style={{ color: selected.best_new_try > glocalTry ? 'var(--accent)' : 'var(--danger)' }}>
                                  TR farkı: {fmtTry(selected.best_new_try - glocalTry)}
                                </div>
                              </div>
                            </div>
                            {isPhone && (
                              <div className="text-[10px]" style={{ color: 'var(--danger)' }}>
                                ⚠ Telefon/IMEI Uyarısı: Yurt dışı telefonlarda pasaport IMEI kayıt harcını toplam maliyete eklemeyi unutma.
                              </div>
                            )}
                            <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                              Not: Türkiye’de 30€ kargo muafiyeti kalktığı için sadece yolcu beraberi / Glocalzone / Grabr mantıklıdır.
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          { label: 'Glocalzone ↗', url: `https://www.glocalzone.com/tr/search?q=${encodeURIComponent(selected.title.split(' ').slice(0, 4).join(' '))}` },
                          { label: 'Grabr ↗', url: `https://grabr.io/en/shop?q=${encodeURIComponent(selected.title.split(' ').slice(0, 4).join(' '))}` },
                          { label: 'Amazon.de ↗', url: `https://www.amazon.de/s?k=${encodeURIComponent(selected.title.split(' ').slice(0, 4).join(' '))}` },
                          { label: 'Idealo.de ↗', url: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(selected.title.split(' ').slice(0, 4).join(' '))}` },
                        ].map((lnk) => (
                          <button
                            key={lnk.label}
                            onClick={() => api.openExternal(lnk.url)}
                            className="px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-pointer"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                          >
                            {lnk.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Perfume Dupe Finder */}
                    {(() => {
                      const dupe = findPerfumeDupe(selected.title);
                      if (!dupe) return null;
                      return (
                        <div className="p-2.5 rounded-xl text-[11px]" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' }}>
                          <strong style={{ color: 'var(--accent)' }}>✨ Parfüm Muadili (Dupe):</strong> {dupe.dupe} —{' '}
                          <span style={{ color: 'var(--muted)' }}>{dupe.note}</span>
                        </div>
                      );
                    })()}
                  </div>
                  )}

                  {/* 2nd Hand + Local Ollama Defect Detector Tab */}
                  {modalTab === 'used' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: 'var(--accent-2)' }}>
                        2. El Piyasa & Lokal AI Kusur Dedektörü ({selected.used_listings.length})
                      </span>
                      <button
                        onClick={() => setShowManualUsed((v) => !v)}
                        className="text-[11px] hover:underline cursor-pointer"
                        style={{ color: 'var(--accent-2)' }}
                      >
                        + Manuel 2. El İlan Ekle
                      </button>
                    </div>

                    {showManualUsed && (
                      <form
                        onSubmit={handleAddManualUsed}
                        className="p-3.5 rounded-2xl grid grid-cols-2 gap-2 text-xs"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      >
                        <input
                          placeholder="İlan başlığı / kısa açıklama"
                          value={manualUsed.title}
                          onChange={(e) => setManualUsed({ ...manualUsed, title: e.target.value })}
                          className="col-span-2 rounded-xl px-3 py-1.5"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                        />
                        <input
                          placeholder="Fiyat (₺)"
                          type="number"
                          value={manualUsed.price_try}
                          onChange={(e) => setManualUsed({ ...manualUsed, price_try: e.target.value })}
                          className="rounded-xl px-3 py-1.5"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                        />
                        <input
                          placeholder="Şehir"
                          value={manualUsed.city}
                          onChange={(e) => setManualUsed({ ...manualUsed, city: e.target.value })}
                          className="rounded-xl px-3 py-1.5"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                        />
                        <button
                          type="submit"
                          className="col-span-2 py-2 rounded-xl font-semibold cursor-pointer"
                          style={{ background: 'var(--accent-2)', color: '#fff' }}
                        >
                          2. El İlanı Kaydet
                        </button>
                      </form>
                    )}

                    {selected.used_listings.map((u) => {
                      const ai = aiResult[u.id];
                      return (
                        <div
                          key={u.id}
                          className="p-3.5 rounded-2xl space-y-2"
                          style={{ background: 'color-mix(in srgb, var(--accent-2) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-2) 24%, transparent)' }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">{u.title}</div>
                              <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                                {u.platform} • {u.city} • Güven %{u.trust_score}
                                {u.param_guvende ? ' • Param Güvende' : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono-num text-sm font-bold" style={{ color: 'var(--accent-2)' }}>
                                {fmtPrice(u.price_try)}
                              </span>
                              <button
                                onClick={() =>
                                  handleAnalyzeUsed(u.id, u.title, u.price_try, selected.best_new_try)
                                }
                                disabled={aiLoadingId === u.id}
                                className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                              >
                                <Bot className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                                {aiLoadingId === u.id ? 'Analiz...' : 'AI Kusur'}
                              </button>
                            </div>
                          </div>

                          {ai && (
                            <div className="p-3 rounded-xl text-[11px] space-y-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                                  {ai.engine} • Risk: {ai.risk_level}
                                </span>
                                <span className="font-mono-num">Adil Teklif: {fmtTry(ai.fair_price_try)}</span>
                              </div>
                              <div style={{ color: 'var(--muted)' }}>{ai.summary}</div>
                              {ai.red_flags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {ai.red_flags.map((rf, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: 'rgba(244,63,94,0.16)', color: 'var(--danger)' }}>
                                      ⚠ {rf}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(ai.bargain_script);
                                  notify('AI pazarlık mesajı kopyalandı.');
                                }}
                                className="text-[10px] font-semibold hover:underline cursor-pointer"
                                style={{ color: 'var(--accent)' }}
                              >
                                Pazarlık Mesajını Kopyala ↗
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onToast={notify}
          onThemeChange={(t) => setActiveTheme(t)}
        />
      )}

      <AnimatePresence>
        {showPalette && (
          <CommandPalette
            onClose={() => setShowPalette(false)}
            actions={[
              { id: 'disc', label: 'Keşfet — Gerçek İndirim Akışına Git', hint: 'Canlı 120+ düşüş', icon: <PaletteIcons.Compass className="w-4 h-4" />, run: () => setActiveTab('discover') },
              { id: 'stg', label: 'Sahne — İstanbul Konser & Etkinlik Radarı', hint: 'Biletinial, Mobilet, Bubilet', icon: <Ticket className="w-4 h-4" />, run: () => setActiveTab('stage') },
              { id: 'gal', label: 'Koleksiyon & Lookbook', icon: <PaletteIcons.LayoutGrid className="w-4 h-4" />, run: () => setActiveTab('gallery') },
              { id: 'shr', label: 'Metehan × İlayda Ortak Pano', icon: <PaletteIcons.Users className="w-4 h-4" />, run: () => setActiveTab('shared') },
              { id: 'mb', label: 'Kombin & Ev Moodboard', icon: <PaletteIcons.Layers className="w-4 h-4" />, run: () => setActiveTab('moodboard') },
              { id: 'ord', label: 'Siparişler & 14 Gün İade Koruması', icon: <PaletteIcons.Package className="w-4 h-4" />, run: () => setActiveTab('orders') },
              { id: 'sec', label: showSecretOnly ? 'Gizli Hediye Filtresini Kapat' : 'Gizli Sürpriz Hediye Kasasını Aç', hint: 'İlayda göremez', icon: <PaletteIcons.Gift className="w-4 h-4" />, run: () => { setShowSecretOnly((v) => !v); setActiveTab('gallery'); } },
              { id: 'hud', label: 'Mini Acrylic HUD Penceresini Aç / Kapat', hint: 'Her zaman üstte', icon: <PaletteIcons.Monitor className="w-4 h-4" />, run: () => { api.toggleMiniHud().catch(() => {}); } },
              { id: 'snap', label: 'Tüm Fiyatları Dondur (Sezon Snapshot)', icon: <PaletteIcons.Camera className="w-4 h-4" />, run: handleSnapshotAll },
              { id: 'snd', label: soundOn ? 'UI Mikro Seslerini Kapat' : 'UI Mikro Seslerini Aç', icon: soundOn ? <PaletteIcons.VolumeX className="w-4 h-4" /> : <PaletteIcons.Volume2 className="w-4 h-4" />, run: () => { const n = !soundOn; setSoundOn(n); sound.enabled = n; } },
              { id: 'set', label: 'Ayarlar, 5 Tema & Cloudflare Tüneli', icon: <PaletteIcons.Settings className="w-4 h-4" />, run: () => setShowSettings(true) },
            ]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-xs font-semibold shadow-2xl"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
