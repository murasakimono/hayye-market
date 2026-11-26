use crate::db;
use crate::models::{SearchCandidate, SiteSessionInfo};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

static WEBVIEW_SEARCH_RESULTS: OnceLock<Mutex<Vec<SearchCandidate>>> = OnceLock::new();

fn search_store() -> &'static Mutex<Vec<SearchCandidate>> {
    WEBVIEW_SEARCH_RESULTS.get_or_init(|| Mutex::new(Vec::new()))
}

pub fn clear_webview_search_results() {
    if let Ok(mut g) = search_store().lock() {
        g.clear();
    }
}

pub fn push_webview_search_results(items: Vec<SearchCandidate>) {
    if let Ok(mut g) = search_store().lock() {
        for it in items {
            if !g.iter().any(|x| x.url == it.url) {
                g.push(it);
            }
        }
        g.sort_by(|a, b| a.price_try.partial_cmp(&b.price_try).unwrap_or(std::cmp::Ordering::Equal));
        if g.len() > 45 {
            g.truncate(45);
        }
    }
}

pub fn get_webview_search_results() -> Vec<SearchCandidate> {
    search_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

pub struct SiteDef {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: &'static str, // "events" | "shopping"
    pub login_url: &'static str,
    pub scan_url: &'static str,
}

pub const SITES: &[SiteDef] = &[
    SiteDef {
        id: "bubilet",
        name: "Bubilet",
        kind: "events",
        login_url: "https://www.bubilet.com.tr/istanbul",
        scan_url: "https://www.bubilet.com.tr/istanbul",
    },
    SiteDef {
        id: "biletix",
        name: "Biletix",
        kind: "events",
        login_url: "https://www.biletix.com/anasayfa/TURKIYE/tr",
        scan_url: "https://www.biletix.com/anasayfa/TURKIYE/tr",
    },
    SiteDef {
        id: "passo",
        name: "Passo",
        kind: "events",
        login_url: "https://www.passo.com.tr/tr/giris",
        scan_url: "https://www.passo.com.tr/tr/kategori/muzik-konser-festival-biletleri/8615",
    },
    SiteDef {
        id: "zorlupsm",
        name: "Zorlu PSM",
        kind: "events",
        login_url: "https://www.zorlupsm.com/tr/etkinlikler",
        scan_url: "https://www.zorlupsm.com/tr/etkinlikler",
    },
    SiteDef {
        id: "paribu",
        name: "Paribu Pass",
        kind: "events",
        login_url: "https://www.paribucineverse.com",
        scan_url: "https://www.paribucineverse.com",
    },
    SiteDef {
        id: "trendyol",
        name: "Trendyol",
        kind: "shopping",
        login_url: "https://www.trendyol.com/giris",
        scan_url: "https://www.trendyol.com/sr?q={q}",
    },
    SiteDef {
        id: "hepsiburada",
        name: "Hepsiburada",
        kind: "shopping",
        login_url: "https://www.hepsiburada.com",
        scan_url: "https://www.hepsiburada.com/ara?q={q}",
    },
    SiteDef {
        id: "zara",
        name: "Zara TR",
        kind: "shopping",
        login_url: "https://www.zara.com/tr/",
        scan_url: "https://www.zara.com/tr/tr/search?searchTerm={q}",
    },
    SiteDef {
        id: "sahibinden",
        name: "Sahibinden",
        kind: "shopping",
        login_url: "https://www.sahibinden.com",
        scan_url: "https://www.sahibinden.com/kelime-ile-arama?query_text={q}",
    },
    SiteDef {
        id: "dolap",
        name: "Dolap",
        kind: "shopping",
        login_url: "https://dolap.com",
        scan_url: "https://dolap.com/ara?q={q}",
    },
    SiteDef {
        id: "sephora",
        name: "Sephora TR",
        kind: "shopping",
        login_url: "https://www.sephora.com.tr",
        scan_url: "https://www.sephora.com.tr/arama?q={q}",
    },
];

pub fn list_site_sessions() -> Vec<SiteSessionInfo> {
    let connected = db::open_db()
        .ok()
        .and_then(|c| db::list_connected_sites(&c).ok())
        .unwrap_or_default();
    SITES
        .iter()
        .map(|s| SiteSessionInfo {
            id: s.id.to_string(),
            name: s.name.to_string(),
            kind: s.kind.to_string(),
            login_url: s.login_url.to_string(),
            connected_at: connected.get(s.id).cloned(),
        })
        .collect()
}

pub fn open_site_login_window(app: &AppHandle, site_id: &str) -> Result<String, String> {
    let def = SITES
        .iter()
        .find(|s| s.id == site_id)
        .ok_or_else(|| format!("Bilinmeyen site: {}", site_id))?;

    let label = format!("hayye-session-{}", def.id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(format!("{} oturum penceresi öne getirildi.", def.name));
    }

    let url = def
        .login_url
        .parse::<tauri::Url>()
        .map_err(|e| e.to_string())?;

    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(&format!("Hayye Oturum — {} (Giriş yaptıktan sonra pencereyi kapatabilirsin)", def.name))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .inner_size(1100.0, 760.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    if let Ok(conn) = db::open_db() {
        let _ = db::mark_site_connected(&conn, def.id);
    }

    Ok(format!("{} oturum penceresi açıldı. Giriş yaptıktan sonra oturum Hayye profilinde kalıcı saklanır.", def.name))
}

fn build_events_extractor_script(source_name: &str, site_id: &str) -> String {
    format!(
        r##"
(function() {{
  if (window.__hayyeScanRan) return;
  window.__hayyeScanRan = true;
  const SOURCE = "{source_name}";
  const SITE_ID = "{site_id}";
  const BRIDGE = "http://127.0.0.1:47821";

  function needsHumanCheck() {{
    const txt = (document.title + " " + (document.body ? document.body.innerText.slice(0, 900) : "")).toLowerCase();
    return /verify you are human|just a moment|cloudflare|captcha|ben robot değilim|olağandışı trafik/.test(txt);
  }}

  function extract() {{
    if (needsHumanCheck()) {{
      fetch(BRIDGE + "/api/webview-attention", {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ site_id: SITE_ID, source: SOURCE }})
      }}).catch(() => {{}});
      return false;
    }}

    const out = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll(
      "a[href*='/etkinlik'], a[href*='/event'], a[href*='/konser'], a[href*='/tiyatro'], a[href*='/stand-up'], a[href*='/muzik'], a[href*='etkinlik-detay'], article a[href]"
    ));

    for (const a of anchors) {{
      const href = a.href || "";
      if (!href.startsWith("http") || seen.has(href)) continue;
      if (href.length < 24 || /giris|login|sepet|cart|hakkimizda|iletisim|kvkk/.test(href.toLowerCase())) continue;

      const card = a.closest("article, li, [class*='card'], [class*='event'], [class*='item']") || a;
      const hEl = card.querySelector("h1, h2, h3, h4, [class*='title'], [class*='name']");
      const rawTitle = (hEl ? hEl.innerText : (a.getAttribute("title") || a.innerText || "")).replace(/\s+/g, " ").trim();
      if (rawTitle.length < 4 || rawTitle.length > 130) continue;

      let img = "";
      const imgEl = card.querySelector("img");
      if (imgEl) {{
        img = imgEl.getAttribute("data-src") || imgEl.getAttribute("src") || "";
        if (img.startsWith("//")) img = "https:" + img;
        if (img.startsWith("/")) img = location.origin + img;
        if (img.startsWith("data:")) img = "";
      }}
      if (!img) {{
        const bgEl = card.querySelector("[style*='background-image']");
        if (bgEl) {{
          const m = (bgEl.getAttribute("style") || "").match(/url\(["']?(https?:[^"')]+)["']?\)/i);
          if (m) img = m[1];
        }}
      }}

      const dateEl = card.querySelector("time, [class*='date'], [class*='tarih']");
      const venueEl = card.querySelector("address, [class*='venue'], [class*='mekan'], [class*='location']");
      const priceEl = card.querySelector("[class*='price'], [class*='fiyat']");

      const lower = (rawTitle + " " + href).toLowerCase();
      const category = /stand|komedi/.test(lower) ? "standup" : /tiyatro|oyun|sahne/.test(lower) ? "theater" : /fest/.test(lower) ? "festival" : "concert";

      seen.add(href);
      out.push({{
        id: SITE_ID + "-" + btoa(unescape(encodeURIComponent(href))).replace(/[^a-zA-Z0-9]/g, "").slice(-20),
        title: rawTitle,
        category,
        city: "İstanbul",
        venue: venueEl ? venueEl.innerText.replace(/\s+/g, " ").trim().slice(0, 70) : SOURCE,
        date_label: dateEl ? dateEl.innerText.replace(/\s+/g, " ").trim().slice(0, 45) : "Satışta",
        price_label: priceEl ? priceEl.innerText.replace(/\s+/g, " ").trim().slice(0, 32) : "Biletler Açık",
        image_url: img,
        url: href,
        source: SOURCE
      }});
      if (out.length >= 26) break;
    }}

    if (out.length > 0) {{
      fetch(BRIDGE + "/api/webview-ingest-events", {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ site_id: SITE_ID, events: out }})
      }}).catch(() => {{}});
      return true;
    }}
    return false;
  }}

  setTimeout(() => {{
    if (!extract()) {{
      setTimeout(extract, 2600);
    }}
  }}, 2600);
}})();
"##,
        source_name = source_name,
        site_id = site_id
    )
}

fn build_shopping_extractor_script(source_name: &str, site_id: &str) -> String {
    format!(
        r##"
(function() {{
  if (window.__hayyeShopScanRan) return;
  window.__hayyeShopScanRan = true;
  const SOURCE = "{source_name}";
  const SITE_ID = "{site_id}";
  const BRIDGE = "http://127.0.0.1:47821";

  function parseTry(txt) {{
    if (!txt) return 0;
    const m = txt.match(/(\d{{1,3}}(?:\.\d{{3}})+|\d+)(?:,\d{{1,2}})?\s*(?:TL|₺)/i)
      || txt.match(/(?:TL|₺)\s*(\d{{1,3}}(?:\.\d{{3}})+|\d+)/i);
    if (!m) return 0;
    return parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
  }}

  function extract() {{
    const txt = (document.title + " " + (document.body ? document.body.innerText.slice(0, 800) : "")).toLowerCase();
    if (/verify you are human|just a moment|captcha|ben robot değilim|olağandışı/.test(txt)) {{
      fetch(BRIDGE + "/api/webview-attention", {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ site_id: SITE_ID, source: SOURCE }})
      }}).catch(() => {{}});
      return false;
    }}

    const out = [];
    const seen = new Set();
    const cards = Array.from(document.querySelectorAll(
      ".p-card-wrppr, [data-testid='product-card'], li.product-grid-product, tr.searchResultsItem, article, [class*='product-card'], [class*='ProductCard']"
    ));

    for (const card of cards) {{
      const a = card.querySelector("a[href]");
      if (!a || !a.href || !a.href.startsWith("http") || seen.has(a.href)) continue;
      const price = parseTry(card.innerText || "");
      if (price <= 10 || price > 2000000) continue;

      const tEl = card.querySelector("h2, h3, .prdct-desc-cntnr-name, .classifiedTitle, [class*='title'], [class*='name']");
      const title = (tEl ? tEl.innerText : (a.getAttribute("title") || a.innerText || "")).replace(/\s+/g, " ").trim();
      if (title.length < 4) continue;

      const imgEl = card.querySelector("img");
      let img = imgEl ? (imgEl.getAttribute("data-src") || imgEl.getAttribute("src") || "") : "";
      if (img.startsWith("//")) img = "https:" + img;
      if (img.startsWith("data:")) img = "";

      seen.add(a.href);
      out.push({{
        title: title.slice(0, 130),
        price_try: price,
        store_name: SOURCE,
        url: a.href,
        image_url: img,
        source: SOURCE + " (Dahili Oturum)",
        offer_count: 1
      }});
      if (out.length >= 12) break;
    }}

    if (out.length > 0) {{
      fetch(BRIDGE + "/api/webview-ingest-search", {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ site_id: SITE_ID, items: out }})
      }}).catch(() => {{}});
      return true;
    }}
    return false;
  }}

  setTimeout(() => {{
    if (!extract()) setTimeout(extract, 2600);
  }}, 2600);
}})();
"##,
        source_name = source_name,
        site_id = site_id
    )
}

pub fn spawn_background_scan(app: &AppHandle, site_id: &str, query: Option<&str>) -> Result<(), String> {
    let def = SITES
        .iter()
        .find(|s| s.id == site_id)
        .ok_or_else(|| format!("Bilinmeyen site: {}", site_id))?;

    let target_url = if let Some(q) = query {
        let enc = q.trim().replace(' ', "%20");
        def.scan_url.replace("{q}", &enc)
    } else {
        def.scan_url.to_string()
    };

    let url = target_url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    let ts = chrono::Utc::now().timestamp_millis();
    let label = format!("hayye-bg-{}-{}", def.id, ts % 100000);

    let script = if def.kind == "events" {
        build_events_extractor_script(def.name, def.id)
    } else {
        build_shopping_extractor_script(def.name, def.id)
    };

    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(&format!("Hayye Arka Plan Tarayıcı — {}", def.name))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .inner_size(1200.0, 820.0)
        .visible(false)
        .skip_taskbar(true)
        .initialization_script(&script)
        .build()
        .map_err(|e| e.to_string())?;

    // Auto-close hidden scanner window after 10s so zero background RAM accumulates
    let app_clone = app.clone();
    let label_clone = label.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;
        if let Some(w) = app_clone.get_webview_window(&label_clone) {
            let _ = w.close();
        }
    });
    let _ = win;
    Ok(())
}
