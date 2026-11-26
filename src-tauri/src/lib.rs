mod bridge;
mod db;
mod models;
mod notify;
mod scraper_engine;
mod tunnel;

use chrono::Utc;
use models::*;
use rusqlite::params;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

#[tauri::command]
async fn get_market_rates() -> MarketRates {
    scraper_engine::fetch_market_rates().await
}

#[tauri::command]
fn get_folders() -> Result<Vec<FolderItem>, String> {
    let conn = db::open_db()?;
    db::list_folders(&conn)
}

#[tauri::command]
fn create_folder(name: String) -> Result<i64, String> {
    let conn = db::open_db()?;
    db::create_folder(&conn, &name)
}

#[tauri::command]
fn get_products() -> Result<Vec<ProductDetail>, String> {
    let conn = db::open_db()?;
    db::list_products(&conn)
}

#[tauri::command]
async fn search_live_tr(query: String) -> Vec<SearchCandidate> {
    scraper_engine::search_products_tr(&query).await
}

#[tauri::command]
async fn track_from_candidate(
    folder_id: i64,
    title: String,
    price_try: f64,
    store_name: String,
    url: String,
    image_url: String,
    source: String,
) -> Result<i64, String> {
    let rates = scraper_engine::fetch_market_rates().await;
    let scraped = scraper_engine::scrape_product_url(&url).await.ok();
    let conn = db::open_db()?;

    let final_title = scraped
        .as_ref()
        .map(|s| s.title.clone())
        .filter(|t| t.len() > 4 && t != "Takip Edilen Ürün")
        .unwrap_or(title);
    let final_img = scraped
        .as_ref()
        .map(|s| s.image_url.clone())
        .filter(|i| !i.is_empty())
        .unwrap_or(image_url);

    let pid = db::upsert_product_with_offer(
        &conn,
        folder_id,
        &final_title,
        &final_img,
        &url,
        &store_name,
        &store_name,
        price_try,
        rates.usd_try,
        &source,
    )?;

    if let Some(sc) = scraped {
        if !sc.sizes.is_empty() || sc.quick_checkout_url.is_some() {
            let _ = db::update_product_sizes(&conn, pid, &sc.sizes, sc.quick_checkout_url.as_deref());
        }
        let now = Utc::now().to_rfc3339();
        for (st, seller, p, u) in sc.offers {
            if p > 0.0 {
                let _ = conn.execute(
                    "DELETE FROM offers WHERE product_id = ?1 AND lower(store_name) = lower(?2)",
                    params![pid, st],
                );
                let _ = conn.execute(
                    "INSERT INTO offers (product_id, store_name, seller_name, price_try, shipping_try, in_stock, url, updated_at)
                     VALUES (?1, ?2, ?3, ?4, 0, 1, ?5, ?6)",
                    params![pid, st, seller, p, u, now],
                );
            }
        }
    }

    Ok(pid)
}

#[tauri::command]
async fn track_from_url(folder_id: i64, url: String) -> Result<i64, String> {
    let clean = url.trim().to_string();
    if !clean.starts_with("http") {
        return Err("Geçerli bir http/https ürün linki gir.".to_string());
    }
    let rates = scraper_engine::fetch_market_rates().await;
    let scraped = scraper_engine::scrape_product_url(&clean).await?;
    let conn = db::open_db()?;
    let best = scraped
        .offers
        .iter()
        .map(|o| o.2)
        .fold(f64::INFINITY, f64::min);
    let best = if best.is_finite() { best } else { 0.0 };
    let first_store = scraped
        .offers
        .first()
        .map(|o| o.0.clone())
        .unwrap_or_else(|| "Mağaza".to_string());

    let pid = db::upsert_product_with_offer(
        &conn,
        folder_id,
        &scraped.title,
        &scraped.image_url,
        &clean,
        &first_store,
        &first_store,
        best,
        rates.usd_try,
        "direct_url",
    )?;

    if !scraped.sizes.is_empty() || scraped.quick_checkout_url.is_some() {
        let _ = db::update_product_sizes(&conn, pid, &scraped.sizes, scraped.quick_checkout_url.as_deref());
    }
    let now = Utc::now().to_rfc3339();
    for (st, seller, p, u) in scraped.offers {
        if p > 0.0 {
            let _ = conn.execute(
                "DELETE FROM offers WHERE product_id = ?1 AND lower(store_name) = lower(?2)",
                params![pid, st],
            );
            let _ = conn.execute(
                "INSERT INTO offers (product_id, store_name, seller_name, price_try, shipping_try, in_stock, url, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 1, ?5, ?6)",
                params![pid, st, seller, p, u, now],
            );
        }
    }
    Ok(pid)
}

#[tauri::command]
async fn refresh_product(product_id: i64) -> Result<String, String> {
    let (url, title, target, tracked_sizes) = {
        let conn = db::open_db()?;
        conn.query_row(
            "SELECT primary_url, title, target_price_try, COALESCE(tracked_sizes, '') FROM products WHERE id = ?1",
            params![product_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<f64>>(2)?,
                    r.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?
    };

    let rates = scraper_engine::fetch_market_rates().await;
    let scraped = scraper_engine::scrape_product_url(&url).await?;
    let best = scraped
        .offers
        .iter()
        .map(|o| o.2)
        .fold(f64::INFINITY, f64::min);
    if !best.is_finite() || best <= 0.0 {
        return Err("Güncel fiyat okunamadı (site bot korumalıysa Brave eklentisiyle sayfayı aç).".to_string());
    }

    let settings = {
        let conn = db::open_db()?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE products SET updated_at = ?1 WHERE id = ?2",
            params![now, product_id],
        )
        .map_err(|e| e.to_string())?;
        if !scraped.sizes.is_empty() || scraped.quick_checkout_url.is_some() {
            let _ = db::update_product_sizes(&conn, product_id, &scraped.sizes, scraped.quick_checkout_url.as_deref());
        }
        for (st, seller, p, u) in &scraped.offers {
            let _ = conn.execute(
                "DELETE FROM offers WHERE product_id = ?1 AND lower(store_name) = lower(?2)",
                params![product_id, st],
            );
            let _ = conn.execute(
                "INSERT INTO offers (product_id, store_name, seller_name, price_try, shipping_try, in_stock, url, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 1, ?5, ?6)",
                params![product_id, st, seller, p, u, now],
            );
        }
        conn.execute(
            "INSERT INTO price_history (product_id, ts, price_try, usd_rate, source) VALUES (?1, ?2, ?3, ?4, 'refresh')",
            params![product_id, now, best, rates.usd_try],
        )
        .map_err(|e| e.to_string())?;
        db::load_settings(&conn)
    };

    let wanted: Vec<String> = tracked_sizes
        .split(',')
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect();
    let matched_size = scraped
        .sizes
        .iter()
        .find(|s| s.in_stock && wanted.iter().any(|w| s.size.to_uppercase() == *w));
    let checkout_link = matched_size
        .and_then(|s| s.cart_url.clone())
        .or(scraped.quick_checkout_url)
        .unwrap_or(url.clone());

    if let Some(ms) = matched_size {
        let _ = notify::dispatch_alert(
            &settings,
            &format!("BEDEN STOĞA GİRDİ ({}): {}", ms.size, title),
            &format!("Güncel fiyat: {:.0} ₺\nHızlı Alım: {}", best, checkout_link),
        )
        .await;
    }

    if let Some(t) = target {
        if best <= t {
            let _ = notify::dispatch_alert(
                &settings,
                &format!("HEDEF FİYAT YAKALANDI: {}", title),
                &format!("Güncel en ucuz fiyat: {:.0} ₺ (Hedef: {:.0} ₺)\nHızlı Alım: {}", best, t, checkout_link),
            )
            .await;
        }
    }

    Ok(format!("Güncellendi: {:.0} ₺", best))
}

#[tauri::command]
fn set_target_price(product_id: i64, target_price_try: Option<f64>) -> Result<(), String> {
    let conn = db::open_db()?;
    conn.execute(
        "UPDATE products SET target_price_try = ?1 WHERE id = ?2",
        params![target_price_try, product_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn move_product_folder(product_id: i64, folder_id: i64) -> Result<(), String> {
    let conn = db::open_db()?;
    conn.execute(
        "UPDATE products SET folder_id = ?1 WHERE id = ?2",
        params![folder_id, product_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_product(product_id: i64) -> Result<(), String> {
    let conn = db::open_db()?;
    conn.execute("DELETE FROM offers WHERE product_id = ?1", params![product_id]).ok();
    conn.execute("DELETE FROM used_listings WHERE product_id = ?1", params![product_id]).ok();
    conn.execute("DELETE FROM price_history WHERE product_id = ?1", params![product_id]).ok();
    conn.execute("DELETE FROM products WHERE id = ?1", params![product_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_manual_used(req: AddManualUsedRequest) -> Result<i64, String> {
    let conn = db::open_db()?;
    db::add_used_listing(&conn, &req)
}

#[tauri::command]
fn delete_used_listing(listing_id: i64) -> Result<(), String> {
    let conn = db::open_db()?;
    conn.execute("DELETE FROM used_listings WHERE id = ?1", params![listing_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_alert_settings() -> Result<AlertSettings, String> {
    let conn = db::open_db()?;
    Ok(db::load_settings(&conn))
}

#[tauri::command]
fn save_alert_settings(settings: AlertSettings) -> Result<(), String> {
    let conn = db::open_db()?;
    db::save_settings(&conn, &settings)
}

#[tauri::command]
async fn test_alert_channels(settings: AlertSettings) -> Result<String, String> {
    notify::dispatch_alert(
        &settings,
        "Hayye Market Test Bildirimi",
        "Anlık fiyat & 2. el fırsat bildirim hattın aktif ve çalışıyor.",
    )
    .await
}

#[tauri::command]
fn set_tracked_sizes(product_id: i64, tracked_sizes: String) -> Result<(), String> {
    let conn = db::open_db()?;
    conn.execute(
        "UPDATE products SET tracked_sizes = ?1 WHERE id = ?2",
        params![tracked_sizes.trim(), product_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_saved_total() -> Result<f64, String> {
    let conn = db::open_db()?;
    Ok(db::get_saved_total(&conn))
}

#[tauri::command]
fn record_savings(delta_try: f64) -> Result<f64, String> {
    let conn = db::open_db()?;
    db::add_saved_amount(&conn, delta_try)
}

#[tauri::command]
fn get_mobile_access_info() -> Result<MobileAccessInfo, String> {
    let conn = db::open_db()?;
    let settings = db::load_settings(&conn);
    let lan_ip = std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let tunnel = tunnel::get_status();
    let cloudflared_installed = !tunnel.cloudflared_path.is_empty();
    Ok(MobileAccessInfo {
        lan_url: format!("http://{}:{}/app", lan_ip, bridge::BRIDGE_PORT),
        cloudflare_url: settings.cloudflare_tunnel_url,
        cloudflared_installed,
        tunnel,
    })
}

#[tauri::command]
fn start_cloudflare_tunnel(settings: Option<AlertSettings>) -> Result<TunnelStatus, String> {
    let conn = db::open_db()?;
    let eff = if let Some(s) = settings {
        db::save_settings(&conn, &s)?;
        s
    } else {
        db::load_settings(&conn)
    };
    tunnel::start_tunnel(eff)
}

#[tauri::command]
fn stop_cloudflare_tunnel() -> TunnelStatus {
    tunnel::stop_tunnel();
    tunnel::get_status()
}

#[tauri::command]
fn get_tunnel_status() -> TunnelStatus {
    tunnel::get_status()
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Geçersiz URL".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let _ = db::open_db();
            bridge::spawn_bridge_server();
            tunnel::auto_start_if_configured();

            // Windows System Tray
            let show_i = MenuItem::with_id(app, "show", "Hayye Market'i Göster", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Hayye Market — Fiyat & 2. El Avcısı (Köprü: 47821)")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        tunnel::stop_tunnel();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_market_rates,
            get_folders,
            create_folder,
            get_products,
            search_live_tr,
            track_from_candidate,
            track_from_url,
            refresh_product,
            set_target_price,
            set_tracked_sizes,
            get_saved_total,
            record_savings,
            get_mobile_access_info,
            start_cloudflare_tunnel,
            stop_cloudflare_tunnel,
            get_tunnel_status,
            move_product_folder,
            delete_product,
            add_manual_used,
            delete_used_listing,
            get_alert_settings,
            save_alert_settings,
            test_alert_channels,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("Hayye Market başlatılırken hata oluştu");
}
