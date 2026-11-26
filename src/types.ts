export interface MarketRates {
  usd_try: number;
  eur_try: number;
  gold_gram_try: number;
  updated_at: string;
}

export interface FolderItem {
  id: number;
  name: string;
  item_count: number;
  total_new_try: number;
  total_used_try: number;
}

export interface TrustFactor {
  label: string;
  delta: number;
  positive: boolean;
}

export interface RetailOffer {
  id: number;
  product_id: number;
  store_name: string;
  seller_name: string;
  price_try: number;
  shipping_try: number;
  in_stock: boolean;
  url: string;
  trust_score: number;
  trust_reasons: TrustFactor[];
  updated_at: string;
}

export interface UsedListing {
  id: number;
  product_id: number;
  platform: string;
  title: string;
  price_try: number;
  city: string;
  seller_name: string;
  param_guvende: boolean;
  has_invoice_box: boolean;
  photo_count: number;
  url: string;
  trust_score: number;
  trust_reasons: TrustFactor[];
  savings_pct: number;
  scam_risk: boolean;
  updated_at: string;
}

export interface PricePoint {
  ts: string;
  price_try: number;
  usd_rate: number;
  source: string;
}

export interface DiscountVerdict {
  status: 'GENUINE_DIP' | 'GENUINE_DROP' | 'NORMAL' | 'INFLATED_FAKE' | string;
  badge: string;
  pct_vs_avg: number;
  avg_30d_try: number;
  min_all_try: number;
  max_all_try: number;
  explanation: string;
}

export interface SizeVariant {
  size: string;
  in_stock: boolean;
  variant_id: string | null;
  cart_url: string | null;
}

export interface UnitPriceInfo {
  amount: number;
  unit: string;
  price_per_10_try: number;
}

export interface TunnelStatus {
  state: string;
  mode: string;
  active_url: string;
  public_url: string;
  stable_url: string;
  published: boolean;
  error: string;
  cloudflared_path: string;
}

export interface MobileAccessInfo {
  lan_url: string;
  cloudflare_url: string;
  cloudflared_installed: boolean;
  tunnel: TunnelStatus;
}

export interface ProductDetail {
  id: number;
  folder_id: number;
  folder_name: string;
  title: string;
  image_url: string;
  primary_url: string;
  target_price_try: number | null;
  tracked_sizes: string;
  sizes: SizeVariant[];
  quick_checkout_url: string | null;
  unit_price: UnitPriceInfo | null;
  best_new_try: number;
  best_used_try: number | null;
  used_median_try: number | null;
  avg_trust_score: number;
  discount_verdict: DiscountVerdict;
  offers: RetailOffer[];
  used_listings: UsedListing[];
  history: PricePoint[];
  updated_at: string;
  vote_metehan: string;
  vote_ilayda: string;
  shared_note: string;
  added_by: string;
  purchased_price_try: number | null;
  purchased_at: string | null;
  snapshot_price_try: number | null;
  snapshot_at: string | null;
  is_secret_gift: boolean;
  cargo_company: string;
  cargo_tracking_no: string;
  warranty_months: number;
  receipt_note: string;
  wear_count: number;
  batch_code: string;
  pao_months: number;
  foreign_eur_price: number | null;
}

export interface SearchCandidate {
  title: string;
  price_try: number;
  store_name: string;
  url: string;
  image_url: string;
  source: string;
  offer_count: number;
}

export interface AlertSettings {
  discord_webhook: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  ntfy_topic: string;
  refresh_interval_min: number;
  cloudflare_tunnel_url: string;
  cloudflare_tunnel_token: string;
  cloudflare_worker_key: string;
  active_theme: string;
  monthly_budget_try: number;
  user_cards: string;
  discover_keywords: string;
  discover_muted: string;
  discover_alerts_enabled: boolean;
  sound_enabled: boolean;
  auto_scan_enabled: boolean;
  event_city: string;
  event_radar_artists: string;
  event_blacklist: string;
}

export interface EventItem {
  id: string;
  title: string;
  category: string;
  city: string;
  venue: string;
  date_label: string;
  price_label: string;
  image_url: string;
  url: string;
  source: string;
  matches_radar: boolean;
  vote_metehan: string;
  vote_ilayda: string;
  ticket_bought: boolean;
}

export interface VaultMetaUpdate {
  product_id: number;
  is_secret_gift?: boolean;
  cargo_company?: string;
  cargo_tracking_no?: string;
  warranty_months?: number;
  receipt_note?: string;
  batch_code?: string;
  pao_months?: number;
  foreign_eur_price?: number;
}

export interface DiscoverArchiveItem {
  deal_id: string;
  title: string;
  brand: string;
  category: string;
  price_try: number;
  drop_pct: number;
  url: string;
  seen_at: string;
}

export interface DiscoverItem {
  id: string;
  title: string;
  brand: string;
  category: string;
  price_try: number;
  drop_pct: number;
  heat_score: number;
  image_url: string;
  url: string;
  source: string;
  is_flash_error: boolean;
  matches_personal: boolean;
  offer_count: number;
}

export interface UsedAiAnalysis {
  engine: string;
  risk_level: string;
  red_flags: string[];
  fair_price_try: number;
  summary: string;
  bargain_script: string;
}

export interface AddManualUsedRequest {
  product_id: number;
  platform: string;
  title: string;
  price_try: number;
  city: string;
  seller_name: string;
  param_guvende: boolean;
  has_invoice_box: boolean;
  photo_count: number;
  url: string;
}

export function fmtTry(v: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' ₺';
}

export function fmtUsd(v: number): string {
  return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(v));
}
