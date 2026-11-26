<div align="center">
  <img src="public/hayye-icon.png" width="104" height="104" alt="Hayye Market Logo" style="border-radius:24px" />
  <h1>HAYYE MARKET</h1>
  <p><strong>Editorial Lookbook Dark — Evrensel Fiyat, Stok, Moda/Kozmetik &amp; 2. El İlan İstihbaratı</strong></p>
  <p>
    <img src="https://img.shields.io/badge/version-3.0.0-10B981?style=flat-square" alt="Version 3.0.0" />
    <img src="https://img.shields.io/badge/stack-Tauri%20v2%20%2B%20Rust%20%2B%20Framer%20Motion-090A0C?style=flat-square" alt="Tauri v2 + Rust" />
    <img src="https://img.shields.io/badge/platform-Windows%20%2B%20Brave%20SidePanel%20%2B%20iOS%20PWA-3B82F6?style=flat-square" alt="Windows + Brave + iOS PWA" />
  </p>
</div>

---

## Neden Hayye Market?

Sahte "bindirim sonrası indirim" etiketleri, 30 saniyede tükenen Inditex/streetwear bedenleri, şişirilmiş 2. el ilanları ve onlarca sekmede dağılan favori listeleri için tek bir koyu piyasa terminali.

- **Sahte İndirim Dedektörü & Enflasyonsuz (TL ↔ USD) Grafik:** Ürünün fiyat geçmişini hem TL hem canlı USD kuru üzerinden analiz eder; **GERÇEK DİP**, **GERÇEK İNDİRİM** veya **ŞİŞİRİLMİŞ** kararını net şekilde verir.
- **Moda, Streetwear & Kozmetik Motoru:**
  - `ikas` (`__NEXT_DATA__`), `Shopify` (`/products/*.json`) ve `JSON-LD` mağazalarını doğrudan tarar (**Flaw Wear, HypeTR, 36clo, Boyner, Nike TR, Beymen, Gratis, Rossmann, Akakçe, Amazon TR, Vatan**).
  - **Beden Bazlı Stok Alarmı:** Sadece kendi bedenlerini (`S`, `M`, `L`, `42` vb.) işaretlersin; o beden stoğa girdiği an bildirim gelir.
  - **1-Tık Sniper Hızlı Alım (`⚡ Hızlı Alım`):** Shopify ve desteklenen mağazalarda doğrudan seçili bedenin sepet/ödeme linkini açar.
  - **Kozmetik Birim Fiyat Dedektörü:** Parfüm, serum ve bakım ürünlerinde `ml` / `gr` miktarını otomatik çıkarıp **`₺ / 10 ml`** gerçek maliyetini hesaplar.
- **2. El vs Sıfır Piyasa Bandı & Güvenilirlik Skoru:** Sahibinden, Dolap ve Letgo ilanlarını sıfır en ucuz fiyatla kıyaslar; Param Güvende, fatura/kutu, fotoğraf sayısı ve fiyat anomalisi kırılımıyla **%0–100 Güvenilirlik Yüzdesi** üretir, tek tıkla pazarlık mesajı kopyalar.
- **29 Mağazalı Brave Yardımcı Eklentisi (`extension/`):** Akamai/WAF korumalı mağazalarda (**Zara, Bershka, Stradivarius, Pull&Bear, Massimo Dutti, Oysho, Sephora, Watsons, Trendyol, Hepsiburada, Sahibinden, Dolap** vb.) kendi oturumun üzerinden **1-tık Ürün/Favori/Sepet Toplu Aktarım** ve DOM beden taraması yapar.
- **iPhone & iPad Safari Uygulaması (PWA — App Store Gerektirmez):** Uygulama yerel ağda (`:47821/app`) ve yerleşik **Cloudflare Zero Trust / Worker Sabit Tünel** üzerinden iPhone/iPad Ana Ekranına sabit uygulama olarak eklenir; iOS Kestirmeler Paylaşım Menüsü (`POST /ios-share`) destekler.
- **Anlık Telefon Bildirimleri:** Discord Webhook, Telegram Bot ve ücretsiz `ntfy.sh` push desteği.
- **Toplam Kurtarılan Para Sayacı & Klasörlü Sepet Toplamı:** Gerçek indirimlerden ettiğin toplam tasarrufu ve tüm alışveriş listelerinin sıfır / 2. el karma maliyetini tek ekranda izler.

---

## Kurulum

### 1. Masaüstü Uygulaması (Windows)
[Releases](https://github.com/murasakimono/hayye-market/releases/latest) sayfasından **`Hayye Market_1.1.1_x64-setup.exe`** dosyasını indirip kur.

### 2. Brave / Chromium Yardımcı Eklentisi
1. Tarayıcıda `brave://extensions` (veya `chrome://extensions`) adresini aç.
2. Sağ üstten **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** diyerek bu repodaki [`extension/`](./extension) klasörünü seç.

### 3. iPhone & iPad Uygulaması (Safari PWA)
- **Ev Wi-Fi:** Hayye Market -> Ayarlar içindeki Ev Wi-Fi adresini (`http://<PC-IP>:47821/app`) Safari'de aç -> **Paylaş -> Ana Ekrana Ekle**.
- **Ev Dışı Sabit Erişim (Cloudflare Tunnel):** Ayarlar -> Cloudflare bölümüne Zero Trust Tunnel Token'ını (veya [`cloudflare-worker/worker.js`](./cloudflare-worker/worker.js) adres + anahtarını) bir kez gir. Uygulama her açıldığında tüneli otomatik bağlar ve iPhone'daki adresin hiç değişmez.

---

## Teknoloji Yığını

| Katman | Teknoloji |
| :--- | :--- |
| Masaüstü Çekirdek | Tauri v2 + Rust (`tokio`, `reqwest`, `scraper`, `rusqlite`) |
| Veritabanı | Gömülü SQLite (sıfır harici sunucu, %100 yerel veri) |
| Arayüz | React 19 + TypeScript + Tailwind CSS v4 (StockX × Teenage Engineering estetiği) |
| Tarayıcı Köprüsü | Yerel HTTP Köprüsü (`:47821`) + Manifest V3 Companion Extension |
| Mobil Erişim | Yerleşik iOS Safari PWA + `cloudflared` Sabit Tünel Yöneticisi |

---

## Kaynaktan Derleme

```bash
npm install
npm run tauri build
```
