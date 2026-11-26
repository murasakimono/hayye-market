use crate::{db, discover, events, notify, scraper_engine};
use chrono::{Datelike, Local, Timelike, Weekday};
use rusqlite::params;
use std::time::Duration;

pub fn spawn_autonomous_scheduler() {
    tauri::async_runtime::spawn(async move {
        // Initial gentle delay after startup
        tokio::time::sleep(Duration::from_secs(90)).await;
        let mut tick_count: u64 = 0;

        loop {
            tick_count += 1;
            let now = Local::now();
            let hour = now.hour();
            let is_sint_window = (7..=9).contains(&hour) || hour == 0;
            let is_gaming_gecesi = now.weekday() == Weekday::Fri && (hour == 21 || hour == 22 || hour == 23);

            let settings = match db::open_db() {
                Ok(c) => db::load_settings(&c),
                Err(_) => {
                    tokio::time::sleep(Duration::from_secs(300)).await;
                    continue;
                }
            };

            if settings.auto_scan_enabled {
                // 1. Discover extreme drop & Gaming Gecesi scan every 30 min (or 10 min on Friday 22:00)
                if tick_count % 3 == 1 || is_gaming_gecesi {
                    let _ = discover::fetch_discover_feed(&settings).await;
                    events::emit("discover_updated");
                }

                // 2. Refresh tracked products (SINT fashion/size items frequently during 07-09, all others every ~45m)
                if let Ok(list) = db::open_db().and_then(|c| db::list_products(&c)) {
                    let rates = scraper_engine::fetch_market_rates().await;
                    for p in list.into_iter().take(25) {
                        let is_fashion = !p.tracked_sizes.trim().is_empty()
                            || "zara|bershka|stradivarius|pullandbear|flaw|hype|nike|boyner"
                                .test_match(&p.primary_url);
                        let should_scan = if is_sint_window && is_fashion {
                            true
                        } else {
                            tick_count % 4 == 0
                        };
                        if !should_scan || !p.primary_url.starts_with("http") {
                            continue;
                        }
                        if let Ok(sc) = scraper_engine::scrape_product_url(&p.primary_url).await {
                            let best = sc.offers.iter().map(|o| o.2).fold(f64::INFINITY, f64::min);
                            if best.is_finite() && best > 0.0 {
                                if let Ok(conn) = db::open_db() {
                                    let now_iso = chrono::Utc::now().to_rfc3339();
                                    let _ = conn.execute(
                                        "INSERT INTO price_history (product_id, ts, price_try, usd_rate, source) VALUES (?1, ?2, ?3, ?4, 'auto_daemon')",
                                        params![p.id, now_iso, best, rates.usd_try],
                                    );
                                    if !sc.sizes.is_empty() || sc.quick_checkout_url.is_some() {
                                        let _ = db::update_product_sizes(&conn, p.id, &sc.sizes, sc.quick_checkout_url.as_deref());
                                    }
                                }
                                // Check 14-day refund drop alert
                                if let Some(bought) = p.purchased_price_try {
                                    if best < bought - 40.0 {
                                        let _ = notify::dispatch_alert(
                                            &settings,
                                            &format!("14 GÜN İADE FIRSATI: {}", p.title),
                                            &format!("Aldığın fiyat: {:.0} ₺ -> Yeni fiyat: {:.0} ₺ ({:.0} ₺ kâr!)", bought, best, bought - best),
                                        ).await;
                                    }
                                }
                                events::emit("products_updated");
                            }
                        }
                        tokio::time::sleep(Duration::from_secs(2)).await;
                    }
                }
            }

            // Sleep 10 min during SINT/Gaming Gecesi windows, otherwise 15 min base heartbeat
            let sleep_secs = if is_sint_window || is_gaming_gecesi { 600 } else { 900 };
            tokio::time::sleep(Duration::from_secs(sleep_secs)).await;
        }
    });
}

trait StrTestMatch {
    fn test_match(&self, haystack: &str) -> bool;
}

impl StrTestMatch for &str {
    fn test_match(&self, haystack: &str) -> bool {
        let lower = haystack.to_lowercase();
        self.split('|').any(|k| !k.is_empty() && lower.contains(k))
    }
}
