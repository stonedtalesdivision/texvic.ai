import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ARCHIVAL_CACHE_DIR = path.join(process.cwd(), 'data', 'media', 'archival-cache');

export interface ArchivalAssetResult {
  source: 'wikimedia-commons' | 'historical-archive' | null;
  filePath: string | null;
  title?: string;
  mimeType?: string;
}

function hashKey(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 16);
}

/**
 * Searches Wikimedia Commons for authentic, public-domain historical photographs,
 * vintage newspaper clippings, declassified documents, and satellite images.
 */
export async function fetchWikimediaArchivalImage(query: string, fallbackTerms?: string[]): Promise<ArchivalAssetResult> {
  if (!query || query.trim().length < 3) {
    return { source: null, filePath: null };
  }

  await fs.mkdir(ARCHIVAL_CACHE_DIR, { recursive: true });
  const cacheKey = hashKey(query.toLowerCase());
  const cachePattern = path.join(ARCHIVAL_CACHE_DIR, `wiki-${cacheKey}.jpg`);

  if (fsSync.existsSync(cachePattern)) {
    try {
      const stat = await fs.stat(cachePattern);
      if (stat.size > 20000) {
        return {
          source: 'wikimedia-commons',
          filePath: cachePattern,
          title: query
        };
      }
    } catch {}
  }

  // Build candidate queries in priority order
  const candidates: string[] = [];
  const cleanInitial = query.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanInitial) candidates.push(cleanInitial);

  // If query had subtitles or colons, extract the primary subject
  const coreSubject = query.split(/[:\-\—\(]/)[0].replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (coreSubject && coreSubject.length >= 4 && coreSubject !== cleanInitial) {
    candidates.push(coreSubject);
  }

  if (Array.isArray(fallbackTerms)) {
    for (const term of fallbackTerms) {
      const cleanTerm = term.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanTerm && cleanTerm.length >= 3) {
        candidates.push(cleanTerm);
      }
    }
  }

  const uniqueCandidates = Array.from(new Set(candidates));

  for (const targetQuery of uniqueCandidates.slice(0, 4)) {
    try {
      // Add filetype:bitmap to prioritize photographs, drawings, and documents over SVGs or audio
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(targetQuery + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&format=json`;

      console.info(`[Archival Engine] 🏛️ Searching Wikimedia Commons for historical records: "${targetQuery}"...`);

      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'TheUntoldArchive/1.0 (contact@theuntoldarch.com; documentary education project)'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!resp.ok) {
        console.warn(`[Archival Engine] Wikimedia API returned status ${resp.status} for "${targetQuery}"`);
        continue;
      }

      const data: any = await resp.json();
      const pages = Object.values(data?.query?.pages || {}) as any[];

      if (!pages.length) continue;

      // Filter for valid images (jpeg, png, webp), prefer high-res photos
      const validImages = pages
        .map(p => {
          const info = p?.imageinfo?.[0];
          return {
            title: String(p?.title || ''),
            url: String(info?.url || ''),
            width: Number(info?.width || 0),
            height: Number(info?.height || 0),
            size: Number(info?.size || 0),
            mime: String(info?.mime || '')
          };
        })
        .filter(img => {
          if (!img.url) return false;
          if (!img.mime.startsWith('image/')) return false;
          // Skip tiny icons, flags, or logos
          if (img.width < 400 && img.height < 400) return false;
          if (/flag|icon|symbol|logo|insignia|emblem|coat_of_arms/i.test(img.title)) return false;
          return true;
        });

      if (!validImages.length) continue;

      // Extract search keywords from targetQuery, filtering out generic search terms
      const queryWords = targetQuery
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !/^(file|photo|image|bitmap|the|and|for|from|with|documented|archival|anomaly|declassified|index)$/i.test(w));

      // Filter and score images by title relevance to target query
      const scoredImages = validImages
        .map(img => {
          const lowerTitle = img.title.toLowerCase();
          let matchScore = 0;
          for (const qw of queryWords) {
            if (lowerTitle.includes(qw)) {
              matchScore += (qw.length >= 5 ? 3 : 1);
            }
          }
          // Reject completely unrelated domain topics (e.g. tennis players, football, fashion, weddings)
          if (/tennis|football|soccer|baseball|wrestling|wedding|celebrity|model|actor|actress|pop_singer/i.test(lowerTitle) && !/tennis|sport/i.test(targetQuery)) {
            matchScore = -10;
          }
          return { img, matchScore };
        })
        .filter(item => item.matchScore > 0);

      if (!scoredImages.length) {
        console.info(`[Archival Engine] No image title matched query terms [${queryWords.join(', ')}] on Wikimedia Commons.`);
        continue;
      }

      scoredImages.sort((a, b) => b.matchScore - a.matchScore);
      const chosen = scoredImages[0].img;
      console.info(`[Archival Engine] 📜 Downloading authentic archival record: "${chosen.title}" (${chosen.width}x${chosen.height}, relevance score ${scoredImages[0].matchScore})...`);

      const imgResp = await fetch(chosen.url, {
        headers: {
          'User-Agent': 'TheUntoldArchive/1.0 (contact@theuntoldarch.com)'
        },
        signal: AbortSignal.timeout(18000)
      });

      if (!imgResp.ok) continue;

      const arrayBuf = await imgResp.arrayBuffer();
      if (arrayBuf.byteLength < 25000) continue;

      await fs.writeFile(cachePattern, Buffer.from(arrayBuf));
      console.info(`[Archival Engine] ✅ Saved authentic archival document (${arrayBuf.byteLength} bytes) -> ${path.basename(cachePattern)}`);

      return {
        source: 'wikimedia-commons',
        filePath: cachePattern,
        title: chosen.title,
        mimeType: chosen.mime
      };
    } catch (err: any) {
      console.warn(`[Archival Engine] Wikimedia query for "${targetQuery}" failed: ${err?.message || err}`);
    }
  }

  return { source: null, filePath: null };
}
