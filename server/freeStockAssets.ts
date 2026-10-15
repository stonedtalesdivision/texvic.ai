import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'media', 'stock-cache');

export interface VisualFetchOptions {
  orientation?: 'portrait' | 'landscape';
  width?: number;
  height?: number;
  preferStock?: boolean;
}

/**
 * High-speed, 100% free visual asset engine.
 * Combines Pexels API (free 20,000 req/mo) with Pollinations FLUX.1 (free unlimited AI art)
 * and curated royalty-free CDN fallbacks.
 */
export async function fetchBestFreeVisual(
  query: string,
  outputPath: string,
  options: VisualFetchOptions = {}
): Promise<{ source: string; path: string }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const isPortrait = options.orientation !== 'landscape';
  const width = options.width || (isPortrait ? 1080 : 1920);
  const height = options.height || (isPortrait ? 1920 : 1080);

  // 1. Check Pexels API if API key is provided
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey && options.preferStock) {
    try {
      const searchUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${isPortrait ? 'portrait' : 'landscape'}&per_page=5`;
      const resp = await fetch(searchUrl, {
        headers: { Authorization: pexelsKey },
        signal: AbortSignal.timeout(8000)
      });
      if (resp.ok) {
        const data = await resp.json();
        const photos = data?.photos || [];
        if (photos.length > 0) {
          const selected = photos[Math.floor(Math.random() * photos.length)];
          const imgUrl = selected?.src?.large2x || selected?.src?.large || selected?.src?.original;
          if (imgUrl) {
            const imgResp = await fetch(imgUrl, { signal: AbortSignal.timeout(12000) });
            if (imgResp.ok) {
              const buf = await imgResp.arrayBuffer();
              if (buf.byteLength > 15000) {
                await fs.writeFile(outputPath, Buffer.from(buf));
                return { source: 'pexels-stock', path: outputPath };
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Free Stock Engine] Pexels fetch skipped or failed: ${err?.message || err}`);
    }
  }

  // 2. Pollinations FLUX.1 (100% Free, unlimited, zero API key required)
  try {
    const cleanedQuery = query.replace(/[^\w\s,-]/g, '').trim();
    const prompt = [
      cleanedQuery,
      'cinematic photography, 8k resolution, dramatic lighting, sharp focus, hyper-detailed',
      isPortrait ? 'vertical 9:16' : 'horizontal 16:9',
      'no text, no words, no watermark, no captions'
    ].join(', ');

    const seed = Math.floor(Math.random() * 100000);
    const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await fetch(fluxUrl, {
          signal: AbortSignal.timeout(22000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          if (buf.byteLength > 10000) {
            await fs.writeFile(outputPath, Buffer.from(buf));
            return { source: 'pollinations-flux', path: outputPath };
          }
        }
      } catch (retryErr: any) {
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Free Stock Engine] Pollinations fetch skipped: ${err?.message || err}`);
  }

  // 3. Fallback: Curated Royalty-Free Documentary & Archival CDN imagery
  const curatedFallbackUrls = [
    'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1080&h=1920&q=80', // Ancient library & manuscripts
    'https://images.unsplash.com/photo-1507842229451-7f01be7ff612?auto=format&fit=crop&w=1080&h=1920&q=80', // Archival dark hall
    'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1080&h=1920&q=80', // Classified shelf & books
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1080&h=1920&q=80', // Dramatic historical architecture
  ];
  const chosenUrl = curatedFallbackUrls[Math.floor(Math.random() * curatedFallbackUrls.length)];
  try {
    const resp = await fetch(chosenUrl, { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > 10000) {
        await fs.writeFile(outputPath, Buffer.from(buf));
        return { source: 'unsplash-cdn', path: outputPath };
      }
    }
  } catch {}

  return { source: 'procedural-fallback', path: outputPath };
}
