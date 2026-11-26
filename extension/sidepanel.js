const BRIDGE = 'http://127.0.0.1:47821';
let pageProduct = null;
const selectedSizes = new Set();

async function syncThemeAndWatchlist() {
  const conn = document.getElementById('conn');
  try {
    const [pRes, tRes, listRes] = await Promise.all([
      fetch(`${BRIDGE}/ping`),
      fetch(`${BRIDGE}/api/theme`),
      fetch(`${BRIDGE}/api/products`),
    ]);
    const p = await pRes.json();
    conn.textContent = `v${p.version} Bağlı`;
    conn.className = 'pill ok';
    const t = await tRes.json();
    if (t.theme) document.documentElement.setAttribute('data-theme', t.theme);
    const list = await listRes.json();
    const wEl = document.getElementById('watch');
    if (!list.length) {
      wEl.innerHTML = '<div style="font-size:11px;color:var(--muted)">Henüz ürün yok.</div>';
    } else {
      wEl.innerHTML = list.slice(0, 8).map(item =>
        `<div class="w-item"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</span><strong style="font-family:monospace;color:var(--acc);flex-shrink:0">${Math.round(item.best_new_try).toLocaleString('tr-TR')} ₺</strong></div>`
      ).join('');
    }
  } catch {
    conn.textContent = 'Uygulama Kapalı';
  }
}

async function startVisualPicker() {
  const msg = document.getElementById('msg');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  msg.textContent = 'Sayfada takip etmek istediğin fiyatın üstüne tıkla...';
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (window.__hayyePickerActive) return;
      window.__hayyePickerActive = true;
      let prev = null;
      const onMove = (e) => {
        if (prev) prev.style.outline = '';
        prev = e.target;
        prev.style.outline = '2px solid #10B981';
      };
      const onClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        window.__hayyePickerActive = false;
        if (prev) prev.style.outline = '';
        const el = e.target;
        const txt = (el.textContent || '').trim();
        const m = txt.replace(/[^\d.,]/g, '');
        const norm = m.includes(',') && m.includes('.') ? m.replace(/\./g,'').replace(',','.') : m.includes(',') ? m.replace(',','.') : m.replace(/\./g,'');
        const price = parseFloat(norm) || 0;
        const sel = el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0,2).join('.') : '');
        const title = (document.querySelector('h1')?.textContent || document.title || '').trim();
        const img = document.querySelector('meta[property="og:image"]')?.content || '';
        const store = location.hostname.replace(/^www\./,'').split('.')[0];
        await fetch('http://127.0.0.1:47821/ingest/product', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ title, url: location.href, price_try: price, store_name: store, image_url: img, custom_css_selector: sel })
        });
        alert(`Hayye Market: Fiyat kilitlendi (${Math.round(price).toLocaleString('tr-TR')} ₺)`);
      };
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
    },
  });
}

async function inspectActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const box = document.getElementById('current');
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, (res) => {
    if (chrome.runtime.lastError || !res?.product?.title) {
      box.innerHTML = `
        <div style="font-size:12px;color:var(--muted);line-height:1.5">Bu sitede otomatik ürün algılanmadı — ama <strong>Görsel Fiyat Seçici</strong> ile dünyadaki herhangi bir sitenin fiyatını tıklayıp takibe alabilirsin.</div>
        <button id="vpick" class="btn">🎯 Görsel Fiyat Seç (Her Site)</button>
      `;
      document.getElementById('vpick').onclick = startVisualPicker;
      return;
    }
    pageProduct = res.product;
    selectedSizes.clear();
    const sizesHtml = (pageProduct.sizes || [])
      .map(s => `<button class="sz ${s.in_stock ? '' : 'out'}" data-sz="${s.size}">${s.size}</button>`)
      .join('');
    box.innerHTML = `
      <div class="title">${pageProduct.title}</div>
      <div class="price">${pageProduct.price_try > 0 ? Math.round(pageProduct.price_try).toLocaleString('tr-TR') + ' ₺' : 'Fiyat algılanmadı'}</div>
      ${sizesHtml ? `<span class="lbl">Alarm Kurulacak Bedenler:</span><div class="sizes">${sizesHtml}</div>` : ''}
      <label class="lbl">Hedef Fiyat Alarmı (₺)</label>
      <input id="target" type="number" placeholder="${pageProduct.price_try ? Math.round(pageProduct.price_try * 0.85) : 'Örn. 1500'}" />
      <button id="save" class="btn">Hayye Market’e Kaydet</button>
      <button id="vpick" class="btn-sec">🎯 Fiyatı Elle Seç (Visual Selector)</button>
    `;
    box.querySelectorAll('.sz').forEach(b => {
      b.onclick = () => {
        const sz = b.dataset.sz;
        if (selectedSizes.has(sz)) { selectedSizes.delete(sz); b.classList.remove('sel'); }
        else { selectedSizes.add(sz); b.classList.add('sel'); }
      };
    });
    document.getElementById('vpick').onclick = startVisualPicker;
    document.getElementById('save').onclick = async () => {
      const targetVal = parseFloat(document.getElementById('target').value);
      const msg = document.getElementById('msg');
      msg.textContent = 'Kaydediliyor...';
      try {
        const r = await fetch(`${BRIDGE}/ingest/product`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            ...pageProduct,
            tracked_sizes: Array.from(selectedSizes).join(', '),
            target_price_try: Number.isFinite(targetVal) && targetVal > 0 ? targetVal : null,
          }),
        });
        const d = await r.json();
        msg.textContent = d.ok ? '✓ Kaydedildi!' : (d.error || 'Hata');
        syncThemeAndWatchlist();
      } catch {
        msg.textContent = 'Hayye PC uygulaması kapalı.';
      }
    };
  });
}

chrome.tabs.onActivated.addListener(() => { inspectActiveTab(); syncThemeAndWatchlist(); });
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') inspectActiveTab(); });

syncThemeAndWatchlist();
inspectActiveTab();
