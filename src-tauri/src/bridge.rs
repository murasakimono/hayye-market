use crate::db;
use crate::models::{AddManualUsedRequest, BridgeBulkProducts, BridgeIngestProduct, BridgeUsedBatch};
use crate::scraper_engine;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const BRIDGE_PORT: u16 = 47821;

const IOS_PWA_HTML: &str = r##"<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Hayye Market" />
  <meta name="theme-color" content="#0E1012" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <title>Hayye Market — Mobil</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body { width: 100%; max-width: 100%; overflow-x: hidden; margin: 0; background: #0E1012; color: #F2EFE9; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); }
    header { position: sticky; top: 0; width: 100%; background: #0B0D0F; border-bottom: 1px solid #242930; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; z-index: 10; }
    .brand { font-weight: 700; font-size: 16px; letter-spacing: 0.02em; display: flex; align-items: center; gap: 8px; min-width: 0; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; flex-shrink: 0; }
    .wrap { width: 100%; padding: 14px 16px 80px; max-width: 720px; margin: 0 auto; }
    .add-box { display: flex; gap: 8px; margin-bottom: 14px; width: 100%; }
    input { flex: 1; min-width: 0; width: 100%; background: #14171A; border: 1px solid #323942; color: #F2EFE9; padding: 11px 12px; font-size: 14px; border-radius: 0; }
    button { flex-shrink: 0; background: #10B981; color: #0E1012; border: none; padding: 11px 14px; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
    .card { background: #14171A; border: 1px solid #242930; padding: 13px; margin-bottom: 10px; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
    .title { font-size: 14px; font-weight: 600; line-height: 1.35; }
    .price { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 17px; font-weight: 700; color: #10B981; white-space: nowrap; }
    .meta { font-size: 11px; color: #9AA2AC; margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .badge { padding: 2px 6px; border: 1px solid #323942; font-family: ui-monospace, monospace; font-size: 10px; }
    .dip { border-color: #10B981; color: #10B981; }
    .fake { border-color: #F43F5E; color: #F43F5E; }
    .used { color: #3B82F6; }
    .sizes { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px; }
    .sz { font-family: ui-monospace, monospace; font-size: 10px; padding: 2px 6px; border: 1px solid #323942; }
    .sz.in { border-color: #10B981; color: #10B981; }
    .sz.out { color: #656E78; text-decoration: line-through; }
    .actions { margin-top: 10px; display: flex; gap: 8px; }
    .a-btn { text-decoration: none; font-size: 12px; font-weight: 600; padding: 7px 10px; border: 1px solid #323942; color: #F2EFE9; }
    .a-btn.sniper { background: #10B981; color: #0E1012; border-color: #10B981; }
    #msg { font-size: 12px; color: #10B981; margin-bottom: 10px; }
  </style>
</head>
<body>
  <header>
    <div class="brand"><span class="dot"></span> Hayye Market</div>
    <button onclick="load()" style="padding:6px 10px;font-size:11px;background:#1A1E23;color:#F2EFE9;border:1px solid #323942">Yenile</button>
  </header>
  <div class="wrap">
    <form class="add-box" onsubmit="addUrl(event)">
      <input id="u" placeholder="Zara, Flaw, Trendyol, Amazon linki yapıştır..." />
      <button type="submit">Ekle</button>
    </form>
    <div id="msg"></div>
    <div id="list">Yükleniyor...</div>
  </div>
  <script>
    const fmt = v => Math.round(v).toLocaleString('tr-TR') + ' ₺';
    async function load() {
      const r = await fetch('/api/products');
      const items = await r.json();
      const el = document.getElementById('list');
      if (!items.length) { el.innerHTML = '<div class="card">Henüz ürün yok. Yukarıya link yapıştır.</div>'; return; }
      el.innerHTML = items.map(p => {
        const cls = p.discount_verdict.status.includes('GENUINE') ? 'dip' : p.discount_verdict.status === 'INFLATED_FAKE' ? 'fake' : '';
        const szHtml = (p.sizes || []).slice(0, 8).map(s => `<span class="sz ${s.in_stock ? 'in' : 'out'}">${s.size}</span>`).join('');
        const buyUrl = p.quick_checkout_url || p.primary_url;
        return `<div class="card">
          <div class="row"><div class="title">${p.title}</div><div class="price">${fmt(p.best_new_try)}</div></div>
          <div class="meta">
            <span class="badge ${cls}">${p.discount_verdict.badge}</span>
            <span>Güven %${p.avg_trust_score}</span>
            ${p.best_used_try ? `<span class="used">2. El ${fmt(p.best_used_try)}</span>` : ''}
            ${p.unit_price ? `<span>10${p.unit_price.unit}: ${p.unit_price.price_per_10_try}₺</span>` : ''}
          </div>
          ${szHtml ? `<div class="sizes">${szHtml}</div>` : ''}
          <div class="actions">
            <a class="a-btn sniper" href="${buyUrl}" target="_blank">⚡ Hızlı Alım / Sepet</a>
            <a class="a-btn" href="${p.primary_url}" target="_blank">Ürüne Git ↗</a>
          </div>
        </div>`;
      }).join('');
    }
    async function addUrl(e) {
      e.preventDefault();
      const inp = document.getElementById('u');
      const url = inp.value.trim();
      if (!url) return;
      document.getElementById('msg').textContent = 'Taranıyor...';
      const r = await fetch('/ios-share', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url }) });
      const d = await r.json();
      document.getElementById('msg').textContent = d.ok ? '✓ Takibe alındı!' : (d.error || 'Hata');
      inp.value = '';
      load();
    }
    load();
  </script>
</body>
</html>"##;

const MANIFEST_JSON: &str = r##"{
  "name": "Hayye Market",
  "short_name": "Hayye",
  "start_url": "/app",
  "display": "standalone",
  "background_color": "#0E1012",
  "theme_color": "#0E1012",
  "icons": [{ "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" }]
}"##;

const ICON_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#0E1012"/><rect x="28" y="28" width="12" height="72" rx="3" fill="#F2EFE9"/><rect x="88" y="28" width="12" height="72" rx="3" fill="#F2EFE9"/><path d="M34 66 L52 66 L63 82 L78 46 L94 60" fill="none" stroke="#10B981" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;

pub fn spawn_bridge_server() {
    tauri::async_runtime::spawn(async move {
        let addr = format!("0.0.0.0:{}", BRIDGE_PORT);
        let Ok(listener) = TcpListener::bind(&addr).await else {
            return;
        };

        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                continue;
            };
            tokio::spawn(async move {
                let mut buf = vec![0u8; 131072];
                let Ok(n) = stream.read(&mut buf).await else {
                    return;
                };
                if n == 0 {
                    return;
                }
                let req_str = String::from_utf8_lossy(&buf[..n]).to_string();
                let mut lines = req_str.lines();
                let first = lines.next().unwrap_or("");
                let mut parts = first.split_whitespace();
                let method = parts.next().unwrap_or("");
                let path = parts.next().unwrap_or("/").split('?').next().unwrap_or("/");

                let body_str = req_str
                    .split("\r\n\r\n")
                    .nth(1)
                    .unwrap_or("")
                    .trim_matches('\0')
                    .trim();

                let (status, ctype, body) = if method == "OPTIONS" {
                    ("204 No Content", "text/plain", String::new())
                } else if method == "GET" && (path == "/" || path == "/app") {
                    ("200 OK", "text/html; charset=utf-8", IOS_PWA_HTML.to_string())
                } else if method == "GET" && path == "/manifest.webmanifest" {
                    ("200 OK", "application/manifest+json", MANIFEST_JSON.to_string())
                } else if method == "GET" && path == "/icon.svg" {
                    ("200 OK", "image/svg+xml", ICON_SVG.to_string())
                } else if method == "GET" && path == "/ping" {
                    ("200 OK", "application/json", r#"{"ok":true,"app":"Hayye Market","version":"1.1.1"}"#.to_string())
                } else if method == "GET" && path == "/api/products" {
                    match db::open_db().and_then(|c| db::list_products(&c)) {
                        Ok(list) => ("200 OK", "application/json", serde_json::to_string(&list).unwrap_or_else(|_| "[]".into())),
                        Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                    }
                } else if method == "GET" && path == "/products" {
                    match db::open_db().and_then(|c| db::list_products(&c)) {
                        Ok(list) => {
                            let slim: Vec<_> = list
                                .into_iter()
                                .map(|p| serde_json::json!({ "id": p.id, "title": p.title, "best_new_try": p.best_new_try }))
                                .collect();
                            ("200 OK", "application/json", serde_json::to_string(&slim).unwrap_or_else(|_| "[]".into()))
                        }
                        Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                    }
                } else if method == "POST" && path == "/ios-share" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let url = v["url"].as_str().unwrap_or("").trim().to_string();
                        if url.starts_with("http") {
                            let rates = scraper_engine::fetch_market_rates().await;
                            match scraper_engine::scrape_product_url(&url).await {
                                Ok(sc) => {
                                    let best = sc.offers.iter().map(|o| o.2).fold(f64::INFINITY, f64::min);
                                    let best = if best.is_finite() { best } else { 0.0 };
                                    let st = sc.offers.first().map(|o| o.0.clone()).unwrap_or_else(|| "iOS Share".to_string());
                                    let r = db::open_db().and_then(|conn| {
                                        let pid = db::upsert_product_with_offer(
                                            &conn, 1, &sc.title, &sc.image_url, &url, &st, &st, best, rates.usd_try, "ios_share"
                                        )?;
                                        if !sc.sizes.is_empty() || sc.quick_checkout_url.is_some() {
                                            let _ = db::update_product_sizes(&conn, pid, &sc.sizes, sc.quick_checkout_url.as_deref());
                                        }
                                        Ok(pid)
                                    });
                                    match r {
                                        Ok(pid) => ("200 OK", "application/json", format!(r#"{{"ok":true,"product_id":{}}}"#, pid)),
                                        Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                                    }
                                }
                                Err(e) => ("400 Bad Request", "application/json", format!(r#"{{"error":"{}"}}"#, e.replace('"', "'"))),
                            }
                        } else {
                            ("400 Bad Request", "application/json", r#"{"error":"Geçerli URL gerekli"}"#.to_string())
                        }
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "POST" && path == "/ingest/product" {
                    match serde_json::from_str::<BridgeIngestProduct>(body_str) {
                        Ok(item) => {
                            let rates = scraper_engine::fetch_market_rates().await;
                            let res = db::open_db().and_then(|conn| {
                                let folder_id = item.folder_id.unwrap_or(1);
                                let seller = item.seller_name.clone().unwrap_or_else(|| item.store_name.clone());
                                let pid = db::upsert_product_with_offer(
                                    &conn,
                                    folder_id,
                                    &item.title,
                                    item.image_url.as_deref().unwrap_or(""),
                                    &item.url,
                                    &item.store_name,
                                    &seller,
                                    if item.is_used.unwrap_or(false) { 0.0 } else { item.price_try },
                                    rates.usd_try,
                                    "brave_bridge",
                                )?;
                                if let Some(sz) = &item.sizes {
                                    let _ = db::update_product_sizes(&conn, pid, sz, item.quick_checkout_url.as_deref());
                                } else if item.quick_checkout_url.is_some() {
                                    let _ = db::update_product_sizes(&conn, pid, &[], item.quick_checkout_url.as_deref());
                                }
                                if item.is_used.unwrap_or(false) {
                                    let _ = db::add_used_listing(
                                        &conn,
                                        &AddManualUsedRequest {
                                            product_id: pid,
                                            platform: item.store_name.clone(),
                                            title: item.title.clone(),
                                            price_try: item.price_try,
                                            city: item.city.unwrap_or_else(|| "İstanbul".to_string()),
                                            seller_name: seller,
                                            param_guvende: item.param_guvende.unwrap_or(false),
                                            has_invoice_box: item.has_invoice_box.unwrap_or(false),
                                            photo_count: item.photo_count.unwrap_or(4),
                                            url: item.url.clone(),
                                        },
                                    );
                                }
                                Ok(pid)
                            });
                            match res {
                                Ok(pid) => ("200 OK", "application/json", format!(r#"{{"ok":true,"product_id":{}}}"#, pid)),
                                Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                            }
                        }
                        Err(e) => ("400 Bad Request", "application/json", format!(r#"{{"error":"Geçersiz JSON: {}"}}"#, e)),
                    }
                } else if method == "POST" && path == "/ingest/bulk-products" {
                    match serde_json::from_str::<BridgeBulkProducts>(body_str) {
                        Ok(bulk) => {
                            let rates = scraper_engine::fetch_market_rates().await;
                            let res = db::open_db().and_then(|conn| {
                                let fid = if let Some(fname) = bulk.folder_name.as_deref().filter(|s| !s.trim().is_empty()) {
                                    db::create_folder(&conn, fname)?
                                } else {
                                    2
                                };
                                let mut count = 0usize;
                                for item in &bulk.items {
                                    if item.title.trim().is_empty() {
                                        continue;
                                    }
                                    let seller = item.seller_name.clone().unwrap_or_else(|| item.store_name.clone());
                                    if let Ok(pid) = db::upsert_product_with_offer(
                                        &conn,
                                        fid,
                                        &item.title,
                                        item.image_url.as_deref().unwrap_or(""),
                                        &item.url,
                                        &item.store_name,
                                        &seller,
                                        item.price_try,
                                        rates.usd_try,
                                        "brave_fav_sync",
                                    ) {
                                        if let Some(sz) = &item.sizes {
                                            let _ = db::update_product_sizes(&conn, pid, sz, item.quick_checkout_url.as_deref());
                                        }
                                        count += 1;
                                    }
                                }
                                Ok(count)
                            });
                            match res {
                                Ok(c) => ("200 OK", "application/json", format!(r#"{{"ok":true,"added":{}}}"#, c)),
                                Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                            }
                        }
                        Err(e) => ("400 Bad Request", "application/json", format!(r#"{{"error":"Geçersiz JSON: {}"}}"#, e)),
                    }
                } else if method == "POST" && path == "/ingest/used-batch" {
                    match serde_json::from_str::<BridgeUsedBatch>(body_str) {
                        Ok(batch) => {
                            let res = db::open_db().map(|conn| {
                                let mut added = 0usize;
                                for u in &batch.listings {
                                    if u.price_try <= 0.0 {
                                        continue;
                                    }
                                    let _ = db::add_used_listing(
                                        &conn,
                                        &AddManualUsedRequest {
                                            product_id: batch.product_id,
                                            platform: batch.platform.clone(),
                                            title: u.title.clone(),
                                            price_try: u.price_try,
                                            city: u.city.clone(),
                                            seller_name: u.seller_name.clone(),
                                            param_guvende: u.param_guvende,
                                            has_invoice_box: u.has_invoice_box,
                                            photo_count: u.photo_count,
                                            url: u.url.clone(),
                                        },
                                    );
                                    added += 1;
                                }
                                added
                            });
                            match res {
                                Ok(added) => ("200 OK", "application/json", format!(r#"{{"ok":true,"added":{}}}"#, added)),
                                Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                            }
                        }
                        Err(e) => ("400 Bad Request", "application/json", format!(r#"{{"error":"Geçersiz JSON: {}"}}"#, e)),
                    }
                } else {
                    ("404 Not Found", "application/json", r#"{"error":"Not found"}"#.to_string())
                };

                let resp = format!(
                    "HTTP/1.1 {}\r\nContent-Type: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    status,
                    ctype,
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            });
        }
    });
}
