use crate::models::{MarketRates, SearchCandidate, SizeVariant, UnitPriceInfo};
use chrono::Utc;
use regex::Regex;
use scraper::{Html, Selector};
use std::sync::OnceLock;
use std::time::Duration;

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .timeout(Duration::from_secs(12))
            .build()
            .unwrap_or_default()
    })
}

fn url_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}

pub fn parse_tr_price(raw: &str) -> Option<f64> {
    let re = Regex::new(r"([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{2,7})(?:,([0-9]{1,2}))?").ok()?;
    let caps = re.captures(raw)?;
    let whole = caps.get(1)?.as_str().replace('.', "");
    let dec = caps.get(2).map(|m| m.as_str()).unwrap_or("00");
    let val = format!("{}.{}", whole, dec).parse::<f64>().ok()?;
    if val >= 5.0 && val <= 50_000_000.0 {
        Some(val)
    } else {
        None
    }
}

/// Cosmetics / consumables unit price calculator (e.g. "50 ml" or "100 gr")
pub fn detect_unit_price(title: &str, price_try: f64) -> Option<UnitPriceInfo> {
    if price_try <= 0.0 {
        return None;
    }
    let re = Regex::new(r"(?i)\b(\d+(?:[.,]\d+)?)\s*(ml|gr|g)\b").ok()?;
    let caps = re.captures(title)?;
    let amt = caps.get(1)?.as_str().replace(',', ".").parse::<f64>().ok()?;
    if amt < 5.0 || amt > 5000.0 {
        return None;
    }
    let raw_unit = caps.get(2)?.as_str().to_lowercase();
    let unit = if raw_unit == "ml" { "ml" } else { "gr" }.to_string();
    let per_10 = (price_try / amt) * 10.0;
    Some(UnitPriceInfo {
        amount: amt,
        unit,
        price_per_10_try: (per_10 * 10.0).round() / 10.0,
    })
}

pub async fn fetch_market_rates() -> MarketRates {
    let mut usd = 35.2;
    let mut eur = 38.4;
    if let Ok(resp) = client()
        .get("https://api.frankfurter.app/latest?from=TRY&to=USD,EUR")
        .send()
        .await
    {
        if let Ok(j) = resp.json::<serde_json::Value>().await {
            if let Some(u) = j["rates"]["USD"].as_f64().filter(|v| *v > 0.0) {
                usd = 1.0 / u;
            }
            if let Some(e) = j["rates"]["EUR"].as_f64().filter(|v| *v > 0.0) {
                eur = 1.0 / e;
            }
        }
    }
    MarketRates {
        usd_try: (usd * 100.0).round() / 100.0,
        eur_try: (eur * 100.0).round() / 100.0,
        updated_at: Utc::now().to_rfc3339(),
    }
}

pub async fn search_products_tr(query: &str) -> Vec<SearchCandidate> {
    let q = query.trim();
    if q.len() < 2 {
        return Vec::new();
    }
    let (akakce, amazon, vatan) = tokio::join!(
        search_akakce(q),
        search_amazon_tr(q),
        search_vatan(q)
    );
    let mut all = Vec::new();
    all.extend(akakce);
    all.extend(amazon);
    all.extend(vatan);
    all
}

async fn search_akakce(query: &str) -> Vec<SearchCandidate> {
    let url = format!("https://www.akakce.com/arama/?q={}", url_encode(query));
    let mut out = Vec::new();
    let Ok(resp) = client()
        .get(&url)
        .header("Accept-Language", "tr-TR,tr;q=0.9")
        .send()
        .await
    else {
        return out;
    };
    let Ok(html_text) = resp.text().await else {
        return out;
    };

    let doc = Html::parse_document(&html_text);
    let li_sel = Selector::parse("ul#APL > li, ul.pl_v9 > li").unwrap();
    let title_sel = Selector::parse("h3.pn_v8, span.pn_v8, a[title]").unwrap();
    let price_sel = Selector::parse("span.pt_v9, span.pt_v8").unwrap();
    let link_sel = Selector::parse("a[href]").unwrap();
    let img_sel = Selector::parse("img").unwrap();

    for li in doc.select(&li_sel).take(14) {
        let title = li
            .select(&title_sel)
            .next()
            .map(|el| {
                let txt = el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                if txt.is_empty() {
                    el.value().attr("title").unwrap_or("").trim().to_string()
                } else {
                    txt
                }
            })
            .unwrap_or_default();
        let price_txt = li
            .select(&price_sel)
            .next()
            .map(|el| el.text().collect::<Vec<_>>().join(" "))
            .unwrap_or_default();
        let Some(price) = parse_tr_price(&price_txt) else {
            continue;
        };
        if title.len() < 3 {
            continue;
        }
        let href = li
            .select(&link_sel)
            .next()
            .and_then(|a| a.value().attr("href"))
            .unwrap_or("");
        let full_url = if href.starts_with("http") {
            href.to_string()
        } else if href.starts_with('/') {
            format!("https://www.akakce.com{}", href)
        } else {
            url.clone()
        };
        let img = li
            .select(&img_sel)
            .next()
            .and_then(|i| i.value().attr("data-src").or_else(|| i.value().attr("src")))
            .unwrap_or("")
            .to_string();
        let image_url = if img.starts_with("//") {
            format!("https:{}", img)
        } else {
            img
        };

        out.push(SearchCandidate {
            title,
            price_try: price,
            store_name: "Akakçe (Çoklu Mağaza)".to_string(),
            url: full_url,
            image_url,
            source: "akakce".to_string(),
            offer_count: 1,
        });
    }
    out
}

async fn search_amazon_tr(query: &str) -> Vec<SearchCandidate> {
    let url = format!("https://www.amazon.com.tr/s?k={}", url_encode(query));
    let mut out = Vec::new();
    let Ok(resp) = client()
        .get(&url)
        .header("Accept-Language", "tr-TR,tr;q=0.9")
        .send()
        .await
    else {
        return out;
    };
    let Ok(html_text) = resp.text().await else {
        return out;
    };

    let doc = Html::parse_document(&html_text);
    let item_sel = Selector::parse("div[data-component-type='s-search-result']").unwrap();
    let title_sel = Selector::parse("h2 span").unwrap();
    let price_sel = Selector::parse("span.a-price-whole").unwrap();
    let link_sel = Selector::parse("h2 a[href], a.a-link-normal[href*='/dp/']").unwrap();
    let img_sel = Selector::parse("img.s-image").unwrap();

    for item in doc.select(&item_sel).take(8) {
        let title = item
            .select(&title_sel)
            .next()
            .map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string())
            .unwrap_or_default();
        let price_txt = item
            .select(&price_sel)
            .next()
            .map(|e| e.text().collect::<Vec<_>>().join(""))
            .unwrap_or_default();
        let Some(price) = parse_tr_price(&price_txt) else {
            continue;
        };
        if title.len() < 3 {
            continue;
        }
        let href = item
            .select(&link_sel)
            .next()
            .and_then(|a| a.value().attr("href"))
            .unwrap_or("");
        let full_url = if href.starts_with("http") {
            href.to_string()
        } else if href.starts_with('/') {
            format!("https://www.amazon.com.tr{}", href)
        } else {
            url.clone()
        };
        let image_url = item
            .select(&img_sel)
            .next()
            .and_then(|i| i.value().attr("src"))
            .unwrap_or("")
            .to_string();

        out.push(SearchCandidate {
            title,
            price_try: price,
            store_name: "Amazon.com.tr".to_string(),
            url: full_url,
            image_url,
            source: "amazon_tr".to_string(),
            offer_count: 1,
        });
    }
    out
}

async fn search_vatan(query: &str) -> Vec<SearchCandidate> {
    let url = format!("https://www.vatanbilgisayar.com/arama/{}/", url_encode(query));
    let mut out = Vec::new();
    let Ok(resp) = client()
        .get(&url)
        .header("Accept-Language", "tr-TR,tr;q=0.9")
        .send()
        .await
    else {
        return out;
    };
    let Ok(html_text) = resp.text().await else {
        return out;
    };

    let doc = Html::parse_document(&html_text);
    let card_sel = Selector::parse("div.product-list--list-page, div.product-list").unwrap();
    let title_sel = Selector::parse("div.product-list__product-name h3, a.product-list__link").unwrap();
    let price_sel = Selector::parse("span.product-list__price").unwrap();
    let link_sel = Selector::parse("a.product-list__link[href]").unwrap();
    let img_sel = Selector::parse("img").unwrap();

    for card in doc.select(&card_sel).take(6) {
        let title = card
            .select(&title_sel)
            .next()
            .map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string())
            .unwrap_or_default();
        let price_txt = card
            .select(&price_sel)
            .next()
            .map(|e| e.text().collect::<Vec<_>>().join(" "))
            .unwrap_or_default();
        let Some(price) = parse_tr_price(&price_txt) else {
            continue;
        };
        if title.len() < 3 {
            continue;
        }
        let href = card
            .select(&link_sel)
            .next()
            .and_then(|a| a.value().attr("href"))
            .unwrap_or("");
        let full_url = if href.starts_with("http") {
            href.to_string()
        } else if href.starts_with('/') {
            format!("https://www.vatanbilgisayar.com{}", href)
        } else {
            url.clone()
        };
        let image_url = card
            .select(&img_sel)
            .next()
            .and_then(|i| i.value().attr("data-src").or_else(|| i.value().attr("src")))
            .unwrap_or("")
            .to_string();

        out.push(SearchCandidate {
            title,
            price_try: price,
            store_name: "Vatan Bilgisayar".to_string(),
            url: full_url,
            image_url,
            source: "vatan".to_string(),
            offer_count: 1,
        });
    }
    out
}

pub struct ScrapedProductPage {
    pub title: String,
    pub image_url: String,
    pub offers: Vec<(String, String, f64, String)>, // (store, seller, price, url)
    pub sizes: Vec<SizeVariant>,
    pub quick_checkout_url: Option<String>,
}

/// Universal product page parser:
/// 1. Shopify /products/<handle>.json (returns variants + exact Cart Permalink!)
/// 2. Akakce multi-store HTML
/// 3. ikas / Next.js __NEXT_DATA__ (Flaw Wear, HypeTR, 36clo, Boyner, Nike, Rossmann)
/// 4. application/ld+json (Beymen, Gratis, etc.)
/// 5. Generic OpenGraph + meta price
pub async fn scrape_product_url(url: &str) -> Result<ScrapedProductPage, String> {
    // Fast path 1: Shopify product JSON if URL contains /products/
    if url.contains("/products/") {
        let base_no_q = url.split('?').next().unwrap_or(url).trim_end_matches('/');
        let shopify_json_url = format!("{}.json", base_no_q);
        if let Ok(sr) = client().get(&shopify_json_url).send().await {
            if sr.status().is_success() {
                if let Ok(j) = sr.json::<serde_json::Value>().await {
                    if let Some(prod) = j.get("product") {
                        let title = prod["title"].as_str().unwrap_or("Shopify Ürünü").to_string();
                        let image_url = prod["image"]["src"].as_str().unwrap_or("").to_string();
                        let origin = url.split("/products/").next().unwrap_or("");
                        let host = origin
                            .trim_start_matches("https://")
                            .trim_start_matches("http://")
                            .replace("www.", "");
                        let mut sizes = Vec::new();
                        let mut best_price = f64::INFINITY;
                        let mut first_cart_url = None;
                        if let Some(vars) = prod["variants"].as_array() {
                            for v in vars {
                                let p = v["price"]
                                    .as_str()
                                    .and_then(|s| s.parse::<f64>().ok())
                                    .or_else(|| v["price"].as_f64())
                                    .unwrap_or(0.0);
                                if p > 0.0 && p < best_price {
                                    best_price = p;
                                }
                                let vid = v["id"].as_i64().map(|n| n.to_string());
                                let in_stock = v["available"].as_bool().unwrap_or(true);
                                let cart_u = vid.as_ref().map(|id| format!("{}/cart/{}:1", origin, id));
                                if in_stock && first_cart_url.is_none() {
                                    first_cart_url = cart_u.clone();
                                }
                                sizes.push(SizeVariant {
                                    size: v["title"].as_str().unwrap_or("Std").to_string(),
                                    in_stock,
                                    variant_id: vid,
                                    cart_url: cart_u,
                                });
                            }
                        }
                        let price = if best_price.is_finite() { best_price } else { 0.0 };
                        return Ok(ScrapedProductPage {
                            title,
                            image_url,
                            offers: if price > 0.0 {
                                vec![(host.clone(), host, price, url.to_string())]
                            } else {
                                vec![]
                            },
                            sizes,
                            quick_checkout_url: first_cart_url,
                        });
                    }
                }
            }
        }
    }

    let resp = client()
        .get(url)
        .header("Accept-Language", "tr-TR,tr;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Sayfa alınamadı: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Site bot koruması verdi (HTTP {}). Bu sayfayı Brave'de açıp 'Hayye'ye At' eklenti butonuyla anında ekleyebilirsin.",
            resp.status()
        ));
    }
    let html_text = resp.text().await.map_err(|e| e.to_string())?;
    let doc = Html::parse_document(&html_text);

    let h1_sel = Selector::parse("h1").unwrap();
    let og_title_sel = Selector::parse("meta[property='og:title']").unwrap();
    let og_img_sel = Selector::parse("meta[property='og:image']").unwrap();

    let title = doc
        .select(&h1_sel)
        .next()
        .map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string())
        .filter(|s| s.len() > 2)
        .or_else(|| {
            doc.select(&og_title_sel)
                .next()
                .and_then(|m| m.value().attr("content"))
                .map(|s| s.trim().to_string())
        })
        .unwrap_or_else(|| "Takip Edilen Ürün".to_string());

    let image_url = doc
        .select(&og_img_sel)
        .next()
        .and_then(|m| m.value().attr("content"))
        .unwrap_or("")
        .to_string();

    let mut offers: Vec<(String, String, f64, String)> = Vec::new();
    let mut sizes: Vec<SizeVariant> = Vec::new();
    let host = url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("Mağaza")
        .replace("www.", "");

    // 1. Akakce multi-store
    if url.contains("akakce.com") {
        let li_sel = Selector::parse("ul#PL > li").unwrap();
        let price_sel = Selector::parse("span.pt_v8").unwrap();
        let store_sel = Selector::parse("span.v_v8 img, span.v_v8").unwrap();
        let link_sel = Selector::parse("a[href]").unwrap();

        for li in doc.select(&li_sel).take(12) {
            let ptxt = li
                .select(&price_sel)
                .next()
                .map(|e| e.text().collect::<Vec<_>>().join(" "))
                .unwrap_or_default();
            if let Some(p) = parse_tr_price(&ptxt) {
                let store = li
                    .select(&store_sel)
                    .next()
                    .map(|e| {
                        let alt = e.value().attr("alt").unwrap_or("").trim().to_string();
                        if !alt.is_empty() {
                            alt
                        } else {
                            e.text().collect::<Vec<_>>().join(" ").trim().to_string()
                        }
                    })
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "Türkiye Mağazası".to_string());
                let href = li
                    .select(&link_sel)
                    .next()
                    .and_then(|a| a.value().attr("href"))
                    .unwrap_or(url);
                let full_u = if href.starts_with("http") {
                    href.to_string()
                } else if href.starts_with('/') {
                    format!("https://www.akakce.com{}", href)
                } else {
                    url.to_string()
                };
                offers.push((store.clone(), store, p, full_u));
            }
        }
    }

    // 2. ikas / Next.js __NEXT_DATA__ (Flaw Wear, HypeTR, 36clo, Boyner, Nike, Rossmann)
    let next_sel = Selector::parse("script#__NEXT_DATA__").unwrap();
    if let Some(sc) = doc.select(&next_sel).next() {
        let txt = sc.text().collect::<Vec<_>>().join("");
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&txt) {
            extract_ikas_variants(&val, &host, url, &mut offers, &mut sizes);
        }
    }

    // 3. application/ld+json (Beymen, Gratis, etc.)
    if offers.is_empty() {
        let ld_sel = Selector::parse("script[type='application/ld+json']").unwrap();
        for sc in doc.select(&ld_sel) {
            let txt = sc.text().collect::<Vec<_>>().join("");
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&txt) {
                extract_ld_offers(&val, &host, url, &mut offers);
            }
        }
    }

    // 4. Fallback selectors
    if offers.is_empty() {
        let p_sel = Selector::parse(
            "meta[property='product:price:amount'], span.a-price-whole, span.product-list__price, span.pt_v8",
        )
        .unwrap();
        for el in doc.select(&p_sel) {
            let raw = el
                .value()
                .attr("content")
                .map(|s| s.to_string())
                .unwrap_or_else(|| el.text().collect::<Vec<_>>().join(" "));
            if let Some(p) = parse_tr_price(&raw) {
                offers.push((host.clone(), host.clone(), p, url.to_string()));
                break;
            }
        }
    }

    Ok(ScrapedProductPage {
        title,
        image_url,
        offers,
        sizes,
        quick_checkout_url: Some(url.to_string()),
    })
}

fn extract_ikas_variants(
    val: &serde_json::Value,
    host: &str,
    url: &str,
    offers: &mut Vec<(String, String, f64, String)>,
    sizes: &mut Vec<SizeVariant>,
) {
    // Walk JSON recursively for ikas product objects ("variants" array with "prices" / "sellPrice" / "discountPrice")
    fn walk(
        v: &serde_json::Value,
        host: &str,
        url: &str,
        offers: &mut Vec<(String, String, f64, String)>,
        sizes: &mut Vec<SizeVariant>,
        depth: usize,
    ) {
        if depth > 8 {
            return;
        }
        match v {
            serde_json::Value::Object(map) => {
                if let Some(serde_json::Value::Array(vars)) = map.get("variants") {
                    let mut best_p = f64::INFINITY;
                    for var in vars.iter().take(20) {
                        let p = var
                            .pointer("/prices/0/discountPrice")
                            .and_then(|x| x.as_f64())
                            .filter(|x| *x > 0.0)
                            .or_else(|| var.pointer("/prices/0/sellPrice").and_then(|x| x.as_f64()))
                            .or_else(|| var.get("sellPrice").and_then(|x| x.as_f64()))
                            .unwrap_or(0.0);
                        if p > 0.0 && p < best_p {
                            best_p = p;
                        }
                        if let Some(label) = var
                            .pointer("/variantValues/0/variantValueName")
                            .and_then(|x| x.as_str())
                            .or_else(|| var.get("sku").and_then(|x| x.as_str()))
                        {
                            let stock = var
                                .pointer("/stocks/0/stockCount")
                                .and_then(|x| x.as_i64())
                                .or_else(|| var.get("stock").and_then(|x| x.as_i64()))
                                .unwrap_or(1);
                            if !sizes.iter().any(|s| s.size == label) {
                                sizes.push(SizeVariant {
                                    size: label.to_string(),
                                    in_stock: stock > 0,
                                    variant_id: var.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()),
                                    cart_url: Some(url.to_string()),
                                });
                            }
                        }
                    }
                    if best_p.is_finite() && offers.is_empty() {
                        offers.push((host.to_string(), host.to_string(), best_p, url.to_string()));
                    }
                }
                for (_, child) in map {
                    walk(child, host, url, offers, sizes, depth + 1);
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr.iter().take(20) {
                    walk(item, host, url, offers, sizes, depth + 1);
                }
            }
            _ => {}
        }
    }
    walk(val, host, url, offers, sizes, 0);
}

fn extract_ld_offers(
    val: &serde_json::Value,
    host: &str,
    fallback_url: &str,
    out: &mut Vec<(String, String, f64, String)>,
) {
    if let Some(arr) = val.as_array() {
        for item in arr {
            extract_ld_offers(item, host, fallback_url, out);
        }
        return;
    }
    if let Some(off) = val.get("offers") {
        if let Some(low) = off
            .get("lowPrice")
            .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        {
            if low > 0.0 {
                out.push((host.to_string(), "Piyasa".to_string(), low, fallback_url.to_string()));
            }
        } else if let Some(p) = off
            .get("price")
            .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        {
            if p > 0.0 {
                let seller = off["seller"]["name"].as_str().unwrap_or(host).to_string();
                out.push((seller.clone(), seller, p, fallback_url.to_string()));
            }
        }
    }
}
