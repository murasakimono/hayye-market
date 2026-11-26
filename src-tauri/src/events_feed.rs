use crate::db;
use crate::models::{AlertSettings, EventItem};
use crate::notify;
use rusqlite::params;
use scraper::{Html, Selector};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

fn city_to_slug(city: &str) -> String {
    city.trim()
        .to_lowercase()
        .replace('ı', "i")
        .replace('İ', "i")
        .replace('ş', "s")
        .replace('ğ', "g")
        .replace('ü', "u")
        .replace('ö', "o")
        .replace('ç', "c")
        .replace(' ', "-")
}

async fn fetch_biletinial_cat(
    client: &reqwest::Client,
    cat_slug: &str,
    cat_id: &str,
    city_slug: &str,
    city_display: &str,
) -> Vec<EventItem> {
    let url = format!("https://biletinial.com/tr-tr/{}/{}", cat_slug, city_slug);
    let Ok(resp) = client.get(&url).send().await else {
        return Vec::new();
    };
    let Ok(html) = resp.text().await else {
        return Vec::new();
    };

    let doc = Html::parse_document(&html);
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    // Direct anchor scan for Biletinial event cards (works regardless of wrapper tag)
    if let Ok(a_sel) = Selector::parse("a[href*='/tr-tr/']") {
        let img_sel = Selector::parse("img").unwrap();
        let h_sel = Selector::parse("h2, h3, h4, strong, figcaption").unwrap();

        for a in doc.select(&a_sel) {
            let href = a.value().attr("href").unwrap_or("").trim();
            let prefix = format!("/tr-tr/{}/", cat_slug);
            let rel = if let Some(idx) = href.find(&prefix) {
                &href[idx..]
            } else {
                continue;
            };
            // Skip city listing root or category root
            let segs: Vec<&str> = rel.trim_matches('/').split('/').collect();
            if segs.len() < 3 || segs[2] == city_slug || segs[2].starts_with('?') {
                continue;
            }
            let full_url = format!("https://biletinial.com{}", rel);
            if !seen.insert(full_url.clone()) {
                continue;
            }
            let title = a
                .select(&h_sel)
                .next()
                .map(|h| h.text().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" "))
                .filter(|s| s.len() >= 3)
                .or_else(|| a.value().attr("title").map(|s| s.trim().to_string()).filter(|s| s.len() >= 3))
                .or_else(|| {
                    let t = a.text().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
                    if t.len() >= 3 && t.len() <= 110 { Some(t) } else { None }
                })
                .unwrap_or_default();
            if title.len() < 3 || title.len() > 140 {
                continue;
            }
            let img = a
                .select(&img_sel)
                .next()
                .and_then(|im| im.value().attr("data-src").or_else(|| im.value().attr("src")))
                .map(|s| if s.starts_with("//") { format!("https:{}", s) } else { s.to_string() })
                .filter(|s| s.starts_with("http"))
                .unwrap_or_default();

            out.push(EventItem {
                id: format!("bi-{}", rel.trim_matches('/').replace('/', "-")),
                title,
                category: cat_id.to_string(),
                city: city_display.to_string(),
                venue: city_display.to_string(),
                date_label: "Yaklaşan Etkinlik".to_string(),
                price_label: "Biletler Açık".to_string(),
                image_url: img,
                url: full_url,
                source: "Biletinial".to_string(),
                matches_radar: false,
                vote_metehan: String::new(),
                vote_ilayda: String::new(),
                ticket_bought: false,
            });
            if out.len() >= 28 {
                break;
            }
        }
    }

    // Fallback: JSON-LD ItemList (supports both direct & nested `item` objects)
    if out.len() < 8 {
        if let Ok(ld_sel) = Selector::parse("script[type='application/ld+json']") {
            for sc in doc.select(&ld_sel) {
                let raw = sc.text().collect::<String>();
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(arr) = val["itemListElement"].as_array() {
                        for it in arr.iter().take(28) {
                            let obj = if it["item"].is_object() { &it["item"] } else { it };
                            let u = obj["url"].as_str().or_else(|| it["url"].as_str()).unwrap_or("").trim();
                            let name = obj["name"].as_str().or_else(|| it["name"].as_str()).unwrap_or("").trim();
                            let img = obj["image"].as_str().unwrap_or("").trim();
                            let venue = obj["location"]["name"].as_str().unwrap_or(city_display).trim();
                            let date = obj["startDate"].as_str().unwrap_or("Yaklaşan").split('T').next().unwrap_or("Yaklaşan");
                            if u.starts_with("http") && name.len() >= 3 && seen.insert(u.to_string()) {
                                out.push(EventItem {
                                    id: format!("bi-ld-{}", out.len()),
                                    title: name.to_string(),
                                    category: cat_id.to_string(),
                                    city: city_display.to_string(),
                                    venue: venue.to_string(),
                                    date_label: date.to_string(),
                                    price_label: "Biletler Açık".to_string(),
                                    image_url: img.to_string(),
                                    url: u.to_string(),
                                    source: "Biletinial".to_string(),
                                    matches_radar: false,
                                    vote_metehan: String::new(),
                                    vote_ilayda: String::new(),
                                    ticket_bought: false,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    out
}

async fn fetch_mobilet_events(client: &reqwest::Client, city_display: &str) -> Vec<EventItem> {
    let Ok(resp) = client.get("https://mobilet.com/tr/").send().await else {
        return Vec::new();
    };
    let Ok(html) = resp.text().await else {
        return Vec::new();
    };
    let doc = Html::parse_document(&html);
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(a_sel) = Selector::parse("a[href^='/tr/event/']") {
        let img_sel = Selector::parse("img").unwrap();
        for a in doc.select(&a_sel) {
            let href = a.value().attr("href").unwrap_or("").trim();
            if href.is_empty() {
                continue;
            }
            let full_url = format!("https://mobilet.com{}", href);
            if !seen.insert(full_url.clone()) {
                continue;
            }
            let parts: Vec<String> = a
                .text()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            let title = parts
                .first()
                .cloned()
                .filter(|s| s.len() >= 3)
                .unwrap_or_else(|| {
                    href.trim_matches('/')
                        .split('/')
                        .last()
                        .unwrap_or("")
                        .replace('-', " ")
                });
            if title.len() < 3 || title.len() > 130 {
                continue;
            }
            let date_label = parts.get(1).cloned().unwrap_or_else(|| "Satışta".to_string());
            let venue = parts.get(2).cloned().unwrap_or_else(|| "Mobilet".to_string());
            let img = a
                .select(&img_sel)
                .next()
                .and_then(|im| im.value().attr("src").or_else(|| im.value().attr("data-src")))
                .filter(|s| s.starts_with("http"))
                .unwrap_or("")
                .to_string();

            let lower = title.to_lowercase();
            let category = if lower.contains("stand") || lower.contains("komedi") {
                "standup"
            } else if lower.contains("tiyatro") || lower.contains("oyun") {
                "theater"
            } else if lower.contains("fest") {
                "festival"
            } else {
                "concert"
            };

            out.push(EventItem {
                id: format!("mob-{}", href.trim_matches('/').replace('/', "-")),
                title,
                category: category.to_string(),
                city: city_display.to_string(),
                venue,
                date_label,
                price_label: "Biletler Açık".to_string(),
                image_url: img,
                url: full_url,
                source: "Mobilet".to_string(),
                matches_radar: false,
                vote_metehan: String::new(),
                vote_ilayda: String::new(),
                ticket_bought: false,
            });
            if out.len() >= 24 {
                break;
            }
        }
    }
    out
}

pub async fn fetch_live_events(settings: &AlertSettings) -> Vec<EventItem> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    let city_display = if settings.event_city.trim().is_empty() {
        "İstanbul".to_string()
    } else {
        settings.event_city.trim().to_string()
    };
    let city_slug = city_to_slug(&city_display);

    let (muzik, tiyatro, standup, mobilet) = tokio::join!(
        fetch_biletinial_cat(&client, "muzik", "concert", &city_slug, &city_display),
        fetch_biletinial_cat(&client, "tiyatro", "theater", &city_slug, &city_display),
        fetch_biletinial_cat(&client, "stand-up", "standup", &city_slug, &city_display),
        fetch_mobilet_events(&client, &city_display),
    );

    let radar_kws: Vec<String> = settings
        .event_radar_artists
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.len() >= 2)
        .collect();
    let blacklist_kws: Vec<String> = settings
        .event_blacklist
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.len() >= 2)
        .collect();

    // Load saved votes from SQLite
    let vote_map: HashMap<String, (String, String, bool)> = db::open_db()
        .ok()
        .and_then(|c| db::load_event_votes(&c).ok())
        .unwrap_or_default();

    let mut seen = HashSet::new();
    let mut all = Vec::new();
    for mut ev in muzik.into_iter().chain(mobilet).chain(standup).chain(tiyatro) {
        if !seen.insert(ev.url.clone()) {
            continue;
        }
        let hay = format!("{} {} {}", ev.title, ev.venue, ev.url).to_lowercase();
        // Strict blacklist filter (e.g. lvbel c5, organize, batuflex, sagopa, gazapizm...)
        if blacklist_kws.iter().any(|b| hay.contains(b)) {
            continue;
        }
        ev.matches_radar = radar_kws.iter().any(|r| hay.contains(r));
        if let Some((vm, vi, bought)) = vote_map.get(&ev.id) {
            ev.vote_metehan = vm.clone();
            ev.vote_ilayda = vi.clone();
            ev.ticket_bought = *bought;
        }
        all.push(ev);
    }

    // Sort: Radar matches first, then bought/voted, then concerts
    all.sort_by(|a, b| {
        b.matches_radar
            .cmp(&a.matches_radar)
            .then_with(|| b.ticket_bought.cmp(&a.ticket_bought))
            .then_with(|| (!b.image_url.is_empty()).cmp(&!a.image_url.is_empty()))
    });

    // Notify on new radar artist concerts in selected city (deduplicated)
    let to_notify: Vec<EventItem> = {
        if let Ok(conn) = db::open_db() {
            let _ = conn.execute(
                "CREATE TABLE IF NOT EXISTS seen_event_alerts (event_id TEXT PRIMARY KEY, ts TEXT NOT NULL)",
                [],
            );
            let mut list = Vec::new();
            for ev in all.iter().filter(|e| e.matches_radar) {
                let exists: bool = conn
                    .query_row("SELECT 1 FROM seen_event_alerts WHERE event_id = ?1", params![ev.id], |_| Ok(true))
                    .unwrap_or(false);
                if !exists {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO seen_event_alerts (event_id, ts) VALUES (?1, datetime('now'))",
                        params![ev.id],
                    );
                    list.push(ev.clone());
                    if list.len() >= 3 {
                        break;
                    }
                }
            }
            list
        } else {
            Vec::new()
        }
    };

    for ev in to_notify {
        let _ = notify::dispatch_alert(
            settings,
            &format!("🎤 RADAR KONSER ({}): {}", ev.city, ev.title),
            &format!("{} • {} • {}\nBilet: {}", ev.source, ev.venue, ev.date_label, ev.url),
        )
        .await;
    }

    all
}
