import 'dotenv/config';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const STOCK_VIDEOS_DIR = path.join(process.cwd(), 'data', 'media', 'stock-videos');

export interface MotionVideoResult {
  source: 'pexels' | 'pixabay' | 'vault' | 'fallback';
  videoPath: string;
  durationSeconds?: number;
}

function hashKey(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 16);
}

/**
 * Searches and downloads an authentic vertical 1080x1920 video from Pexels API.
 * Free tier provides 20,000 video requests/month with zero watermarks.
 */
async function fetchPexelsVideo(query: string, cachePath: string, customTerms?: string[]): Promise<string | null> {
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) return null;

  const candidateQueries = extractSearchTerms(query, customTerms);

  for (const q of candidateQueries.slice(0, 4)) {
    try {
      const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=6`;
      console.info(`[Motion Video Engine] Querying Pexels Video API for "${q}"...`);
      
      const resp = await fetch(searchUrl, {
        headers: { Authorization: pexelsKey },
        signal: AbortSignal.timeout(10000)
      });

      if (!resp.ok) continue;

      const data: any = await resp.json();
      const videos = data?.videos || [];
      if (!videos.length) continue;

      // Pick a video from top results
      const chosenVideo = videos[Math.floor(Math.random() * Math.min(videos.length, 4))];
      const files: any[] = chosenVideo?.video_files || [];

      // Filter for valid MP4s and sort by proximity to 1080x1920
      const mp4Files = files.filter(f => f?.file_type === 'video/mp4' && f?.link);
      if (!mp4Files.length) continue;

      // Prefer exact 1080x1920 portrait or HD quality
      const bestFile = mp4Files.find(f => f.width === 1080 && f.height === 1920) ||
                       mp4Files.find(f => f.quality === 'hd') ||
                       mp4Files.find(f => (f.height || 0) > (f.width || 0)) ||
                       mp4Files[0];

      if (!bestFile?.link) continue;

      console.info(`[Motion Video Engine] Downloading Pexels video (${bestFile.width}x${bestFile.height}): ${bestFile.link.slice(0, 50)}...`);
      const vidResp = await fetch(bestFile.link, { signal: AbortSignal.timeout(25000) });
      if (!vidResp.ok) continue;

      const arrayBuf = await vidResp.arrayBuffer();
      if (arrayBuf.byteLength < 50000) continue;

      await fs.writeFile(cachePath, Buffer.from(arrayBuf));
      console.info(`[Motion Video Engine] Downloaded Pexels video (${arrayBuf.byteLength} bytes) for "${q}" -> ${path.basename(cachePath)}`);
      return cachePath;
    } catch (err: any) {
      console.warn(`[Motion Video Engine] Pexels fetch for "${q}" failed: ${err?.message || err}`);
    }
  }
  return null;
}

/**
 * Distills arbitrary prompts or headlines into crisp 1-2 word search keywords
 * that stock video APIs (Pixabay/Pexels) have high-volume tags for.
 */
export function extractSearchTerms(rawQuery: string, customTerms?: string[]): string[] {
  const terms: string[] = [];

  // Prioritize explicit contextual terms from the LLM first
  if (Array.isArray(customTerms)) {
    for (const ct of customTerms) {
      if (ct && ct.trim().length >= 3) {
        terms.push(ct.trim().toLowerCase());
      }
    }
  }

  const text = rawQuery.toLowerCase();

  // Domain-specific keyword matching for Scary, Spooky & Horror themes
  if (/scary|horror|spooky|creepy|ghost|haunted|monster|dark forest|cemetery|graveyard|shadow|demon|curse|paranormal/i.test(text)) {
    terms.push('dark forest', 'foggy forest', 'abandoned dark', 'spooky shadows', 'cemetery');
  }
  if (/abandoned|asylum|hospital|ruins|decay|empty building/i.test(text)) {
    terms.push('abandoned building', 'dark hallway', 'ruins decay');
  }
  if (/unsolved|disappeared|missing|incident|cold case|anomaly/i.test(text)) {
    terms.push('fog atmospheric', 'dark moody', 'investigation', 'rain dark');
  }

  // Domain-specific keyword matching for Untold World Mysteries & Events
  if (/canal|ship|cargo|vessel|panama|harbor|port|container/i.test(text)) terms.push('cargo ship', 'ocean port');
  if (/history|ancient|temple|ruins|pyramid|archaeology|artifact|roman/i.test(text)) terms.push('ancient ruins', 'history');
  if (/heist|bank|vault|gold|money|trader|wall street|cash|dollar|wire/i.test(text)) terms.push('bank vault', 'gold bars', 'counting money');
  if (/ocean|sea|underwater|abyss|deep sea|borehole|kola|tibet|diver|shipwreck/i.test(text)) terms.push('deep ocean', 'underwater', 'aerial landscape');
  if (/island|bunker|secret|military|satellite|space|radar|sentinel|isolated/i.test(text)) terms.push('satellite space', 'aerial island', 'mountains');
  if (/mystery|forbidden|conspiracy|investigation|dossier|classified|cia|fbi/i.test(text)) terms.push('investigation', 'dark moody', 'fog atmospheric');
  if (/tunnel|underground|cavern|subterranean|cave|derinkuyu/i.test(text)) terms.push('underground tunnel', 'dark cave');
  if (/drought|desert|cracked|climate|disaster|volcano/i.test(text)) terms.push('cracked desert', 'aerial landscape');
  if (/code|cable|fiber optic|internet cable|undersea cable/i.test(text)) terms.push('deep ocean', 'network fiber');

  // Strip noise and extract 2 top descriptive words
  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'have', 'scene', 'visual', 'video', 'ultra', 'high',
    'save', 'hours', 'hour', 'stop', 'manual', 'turn', 'need', 'drop', 'want', 'test',
    'best', 'week', 'make', 'take', 'time', 'fast', 'just', 'more', 'here', 'will', 'your',
    'doing', 'right', 'into', 'what', 'like'
  ]);

  const clean = text.replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopWords.has(w));

  if (clean.length >= 2) {
    terms.push(`${clean[0]} ${clean[1]}`);
  } else if (clean.length === 1) {
    terms.push(clean[0]);
  }

  // High-retention cinematic documentary fallbacks (NEVER computer screens for world events!)
  terms.push('aerial landscape', 'dark moody', 'drone cinematography');
  return Array.from(new Set(terms));
}

/**
 * Searches and downloads an authentic video from Pixabay API.
 * Pixabay issues free API keys instantly with zero wait times.
 */
async function fetchPixabayVideo(query: string, cachePath: string, customTerms?: string[]): Promise<string | null> {
  const pixabayKey = process.env.PIXABAY_API_KEY;
  if (!pixabayKey) return null;

  const candidateQueries = extractSearchTerms(query, customTerms);

  for (const q of candidateQueries.slice(0, 3)) {
    try {
      const searchUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(q)}&video_type=all&per_page=6`;
      console.info(`[Motion Video Engine] Querying Pixabay Video API for "${q}"...`);
      const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;

      const data: any = await resp.json();
      const hits = data?.hits || [];
      if (!hits.length) continue;

      const chosen = hits[Math.floor(Math.random() * Math.min(hits.length, 4))];
      // Prefer high resolution video files (large or medium)
      const videoUrl = chosen?.videos?.large?.url || chosen?.videos?.medium?.url || chosen?.videos?.small?.url;
      if (!videoUrl) continue;

      console.info(`[Motion Video Engine] Downloading Pixabay video clip: ${videoUrl.slice(0, 60)}...`);
      const vidResp = await fetch(videoUrl, { signal: AbortSignal.timeout(25000) });
      if (!vidResp.ok) continue;

      const arrayBuf = await vidResp.arrayBuffer();
      if (arrayBuf.byteLength < 50000) continue;

      await fs.writeFile(cachePath, Buffer.from(arrayBuf));
      console.info(`[Motion Video Engine] Downloaded Pixabay video (${arrayBuf.byteLength} bytes) -> ${path.basename(cachePath)}`);
      return cachePath;
    } catch (err: any) {
      console.warn(`[Motion Video Engine] Pixabay fetch for "${q}" failed: ${err?.message || err}`);
    }
  }
  return null;
}

/**
 * Scans the local stock video vault for existing video clips matching the category/topic.
 */
async function findLocalVaultVideo(keywords: string[]): Promise<string | null> {
  try {
    if (!fsSync.existsSync(STOCK_VIDEOS_DIR)) return null;
    const files = await fs.readdir(STOCK_VIDEOS_DIR);
    const mp4s = files.filter(f => f.toLowerCase().endsWith('.mp4'));
    if (!mp4s.length) return null;

    // Rank local files by keyword overlap
    const lowerKw = keywords.map(k => k.toLowerCase());
    const scored = mp4s.map(file => {
      const lowerFile = file.toLowerCase();
      let score = 0;
      for (const kw of lowerKw) {
        if (lowerFile.includes(kw)) score += 2;
      }
      return { file, score };
    });

    const hasMatch = scored.some(s => s.score > 0);
    if (hasMatch) {
      scored.sort((a, b) => b.score - a.score);
      const chosen = scored[0].file;
      return path.join(STOCK_VIDEOS_DIR, chosen);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * High-speed Motion Video Engine.
 * Resolves authentic moving vertical video footage matching the reel scene's subject.
 * 
 * Order of resolution:
 * 1. Checks local cache for previously fetched video for this query.
 * 2. Queries Pexels Video API (if PEXELS_API_KEY is configured).
 * 3. Queries Pixabay Video API (if PIXABAY_API_KEY is configured).
 * 4. Checks local stock video vault in data/media/stock-videos/.
 * 5. Falls back to graceful indicator if no network video available.
 */
export async function fetchBestMotionVideo(
  query: string,
  outputPath: string,
  options: { targetDuration?: number; customKeywords?: string[] } = {}
): Promise<MotionVideoResult> {
  await fs.mkdir(STOCK_VIDEOS_DIR, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const cleanedQuery = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const queryHash = hashKey(cleanedQuery + (options.customKeywords ? options.customKeywords.join('-') : ''));
  const cachedVideoPath = path.join(STOCK_VIDEOS_DIR, `cache-${queryHash}.mp4`);

  // 1. Check local query cache first
  if (fsSync.existsSync(cachedVideoPath)) {
    const stats = await fs.stat(cachedVideoPath);
    if (stats.size > 50000) {
      await fs.copyFile(cachedVideoPath, outputPath);
      return { source: 'vault', videoPath: outputPath };
    }
  }

  // 2. Query Pexels Video Search API with custom contextual keywords
  const pexelsResult = await fetchPexelsVideo(cleanedQuery, cachedVideoPath, options.customKeywords);
  if (pexelsResult && fsSync.existsSync(pexelsResult)) {
    await fs.copyFile(pexelsResult, outputPath);
    return { source: 'pexels', videoPath: outputPath };
  }

  // 3. Query Pixabay Video Search API with custom keywords
  const pixabayResult = await fetchPixabayVideo(cleanedQuery, cachedVideoPath, options.customKeywords);
  if (pixabayResult && fsSync.existsSync(pixabayResult)) {
    await fs.copyFile(pixabayResult, outputPath);
    return { source: 'pixabay', videoPath: outputPath };
  }

  // 4. Query local vault for category matches
  const keywords = cleanedQuery.split(/\s+/).filter(w => w.length >= 3);
  const vaultMatch = await findLocalVaultVideo(keywords);
  if (vaultMatch && fsSync.existsSync(vaultMatch)) {
    await fs.copyFile(vaultMatch, outputPath);
    return { source: 'vault', videoPath: outputPath };
  }

  return { source: 'fallback', videoPath: outputPath };
}
