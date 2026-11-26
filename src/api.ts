import { invoke } from '@tauri-apps/api/core';
import type {
  AddManualUsedRequest,
  AlertSettings,
  FolderItem,
  MarketRates,
  MobileAccessInfo,
  ProductDetail,
  SearchCandidate,
  TunnelStatus,
  UsedAiAnalysis,
} from './types';

export const api = {
  getMarketRates: () => invoke<MarketRates>('get_market_rates'),
  getFolders: () => invoke<FolderItem[]>('get_folders'),
  createFolder: (name: string) => invoke<number>('create_folder', { name }),
  getProducts: () => invoke<ProductDetail[]>('get_products'),
  searchLiveTr: (query: string) => invoke<SearchCandidate[]>('search_live_tr', { query }),
  trackFromCandidate: (
    folderId: number,
    c: SearchCandidate
  ) =>
    invoke<number>('track_from_candidate', {
      folderId,
      title: c.title,
      priceTry: c.price_try,
      storeName: c.store_name,
      url: c.url,
      imageUrl: c.image_url,
      source: c.source,
    }),
  trackFromUrl: (folderId: number, url: string) => invoke<number>('track_from_url', { folderId, url }),
  refreshProduct: (productId: number) => invoke<string>('refresh_product', { productId }),
  setTargetPrice: (productId: number, targetPriceTry: number | null) =>
    invoke<void>('set_target_price', { productId, targetPriceTry }),
  setTrackedSizes: (productId: number, trackedSizes: string) =>
    invoke<void>('set_tracked_sizes', { productId, trackedSizes }),
  setProductVote: (productId: number, who: 'metehan' | 'ilayda', vote: string, note?: string) =>
    invoke<void>('set_product_vote', { productId, who, vote, note: note ?? null }),
  markPurchased: (productId: number, priceTry: number | null) =>
    invoke<void>('mark_purchased', { productId, priceTry }),
  freezePriceSnapshots: () => invoke<number>('freeze_price_snapshots'),
  setActiveTheme: (theme: string) => invoke<void>('set_active_theme', { theme }),
  analyzeUsedWithOllama: (
    title: string,
    description: string,
    priceTry: number,
    newRetailTry: number
  ) =>
    invoke<UsedAiAnalysis>('analyze_used_with_ollama', {
      title,
      description,
      priceTry,
      newRetailTry,
    }),
  getSavedTotal: () => invoke<number>('get_saved_total'),
  recordSavings: (deltaTry: number) => invoke<number>('record_savings', { deltaTry }),
  getMobileAccessInfo: () => invoke<MobileAccessInfo>('get_mobile_access_info'),
  startCloudflareTunnel: (settings?: AlertSettings) =>
    invoke<TunnelStatus>('start_cloudflare_tunnel', { settings: settings ?? null }),
  stopCloudflareTunnel: () => invoke<TunnelStatus>('stop_cloudflare_tunnel'),
  getTunnelStatus: () => invoke<TunnelStatus>('get_tunnel_status'),
  moveProductFolder: (productId: number, folderId: number) =>
    invoke<void>('move_product_folder', { productId, folderId }),
  deleteProduct: (productId: number) => invoke<void>('delete_product', { productId }),
  addManualUsed: (req: AddManualUsedRequest) => invoke<number>('add_manual_used', { req }),
  deleteUsedListing: (listingId: number) => invoke<void>('delete_used_listing', { listingId }),
  getAlertSettings: () => invoke<AlertSettings>('get_alert_settings'),
  saveAlertSettings: (settings: AlertSettings) => invoke<void>('save_alert_settings', { settings }),
  testAlertChannels: (settings: AlertSettings) => invoke<string>('test_alert_channels', { settings }),
  openExternal: (url: string) => invoke<void>('open_external', { url }),
};
