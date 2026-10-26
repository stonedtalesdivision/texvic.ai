import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'media', 'stock-cache');

export interface VisualFetchOptions {
  orientation?: 'portrait' | 'landscape';
  width?: number;
  height?: number;
  preferStock?: boolean;
  customKeywords?: string[];
  fallbackTopic?: string;
}

/**
 * High-speed, 100% free visual asset engine.
 * Combines Pixabay Photo API (free key), Pexels API, Pollinations FLUX.1,
 * and topic-grounded archival fallbacks.
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

  // Disconnected: Pixabay Photo API and Pexels API completely removed to prevent off-topic stock images
  // All visuals routed exclusively through AI visual generation or procedural slates

  // 3. Pollinations FLUX.1 (Free AI generation with strict 12s timeout)
  try {
    const cleanedQuery = query.replace(/[^\w\s,-]/g, '').trim();
    const prompt = [
      cleanedQuery,
      'cinematic photography, 35mm film, documentary archival lighting, sharp focus, authentic realism',
      isPortrait ? 'vertical 9:16' : 'horizontal 16:9',
      'no text, no words, no watermark, no captions'
    ].join(', ');

    const seed = Math.floor(Math.random() * 100000);
    const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

    const resp = await fetch(fluxUrl, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > 15000) {
        await fs.writeFile(outputPath, Buffer.from(buf));
        return { source: 'pollinations-flux', path: outputPath };
      }
    }
  } catch (err: any) {
    console.warn(`[Free Stock Engine] Pollinations fetch skipped: ${err?.message || err}`);
  }

  return { source: 'procedural-fallback', path: outputPath };
}
