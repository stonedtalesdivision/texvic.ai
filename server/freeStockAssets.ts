import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { recordVisualUsage } from './database.js';
import { BANNED_STOCK_TAGS } from './motionVideoEngine.js';

const CACHE_DIR = path.join(process.cwd(), 'data', 'media', 'stock-cache');

export interface VisualFetchOptions {
  orientation?: 'portrait' | 'landscape';
  width?: number;
  height?: number;
  preferStock?: boolean;
  customKeywords?: string[];
  fallbackTopic?: string;
  usedUrls?: Set<string>;
  reelId?: string;
}

/**
 * High-speed, 100% free visual asset engine.
 * Combines Pixabay Photo API (free key), Pexels API,
 * and topic-grounded archival fallbacks with cross-reel deduplication.
 */
export async function fetchBestFreeVisual(
  query: string,
  outputPath: string,
  options: VisualFetchOptions = {}
): Promise<{ source: string; path: string }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const isPortrait = options.orientation !== 'landscape';

  // 1. Pixabay Photo API (High-resolution, topic-relevant photography)
  const pixabayKey = process.env.PIXABAY_API_KEY;
  if (pixabayKey) {
    const candidateTerms: string[] = [];
    if (Array.isArray(options.customKeywords)) {
      for (const kw of options.customKeywords) {
        if (kw && kw.trim().length >= 3) candidateTerms.push(kw.trim().toLowerCase());
      }
    }

    // Extract core subject words from query
    const cleanWords = query.replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !/^(this|that|with|from|have|will|your|scene|visual|photo|ultra|high|what|when|where|into|about|documentary)$/i.test(w));

    if (cleanWords.length >= 2) {
      candidateTerms.push(`${cleanWords[0]} ${cleanWords[1]}`);
    }
    if (cleanWords.length >= 1) {
      candidateTerms.push(cleanWords[0]);
    }
    if (options.fallbackTopic) {
      const fbClean = options.fallbackTopic.replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !/^(the|and|for|from|with)$/i.test(w));
      if (fbClean[0]) candidateTerms.push(fbClean[0]);
    }

    const uniqueCandidates = Array.from(new Set(candidateTerms));
    for (const term of uniqueCandidates.slice(0, 4)) {
      try {
        const orientationParam = isPortrait ? 'vertical' : 'horizontal';
        const searchUrl = `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(term)}&image_type=photo&orientation=${orientationParam}&per_page=15&safesearch=true`;
        console.info(`[Free Stock Engine] 📸 Searching Pixabay Photo API for "${term}" (${orientationParam})...`);
        const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;

        const data: any = await resp.json();
        const hits = data?.hits || [];
        if (!hits.length) continue;

        // Exclude previously used photos across recent reels & banned lifestyle stock
        const validHits = hits.filter((h: any) => {
          const tags = String(h?.tags || '').toLowerCase();
          if (BANNED_STOCK_TAGS.test(tags)) return false;
          const imgUrl = h?.largeImageURL || h?.webformatURL || h?.imageURL;
          if (!imgUrl) return false;
          if (options.usedUrls?.has(imgUrl)) return false;
          if (h.id && options.usedUrls?.has(String(h.id))) return false;
          return true;
        });

        if (!validHits.length) continue;
        const pool = validHits;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        const imgUrl = chosen?.largeImageURL || chosen?.webformatURL || chosen?.imageURL;
        if (!imgUrl) continue;

        console.info(`[Free Stock Engine] Downloading Pixabay photo for "${term}": ${imgUrl.slice(0, 60)}...`);
        const imgResp = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
        if (!imgResp.ok) continue;

        const buf = await imgResp.arrayBuffer();
        if (buf.byteLength > 20000) {
          await fs.writeFile(outputPath, Buffer.from(buf));
          if (options.usedUrls) {
            options.usedUrls.add(imgUrl);
            if (chosen.id) options.usedUrls.add(String(chosen.id));
          }
          recordVisualUsage({
            assetType: 'stock_photo',
            source: 'pixabay',
            sourceUrl: imgUrl,
            identifier: chosen.id ? String(chosen.id) : term,
            query: term,
            reelId: options.reelId
          });
          console.info(`[Free Stock Engine] ✅ Pixabay photo locked (${buf.byteLength} bytes) for "${term}".`);
          return { source: 'pixabay-stock-photo', path: outputPath };
        }
      } catch (err: any) {
        console.warn(`[Free Stock Engine] Pixabay photo search for "${term}" error: ${err?.message || err}`);
      }
    }
  }

  // 2. Check Pexels API if API key is provided
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey && options.preferStock) {
    try {
      const searchUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${isPortrait ? 'portrait' : 'landscape'}&per_page=15`;
      const resp = await fetch(searchUrl, {
        headers: { Authorization: pexelsKey },
        signal: AbortSignal.timeout(8000)
      });
      if (resp.ok) {
        const data: any = await resp.json();
        const photos = data?.photos || [];
        if (photos.length > 0) {
          const availablePhotos = photos.filter((p: any) => {
            const photoSlug = String(p?.url || '').toLowerCase();
            if (BANNED_STOCK_TAGS.test(photoSlug)) return false;
            const imgUrl = p?.src?.large2x || p?.src?.large || p?.src?.original;
            if (!imgUrl) return false;
            if (options.usedUrls?.has(imgUrl)) return false;
            if (p.id && options.usedUrls?.has(String(p.id))) return false;
            if (p.url && options.usedUrls?.has(p.url)) return false;
            return true;
          });

          if (availablePhotos.length > 0) {
            const pool = availablePhotos;
            const selected = pool[Math.floor(Math.random() * pool.length)];
            const imgUrl = selected?.src?.large2x || selected?.src?.large || selected?.src?.original;
            if (imgUrl) {
              const imgResp = await fetch(imgUrl, { signal: AbortSignal.timeout(12000) });
              if (imgResp.ok) {
                const buf = await imgResp.arrayBuffer();
                if (buf.byteLength > 15000) {
                  await fs.writeFile(outputPath, Buffer.from(buf));
                  if (options.usedUrls) {
                    options.usedUrls.add(imgUrl);
                    if (selected.id) options.usedUrls.add(String(selected.id));
                    if (selected.url) options.usedUrls.add(selected.url);
                  }
                  recordVisualUsage({
                    assetType: 'stock_photo',
                    source: 'pexels',
                    sourceUrl: imgUrl,
                    identifier: selected.id ? String(selected.id) : query,
                    query,
                    reelId: options.reelId
                  });
                  return { source: 'pexels-stock', path: outputPath };
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Free Stock Engine] Pexels fetch skipped or failed: ${err?.message || err}`);
    }
  }

  return { source: 'procedural-fallback', path: outputPath };
}
