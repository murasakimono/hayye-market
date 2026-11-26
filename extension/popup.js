const BRIDGE = 'http://127.0.0.1:47821';
let pageProduct = null;
const selectedSizes = new Set();

async function init() {
  const conn = document.getElementById('conn');
  try {
    const r = await fetch(`${BRIDGE}/ping`);
    const d = await r.json();
    conn.textContent = `v${d.version} Bağlı`;
    conn.className = 'pill ok';
  } catch {
    conn.textContent = 'Uygulama Kapalı';
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, (res) => {
    const box = document.getElementById('content');
    if (chrome.runtime.lastError || !res?.product?.title) {
      box.innerHTML = `<div style="font-size:12px;color:#8F96A3">Bu sekmede desteklenen bir ürün sayfası algılanmadı.<br/><br/>Zara, Flaw, Trendyol, Amazon, Sephora, Sahibinden veya Dolap ürün sayfasında açabilirsin.</div>`;
      return;
    }
    pageProduct = res.product;
    const sizesHtml = (pageProduct.sizes || [])
      .map(
        (s) =>
          `<button class="sz ${s.in_stock ? '' : 'out'}" data-sz="${s.size}">${s.size}</button>`
      )
      .join('');

    box.innerHTML = `
      <div class="title">${pageProduct.title}</div>
      <div class="price">${pageProduct.price_try > 0 ? Math.round(pageProduct.price_try).toLocaleString('tr-TR') + ' ₺' : 'Fiyat algılanmadı'}</div>
      ${sizesHtml ? `<span class="lbl">Alarm Kurulacak Bedenler (tıkla):</span><div class="sizes">${sizesHtml}</div>` : ''}
      <label class="lbl">Hedef Fiyat Alarmı (₺, opsiyonel)</label>
      <input id="target" type="number" placeholder="${pageProduct.price_try ? Math.round(pageProduct.price_try * 0.85) : 'Örn. 1500'}" />
      <button id="save" class="btn">Hayye Market'e Kaydet</button>
    `;

    box.querySelectorAll('.sz').forEach((btn) => {
      btn.onclick = () => {
        const sz = btn.dataset.sz;
        if (selectedSizes.has(sz)) {
          selectedSizes.delete(sz);
          btn.classList.remove('sel');
        } else {
          selectedSizes.add(sz);
          btn.classList.add('sel');
        }
      };
    });

    document.getElementById('save').onclick = async () => {
      const targetVal = parseFloat(document.getElementById('target').value);
      const payload = {
        ...pageProduct,
        tracked_sizes: Array.from(selectedSizes).join(', '),
        target_price_try: Number.isFinite(targetVal) && targetVal > 0 ? targetVal : null,
      };
      const msg = document.getElementById('msg');
      msg.textContent = 'Kaydediliyor...';
      try {
        const r = await fetch(`${BRIDGE}/ingest/product`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        msg.textContent = d.ok ? '✓ Beden & alarmla Hayye Market’e kaydedildi!' : d.error || 'Hata';
      } catch {
        msg.style.color = '#F43F5E';
        msg.textContent = 'Hayye Market masaüstü uygulaması açık değil.';
      }
    };
  });
}

init();
