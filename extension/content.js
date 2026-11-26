(() => {
  const BRIDGE = 'http://127.0.0.1:47821';
  if (document.getElementById('hayye-floating-pill')) return;

  const host = location.hostname.replace(/^www\./, '');
  const isSecondHand = /sahibinden|dolap|letgo|gardrops/i.test(host);
  const isFavOrCart = /favori|wishlist|sepet|cart|bag|saved|lists|likes/i.test(location.pathname + location.search);

  // 2. El "Yeni İlan Farkı" Nöbeti (Sahibinden / Dolap / Gardrops / Letgo)
  if (isSecondHand) {
    try {
      const storeKey = 'hayye_seen_2el_' + host + '_' + location.pathname;
      const prevMap = JSON.parse(localStorage.getItem(storeKey) || '{}');
      const nextMap = { ...prevMap };
      const hasHistory = Object.keys(prevMap).length > 0;
      document.querySelectorAll('tr.searchResultsItem, [class*="product" i], [class*="card" i]').forEach((row) => {
        const a = row.querySelector('a[href]');
        if (!a) return;
        const id = a.getAttribute('href').split('?')[0];
        const txt = (row.textContent || '').replace(/\s+/g, ' ');
        const pm = txt.match(/(\d{1,3}(?:\.\d{3})+|\d{3,6})\s*(?:TL|₺)/i);
        const price = pm ? parseFloat(pm[1].replace(/\./g, '')) : 0;
        if (!id || price <= 0) return;
        nextMap[id] = price;
        if (hasHistory) {
          if (!(id in prevMap)) {
            row.style.outline = '2px solid #10B981';
            row.style.borderRadius = '10px';
            const tag = document.createElement('span');
            tag.textContent = '✦ YENİ İLAN';
            tag.style.cssText = 'display:inline-block;margin:4px;padding:2px 7px;border-radius:999px;background:#10B981;color:#07100C;font-size:10px;font-weight:700;';
            row.prepend(tag);
          } else if (price < prevMap[id] - 20) {
            const diff = Math.round(prevMap[id] - price).toLocaleString('tr-TR');
            row.style.outline = '2px solid #3B82F6';
            const tag = document.createElement('span');
            tag.textContent = `↓ -${diff} ₺ DÜŞTÜ`;
            tag.style.cssText = 'display:inline-block;margin:4px;padding:2px 7px;border-radius:999px;background:#3B82F6;color:#fff;font-size:10px;font-weight:700;';
            row.prepend(tag);
          }
        }
      });
      localStorage.setItem(storeKey, JSON.stringify(nextMap));
    } catch {}
  }

  function parsePrice(str) {
    if (!str) return 0;
    const cleaned = String(str).replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return 0;
    const norm = cleaned.includes(',') && cleaned.includes('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.includes(',') && cleaned.split(',')[1]?.length <= 2
      ? cleaned.replace(',', '.')
      : cleaned.replace(/\./g, '');
    const v = parseFloat(norm);
    return Number.isFinite(v) ? v : 0;
  }

  function extractSizes() {
    const out = [];
    const seen = new Set();
    const selectors = [
      '[class*="size"] button', '[class*="size"] li', '[data-qa*="size"]',
      '[class*="beden"] button', '[class*="beden"] li', '.size-selector button',
      'button[aria-label*="beden" i]', 'button[aria-label*="size" i]',
      'input[name*="size" i] + label', '.product-detail-size-selector__size-list-item'
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
        if (!txt || txt.length > 14 || seen.has(txt.toUpperCase())) return;
        if (!/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|STD|TEK|\d{2}(\.\d)?)$/i.test(txt)) return;
        seen.add(txt.toUpperCase());
        const cls = (el.className || '').toString().toLowerCase();
        const outStock = el.disabled || el.getAttribute('aria-disabled') === 'true' ||
          /out|sold|disabled|unavail|notify|tuken|yok/.test(cls);
        out.push({ size: txt.toUpperCase(), in_stock: !outStock, cart_url: null });
      });
    }
    return out.slice(0, 20);
  }

  function extractPageProduct() {
    const h1 = document.querySelector('h1');
    const title = (h1?.textContent || document.querySelector('meta[property="og:title"]')?.content || document.title || '').trim();
    const img = document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector('img[src*="http"]')?.src || '';

    let price = 0;
    const metaP = document.querySelector('meta[property="product:price:amount"], meta[itemprop="price"]');
    if (metaP?.content) price = parsePrice(metaP.content);

    if (!price) {
      const priceSelectors = [
        '.money-amount__main', '[data-qa-qualifier="price-amount-current"]',
        '.prc-dsc', '.product-price', '[data-test-id="default-price"]',
        '.a-price .a-offscreen', '.price-current', '.classifiedInfo h3', '[class*="price" i]'
      ];
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const p = parsePrice(el.textContent);
          if (p >= 20 && p < 5000000) { price = p; break; }
        }
      }
    }

    const storeName = host.split('.')[0].replace(/^./, (c) => c.toUpperCase());
    return {
      title: title.slice(0, 180),
      url: location.href,
      price_try: price,
      store_name: storeName,
      image_url: img,
      is_used: isSecondHand,
      sizes: extractSizes(),
    };
  }

  function extractBulkItems() {
    const items = [];
    const seen = new Set();
    const storeName = host.split('.')[0].replace(/^./, (c) => c.toUpperCase());
    document.querySelectorAll('a[href]').forEach((a) => {
      const card = a.closest('article, li, [class*="product" i], [class*="card" i], [class*="item" i]');
      if (!card) return;
      const href = a.href;
      if (!href || seen.has(href) || !href.startsWith('http')) return;
      const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
      const priceMatch = text.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{3,6}(?:,\d{2})?)\s*(?:TL|₺)/i);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const img = card.querySelector('img')?.src || '';
      const nameEl = card.querySelector('h2, h3, h4, [class*="name" i], [class*="title" i]');
      const title = (nameEl?.textContent || a.getAttribute('title') || '').trim();
      if (title.length < 4 || price <= 0) return;
      seen.add(href);
      items.push({ title: title.slice(0, 160), url: href, price_try: price, store_name: storeName, image_url: img });
    });
    return items.slice(0, 40);
  }

  // Respond to popup.js requests
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_PAGE_INFO') {
      sendResponse({ product: extractPageProduct(), isFavOrCart });
    }
  });

  // Build Sleek Editorial Floating Glass Pill (Keepa × Phia style)
  const pill = document.createElement('div');
  pill.id = 'hayye-floating-pill';
  pill.style.cssText = `
    position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
    display: flex; align-items: center; gap: 8px; padding: 7px 10px 7px 8px;
    border-radius: 999px; background: rgba(14, 16, 20, 0.88);
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #F5F2EB; font-size: 12px; transition: all 0.2s ease;
  `;

  const iconUrl = chrome.runtime.getURL('icons/icon32.png');
  pill.innerHTML = `
    <img src="${iconUrl}" style="width:24px;height:24px;border-radius:7px;flex-shrink:0" />
    <span id="hayye-status-txt" style="max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C7CCD4;font-weight:500">Hayye</span>
    <button id="hayye-cmp-btn" style="border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#F5F2EB;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer">Daha Ucuzu?</button>
    <button id="hayye-save-btn" style="border:none;background:#10B981;color:#090A0C;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer">${isFavOrCart ? 'Toplu Aktar' : 'Takibe Al'}</button>
    <button id="hayye-close-btn" style="border:none;background:transparent;color:#8F96A3;font-size:14px;line-height:1;cursor:pointer;padding:0 3px">×</button>
  `;
  document.body.appendChild(pill);

  const statusEl = pill.querySelector('#hayye-status-txt');
  const cmpBtn = pill.querySelector('#hayye-cmp-btn');
  const saveBtn = pill.querySelector('#hayye-save-btn');
  pill.querySelector('#hayye-close-btn').onclick = () => pill.remove();

  // Auto-check if product is already tracked in Hayye Market
  const prod = extractPageProduct();
  if (prod.title && !isFavOrCart) {
    fetch(`${BRIDGE}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: prod.url, title: prod.title, price_try: prod.price_try }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.tracked) {
          const dip = Math.round(d.min_all_try || d.best_new_try).toLocaleString('tr-TR');
          const color = d.status?.includes('GENUINE') ? '#10B981' : d.status === 'INFLATED_FAKE' ? '#F43F5E' : '#F5F2EB';
          statusEl.style.color = color;
          statusEl.textContent = `${d.badge} • Dip: ${dip} ₺`;
          saveBtn.textContent = 'Güncelle';
        }
      })
      .catch(() => {});
  }

  // Cross-store cheaper price lookup
  cmpBtn.onclick = async () => {
    const cur = extractPageProduct();
    if (!cur.title) return;
    cmpBtn.textContent = 'Arıyor...';
    try {
      const r = await fetch(`${BRIDGE}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cur.title, current_price_try: cur.price_try }),
      });
      const d = await r.json();
      if (d.cheaper) {
        const diff = cur.price_try > d.cheaper.price_try
          ? `${Math.round(cur.price_try - d.cheaper.price_try).toLocaleString('tr-TR')} ₺ ucuz`
          : `${Math.round(d.cheaper.price_try).toLocaleString('tr-TR')} ₺`;
        statusEl.style.color = '#10B981';
        statusEl.innerHTML = `<a href="${d.cheaper.url}" target="_blank" style="color:#10B981;text-decoration:underline">${d.cheaper.store_name}: ${diff} ↗</a>`;
        cmpBtn.textContent = 'Bulundu ✓';
      } else {
        statusEl.textContent = 'En iyi fiyat burada görünüyor';
        cmpBtn.textContent = 'En İyi ✓';
      }
    } catch {
      statusEl.textContent = 'Hayye uygulaması kapalı';
      cmpBtn.textContent = 'Daha Ucuzu?';
    }
  };

  // Save product or bulk wishlist
  saveBtn.onclick = async () => {
    saveBtn.textContent = '...';
    try {
      if (isFavOrCart) {
        const items = extractBulkItems();
        const r = await fetch(`${BRIDGE}/ingest/bulk-products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_name: 'Giyim & Inditex', items }),
        });
        const d = await r.json();
        statusEl.style.color = '#10B981';
        statusEl.textContent = `${d.added || 0} ürün aktarıldı`;
        saveBtn.textContent = 'Aktarıldı ✓';
      } else {
        const item = extractPageProduct();
        const r = await fetch(`${BRIDGE}/ingest/product`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        const d = await r.json();
        if (d.ok) {
          statusEl.style.color = '#10B981';
          statusEl.textContent = 'Hayye koleksiyonuna eklendi';
          saveBtn.textContent = 'Kaydedildi ✓';
        }
      }
    } catch {
      statusEl.style.color = '#F43F5E';
      statusEl.textContent = 'Hayye PC uygulaması açık değil';
      saveBtn.textContent = 'Tekrar Dene';
    }
  };
})();
