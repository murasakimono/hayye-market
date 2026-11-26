(() => {
  const BRIDGE = 'http://127.0.0.1:47821';
  const host = location.hostname.replace(/^www\./, '');
  const isUsedSite = /sahibinden|dolap|letgo/.test(host);
  const isFashionSite = /zara|bershka|stradivarius|pullandbear|massimodutti|oysho|flawwear|hypetr|36clo|nike|beymen|boyner/.test(host);
  const isCosmeticsSite = /sephora|gratis|watsons|rossmann/.test(host);

  function parsePrice(txt) {
    if (!txt) return 0;
    const m = txt.match(/([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{2,7})(?:,([0-9]{1,2}))?/);
    if (!m) return 0;
    return parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '00')) || 0;
  }

  function extractSizesFromDom() {
    const out = [];
    const seen = new Set();
    const candidates = document.querySelectorAll(
      '[class*="size"] button, [class*="size"] li, [data-qa-action="size-in-stock"], [data-qa-action="size-out-of-stock"], .size-selector-sizes-size__button'
    );
    candidates.forEach((el) => {
      const txt = (el.innerText || '').trim().split('\n')[0].trim();
      if (!txt || txt.length > 8 || seen.has(txt)) return;
      if (!/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|[3-4][0-9](\.5)?|STD)$/i.test(txt)) return;
      seen.add(txt);
      const cls = (el.className || '').toLowerCase();
      const disabled = el.hasAttribute('disabled') || cls.includes('out') || cls.includes('disabled') || cls.includes('unavailable') || el.getAttribute('data-qa-action') === 'size-out-of-stock';
      out.push({ size: txt.toUpperCase(), in_stock: !disabled, variant_id: null, cart_url: location.href });
    });
    return out;
  }

  function extractSingleProduct() {
    const title = (document.querySelector('h1')?.innerText || document.title || '').trim();
    const img = document.querySelector('meta[property="og:image"]')?.content || document.querySelector('img[src*="static.zara"], img[src*="bershka"], img[src*="cdn"]')?.src || '';
    const priceSelectors = [
      '.money-amount__main',
      '.current-price-elem',
      '.classifiedInfo h3',
      '.prc-dsc',
      '[data-test-id="price-current-price"]',
      '.a-price-whole',
      '.pt_v8',
      '.product-list__price',
      '[class*="price"]'
    ];
    let price = 0;
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const p = parsePrice(el.innerText);
        if (p > 5) { price = p; break; }
      }
    }
    const bodyText = document.body.innerText.toLowerCase();
    return {
      title,
      url: location.href,
      price_try: price,
      store_name: host,
      seller_name: host,
      image_url: img,
      folder_id: isCosmeticsSite ? 3 : isFashionSite ? 2 : 1,
      is_used: isUsedSite,
      city: 'İstanbul',
      param_guvende: /param güvende|dolap güvencesi/.test(bodyText),
      has_invoice_box: /faturalı|fatura|garantili|kutulu/.test(bodyText),
      photo_count: Math.min(12, document.querySelectorAll('img').length > 8 ? 6 : 3),
      sizes: isFashionSite ? extractSizesFromDom() : [],
      quick_checkout_url: location.href
    };
  }

  function extractCartOrFavoritesBatch() {
    const path = location.pathname.toLowerCase();
    if (!/(cart|sepet|basket|fav|wishlist|saved|shop-cart)/.test(path)) return [];
    const cards = document.querySelectorAll('article, [class*="cart-item"], [class*="wishlist"], [class*="favorite"], [class*="basket-item"], li[class*="product"]');
    const items = [];
    const seen = new Set();
    cards.forEach((c) => {
      const a = c.querySelector('a[href]');
      const titleEl = c.querySelector('h2, h3, h4, [class*="name"], [class*="title"]');
      const price = parsePrice(c.innerText);
      const title = (titleEl?.innerText || a?.innerText || '').trim();
      if (!title || title.length < 3 || price <= 5 || seen.has(title)) return;
      seen.add(title);
      items.push({
        title: title.slice(0, 120),
        url: a ? a.href : location.href,
        price_try: price,
        store_name: host,
        seller_name: host,
        image_url: c.querySelector('img')?.src || '',
        sizes: [],
        quick_checkout_url: a ? a.href : location.href
      });
    });
    return items.slice(0, 35);
  }

  function extractSahibindenSearchBatch() {
    const rows = document.querySelectorAll('tr.searchResultsItem');
    const items = [];
    rows.forEach((tr) => {
      const a = tr.querySelector('a.classifiedTitle');
      const pEl = tr.querySelector('td.searchResultsPriceValue');
      const locEl = tr.querySelector('td.searchResultsLocationValue');
      if (!a || !pEl) return;
      const price = parsePrice(pEl.innerText);
      if (price <= 0) return;
      const title = a.innerText.trim();
      const txt = tr.innerText.toLowerCase();
      items.push({
        title,
        price_try: price,
        city: (locEl?.innerText || 'Türkiye').replace(/\s+/g, ' ').trim(),
        seller_name: 'Sahibinden Satıcı',
        param_guvende: /param güvende/.test(txt) || !!tr.querySelector('.param-guvende, [title*="Param Güvende"]'),
        has_invoice_box: /fatura|garanti|kutulu|sıfır/.test(txt),
        photo_count: 5,
        url: a.href
      });
    });
    return items.slice(0, 25);
  }

  const btn = document.createElement('button');
  const isCartOrFav = /(cart|sepet|basket|fav|wishlist|saved|shop-cart)/.test(location.pathname.toLowerCase());
  btn.textContent = isCartOrFav ? '● Sepet/Favorileri Hayye\'ye Aktar' : '● Hayye\'ye At';
  Object.assign(btn.style, {
    position: 'fixed',
    right: '18px',
    bottom: '18px',
    zIndex: '2147483647',
    background: '#0E1012',
    color: '#F2EFE9',
    border: '1px solid #10B981',
    padding: '9px 14px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)'
  });

  btn.addEventListener('click', async () => {
    btn.textContent = 'Gönderiliyor...';
    try {
      const usedBatch = host.includes('sahibinden') ? extractSahibindenSearchBatch() : [];
      const favBatch = isCartOrFav ? extractCartOrFavoritesBatch() : [];
      if (favBatch.length >= 1) {
        const res = await fetch(`${BRIDGE}/ingest/bulk-products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_name: isCosmeticsSite ? 'Kozmetik' : 'Giyim & Inditex', items: favBatch })
        }).then((r) => r.json());
        btn.textContent = `✓ ${res.added || favBatch.length} ürün senkronize edildi`;
      } else if (usedBatch.length >= 2) {
        const prods = await fetch(`${BRIDGE}/products`).then((r) => r.json());
        if (!prods.length) {
          btn.textContent = 'Önce Hayye\'de ürün aç';
          return;
        }
        const pickText = prods.map((p, i) => `${i + 1}) ${p.title}`).join('\n');
        const ans = prompt(`${usedBatch.length} adet 2. el ilan bulundu. Hangi ürüne eklensin?\n${pickText}`, '1');
        const idx = parseInt(ans || '1', 10) - 1;
        const target = prods[idx] || prods[0];
        const res = await fetch(`${BRIDGE}/ingest/used-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: target.id, platform: 'Sahibinden', listings: usedBatch })
        }).then((r) => r.json());
        btn.textContent = `✓ ${res.added || usedBatch.length} 2. el ilan aktarıldı`;
      } else {
        const item = extractSingleProduct();
        await fetch(`${BRIDGE}/ingest/product`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
        btn.textContent = '✓ Hayye\'ye Eklendi';
      }
    } catch {
      btn.textContent = 'Hayye kapalı (47821)';
    }
    setTimeout(() => {
      btn.textContent = isCartOrFav ? '● Sepet/Favorileri Hayye\'ye Aktar' : '● Hayye\'ye At';
    }, 2600);
  });

  document.body.appendChild(btn);
})();
