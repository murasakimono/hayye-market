use crate::db;
use crate::models::{AlertSettings, DiscoverItem};
use crate::notify;
use crate::scraper_engine::parse_tr_price;
use regex::Regex;
use rusqlite::params;
use scraper::{Html, Selector};
use std::collections::HashSet;
use std::time::Duration;

fn classify_category(url: &str, title: &str, brand: &str) -> String {
    let hay = format!("{} {} {}", url, title, brand).to_lowercase();
    if [
        "parfum", "parfüm", "kozmetik", "cilt", "serum", "krem", "makyaj", "ruj", "maskara",
        "sampuan", "şampuan", "deodorant", "gunes", "güneş", "sephora", "gratis", "bioderma",
        "la roche", "cerave", "dior", "chanel", "versace", "ysl", "armani", "loreal", "maybelline",
    ]
    .iter()
    .any(|k| hay.contains(k))
    {
        return "cosmetics".to_string();
    }
    if [
        "ayakkabi", "ayakkabı", "sneaker", "bot", "mont", "ceket", "sweat", "tisort", "tişört",
        "pantolon", "jean", "elbise", "canta", "çanta", "gozluk", "gözlük", "saat", "nike",
        "adidas", "puma", "new balance", "zara", "bershka", "pull", "stradivarius", "vans",
        "converse", "north face", "columbia", "lacoste", "tommy", "calvin", "skechers", "under armour",
    ]
    .iter()
    .any(|k| hay.contains(k))
    {
        return "fashion".to_string();
    }
    if [
        "airfryer", "fritoz", "fritöz", "kahve", "blender", "tost", "supurge", "süpürge",
        "robot", "utu", "ütü", "tencere", "tava", "mutfak", "dyson", "ninja", "philips",
        "karaca", "tefal", "arcelik", "arçelik", "bosch", "siemens", "grundig", "korkmaz",
        "elektrikli-ev", "kucuk-ev", "ev-yasam", "mobilya", "nevresim",
    ]
    .iter()
    .any(|k| hay.contains(k))
    {
        return "home".to_string();
    }
    if [
        "telefon", "bilgisayar", "laptop", "notebook", "ekran-karti", "islemci", "anakart",
        "ram", "ssd", "monitor", "monitör", "klavye", "mouse", "kulaklik", "kulaklık", "tablet",
        "televizyon", "tv", "konsol", "playstation", "xbox", "kamera", "apple", "iphone", "ipad",
        "macbook", "samsung", "lenovo", "asus", "msi", "nvidia", "rtx", "amd", "sony", "logitech",
        "razer", "steelseries", "xiaomi", "huawei", "jbl", "marshall",
    ]
    .iter()
    .any(|k| hay.contains(k))
    {
        return "tech".to_string();
    }
    "other".to_string()
}

async fn fetch_akakce_drops_page(client: &reqwest::Client, page: u32) -> Vec<DiscoverItem> {
    let url = if page <= 1 {
        "https://www.akakce.com/fiyati-dusen-urunler/".to_string()
    } else {
        format!("https://www.akakce.com/fiyati-dusen-urunler/?p={}", page)
    };
    let Ok(resp) = client.get(&url).send().await else {
        return Vec::new();
    };
    let Ok(html) = resp.text().await else {
        return Vec::new();
    };

    let doc = Html::parse_document(&html);
    let li_sel = Selector::parse("li[data-pr]").unwrap();
    let a_sel = Selector::parse("a.pw_v8, a[href$='.html']").unwrap();
    let h3_sel = Selector::parse("h3.pn_v8, h3").unwrap();
    let img_sel = Selector::parse("img").unwrap();
    let price_sel = Selector::parse("span.pt_v8").unwrap();
    let disc_sel = Selector::parse("span.ps_v9 i, span.ps_v9").unwrap();
    let pct_re = Regex::new(r"%\s*(\d{1,2})").unwrap();
    let offers_re = Regex::new(r"\+(\d+)\s*FİYAT").unwrap();

    let mut out = Vec::new();
    for li in doc.select(&li_sel) {
        let Some(a) = li.select(&a_sel).next() else {
            continue;
        };
        let href = a.value().attr("href").unwrap_or("").trim();
        if href.is_empty() {
            continue;
        }
        let full_url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://www.akakce.com{}", href)
        };
        let title = li
            .select(&h3_sel)
            .next()
            .map(|h| h.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| a.value().attr("title").map(|s| s.trim().to_string()))
            .unwrap_or_default();
        if title.len() < 4 {
            continue;
        }
        let brand = li.value().attr("data-mk").unwrap_or("").trim().to_string();
        let img = li
            .select(&img_sel)
            .next()
            .and_then(|im| im.value().attr("data-src").or_else(|| im.value().attr("src")))
            .map(|s| {
                if s.starts_with("//") {
                    format!("https:{}", s)
                } else {
                    s.to_string()
                }
            })
            .filter(|s| s.starts_with("http"))
            .unwrap_or_default();

        let price_raw = li
            .select(&price_sel)
            .next()
            .map(|p| p.text().collect::<String>())
            .unwrap_or_default();
        let Some(price_try) = parse_tr_price(&price_raw) else {
            continue;
        };

        let offer_count = offers_re
            .captures(&price_raw)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<u32>().ok())
            .unwrap_or(1);

        let disc_raw = li
            .select(&disc_sel)
            .next()
            .map(|d| d.text().collect::<String>())
            .unwrap_or_default();
        let drop_pct = pct_re
            .captures(&disc_raw)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<f64>().ok())
            .unwrap_or(5.0);

        let category = classify_category(&full_url, &title, &brand);
        let id = li
            .value()
            .attr("data-pr")
            .map(|s| format!("ak-{}", s))
            .unwrap_or_else(|| full_url.clone());

        out.push(DiscoverItem {
            id,
            title,
            brand,
            category,
            price_try,
            drop_pct,
            heat_score: 0,
            image_url: img,
            url: full_url,
            source: "Akakçe Gerçek Dip".to_string(),
            is_flash_error: drop_pct >= 35.0,
            matches_personal: false,
            offer_count,
        });
    }
    out
}

pub async fn fetch_discover_feed(settings: &AlertSettings) -> Vec<DiscoverItem> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    let (p1, p2, p3, p4) = tokio::join!(
        fetch_akakce_drops_page(&client, 1),
        fetch_akakce_drops_page(&client, 2),
        fetch_akakce_drops_page(&client, 3),
        fetch_akakce_drops_page(&client, 4),
    );

    let personal_kws: Vec<String> = settings
        .discover_keywords
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.len() >= 2)
        .collect();
    let muted_kws: Vec<String> = settings
        .discover_muted
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.len() >= 2)
        .collect();

    let mut seen = HashSet::new();
    let mut all = Vec::new();
    for item in p1.into_iter().chain(p2).chain(p3).chain(p4) {
        if !seen.insert(item.id.clone()) {
            continue;
        }
        let hay = format!("{} {} {}", item.title, item.brand, item.url).to_lowercase();
        if muted_kws.iter().any(|m| hay.contains(m)) {
            continue;
        }
        let matches_personal = personal_kws.iter().any(|k| hay.contains(k));
        let mut heat: i32 = 35 + (item.drop_pct * 1.45) as i32;
        if item.offer_count >= 15 {
            heat += 10;
        }
        if matches_personal {
            heat += 15;
        }
        if item.is_flash_error {
            heat += 15;
        }
        let mut it = item;
        it.matches_personal = matches_personal;
        it.heat_score = heat.clamp(25, 99) as u8;
        all.push(it);
    }

    all.sort_by(|a, b| {
        b.is_flash_error
            .cmp(&a.is_flash_error)
            .then_with(|| b.heat_score.cmp(&a.heat_score))
            .then_with(|| b.drop_pct.partial_cmp(&a.drop_pct).unwrap_or(std::cmp::Ordering::Equal))
    });

    // Record top drops into discover_archive ("Kaçırılan En İyi Fırsatlar")
    if let Ok(conn) = db::open_db() {
        let now_iso = chrono::Utc::now().to_rfc3339();
        for d in all.iter().filter(|x| x.drop_pct >= 18.0).take(10) {
            let _ = conn.execute(
                "INSERT INTO discover_archive (deal_id, title, brand, category, price_try, drop_pct, url, seen_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(deal_id) DO UPDATE SET price_try=excluded.price_try, drop_pct=MAX(drop_pct, excluded.drop_pct), seen_at=excluded.seen_at",
                params![d.id, d.title, d.brand, d.category, d.price_try, d.drop_pct, d.url, now_iso],
            );
        }
    }

    // Dispatch extreme drop / personal radar alerts (deduplicated in SQLite)
    if settings.discover_alerts_enabled {
        let alerts_to_send: Vec<DiscoverItem> = {
            if let Ok(conn) = db::open_db() {
                let _ = conn.execute(
                    "CREATE TABLE IF NOT EXISTS seen_discover_alerts (deal_id TEXT PRIMARY KEY, ts TEXT NOT NULL)",
                    [],
                );
                let mut picked = Vec::new();
                for d in all.iter().take(25) {
                    let trigger = d.drop_pct >= 35.0 || (d.matches_personal && d.drop_pct >= 20.0);
                    if !trigger {
                        continue;
                    }
                    let already: bool = conn
                        .query_row(
                            "SELECT 1 FROM seen_discover_alerts WHERE deal_id = ?1",
                            params![d.id],
                            |_| Ok(true),
                        )
                        .unwrap_or(false);
                    if !already {
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO seen_discover_alerts (deal_id, ts) VALUES (?1, datetime('now'))",
                            params![d.id],
                        );
                        picked.push(d.clone());
                        if picked.len() >= 3 {
                            break;
                        }
                    }
                }
                picked
            } else {
                Vec::new()
            }
        };

        for d in alerts_to_send {
            let tag = if d.drop_pct >= 35.0 {
                format!("⚡ EKSTREM DÜŞÜŞ (-%{:.0})", d.drop_pct)
            } else {
                format!("✦ KİŞİSEL RADAR (-%{:.0})", d.drop_pct)
            };
            let _ = notify::dispatch_alert(
                settings,
                &format!("{}: {}", tag, d.title),
                &format!("Güncel fiyat: {:.0} ₺ ({})\nLink: {}", d.price_try, d.source, d.url),
            )
            .await;
        }
    }

    all
}
