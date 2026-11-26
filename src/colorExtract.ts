// Apple Music style Adaptive Product Ambient Color Extractor
const colorCache = new Map<string, string>();

function fallbackGlow(seed: string): string {
  const palette = [
    'rgba(16, 185, 129, 0.28)',
    'rgba(59, 130, 246, 0.28)',
    'rgba(244, 63, 94, 0.26)',
    'rgba(245, 158, 11, 0.26)',
    'rgba(139, 92, 246, 0.26)',
    'rgba(20, 184, 166, 0.28)',
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function extractAmbientColor(imageUrl: string, seedTitle: string): Promise<string> {
  if (!imageUrl) return Promise.resolve(fallbackGlow(seedTitle));
  const cached = colorCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const br = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (br > 30 && br < 225) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }
        if (count > 0) {
          const rgba = `rgba(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)}, 0.32)`;
          colorCache.set(imageUrl, rgba);
          resolve(rgba);
          return;
        }
      } catch {
        // CORS tainted canvas fallback
      }
      const fb = fallbackGlow(seedTitle);
      colorCache.set(imageUrl, fb);
      resolve(fb);
    };
    img.onerror = () => {
      const fb = fallbackGlow(seedTitle);
      colorCache.set(imageUrl, fb);
      resolve(fb);
    };
    img.src = imageUrl;
  });
}
