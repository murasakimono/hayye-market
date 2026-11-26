use crate::db;
use crate::models::{AddManualUsedRequest, BridgeBulkProducts, BridgeIngestProduct, BridgeUsedBatch};
use crate::scraper_engine;
use rusqlite::params;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const BRIDGE_PORT: u16 = 47821;

const ICON_PNG: &[u8] = include_bytes!("../icons/128x128.png");

const SW_JS: &str = r##"const CACHE = 'hayye-v3';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/app', '/manifest.webmanifest', '/icon.png'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.pathname === '/api/products' || u.pathname === '/api/theme') {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
"##;

const IOS_PWA_HTML: &str = r##"<!doctype html>
<html lang="tr" data-theme="obsidian-aurora">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Hayye Market" />
  <meta name="theme-color" content="#080A0D" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/icon.png" />
  <title>Hayye Market</title>
  <style>
    :root, [data-theme="obsidian-aurora"] {
      --bg:#080A0D; --surf:rgba(17,20,26,.82); --surf2:rgba(255,255,255,.05); --ink:#F5F2EB; --muted:#8F96A3;
      --acc:#10B981; --accInk:#07100C; --acc2:#3B82F6; --danger:#F43F5E; --bdr:rgba(255,255,255,.09);
      --o1:rgba(16,185,129,.22); --o2:rgba(59,130,246,.18);
    }
    [data-theme="noir-velvet"] {
      --bg:#0F090D; --surf:rgba(26,15,22,.82); --surf2:rgba(255,230,235,.06); --ink:#FAF3F0; --muted:#B098A4;
      --acc:#F43F5E; --accInk:#FFF7F8; --acc2:#F59E0B; --danger:#FB7185; --bdr:rgba(255,220,230,.1);
      --o1:rgba(225,29,72,.24); --o2:rgba(245,158,11,.18);
    }
    [data-theme="atelier-ivory"] {
      --bg:#F4EFE6; --surf:rgba(255,253,249,.9); --surf2:rgba(20,19,17,.05); --ink:#161513; --muted:#6C675E;
      --acc:#059669; --accInk:#FFFFFF; --acc2:#2563EB; --danger:#E11D48; --bdr:rgba(20,19,17,.1);
      --o1:rgba(16,185,129,.14); --o2:rgba(217,119,6,.13);
    }
    [data-theme="arctic-frost"] {
      --bg:#060C14; --surf:rgba(13,24,38,.78); --surf2:rgba(186,230,253,.07); --ink:#F0F9FF; --muted:#8EB2CC;
      --acc:#38BDF8; --accInk:#05131E; --acc2:#818CF8; --danger:#FB7185; --bdr:rgba(186,230,253,.14);
      --o1:rgba(56,189,248,.24); --o2:rgba(129,140,248,.18);
    }
    [data-theme="midnight-botanical"] {
      --bg:#070F0C; --surf:rgba(13,25,20,.82); --surf2:rgba(212,245,226,.06); --ink:#F2F7F4; --muted:#8FA89B;
      --acc:#34D399; --accInk:#05140E; --acc2:#D97706; --danger:#F43F5E; --bdr:rgba(212,245,226,.1);
      --o1:rgba(52,211,153,.22); --o2:rgba(217,119,6,.18);
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      width: 100%; max-width: 100%; overflow-x: hidden; margin: 0;
      background: var(--bg); color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      padding: env(safe-area-inset-top) 0 calc(88px + env(safe-area-inset-bottom));
      transition: background .4s ease, color .3s ease;
    }
    .mesh { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .orb { position: absolute; border-radius: 50%; filter: blur(90px); }
    .orb1 { width: 75vw; height: 75vw; top: -18%; left: -16%; background: var(--o1); animation: d1 18s ease-in-out infinite alternate; }
    .orb2 { width: 70vw; height: 70vw; bottom: -18%; right: -16%; background: var(--o2); animation: d2 22s ease-in-out infinite alternate; }
    @keyframes d1 { to { transform: translate(12%, 10%) scale(1.1); } }
    @keyframes d2 { to { transform: translate(-10%, -12%) scale(.94); } }
    header {
      position: sticky; top: 0; width: 100%; z-index: 20;
      background: var(--surf); backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
      border-bottom: 1px solid var(--bdr);
      padding: 11px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; letter-spacing: -0.02em; }
    .brand img { width: 28px; height: 28px; border-radius: 8px; }
    .h-right { display: flex; align-items: center; gap: 6px; }
    .t-btn {
      border: 1px solid var(--bdr); background: var(--surf2); color: var(--ink);
      border-radius: 999px; padding: 6px 9px; font-size: 12px; cursor: pointer;
    }
    .who-pill { display: flex; background: var(--surf2); border: 1px solid var(--bdr); border-radius: 999px; padding: 2px; }
    .who-btn { border: none; background: transparent; color: var(--muted); font-size: 11px; font-weight: 600; padding: 5px 9px; border-radius: 999px; cursor: pointer; }
    .who-btn.active { background: var(--ink); color: var(--bg); }
    .wrap { position: relative; z-index: 2; width: 100%; max-width: 960px; margin: 0 auto; padding: 14px 16px; }
    .add-box { display: flex; gap: 8px; margin-bottom: 12px; width: 100%; }
    input {
      flex: 1; min-width: 0; width: 100%; background: var(--surf);
      border: 1px solid var(--bdr); color: var(--ink);
      padding: 11px 14px; font-size: 14px; border-radius: 999px; outline: none;
    }
    input:focus { border-color: var(--acc); }
    .add-btn {
      flex-shrink: 0; background: var(--ink); color: var(--bg); border: none;
      padding: 11px 15px; font-weight: 700; font-size: 13px; border-radius: 999px; cursor: pointer;
    }
    #msg { font-size: 12px; color: var(--acc); margin-bottom: 10px; min-height: 16px; }
    #list { display: grid; grid-template-columns: 1fr; gap: 14px; }
    @media (min-width: 720px) { #list { grid-template-columns: 1fr 1fr; } }
    .card {
      background: var(--surf); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      border: 1px solid var(--bdr); border-radius: 24px; overflow: hidden;
      transition: transform .22s cubic-bezier(.22,1,.36,1);
    }
    .hero { position: relative; aspect-ratio: 16/10; background: var(--surf2); overflow: hidden; }
    .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero-grad { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.78) 4%, transparent 55%, rgba(0,0,0,.35)); }
    .pill-top { position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
    .badge {
      padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; color: #F5F2EB;
      background: rgba(0,0,0,.55); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.15);
    }
    .badge.dip { background: rgba(16,185,129,.28); color: #6EE7B7; border-color: rgba(16,185,129,.45); }
    .badge.fake { background: rgba(244,63,94,.28); color: #FDA4AF; border-color: rgba(244,63,94,.45); }
    .price-ov { position: absolute; bottom: 10px; left: 14px; right: 14px; display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
    .price { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 21px; font-weight: 700; color: #FFFFFF; }
    .used-pill { font-family: ui-monospace, monospace; font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 999px; background: rgba(59,130,246,.28); color: #BFDBFE; }
    .body { padding: 14px; }
    .title { font-size: 14px; font-weight: 600; line-height: 1.38; color: var(--ink); }
    .meta { font-size: 11px; color: var(--muted); margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px; }
    .sizes { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 5px; }
    .sz { font-family: ui-monospace, monospace; font-size: 10px; padding: 3px 8px; border-radius: 999px; }
    .sz.in { background: rgba(16,185,129,.18); color: var(--acc); }
    .sz.out { background: var(--surf2); color: var(--muted); opacity: .55; text-decoration: line-through; }
    .votes { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--bdr); display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .v-btns { display: flex; gap: 6px; }
    .v-btn { border: 1px solid var(--bdr); background: var(--surf2); color: var(--muted); border-radius: 999px; padding: 5px 11px; font-size: 11px; font-weight: 600; cursor: pointer; }
    .v-btn.buy { background: rgba(16,185,129,.22); color: var(--acc); border-color: var(--acc); }
    .v-btn.wait { background: rgba(245,158,11,.2); color: #F59E0B; border-color: #F59E0B; }
    .v-btn.pass { background: rgba(244,63,94,.2); color: var(--danger); border-color: var(--danger); }
    .actions { margin-top: 11px; display: flex; gap: 8px; }
    .a-btn {
      flex: 1; text-align: center; text-decoration: none; font-size: 12px; font-weight: 600;
      padding: 10px 12px; border-radius: 14px; border: 1px solid var(--bdr); color: var(--ink);
      background: var(--surf2); cursor: pointer;
    }
    .a-btn.sniper { background: var(--acc); color: var(--accInk); border-color: var(--acc); font-weight: 700; }
    .swipe-hint { font-size: 11px; color: var(--muted); text-align: center; margin-bottom: 10px; }
    .dock {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(12px + env(safe-area-inset-bottom)); z-index: 30;
      display: flex; gap: 4px; padding: 5px; border-radius: 999px;
      background: var(--surf); backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
      border: 1px solid var(--bdr); box-shadow: 0 14px 36px rgba(0,0,0,.45);
    }
    .d-btn { border: none; background: transparent; color: var(--muted); font-size: 11px; font-weight: 600; padding: 8px 10px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
    .d-btn.active { background: var(--ink); color: var(--bg); }
  </style>
</head>
<body>
  <div class="mesh"><div class="orb orb1"></div><div class="orb orb2"></div></div>
  <header>
    <div class="brand"><img src="/icon.png" alt="H" /> Hayye</div>
    <div class="h-right">
      <button class="t-btn" onclick="enablePush()" title="Bildirim İzni">🔔</button>
      <button class="t-btn" onclick="cycleTheme()" title="Tema Değiştir">◐</button>
      <div class="who-pill">
        <button id="who-m" class="who-btn" onclick="setWho('metehan')">Metehan</button>
        <button id="who-i" class="who-btn" onclick="setWho('ilayda')">İlayda</button>
      </div>
    </div>
  </header>
  <div class="wrap">
    <form class="add-box" onsubmit="addOrCompare(event)">
      <input id="u" placeholder="Link, ürün adı veya Zara ref kodu (1234/567)..." />
      <button class="add-btn" type="submit">Ekle / Ara</button>
    </form>
    <div id="msg"></div>
    <div id="hint" class="swipe-hint" style="display:none">Kartı sağa kaydır: Al ✓ • Sola kaydır: Pas ✕</div>
    <div id="list">Yükleniyor...</div>
  </div>
  <nav class="dock">
    <button id="t-discover" class="d-btn" onclick="setTab('discover')">Keşfet</button>
    <button id="t-stage" class="d-btn" onclick="setTab('stage')">Sahne</button>
    <button id="t-gallery" class="d-btn active" onclick="setTab('gallery')">Galeri</button>
    <button id="t-radar" class="d-btn" onclick="setTab('radar')">Radar</button>
    <button id="t-shared" class="d-btn" onclick="setTab('shared')">Ortak</button>
    <button id="t-orders" class="d-btn" onclick="setTab('orders')">Sipariş</button>
  </nav>
  <script>
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
    const THEMES = ['obsidian-aurora','noir-velvet','atelier-ivory','arctic-frost','midnight-botanical'];
    const fmt = v => Math.round(v).toLocaleString('tr-TR') + ' ₺';
    let who = localStorage.getItem('hayye_who') || 'metehan';
    let tab = 'gallery';
    let cache = [];
    let discoverCache = [];
    let eventsCache = [];
    let curTheme = 'obsidian-aurora';

    function applyTheme(t) {
      curTheme = THEMES.includes(t) ? t : 'obsidian-aurora';
      document.documentElement.setAttribute('data-theme', curTheme);
    }
    async function cycleTheme() {
      const next = THEMES[(THEMES.indexOf(curTheme) + 1) % THEMES.length];
      applyTheme(next);
      fetch('/api/theme', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ theme: next }) }).catch(()=>{});
    }
    function syncWhoUI() {
      document.getElementById('who-m').className = 'who-btn' + (who === 'metehan' ? ' active' : '');
      document.getElementById('who-i').className = 'who-btn' + (who === 'ilayda' ? ' active' : '');
    }
    function setWho(w) { who = w; localStorage.setItem('hayye_who', w); syncWhoUI(); render(); }
    function setTab(t) {
      tab = t;
      ['discover','stage','gallery','radar','shared','orders'].forEach(x => {
        document.getElementById('t-' + x).className = 'd-btn' + (x === t ? ' active' : '');
      });
      document.getElementById('hint').style.display = t === 'shared' ? 'block' : 'none';
      if (t === 'discover' && !discoverCache.length) { loadDiscover(); }
      else if (t === 'stage' && !eventsCache.length) { loadEvents(); }
      else { render(); }
    }
    async function loadEvents() {
      document.getElementById('list').innerHTML = '<div class="card"><div class="body" style="text-align:center;color:var(--muted)">İstanbul konser & etkinlikleri taranıyor...</div></div>';
      const r = await fetch('/api/events-feed');
      eventsCache = await r.json();
      render();
    }
    async function voteEvent(eid, v, bought) {
      await fetch('/api/event-vote', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ event_id: eid, who, vote: v, ticket_bought: bought })
      });
      await loadEvents();
    }
    async function loadDiscover() {
      document.getElementById('list').innerHTML = '<div class="card"><div class="body" style="text-align:center;color:var(--muted)">Gerçek indirimler taranıyor...</div></div>';
      const r = await fetch('/api/discover');
      discoverCache = await r.json();
      render();
    }
    async function saveDiscover(idx, askOther) {
      const d = discoverCache[idx];
      if (!d) return;
      const r = await fetch('/ingest/product', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ title: d.title, url: d.url, price_try: d.price_try, store_name: d.brand || 'Akakçe', image_url: d.image_url })
      });
      const res = await r.json();
      if (res.ok && askOther && res.product_id) {
        await fetch('/api/vote', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ product_id: res.product_id, who, vote: 'buy' })
        });
      }
      document.getElementById('msg').textContent = askOther ? '✓ Ortak Panoya gönderildi!' : '✓ Koleksiyona eklendi!';
      load();
    }
    async function vote(pid, v) {
      await fetch('/api/vote', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ product_id: pid, who, vote: v })
      });
      await load();
    }
    async function toggleBuy(pid, price, already) {
      await fetch('/api/purchase', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ product_id: pid, price_try: already ? null : price })
      });
      await load();
    }

    function attachSwipe(cardEl, pid) {
      let sx = 0, dx = 0;
      cardEl.addEventListener('touchstart', e => { sx = e.touches[0].clientX; dx = 0; }, { passive: true });
      cardEl.addEventListener('touchmove', e => {
        dx = e.touches[0].clientX - sx;
        if (Math.abs(dx) > 16) cardEl.style.transform = `translateX(${dx * 0.45}px) rotate(${dx * 0.02}deg)`;
      }, { passive: true });
      cardEl.addEventListener('touchend', () => {
        cardEl.style.transform = '';
        if (dx > 95) vote(pid, 'buy');
        else if (dx < -95) vote(pid, 'pass');
      });
    }

    function render() {
      const el = document.getElementById('list');
      if (tab === 'stage') {
        if (!eventsCache.length) {
          el.innerHTML = '<div class="card"><div class="body" style="text-align:center;color:var(--muted)">Etkinlik bulunamadı.</div></div>';
          return;
        }
        el.innerHTML = eventsCache.slice(0, 45).map(ev => {
          const myV = who === 'ilayda' ? ev.vote_ilayda : ev.vote_metehan;
          const othV = who === 'ilayda' ? ev.vote_metehan : ev.vote_ilayda;
          const othN = who === 'ilayda' ? 'Metehan' : 'İlayda';
          const vT = v => v === 'go' ? 'Gidelim ✓' : v === 'maybe' ? 'Belki' : v === 'pass' ? 'Pas' : '—';
          return `<div class="card">
            ${ev.image_url ? `<div class="hero"><img src="${ev.image_url}" alt="" /><div class="hero-grad"></div>
              <div class="pill-top">
                <span class="badge">${ev.source} • ${ev.category}</span>
                ${ev.matches_radar ? '<span class="badge dip">✦ RADARIM</span>' : ''}
                ${ev.ticket_bought ? '<span class="badge dip">🎟 BİLET ALINDI</span>' : ''}
                ${ev.vote_metehan === 'go' && ev.vote_ilayda === 'go' ? '<span class="badge dip">İKİMİZ DE GİDELİM ✓</span>' : ''}
              </div>
              <div class="price-ov"><div class="price" style="font-size:15px">${ev.date_label || ev.city}</div>
                ${ev.price_label ? `<span class="used-pill">${ev.price_label}</span>` : ''}
              </div></div>` : ''}
            <div class="body">
              <div class="title">${ev.title}</div>
              <div class="meta"><span>${ev.venue || ev.city}</span><span>${ev.source}</span></div>
              <div class="votes">
                <div class="v-btns">
                  <button class="v-btn ${myV==='go'?'buy':''}" onclick="voteEvent('${ev.id}', '${myV==='go'?'':'go'}', null)">Gidelim</button>
                  <button class="v-btn ${myV==='maybe'?'wait':''}" onclick="voteEvent('${ev.id}', '${myV==='maybe'?'':'maybe'}', null)">Belki</button>
                  <button class="v-btn ${myV==='pass'?'pass':''}" onclick="voteEvent('${ev.id}', '${myV==='pass'?'':'pass'}', null)">Pas</button>
                </div>
                <span style="font-size:11px;color:var(--muted)">${othN}: ${vT(othV)}</span>
              </div>
              <div class="actions">
                <a class="a-btn sniper" href="${ev.url}" target="_blank">🎟 Bilet Ekranı ↗</a>
                <button class="a-btn" onclick="voteEvent('${ev.id}', '${myV}', ${!ev.ticket_bought})">${ev.ticket_bought ? 'Bilet Alındı ✓' : 'Bilet Aldım'}</button>
              </div>
            </div>
          </div>`;
        }).join('');
        return;
      }
      if (tab === 'discover') {
        if (!discoverCache.length) {
          el.innerHTML = '<div class="card"><div class="body" style="text-align:center;color:var(--muted)">Fırsat bulunamadı.</div></div>';
          return;
        }
        el.innerHTML = discoverCache.slice(0, 40).map((d, idx) => `<div class="card">
          ${d.image_url ? `<div class="hero"><img src="${d.image_url}" alt="" /><div class="hero-grad"></div>
            <div class="pill-top"><span class="badge dip">-%${Math.round(d.drop_pct)}</span>
              ${d.matches_personal ? '<span class="badge">✦ SANA ÖZEL</span>' : ''}
              ${d.is_flash_error ? '<span class="badge fake">⚡ FLAŞ</span>' : ''}
            </div>
            <div class="price-ov"><div class="price">${fmt(d.price_try)}</div><span class="used-pill">Isı ${d.heat_score}</span></div></div>` : ''}
          <div class="body">
            <div class="title">${d.title}</div>
            <div class="meta"><span>${d.brand || d.source}</span><span>+${d.offer_count} satıcı</span></div>
            <div class="actions">
              <button class="a-btn sniper" onclick="saveDiscover(${idx}, false)">+ Koleksiyon</button>
              <button class="a-btn" onclick="saveDiscover(${idx}, true)">♥ Ortak Pano</button>
              <a class="a-btn" style="flex:.45" href="${d.url}" target="_blank">↗</a>
            </div>
          </div>
        </div>`).join('');
        return;
      }
      let items = cache;
      const radarCount = cache.filter(p => p.discount_verdict.status.includes('GENUINE') || (p.best_used_try && p.best_used_try <= p.best_new_try * 0.8)).length;
      if ('setAppBadge' in navigator) {
        radarCount > 0 ? navigator.setAppBadge(radarCount).catch(()=>{}) : navigator.clearAppBadge().catch(()=>{});
      }
      if (tab === 'radar') {
        items = cache.filter(p => p.discount_verdict.status.includes('GENUINE') || (p.best_used_try && p.best_used_try <= p.best_new_try * 0.8));
      } else if (tab === 'orders') {
        items = cache.filter(p => p.purchased_price_try !== null);
      }
      if (!items.length) {
        el.innerHTML = '<div class="card"><div class="body" style="text-align:center;color:var(--muted)">Bu görünümde henüz ürün yok.</div></div>';
        return;
      }
      el.innerHTML = items.map(p => {
        const cls = p.discount_verdict.status.includes('GENUINE') ? 'dip' : p.discount_verdict.status === 'INFLATED_FAKE' ? 'fake' : '';
        const szHtml = (p.sizes || []).slice(0, 7).map(s => `<span class="sz ${s.in_stock ? 'in' : 'out'}">${s.size}</span>`).join('');
        const buyUrl = p.quick_checkout_url || p.primary_url;
        const myVote = who === 'ilayda' ? p.vote_ilayda : p.vote_metehan;
        const otherVote = who === 'ilayda' ? p.vote_metehan : p.vote_ilayda;
        const otherName = who === 'ilayda' ? 'Metehan' : 'İlayda';
        const vTxt = v => v === 'buy' ? 'Al ✓' : v === 'wait' ? 'Bekle' : v === 'pass' ? 'Pas' : '—';
        const isBought = p.purchased_price_try !== null;
        return `<div class="card" data-pid="${p.id}">
          ${p.image_url ? `<div class="hero"><img src="${p.image_url}" alt="" /><div class="hero-grad"></div>
            <div class="pill-top"><span class="badge ${cls}">${p.discount_verdict.badge}</span>
              ${p.vote_metehan === 'buy' && p.vote_ilayda === 'buy' ? '<span class="badge dip">İKİMİZ DE AL ✓</span>' : ''}
            </div>
            <div class="price-ov"><div class="price">${fmt(p.best_new_try)}</div>
              ${p.best_used_try ? `<span class="used-pill">2. El ${fmt(p.best_used_try)}</span>` : ''}
            </div></div>` : ''}
          <div class="body">
            <div class="title">${p.title}</div>
            <div class="meta">
              <span>${p.folder_name}</span>
              <span>Güven %${p.avg_trust_score}</span>
              ${p.unit_price ? `<span>10${p.unit_price.unit}: ${p.unit_price.price_per_10_try}₺</span>` : ''}
              ${!p.image_url ? `<strong style="color:var(--acc)">${fmt(p.best_new_try)}</strong>` : ''}
            </div>
            ${szHtml ? `<div class="sizes">${szHtml}</div>` : ''}
            <div class="votes">
              <div class="v-btns">
                <button class="v-btn ${myVote==='buy'?'buy':''}" onclick="vote(${p.id}, '${myVote==='buy'?'':'buy'}')">Al</button>
                <button class="v-btn ${myVote==='wait'?'wait':''}" onclick="vote(${p.id}, '${myVote==='wait'?'':'wait'}')">Bekle</button>
                <button class="v-btn ${myVote==='pass'?'pass':''}" onclick="vote(${p.id}, '${myVote==='pass'?'':'pass'}')">Pas</button>
              </div>
              <span style="font-size:11px;color:var(--muted)">${otherName}: ${vTxt(otherVote)}</span>
            </div>
            <div class="actions">
              <a class="a-btn sniper" href="${buyUrl}" target="_blank">⚡ Hızlı Alım</a>
              <button class="a-btn" onclick="toggleBuy(${p.id}, ${p.best_new_try}, ${isBought})">${isBought ? '14 Gün ✓' : 'Aldım'}</button>
            </div>
          </div>
        </div>`;
      }).join('');
      if (tab === 'shared') {
        el.querySelectorAll('.card[data-pid]').forEach(c => attachSwipe(c, Number(c.dataset.pid)));
      }
    }

    async function enablePush() {
      const msg = document.getElementById('msg');
      if (!('Notification' in window)) { msg.textContent = 'Bildirim için Safari -> Ana Ekrana Ekle gerekli.'; return; }
      const perm = await Notification.requestPermission();
      msg.textContent = perm === 'granted' ? '✓ iOS bildirim izni açıldı!' : 'Bildirim izni verilmedi.';
    }
    async function load() {
      fetch('/api/theme').then(r=>r.json()).then(d=>{ if(d.theme) applyTheme(d.theme); }).catch(()=>{});
      const r = await fetch('/api/products?who=' + encodeURIComponent(who));
      cache = await r.json();
      render();
    }
    try {
      const es = new EventSource('/api/events');
      es.onmessage = () => { load(); };
    } catch {}
    async function addOrCompare(e) {
      e.preventDefault();
      const inp = document.getElementById('u');
      const val = inp.value.trim();
      if (!val) return;
      const msg = document.getElementById('msg');
      if (val.startsWith('http')) {
        msg.textContent = 'Taranıyor...';
        const r = await fetch('/ios-share', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url: val }) });
        const d = await r.json();
        msg.textContent = d.ok ? '✓ Koleksiyona eklendi!' : (d.error || 'Hata');
        inp.value = '';
        load();
      } else {
        msg.textContent = 'Mağaza içi online kıyaslama yapılıyor...';
        const r = await fetch('/api/compare', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title: val, current_price_try: 0 }) });
        const d = await r.json();
        if (d.cheaper) {
          msg.innerHTML = `En ucuz online: <a href="${d.cheaper.url}" target="_blank" style="color:var(--acc);text-decoration:underline">${d.cheaper.store_name} — ${fmt(d.cheaper.price_try)} ↗</a>`;
        } else {
          msg.textContent = 'Online sonuç bulunamadı.';
        }
      }
    }
    syncWhoUI();
    load();
  </script>
</body>
</html>"##;

const MANIFEST_JSON: &str = r##"{
  "name": "Hayye Market",
  "short_name": "Hayye",
  "start_url": "/app",
  "display": "standalone",
  "background_color": "#080A0D",
  "theme_color": "#080A0D",
  "icons": [{ "src": "/icon.png", "sizes": "128x128", "type": "image/png" }]
}"##;

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
                let full_path = parts.next().unwrap_or("/");
                let mut path_split = full_path.splitn(2, '?');
                let path = path_split.next().unwrap_or("/");
                let query_str = path_split.next().unwrap_or("");

                if method == "GET" && path == "/api/events" {
                    let hdr = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
                    if stream.write_all(hdr.as_bytes()).await.is_err() {
                        return;
                    }
                    let mut rx = crate::events::subscribe();
                    loop {
                        match tokio::time::timeout(std::time::Duration::from_secs(25), rx.recv()).await {
                            Ok(Ok(msg)) => {
                                let frame = format!("data: {}\n\n", msg);
                                if stream.write_all(frame.as_bytes()).await.is_err() {
                                    break;
                                }
                            }
                            Ok(Err(_)) => break,
                            Err(_) => {
                                if stream.write_all(b": keepalive\n\n").await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    return;
                }

                let body_str = req_str
                    .split("\r\n\r\n")
                    .nth(1)
                    .unwrap_or("")
                    .trim_matches('\0')
                    .trim();

                if method == "GET" && (path == "/icon.png" || path == "/icon.svg") {
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nCache-Control: public, max-age=86400\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        ICON_PNG.len()
                    );
                    let _ = stream.write_all(header.as_bytes()).await;
                    let _ = stream.write_all(ICON_PNG).await;
                    return;
                }

                let (status, ctype, body) = if method == "OPTIONS" {
                    ("204 No Content", "text/plain", String::new())
                } else if method == "GET" && (path == "/" || path == "/app") {
                    ("200 OK", "text/html; charset=utf-8", IOS_PWA_HTML.to_string())
                } else if method == "GET" && path == "/sw.js" {
                    ("200 OK", "application/javascript; charset=utf-8", SW_JS.to_string())
                } else if method == "GET" && path == "/manifest.webmanifest" {
                    ("200 OK", "application/manifest+json", MANIFEST_JSON.to_string())
                } else if method == "GET" && path == "/ping" {
                    ("200 OK", "application/json", r#"{"ok":true,"app":"Hayye Market","version":"4.3.1"}"#.to_string())
                } else if method == "POST" && path == "/api/webview-ingest-events" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let mut parsed = Vec::new();
                        if let Some(arr) = v["events"].as_array() {
                            for it in arr {
                                parsed.push(crate::models::EventItem {
                                    id: it["id"].as_str().unwrap_or("").to_string(),
                                    title: it["title"].as_str().unwrap_or("").to_string(),
                                    category: it["category"].as_str().unwrap_or("concert").to_string(),
                                    city: it["city"].as_str().unwrap_or("İstanbul").to_string(),
                                    venue: it["venue"].as_str().unwrap_or("").to_string(),
                                    date_label: it["date_label"].as_str().unwrap_or("Satışta").to_string(),
                                    price_label: it["price_label"].as_str().unwrap_or("Biletler Açık").to_string(),
                                    image_url: it["image_url"].as_str().unwrap_or("").to_string(),
                                    url: it["url"].as_str().unwrap_or("").to_string(),
                                    source: it["source"].as_str().unwrap_or("WebView").to_string(),
                                    matches_radar: false,
                                    vote_metehan: String::new(),
                                    vote_ilayda: String::new(),
                                    ticket_bought: false,
                                });
                            }
                        }
                        let count = db::open_db()
                            .and_then(|c| db::upsert_webview_events(&c, &parsed))
                            .unwrap_or(0);
                        if count > 0 {
                            crate::events::emit("events_updated");
                        }
                        ("200 OK", "application/json", format!(r#"{{"ok":true,"count":{}}}"#, count))
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "POST" && path == "/api/webview-ingest-search" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let mut parsed = Vec::new();
                        if let Some(arr) = v["items"].as_array() {
                            for it in arr {
                                if let (Some(title), Some(url), Some(price)) = (
                                    it["title"].as_str(),
                                    it["url"].as_str(),
                                    it["price_try"].as_f64(),
                                ) {
                                    parsed.push(crate::models::SearchCandidate {
                                        title: title.to_string(),
                                        price_try: price,
                                        store_name: it["store_name"].as_str().unwrap_or("Mağaza").to_string(),
                                        url: url.to_string(),
                                        image_url: it["image_url"].as_str().unwrap_or("").to_string(),
                                        source: it["source"].as_str().unwrap_or("Dahili Oturum").to_string(),
                                        offer_count: it["offer_count"].as_u64().unwrap_or(1) as u32,
                                    });
                                }
                            }
                        }
                        let n = parsed.len();
                        if n > 0 {
                            crate::webview_scanner::push_webview_search_results(parsed);
                            crate::events::emit("search_updated");
                        }
                        ("200 OK", "application/json", format!(r#"{{"ok":true,"count":{}}}"#, n))
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "POST" && path == "/api/webview-attention" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let src = v["source"].as_str().unwrap_or("Site");
                        crate::events::emit(&format!("webview_attention:{}", src));
                    }
                    ("200 OK", "application/json", r#"{"ok":true}"#.to_string())
                } else if method == "GET" && path == "/api/events-feed" {
                    let settings = db::open_db().map(|c| db::load_settings(&c)).unwrap_or(crate::models::AlertSettings {
                        discord_webhook: String::new(),
                        telegram_bot_token: String::new(),
                        telegram_chat_id: String::new(),
                        ntfy_topic: String::new(),
                        refresh_interval_min: 45,
                        cloudflare_tunnel_url: String::new(),
                        cloudflare_tunnel_token: String::new(),
                        cloudflare_worker_key: String::new(),
                        active_theme: "obsidian-aurora".to_string(),
                        monthly_budget_try: 15000.0,
                        user_cards: String::new(),
                        discover_keywords: String::new(),
                        discover_muted: String::new(),
                        discover_alerts_enabled: false,
                        sound_enabled: true,
                        auto_scan_enabled: true,
                        event_city: "istanbul".to_string(),
                        event_radar_artists: String::new(),
                        event_blacklist: String::new(),
                    });
                    let list = crate::events_feed::fetch_live_events(&settings).await;
                    ("200 OK", "application/json", serde_json::to_string(&list).unwrap_or_else(|_| "[]".into()))
                } else if method == "POST" && path == "/api/event-vote" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let eid = v["event_id"].as_str().unwrap_or("");
                        let who = v["who"].as_str().unwrap_or("metehan");
                        let vote = v["vote"].as_str().unwrap_or("");
                        let bought = v["ticket_bought"].as_bool();
                        if !eid.is_empty() {
                            let _ = db::open_db().and_then(|c| db::set_event_vote(&c, eid, who, vote, bought));
                            crate::events::emit("event_vote_updated");
                        }
                        ("200 OK", "application/json", r#"{"ok":true}"#.to_string())
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "POST" && path == "/api/push/subscribe" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let ep = v["endpoint"].as_str().unwrap_or("");
                        let p256 = v["keys"]["p256dh"].as_str().unwrap_or("");
                        let auth = v["keys"]["auth"].as_str().unwrap_or("");
                        let who = v["who"].as_str().unwrap_or("metehan");
                        if !ep.is_empty() {
                            let _ = db::open_db().and_then(|c| db::save_push_subscription(&c, ep, p256, auth, who));
                        }
                        ("200 OK", "application/json", r#"{"ok":true}"#.to_string())
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "GET" && path == "/api/discover" {
                    let settings = db::open_db().map(|c| db::load_settings(&c)).unwrap_or(crate::models::AlertSettings {
                        discord_webhook: String::new(),
                        telegram_bot_token: String::new(),
                        telegram_chat_id: String::new(),
                        ntfy_topic: String::new(),
                        refresh_interval_min: 45,
                        cloudflare_tunnel_url: String::new(),
                        cloudflare_tunnel_token: String::new(),
                        cloudflare_worker_key: String::new(),
                        active_theme: "obsidian-aurora".to_string(),
                        monthly_budget_try: 15000.0,
                        user_cards: String::new(),
                        discover_keywords: String::new(),
                        discover_muted: String::new(),
                        discover_alerts_enabled: false,
                        sound_enabled: true,
                        auto_scan_enabled: true,
                        event_city: "istanbul".to_string(),
                        event_radar_artists: String::new(),
                        event_blacklist: String::new(),
                    });
                    let list = crate::discover::fetch_discover_feed(&settings).await;
                    ("200 OK", "application/json", serde_json::to_string(&list).unwrap_or_else(|_| "[]".into()))
                } else if method == "GET" && path == "/api/theme" {
                    match db::open_db() {
                        Ok(c) => {
                            let s = db::load_settings(&c);
                            let j = serde_json::json!({ "theme": s.active_theme, "monthly_budget_try": s.monthly_budget_try });
                            ("200 OK", "application/json", j.to_string())
                        }
                        Err(_) => ("200 OK", "application/json", r#"{"theme":"obsidian-aurora"}"#.to_string()),
                    }
                } else if method == "POST" && path == "/api/theme" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let theme = v["theme"].as_str().unwrap_or("obsidian-aurora").trim();
                        let _ = db::open_db().and_then(|c| {
                            c.execute(
                                "INSERT INTO settings (key, val) VALUES ('active_theme', ?1) ON CONFLICT(key) DO UPDATE SET val = excluded.val",
                                params![theme],
                            ).map_err(|e| e.to_string())
                        });
                        ("200 OK", "application/json", r#"{"ok":true}"#.to_string())
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "GET" && path == "/api/products" {
                    let hide_secret = query_str.to_lowercase().contains("who=ilayda");
                    match db::open_db().and_then(|c| db::list_products(&c)) {
                        Ok(list) => {
                            let filtered: Vec<_> = if hide_secret {
                                list.into_iter().filter(|p| !p.is_secret_gift).collect()
                            } else {
                                list
                            };
                            ("200 OK", "application/json", serde_json::to_string(&filtered).unwrap_or_else(|_| "[]".into()))
                        }
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
                } else if method == "POST" && path == "/api/vote" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let pid = v["product_id"].as_i64().unwrap_or(0);
                        let who = v["who"].as_str().unwrap_or("metehan");
                        let vote = v["vote"].as_str().unwrap_or("");
                        let note = v["note"].as_str();
                        match db::open_db().and_then(|c| db::set_product_vote(&c, pid, who, vote, note)) {
                            Ok(_) => {
                                crate::events::emit("vote_updated");
                                ("200 OK", "application/json", r#"{"ok":true}"#.to_string())
                            }
                            Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                        }
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "POST" && path == "/api/purchase" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let pid = v["product_id"].as_i64().unwrap_or(0);
                        let price = v["price_try"].as_f64();
                        match db::open_db().and_then(|c| db::mark_purchased(&c, pid, price)) {
                            Ok(_) => ("200 OK", "application/json", r#"{"ok":true}"#.to_string()),
                            Err(e) => ("500 Internal Server Error", "application/json", format!(r#"{{"error":"{}"}}"#, e)),
                        }
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "POST" && path == "/api/check" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let url = v["url"].as_str().unwrap_or("").trim();
                        let title = v["title"].as_str().unwrap_or("").trim().to_lowercase();
                        let res = db::open_db().and_then(|c| db::list_products(&c));
                        match res {
                            Ok(list) => {
                                let found = list.into_iter().find(|p| {
                                    (!url.is_empty() && (p.primary_url == url || p.offers.iter().any(|o| o.url == url)))
                                        || (!title.is_empty() && title.len() > 8 && p.title.to_lowercase().contains(&title[..title.len().min(22)]))
                                });
                                if let Some(p) = found {
                                    let j = serde_json::json!({
                                        "tracked": true,
                                        "product_id": p.id,
                                        "best_new_try": p.best_new_try,
                                        "min_all_try": p.discount_verdict.min_all_try,
                                        "avg_30d_try": p.discount_verdict.avg_30d_try,
                                        "badge": p.discount_verdict.badge,
                                        "status": p.discount_verdict.status,
                                        "tracked_sizes": p.tracked_sizes,
                                    });
                                    ("200 OK", "application/json", j.to_string())
                                } else {
                                    ("200 OK", "application/json", r#"{"tracked":false}"#.to_string())
                                }
                            }
                            Err(_) => ("200 OK", "application/json", r#"{"tracked":false}"#.to_string()),
                        }
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
                    }
                } else if method == "POST" && path == "/api/compare" {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let title = v["title"].as_str().unwrap_or("").trim();
                        let current = v["current_price_try"].as_f64().unwrap_or(0.0);
                        let clean_q: String = title.split_whitespace().take(5).collect::<Vec<_>>().join(" ");
                        if clean_q.len() < 3 {
                            ("200 OK", "application/json", r#"{"cheaper":null}"#.to_string())
                        } else {
                            let cands = crate::search_live_tr(clean_q).await;
                            let cheaper = cands
                                .into_iter()
                                .filter(|c| c.price_try > 0.0 && (current <= 0.0 || c.price_try < current * 0.96))
                                .min_by(|a, b| a.price_try.partial_cmp(&b.price_try).unwrap_or(std::cmp::Ordering::Equal));
                            let j = serde_json::json!({ "cheaper": cheaper });
                            ("200 OK", "application/json", j.to_string())
                        }
                    } else {
                        ("400 Bad Request", "application/json", r#"{"error":"Geçersiz JSON"}"#.to_string())
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
                                if let Some(ts) = item.tracked_sizes.as_deref().filter(|s| !s.trim().is_empty()) {
                                    let _ = conn.execute("UPDATE products SET tracked_sizes = ?1 WHERE id = ?2", params![ts.trim(), pid]);
                                }
                                if let Some(tp) = item.target_price_try.filter(|v| *v > 0.0) {
                                    let _ = conn.execute("UPDATE products SET target_price_try = ?1 WHERE id = ?2", params![tp, pid]);
                                }
                                if let Some(sel) = item.custom_css_selector.as_deref().filter(|s| !s.trim().is_empty()) {
                                    let _ = conn.execute("UPDATE products SET custom_css_selector = ?1 WHERE id = ?2", params![sel.trim(), pid]);
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
