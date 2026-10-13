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
export async function fetchWikimediaArchivalImage(query: string): Promise<ArchivalAssetResult> {
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

  try {
    // Add filetype:bitmap to prioritize photographs, drawings, and documents over SVGs or audio
    const cleanQuery = query.replace(/[^\w\s-]/g, ' ').trim();
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&format=json`;

    console.info(`[Archival Engine] 🏛️ Searching Wikimedia Commons for historical records: "${cleanQuery}"...`);

    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'TheUntoldArchive/1.0 (contact@theuntoldarch.com; documentary education project)'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!resp.ok) {
      console.warn(`[Archival Engine] Wikimedia API returned status ${resp.status}`);
      return { source: null, filePath: null };
    }

    const data: any = await resp.json();
    const pages = Object.values(data?.query?.pages || {}) as any[];

    if (!pages.length) {
      console.info(`[Archival Engine] No Wikimedia archival media found for "${cleanQuery}"`);
      return { source: null, filePath: null };
    }

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
        if (img.width < 500 && img.height < 500) return false;
        if (/flag|icon|symbol|logo|insignia|emblem/i.test(img.title)) return false;
        return true;
      });

    if (!validImages.length) {
      return { source: null, filePath: null };
    }

    // Pick the best high-resolution archival image
    const chosen = validImages[0];
    console.info(`[Archival Engine] 📜 Downloading authentic archival record: "${chosen.title}" (${chosen.width}x${chosen.height})...`);

    const imgResp = await fetch(chosen.url, {
      headers: {
        'User-Agent': 'TheUntoldArchive/1.0 (contact@theuntoldarch.com)'
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!imgResp.ok) return { source: null, filePath: null };

    const arrayBuf = await imgResp.arrayBuffer();
    if (arrayBuf.byteLength < 25000) return { source: null, filePath: null };

    await fs.writeFile(cachePattern, Buffer.from(arrayBuf));
    console.info(`[Archival Engine] ✅ Saved authentic archival document (${arrayBuf.byteLength} bytes) -> ${path.basename(cachePattern)}`);

    return {
      source: 'wikimedia-commons',
      filePath: cachePattern,
      title: chosen.title,
      mimeType: chosen.mime
    };
  } catch (err: any) {
    console.warn(`[Archival Engine] Wikimedia search failed: ${err?.message || err}`);
    return { source: null, filePath: null };
  }
}
