use crate::models::*;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::PathBuf;

pub fn db_path() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = base.join("HayyeMarket");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("hayye.db")
}

pub fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(db_path()).map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL,
            image_url TEXT NOT NULL DEFAULT '',
            primary_url TEXT NOT NULL DEFAULT '',
            target_price_try REAL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS offers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            store_name TEXT NOT NULL,
            seller_name TEXT NOT NULL,
            price_try REAL NOT NULL,
            shipping_try REAL NOT NULL DEFAULT 0,
            in_stock INTEGER NOT NULL DEFAULT 1,
            url TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS used_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            title TEXT NOT NULL,
            price_try REAL NOT NULL,
            city TEXT NOT NULL DEFAULT 'İstanbul',
            seller_name TEXT NOT NULL DEFAULT 'Bireysel',
            param_guvende INTEGER NOT NULL DEFAULT 0,
            has_invoice_box INTEGER NOT NULL DEFAULT 0,
            photo_count INTEGER NOT NULL DEFAULT 3,
            url TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            ts TEXT NOT NULL,
            price_try REAL NOT NULL,
            usd_rate REAL NOT NULL,
            source TEXT NOT NULL,
            FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            val TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    // Safe migrations for v1.1 & v2.0 columns
    let _ = conn.execute("ALTER TABLE products ADD COLUMN tracked_sizes TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN sizes_json TEXT NOT NULL DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN quick_checkout_url TEXT", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN vote_metehan TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN vote_ilayda TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN shared_note TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN added_by TEXT NOT NULL DEFAULT 'Metehan'", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN purchased_price_try REAL", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN purchased_at TEXT", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN snapshot_price_try REAL", []);
    let _ = conn.execute("ALTER TABLE products ADD COLUMN snapshot_at TEXT", []);

    // Seed default folders
    for name in ["Genel", "Giyim & Inditex", "Kozmetik", "Yeni PC Toplama", "Mutfak Çeyiz", "2. El Avı"] {
        let _ = conn.execute("INSERT OR IGNORE INTO folders (name) VALUES (?1)", params![name]);
    }
    Ok(())
}

pub fn score_retail_offer(
    store_name: &str,
    seller_name: &str,
    price_try: f64,
    median_price: f64,
    is_fake_discount: bool,
) -> (u8, Vec<TrustFactor>) {
    let mut score: i32 = 40;
    let mut reasons = Vec::new();
    let lower = format!("{} {}", store_name, seller_name).to_lowercase();

    let official_tier = [
        "amazon.com.tr", "amazon", "vatan", "teknosa", "mediamarkt", "itopya", "incehesap",
        "sinerji", "gaming.gen", "apple", "samsung", "dyson", "hepsiburada",
    ];
    let market_tier = ["trendyol", "n11", "pazarama", "pttavm", "akakçe", "akakce", "idefix"];

    if official_tier.iter().any(|k| lower.contains(k)) {
        score += 30;
        reasons.push(TrustFactor {
            label: "Resmî / Yetkili Büyük Mağaza".to_string(),
            delta: 30,
            positive: true,
        });
    } else if market_tier.iter().any(|k| lower.contains(k)) {
        score += 18;
        reasons.push(TrustFactor {
            label: "Büyük Pazaryeri Korumalı Satış".to_string(),
            delta: 18,
            positive: true,
        });
    } else {
        score += 6;
        reasons.push(TrustFactor {
            label: "Bağımsız / İkincil Satıcı".to_string(),
            delta: 6,
            positive: true,
        });
    }

    if median_price > 0.0 {
        let ratio = price_try / median_price;
        if ratio < 0.62 {
            score -= 22;
            reasons.push(TrustFactor {
                label: "Piyasanın %38+ altında (Paralel ithalat / şüpheli ilan riski)".to_string(),
                delta: -22,
                positive: false,
            });
        } else if ratio <= 1.08 {
            score += 18;
            reasons.push(TrustFactor {
                label: "Piyasa medyanıyla tutarlı fiyat bandı".to_string(),
                delta: 18,
                positive: true,
            });
        } else {
            score += 8;
            reasons.push(TrustFactor {
                label: "Piyasa ortalamasının üzerinde fiyat".to_string(),
                delta: 8,
                positive: true,
            });
        }
    }

    if is_fake_discount {
        score -= 15;
        reasons.push(TrustFactor {
            label: "Son dönemde şişirilmiş/dalgalı fiyat geçmişi".to_string(),
            delta: -15,
            positive: false,
        });
    } else {
        score += 12;
        reasons.push(TrustFactor {
            label: "Temiz fiyat geçmişi (sahte indirim yok)".to_string(),
            delta: 12,
            positive: true,
        });
    }

    (score.clamp(15, 99) as u8, reasons)
}

pub fn score_used_listing(
    platform: &str,
    param_guvende: bool,
    has_invoice_box: bool,
    photo_count: u8,
    price_try: f64,
    used_median: f64,
) -> (u8, Vec<TrustFactor>, bool) {
    let mut score: i32 = 25;
    let mut reasons = Vec::new();
    let mut scam_risk = false;

    if param_guvende || platform.to_lowercase().contains("dolap") {
        score += 30;
        reasons.push(TrustFactor {
            label: "Param Güvende / Platform Alıcı Koruması".to_string(),
            delta: 30,
            positive: true,
        });
    } else {
        score -= 5;
        reasons.push(TrustFactor {
            label: "Elden / Havale (alıcı koruması yok)".to_string(),
            delta: -5,
            positive: false,
        });
    }

    if has_invoice_box {
        score += 20;
        reasons.push(TrustFactor {
            label: "Kutu / Fatura / Garanti belirtilmiş".to_string(),
            delta: 20,
            positive: true,
        });
    }

    if photo_count >= 5 {
        score += 15;
        reasons.push(TrustFactor {
            label: format!("Detaylı görsel ({} fotoğraf)", photo_count),
            delta: 15,
            positive: true,
        });
    } else if photo_count <= 1 {
        score -= 10;
        reasons.push(TrustFactor {
            label: "Yetersiz fotoğraf (tek görsel)".to_string(),
            delta: -10,
            positive: false,
        });
    } else {
        score += 8;
        reasons.push(TrustFactor {
            label: format!("Orta görsel detayı ({} fotoğraf)", photo_count),
            delta: 8,
            positive: true,
        });
    }

    if used_median > 0.0 {
        let ratio = price_try / used_median;
        if ratio < 0.58 {
            scam_risk = true;
            score -= 35;
            reasons.push(TrustFactor {
                label: "2. El medyanının %42+ altında — DOLANDIRICILIK / ARIZALI RİSKİ!".to_string(),
                delta: -35,
                positive: false,
            });
        } else if ratio <= 1.05 {
            score += 10;
            reasons.push(TrustFactor {
                label: "Gerçekçi 2. el piyasa bandında".to_string(),
                delta: 10,
                positive: true,
            });
        }
    }

    (score.clamp(10, 99) as u8, reasons, scam_risk)
}

pub fn compute_discount_verdict(current_best: f64, history: &[PricePoint]) -> DiscountVerdict {
    if history.is_empty() || current_best <= 0.0 {
        return DiscountVerdict {
            status: "NORMAL".to_string(),
            badge: "YENİ TAKİP".to_string(),
            pct_vs_avg: 0.0,
            avg_30d_try: current_best,
            min_all_try: current_best,
            max_all_try: current_best,
            explanation: "Fiyat geçmişi yeni birikmeye başladı; sonraki taramalarla sahte indirim analizi netleşecek.".to_string(),
        };
    }

    let prices: Vec<f64> = history.iter().map(|h| h.price_try).filter(|p| *p > 0.0).collect();
    let min_all = prices.iter().cloned().fold(current_best, f64::min);
    let max_all = prices.iter().cloned().fold(current_best, f64::max);
    let avg = prices.iter().sum::<f64>() / (prices.len().max(1) as f64);
    let pct_vs_avg = if avg > 0.0 { ((current_best - avg) / avg) * 100.0 } else { 0.0 };

    if current_best <= min_all * 1.005 && prices.len() >= 2 && pct_vs_avg <= -4.0 {
        DiscountVerdict {
            status: "GENUINE_DIP".to_string(),
            badge: format!("GERÇEK DİP ({:.1}%)", pct_vs_avg),
            pct_vs_avg,
            avg_30d_try: avg,
            min_all_try: min_all,
            max_all_try: max_all,
            explanation: format!(
                "Takip geçmişindeki en düşük seviye! Ortalama {:.0} ₺ yerine şu an {:.0} ₺.",
                avg, current_best
            ),
        }
    } else if pct_vs_avg <= -6.0 {
        DiscountVerdict {
            status: "GENUINE_DROP".to_string(),
            badge: format!("GERÇEK İNDİRİM ({:.1}%)", pct_vs_avg),
            pct_vs_avg,
            avg_30d_try: avg,
            min_all_try: min_all,
            max_all_try: max_all,
            explanation: format!(
                "Geçmiş ortalamanın ({:.0} ₺) belirgin şekilde altında; gerçek fiyat düşüşü.",
                avg
            ),
        }
    } else if pct_vs_avg >= 6.0 || (current_best > min_all * 1.12 && prices.len() >= 3) {
        DiscountVerdict {
            status: "INFLATED_FAKE".to_string(),
            badge: format!("ŞİŞİRİLMİŞ (+{:.1}%)", pct_vs_avg.max(0.0)),
            pct_vs_avg,
            avg_30d_try: avg,
            min_all_try: min_all,
            max_all_try: max_all,
            explanation: format!(
                "Dikkat! Bu ürün geçmişte {:.0} ₺'ye kadar düştü. Şu anki fiyat ortalamanın üzerinde, sahte indirim olabilir.",
                min_all
            ),
        }
    } else {
        DiscountVerdict {
            status: "NORMAL".to_string(),
            badge: "PİYASA BANDI".to_string(),
            pct_vs_avg,
            avg_30d_try: avg,
            min_all_try: min_all,
            max_all_try: max_all,
            explanation: format!(
                "Fiyat normal seyrinde (Ortalama {:.0} ₺, En düşük {:.0} ₺).",
                avg, min_all
            ),
        }
    }
}

pub fn list_products(conn: &Connection) -> Result<Vec<ProductDetail>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.folder_id, COALESCE(f.name, 'Genel'), p.title, p.image_url, p.primary_url, p.target_price_try, p.updated_at, COALESCE(p.tracked_sizes, ''), COALESCE(p.sizes_json, '[]'), p.quick_checkout_url, COALESCE(p.vote_metehan, ''), COALESCE(p.vote_ilayda, ''), COALESCE(p.shared_note, ''), COALESCE(p.added_by, 'Metehan'), p.purchased_price_try, p.purchased_at, p.snapshot_price_try, p.snapshot_at
             FROM products p LEFT JOIN folders f ON p.folder_id = f.id
             ORDER BY p.id DESC",
        )
        .map_err(|e| e.to_string())?;

    struct RawProdRow {
        id: i64,
        folder_id: i64,
        folder_name: String,
        title: String,
        image_url: String,
        primary_url: String,
        target_price_try: Option<f64>,
        updated_at: String,
        tracked_sizes: String,
        sizes_json: String,
        quick_checkout_url: Option<String>,
        vote_metehan: String,
        vote_ilayda: String,
        shared_note: String,
        added_by: String,
        purchased_price_try: Option<f64>,
        purchased_at: Option<String>,
        snapshot_price_try: Option<f64>,
        snapshot_at: Option<String>,
    }

    let rows: Vec<RawProdRow> = stmt
        .query_map([], |r| {
            Ok(RawProdRow {
                id: r.get(0)?,
                folder_id: r.get(1)?,
                folder_name: r.get(2)?,
                title: r.get(3)?,
                image_url: r.get(4)?,
                primary_url: r.get(5)?,
                target_price_try: r.get(6)?,
                updated_at: r.get(7)?,
                tracked_sizes: r.get(8)?,
                sizes_json: r.get(9)?,
                quick_checkout_url: r.get(10)?,
                vote_metehan: r.get(11)?,
                vote_ilayda: r.get(12)?,
                shared_note: r.get(13)?,
                added_by: r.get(14)?,
                purchased_price_try: r.get(15)?,
                purchased_at: r.get(16)?,
                snapshot_price_try: r.get(17)?,
                snapshot_at: r.get(18)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let mut out = Vec::new();
    for rp in rows {
        let RawProdRow {
            id, folder_id, folder_name, title, image_url, primary_url, target_price_try, updated_at,
            tracked_sizes, sizes_json, quick_checkout_url, vote_metehan, vote_ilayda, shared_note,
            added_by, purchased_price_try, purchased_at, snapshot_price_try, snapshot_at,
        } = rp;
        // History
        let mut hstmt = conn
            .prepare("SELECT ts, price_try, usd_rate, source FROM price_history WHERE product_id = ?1 ORDER BY id ASC")
            .map_err(|e| e.to_string())?;
        let history: Vec<PricePoint> = hstmt
            .query_map(params![id], |r| {
                Ok(PricePoint {
                    ts: r.get(0)?,
                    price_try: r.get(1)?,
                    usd_rate: r.get(2)?,
                    source: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();

        // Raw offers
        let mut ostmt = conn
            .prepare("SELECT id, store_name, seller_name, price_try, shipping_try, in_stock, url, updated_at FROM offers WHERE product_id = ?1 ORDER BY (price_try + shipping_try) ASC")
            .map_err(|e| e.to_string())?;
        let raw_offers: Vec<(i64, String, String, f64, f64, bool, String, String)> = ostmt
            .query_map(params![id], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get::<_, i64>(5)? != 0,
                    r.get(6)?,
                    r.get(7)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();

        let best_new_try = raw_offers
            .iter()
            .filter(|o| o.5 && o.3 > 0.0)
            .map(|o| o.3 + o.4)
            .fold(f64::INFINITY, f64::min);
        let best_new_try = if best_new_try.is_finite() {
            best_new_try
        } else {
            history.last().map(|h| h.price_try).unwrap_or(0.0)
        };

        let mut offer_prices: Vec<f64> = raw_offers.iter().map(|o| o.3 + o.4).filter(|p| *p > 0.0).collect();
        offer_prices.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let median_new = if offer_prices.is_empty() {
            best_new_try
        } else {
            offer_prices[offer_prices.len() / 2]
        };

        let discount_verdict = compute_discount_verdict(best_new_try, &history);
        let is_fake = discount_verdict.status == "INFLATED_FAKE";

        let offers: Vec<RetailOffer> = raw_offers
            .into_iter()
            .map(|(oid, store_name, seller_name, price_try, shipping_try, in_stock, url, o_upd)| {
                let (trust_score, trust_reasons) =
                    score_retail_offer(&store_name, &seller_name, price_try + shipping_try, median_new, is_fake);
                RetailOffer {
                    id: oid,
                    product_id: id,
                    store_name,
                    seller_name,
                    price_try,
                    shipping_try,
                    in_stock,
                    url,
                    trust_score,
                    trust_reasons,
                    updated_at: o_upd,
                }
            })
            .collect();

        // Used listings
        let mut ustmt = conn
            .prepare("SELECT id, platform, title, price_try, city, seller_name, param_guvende, has_invoice_box, photo_count, url, updated_at FROM used_listings WHERE product_id = ?1 ORDER BY price_try ASC")
            .map_err(|e| e.to_string())?;
        let raw_used: Vec<(i64, String, String, f64, String, String, bool, bool, u8, String, String)> = ustmt
            .query_map(params![id], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get::<_, i64>(6)? != 0,
                    r.get::<_, i64>(7)? != 0,
                    r.get::<_, i64>(8)? as u8,
                    r.get(9)?,
                    r.get(10)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();

        let mut u_prices: Vec<f64> = raw_used.iter().map(|u| u.3).filter(|p| *p > 0.0).collect();
        u_prices.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let used_median_try = if u_prices.is_empty() {
            None
        } else {
            Some(u_prices[u_prices.len() / 2])
        };
        let best_used_try = u_prices.first().copied();

        let used_listings: Vec<UsedListing> = raw_used
            .into_iter()
            .map(|(uid, platform, utitle, price_try, city, seller_name, pg, ib, photos, url, u_upd)| {
                let (trust_score, trust_reasons, scam_risk) = score_used_listing(
                    &platform,
                    pg,
                    ib,
                    photos,
                    price_try,
                    used_median_try.unwrap_or(price_try),
                );
                let savings_pct = if best_new_try > 0.0 {
                    ((best_new_try - price_try) / best_new_try) * 100.0
                } else {
                    0.0
                };
                UsedListing {
                    id: uid,
                    product_id: id,
                    platform,
                    title: utitle,
                    price_try,
                    city,
                    seller_name,
                    param_guvende: pg,
                    has_invoice_box: ib,
                    photo_count: photos,
                    url,
                    trust_score,
                    trust_reasons,
                    savings_pct,
                    scam_risk,
                    updated_at: u_upd,
                }
            })
            .collect();

        let avg_trust_score = if !offers.is_empty() {
            (offers.iter().map(|o| o.trust_score as u32).sum::<u32>() / offers.len() as u32) as u8
        } else if !used_listings.is_empty() {
            (used_listings.iter().map(|u| u.trust_score as u32).sum::<u32>() / used_listings.len() as u32) as u8
        } else {
            75
        };

        let sizes: Vec<SizeVariant> = serde_json::from_str(&sizes_json).unwrap_or_default();
        let unit_price = crate::scraper_engine::detect_unit_price(&title, best_new_try);

        out.push(ProductDetail {
            id,
            folder_id,
            folder_name,
            title,
            image_url,
            primary_url,
            target_price_try,
            tracked_sizes,
            sizes,
            quick_checkout_url,
            unit_price,
            best_new_try,
            best_used_try,
            used_median_try,
            avg_trust_score,
            discount_verdict,
            offers,
            used_listings,
            history,
            updated_at,
            vote_metehan,
            vote_ilayda,
            shared_note,
            added_by,
            purchased_price_try,
            purchased_at,
            snapshot_price_try,
            snapshot_at,
        });
    }

    Ok(out)
}

pub fn list_folders(conn: &Connection) -> Result<Vec<FolderItem>, String> {
    let products = list_products(conn)?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM folders ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    Ok(rows
        .into_iter()
        .map(|(id, name)| {
            let matching: Vec<&ProductDetail> = products.iter().filter(|p| p.folder_id == id).collect();
            let total_new_try: f64 = matching.iter().map(|p| p.best_new_try).sum();
            let total_used_try: f64 = matching
                .iter()
                .map(|p| p.best_used_try.unwrap_or(p.best_new_try))
                .sum();
            FolderItem {
                id,
                name,
                item_count: matching.len(),
                total_new_try,
                total_used_try,
            }
        })
        .collect())
}

pub fn create_folder(conn: &Connection, name: &str) -> Result<i64, String> {
    let clean = name.trim();
    if clean.is_empty() {
        return Err("Klasör adı boş olamaz.".to_string());
    }
    conn.execute("INSERT OR IGNORE INTO folders (name) VALUES (?1)", params![clean])
        .map_err(|e| e.to_string())?;
    let id: i64 = conn
        .query_row("SELECT id FROM folders WHERE name = ?1", params![clean], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn upsert_product_with_offer(
    conn: &Connection,
    folder_id: i64,
    title: &str,
    image_url: &str,
    primary_url: &str,
    store_name: &str,
    seller_name: &str,
    price_try: f64,
    usd_rate: f64,
    source: &str,
) -> Result<i64, String> {
    let now = Utc::now().to_rfc3339();
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM products WHERE primary_url = ?1 OR lower(title) = lower(?2) LIMIT 1",
            params![primary_url, title],
            |r| r.get(0),
        )
        .ok();

    let pid = if let Some(id) = existing {
        conn.execute(
            "UPDATE products SET updated_at = ?1, image_url = CASE WHEN image_url = '' THEN ?2 ELSE image_url END WHERE id = ?3",
            params![now, image_url, id],
        )
        .map_err(|e| e.to_string())?;
        id
    } else {
        conn.execute(
            "INSERT INTO products (folder_id, title, image_url, primary_url, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![folder_id, title, image_url, primary_url, now],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    if price_try > 0.0 {
        let _ = conn.execute(
            "DELETE FROM offers WHERE product_id = ?1 AND lower(store_name) = lower(?2)",
            params![pid, store_name],
        );
        conn.execute(
            "INSERT INTO offers (product_id, store_name, seller_name, price_try, shipping_try, in_stock, url, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, 1, ?5, ?6)",
            params![pid, store_name, seller_name, price_try, primary_url, now],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO price_history (product_id, ts, price_try, usd_rate, source) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![pid, now, price_try, usd_rate.max(1.0), source],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(pid)
}

pub fn add_used_listing(conn: &Connection, req: &AddManualUsedRequest) -> Result<i64, String> {
    let now = Utc::now().to_rfc3339();
    let _ = conn.execute(
        "DELETE FROM used_listings WHERE product_id = ?1 AND url = ?2 AND url != ''",
        params![req.product_id, req.url],
    );
    conn.execute(
        "INSERT INTO used_listings (product_id, platform, title, price_try, city, seller_name, param_guvende, has_invoice_box, photo_count, url, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            req.product_id,
            req.platform,
            req.title,
            req.price_try,
            req.city,
            req.seller_name,
            if req.param_guvende { 1 } else { 0 },
            if req.has_invoice_box { 1 } else { 0 },
            req.photo_count as i64,
            req.url,
            now
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn update_product_sizes(
    conn: &Connection,
    product_id: i64,
    sizes: &[SizeVariant],
    quick_checkout_url: Option<&str>,
) -> Result<(), String> {
    let sj = serde_json::to_string(sizes).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE products SET sizes_json = ?1, quick_checkout_url = COALESCE(?2, quick_checkout_url) WHERE id = ?3",
        params![sj, quick_checkout_url, product_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_product_vote(
    conn: &Connection,
    product_id: i64,
    who: &str,
    vote: &str,
    note: Option<&str>,
) -> Result<(), String> {
    let col = if who.eq_ignore_ascii_case("ilayda") {
        "vote_ilayda"
    } else {
        "vote_metehan"
    };
    let clean_vote = match vote.to_lowercase().as_str() {
        "buy" | "wait" | "pass" => vote.to_lowercase(),
        _ => String::new(),
    };
    let sql = format!("UPDATE products SET {} = ?1 WHERE id = ?2", col);
    conn.execute(&sql, params![clean_vote, product_id]).map_err(|e| e.to_string())?;
    if let Some(n) = note {
        conn.execute("UPDATE products SET shared_note = ?1 WHERE id = ?2", params![n.trim(), product_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn mark_purchased(conn: &Connection, product_id: i64, price_try: Option<f64>) -> Result<(), String> {
    if let Some(p) = price_try {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE products SET purchased_price_try = ?1, purchased_at = ?2 WHERE id = ?3",
            params![p, now, product_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE products SET purchased_price_try = NULL, purchased_at = NULL WHERE id = ?1",
            params![product_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn freeze_price_snapshots(conn: &Connection) -> Result<usize, String> {
    let list = list_products(conn)?;
    let now = Utc::now().to_rfc3339();
    let mut count = 0usize;
    for p in list {
        if p.best_new_try > 0.0 {
            let _ = conn.execute(
                "UPDATE products SET snapshot_price_try = ?1, snapshot_at = ?2 WHERE id = ?3",
                params![p.best_new_try, now, p.id],
            );
            count += 1;
        }
    }
    Ok(count)
}

pub fn get_saved_total(conn: &Connection) -> f64 {
    conn.query_row("SELECT val FROM settings WHERE key = 'saved_total_try'", [], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0)
}

pub fn add_saved_amount(conn: &Connection, delta_try: f64) -> Result<f64, String> {
    let next = (get_saved_total(conn) + delta_try.max(0.0)).round();
    conn.execute(
        "INSERT INTO settings (key, val) VALUES ('saved_total_try', ?1) ON CONFLICT(key) DO UPDATE SET val = excluded.val",
        params![next.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(next)
}

pub fn load_settings(conn: &Connection) -> AlertSettings {
    let get = |k: &str, def: &str| -> String {
        conn.query_row("SELECT val FROM settings WHERE key = ?1", params![k], |r| r.get(0))
            .unwrap_or_else(|_| def.to_string())
    };
    AlertSettings {
        discord_webhook: get("discord_webhook", ""),
        telegram_bot_token: get("telegram_bot_token", ""),
        telegram_chat_id: get("telegram_chat_id", ""),
        ntfy_topic: get("ntfy_topic", ""),
        refresh_interval_min: get("refresh_interval_min", "45").parse().unwrap_or(45),
        cloudflare_tunnel_url: get("cloudflare_tunnel_url", ""),
        cloudflare_tunnel_token: get("cloudflare_tunnel_token", ""),
        cloudflare_worker_key: get("cloudflare_worker_key", ""),
    }
}

pub fn save_settings(conn: &Connection, s: &AlertSettings) -> Result<(), String> {
    let pairs = [
        ("discord_webhook", s.discord_webhook.clone()),
        ("telegram_bot_token", s.telegram_bot_token.clone()),
        ("telegram_chat_id", s.telegram_chat_id.clone()),
        ("ntfy_topic", s.ntfy_topic.clone()),
        ("refresh_interval_min", s.refresh_interval_min.to_string()),
        ("cloudflare_tunnel_url", s.cloudflare_tunnel_url.clone()),
        ("cloudflare_tunnel_token", s.cloudflare_tunnel_token.clone()),
        ("cloudflare_worker_key", s.cloudflare_worker_key.clone()),
    ];
    for (k, v) in pairs {
        conn.execute(
            "INSERT INTO settings (key, val) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET val = excluded.val",
            params![k, v],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
