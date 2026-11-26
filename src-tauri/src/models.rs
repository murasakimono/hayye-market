use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketRates {
    pub usd_try: f64,
    pub eur_try: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderItem {
    pub id: i64,
    pub name: String,
    pub item_count: usize,
    pub total_new_try: f64,
    pub total_used_try: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustFactor {
    pub label: String,
    pub delta: i32,
    pub positive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizeVariant {
    pub size: String,
    pub in_stock: bool,
    pub variant_id: Option<String>,
    pub cart_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetailOffer {
    pub id: i64,
    pub product_id: i64,
    pub store_name: String,
    pub seller_name: String,
    pub price_try: f64,
    pub shipping_try: f64,
    pub in_stock: bool,
    pub url: String,
    pub trust_score: u8,
    pub trust_reasons: Vec<TrustFactor>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsedListing {
    pub id: i64,
    pub product_id: i64,
    pub platform: String,
    pub title: String,
    pub price_try: f64,
    pub city: String,
    pub seller_name: String,
    pub param_guvende: bool,
    pub has_invoice_box: bool,
    pub photo_count: u8,
    pub url: String,
    pub trust_score: u8,
    pub trust_reasons: Vec<TrustFactor>,
    pub savings_pct: f64,
    pub scam_risk: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricePoint {
    pub ts: String,
    pub price_try: f64,
    pub usd_rate: f64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscountVerdict {
    pub status: String, // "GENUINE_DIP" | "GENUINE_DROP" | "NORMAL" | "INFLATED_FAKE"
    pub badge: String,
    pub pct_vs_avg: f64,
    pub avg_30d_try: f64,
    pub min_all_try: f64,
    pub max_all_try: f64,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitPriceInfo {
    pub amount: f64,
    pub unit: String,          // "ml" | "gr"
    pub price_per_10_try: f64, // TRY per 10ml or 10gr
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductDetail {
    pub id: i64,
    pub folder_id: i64,
    pub folder_name: String,
    pub title: String,
    pub image_url: String,
    pub primary_url: String,
    pub target_price_try: Option<f64>,
    pub tracked_sizes: String,
    pub sizes: Vec<SizeVariant>,
    pub quick_checkout_url: Option<String>,
    pub unit_price: Option<UnitPriceInfo>,
    pub best_new_try: f64,
    pub best_used_try: Option<f64>,
    pub used_median_try: Option<f64>,
    pub avg_trust_score: u8,
    pub discount_verdict: DiscountVerdict,
    pub offers: Vec<RetailOffer>,
    pub used_listings: Vec<UsedListing>,
    pub history: Vec<PricePoint>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchCandidate {
    pub title: String,
    pub price_try: f64,
    pub store_name: String,
    pub url: String,
    pub image_url: String,
    pub source: String,
    pub offer_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertSettings {
    pub discord_webhook: String,
    pub telegram_bot_token: String,
    pub telegram_chat_id: String,
    pub ntfy_topic: String,
    pub refresh_interval_min: u32,
    pub cloudflare_tunnel_url: String,
    pub cloudflare_tunnel_token: String,
    pub cloudflare_worker_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelStatus {
    pub state: String,
    pub mode: String,
    pub active_url: String,
    pub public_url: String,
    pub stable_url: String,
    pub published: bool,
    pub error: String,
    pub cloudflared_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileAccessInfo {
    pub lan_url: String,
    pub cloudflare_url: String,
    pub cloudflared_installed: bool,
    pub tunnel: TunnelStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeIngestProduct {
    pub title: String,
    pub url: String,
    pub price_try: f64,
    pub store_name: String,
    pub seller_name: Option<String>,
    pub image_url: Option<String>,
    pub folder_id: Option<i64>,
    pub is_used: Option<bool>,
    pub city: Option<String>,
    pub param_guvende: Option<bool>,
    pub has_invoice_box: Option<bool>,
    pub photo_count: Option<u8>,
    pub sizes: Option<Vec<SizeVariant>>,
    pub quick_checkout_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeBulkProducts {
    pub folder_name: Option<String>,
    pub items: Vec<BridgeIngestProduct>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeUsedBatch {
    pub product_id: i64,
    pub platform: String,
    pub listings: Vec<BridgeUsedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeUsedItem {
    pub title: String,
    pub price_try: f64,
    pub city: String,
    pub seller_name: String,
    pub param_guvende: bool,
    pub has_invoice_box: bool,
    pub photo_count: u8,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddManualUsedRequest {
    pub product_id: i64,
    pub platform: String,
    pub title: String,
    pub price_try: f64,
    pub city: String,
    pub seller_name: String,
    pub param_guvende: bool,
    pub has_invoice_box: bool,
    pub photo_count: u8,
    pub url: String,
}
