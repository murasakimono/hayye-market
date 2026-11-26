export interface CampaignEvent {
  id: string;
  title: string;
  store: string;
  daysLeft: number;
  advice: string;
  badge: string;
}

export function getUpcomingCampaigns(): CampaignEvent[] {
  const now = new Date();
  const y = now.getFullYear();

  const daysUntil = (month1Based: number, day: number): number => {
    let target = new Date(y, month1Based - 1, day);
    if (target.getTime() < now.getTime() - 86_400_000) {
      target = new Date(y + 1, month1Based - 1, day);
    }
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86_400_000));
  };

  // Days until next Friday 22:00 (İncehesap Gaming Gecesi)
  const dayOfWeek = now.getDay(); // 5 = Friday
  const daysToFri = (5 - dayOfWeek + 7) % 7;

  return [
    {
      id: 'incehesap-gg',
      title: 'İncehesap Gaming Gecesi (22:00)',
      store: 'İncehesap',
      daysLeft: daysToFri,
      advice: daysToFri === 0 ? 'Bu akşam 22:00! PC donanım alımını akşama beklet.' : 'Her Cuma 22:00 flaş stoklar açılır.',
      badge: 'PC / Donanım',
    },
    {
      id: 'inditex-winter',
      title: 'Inditex Kış Büyük İndirimi',
      store: 'Zara / Bershka / Pull&Bear',
      daysLeft: daysUntil(12, 18),
      advice: 'İlk dalga %20–30 ile başlar; favorilerini önceden sepete ekle.',
      badge: 'Moda',
    },
    {
      id: 'inditex-summer',
      title: 'Inditex Yaz Büyük İndirimi',
      store: 'Zara / Stradivarius / Massimo',
      daysLeft: daysUntil(6, 18),
      advice: 'Haziran 3. haftası başlar; 2. dalga %40–50 olur.',
      badge: 'Moda',
    },
    {
      id: 'sephora-weekend',
      title: 'Sephora & Gratis %40–50 Hafta Sonu',
      store: 'Sephora / Gratis / Watsons',
      daysLeft: (6 - dayOfWeek + 7) % 7,
      advice: 'Hafta sonu kozmetik kampanyalarını beklemeden tam fiyattan alma.',
      badge: 'Kozmetik',
    },
    {
      id: 'amazon-prime',
      title: 'Amazon Prime Day & Gülümseten Kasım',
      store: 'Amazon TR',
      daysLeft: Math.min(daysUntil(7, 15), daysUntil(11, 1)),
      advice: 'Elektronik ve mutfak aletlerinde yılın en temiz gerçek dipleri.',
      badge: 'Genel',
    },
  ].sort((a, b) => a.daysLeft - b.daysLeft);
}

export function getCargoTrackUrl(company: string, trackingNo: string): string {
  const c = company.toLowerCase();
  const t = encodeURIComponent(trackingNo.trim());
  if (c.includes('yurtiçi') || c.includes('yurtici')) return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${t}`;
  if (c.includes('aras')) return `https://kargotakip.araskargo.com.tr/mainpage.aspx?code=${t}`;
  if (c.includes('mng')) return `https://kargotakip.mngkargo.com.tr/?code=${t}`;
  if (c.includes('hepsijet')) return `https://www.hepsijet.com/gonderi-takibi/${t}`;
  if (c.includes('kolay')) return `https://kolaygelsin.com/gonderi-takip?code=${t}`;
  return `https://www.google.com/search?q=${encodeURIComponent(company + ' kargo takip ' + trackingNo)}`;
}

export const FREE_SHIPPING_THRESHOLDS: Record<string, number> = {
  Zara: 1990,
  Bershka: 1990,
  Stradivarius: 1990,
  Pullandbear: 1990,
  Trendyol: 250,
  Hepsiburada: 250,
  Gratis: 450,
  Watsons: 450,
  Sephora: 1000,
  Boyner: 1500,
  Amazon: 0,
};

export const PERFUME_DUPES: Array<{ match: string; dupe: string; note: string }> = [
  { match: 'sauvage', dupe: 'Armaf Club de Nuit Urban Man / Zara Aromatic Future', note: 'Benzer ambroksan-biber DNA (%65+ daha ucuz)' },
  { match: 'baccarat', dupe: 'Zara Red Temptation / Al Haramain Amber Oud Rouge', note: 'Safran + yanık şeker akoru' },
  { match: 'aventus', dupe: 'Armaf Club de Nuit Intense Man (CDNIM)', note: 'En yüksek puanlı ananas-huş ağacı muadili' },
  { match: 'libre', dupe: 'Zara Golden Decade', note: 'Lavanta-vanilya imzasında %90+ benzerlik' },
  { match: 'lost cherry', dupe: 'Zara Cherry Smoothie / Maison Alhambra Lovely Cherie', note: 'Vişne likörü + badem notası' },
  { match: 'bleu de chanel', dupe: 'Armaf Club de Nuit Iconic', note: 'Narenciye-tütsü ofis klasiği muadili' },
  { match: 'good girl', dupe: 'Zara Deep Garden / Lattafa Qimmah', note: 'Tatlı badem-yasemin akşam parfümü' },
  { match: 'stronger with you', dupe: 'Lattafa Khamrah / Zara Sand Desert', note: 'Sıcak kestane-tarçın-vanilya kış DNA' },
];

export function findPerfumeDupe(title: string): { dupe: string; note: string } | null {
  const lower = title.toLowerCase();
  const hit = PERFUME_DUPES.find((d) => lower.includes(d.match));
  return hit ? { dupe: hit.dupe, note: hit.note } : null;
}
