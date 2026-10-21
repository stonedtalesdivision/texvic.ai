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
 * Distills arbitrary prompts or headlines into crisp 1-2 word search keywords
 * that stock video APIs (Pixabay/Pexels) have high-volume tags for.
 */
export interface MotionVideoOptions {
  targetDuration?: number;
  customKeywords?: string[];
  voiceScript?: string;
  topic?: string;
  sceneIndex?: number;
  usedUrls?: Set<string>;
}

/**
 * Distills scene narration, topic context, and custom keywords into crisp 1-2 word search keywords
 * that stock video APIs (Pixabay/Pexels) have high-volume tags for.
 */
export function extractSearchTerms(
  rawQuery: string,
  customTerms?: string[],
  voiceScript?: string,
  topic?: string,
  sceneIndex = 0
): string[] {
  const terms: string[] = [];

  const speechText = String(voiceScript || '').toLowerCase();
  const topicText = String(topic || '').toLowerCase();
  const rawText = String(rawQuery || '').toLowerCase();
  const combined = `${speechText} ${topicText} ${rawText}`;

  // 1. Prioritize explicit contextual terms from LLM/scene metadata (cleaned of abstract words)
  if (Array.isArray(customTerms)) {
    for (const ct of customTerms) {
      if (ct && ct.trim().length >= 3) {
        const cleanCt = ct.trim().toLowerCase().replace(/[^\w\s-]/g, '');
        if (!/telemetry|forensic|dossier|record|anomaly|investigation|impact|verdict/i.test(cleanCt)) {
          terms.push(cleanCt);
        }
      }
    }
  }

  // 2. Concrete Physical Visual Domain Mappings (derived directly from spoken narration)
  // Aviation, Hijacking & Sky
  if (/airplane|aircraft|flight|aviation|airborne|pilot|cockpit|hijack|hijackers|boeing|airbus|jet|lufthansa/i.test(combined)) {
    if (sceneIndex === 0) terms.push('airplane flying', 'airplane', 'aircraft flight');
    else if (sceneIndex === 1) terms.push('airplane cockpit', 'runway airplane', 'airport');
    else terms.push('radar screen', 'airplane night', 'radar');
  }

  // Desert, Dunes & Wasteland
  if (/desert|dunes|sand|sahara|yemen|arabian|arid|wasteland|rub al khali/i.test(combined)) {
    terms.push('desert dunes', 'desert', 'sand storm', 'desert aerial');
  }

  // Money, Ransom, Cash, Heists & Vaults
  if (/cash|money|ransom|million|duffel|bank|vault|gold|currency|dollar|safe deposit|looting/i.test(combined)) {
    terms.push('money cash', 'counting money', 'bank vault', 'gold bars', 'cash');
  }

  // Ocean, Deep Sea & Marine
  if (/ocean|sea|underwater|deep sea|shipwreck|atlantic|pacific|water|waves|diver|abyss|hydrophone|bloop/i.test(combined)) {
    terms.push('deep ocean', 'underwater', 'ocean waves', 'scuba diver');
  }

  // Submarines & Naval Operations
  if (/submarine|torpedo|submersible|azorian|glomar|k-129|periscope|sonar/i.test(combined)) {
    terms.push('submarine', 'sonar radar', 'deep ocean', 'ship ocean');
  }

  // Underground Cities, Caves & Tunnels
  if (/derinkuyu|tunnel|underground|cavern|cave|subterranean|basement|catacomb|shaft/i.test(combined)) {
    terms.push('underground tunnel', 'dark cave', 'ancient cave', 'cave rock');
  }

  // Nuclear Bunkers & Blast Doors
  if (/bunker|blast door|greenbrier|greek island|cheyenne|norad|fallout|shelter|silo/i.test(combined)) {
    terms.push('underground bunker', 'vault door', 'military tunnel', 'bunker');
  }

  // Radar, Technology, Tracking & Signals
  if (/radar|satellite|antenna|telemetry|signal|tracking|surveillance|cyber|terminal|routing|swift/i.test(combined)) {
    terms.push('radar screen', 'satellite space', 'antenna', 'radar');
  }

  // Ancient Ruins, Pyramids, Archaeology & Architecture
  if (/ancient|pyramid|temple|ruins|archaeology|roman|concrete|monument|tomb|pharaoh|hittite/i.test(combined)) {
    terms.push('ancient ruins', 'pyramid', 'ancient temple', 'roman ruins');
  }

  // Arctic, Ice, Permafrost & Seed Vault
  if (/arctic|snow|permafrost|ice|svalbard|mountain|glacier|longyearbyen|polar|doomsday/i.test(combined)) {
    terms.push('arctic mountain', 'snow mountain', 'glacier ice', 'snow');
  }

  // Drilling, Boreholes & Earth Crust
  if (/borehole|kola|drilling|mantle|drill rig|subterranean depth|deep hole/i.test(combined)) {
    terms.push('drilling rig', 'drilling', 'mine tunnel', 'industrial machine');
  }

  // Volcanoes, Lava & Eruptions
  if (/volcano|eruption|lava|magma|smoke mountain|crater/i.test(combined)) {
    terms.push('volcano', 'lava flow', 'smoke mountain');
  }

  // Ships, Ports & Maritime Chokepoints
  if (/canal|ship|cargo|vessel|panama|harbor|port|container|strait|malacca|suez/i.test(combined)) {
    terms.push('cargo ship', 'ocean port', 'ship container', 'shipping vessel');
  }

  // Undersea Cables & Internet Infrastructure
  if (/cable|fiber optic|internet cable|undersea cable|tat-14|chokepoint/i.test(combined)) {
    terms.push('deep ocean', 'network fiber', 'cable underwater', 'server room');
  }

  // Cold War, Spies, Declassified & Mystery
  if (/cold war|cia|kgb|classified|covert|espionage|agents|surveillance|investigation/i.test(combined)) {
    terms.push('dark moody', 'military bunker', 'fog atmospheric', 'radar screen');
  }

  // Ekranoplan & Ground Effect
  if (/ekranoplan|caspian/i.test(combined)) {
    terms.push('seaplane', 'military aircraft', 'ocean water');
  }

  // 3. Concrete Physical Noun Extraction from Voice Script
  const stopWords = new Set([
    'the', 'this', 'that', 'with', 'from', 'have', 'will', 'your', 'about', 'what', 'when',
    'where', 'into', 'over', 'under', 'between', 'during', 'official', 'record', 'records',
    'archive', 'investigation', 'primary', 'timeline', 'incident', 'story', 'secret',
    'revealed', 'documented', 'evidence', 'untold', 'aftermath', 'consequence', 'verifiable',
    'whose', 'stand', 'stands', 'close', 'closer', 'came', 'ending', 'decades', 'mechanism',
    'modern', 'today', 'scientists', 'engineers', 'findings', 'undeniable', 'behind',
    'according', 'confirmed', 'situation', 'rapidly', 'escalating', 'choice', 'altered',
    'course', 'profound', 'would', 'done', 'position', 'standard', 'textbooks', 'examined',
    'physical', 'copying', 'exact', 'breakthrough', 'know', 'imagine', 'blow', 'mind',
    'nobody', 'talking', 'comment', 'share', 'follow', 'below'
  ]);

  const cleanSpeechWords = speechText.replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopWords.has(w));

  if (cleanSpeechWords.length >= 2) {
    terms.push(`${cleanSpeechWords[0]} ${cleanSpeechWords[1]}`);
  }
  if (cleanSpeechWords.length >= 1) {
    terms.push(cleanSpeechWords[0]);
  }

  // 4. Cinematic High-Engagement Atmospheric Fallbacks
  terms.push('aerial landscape', 'cinematic dark', 'drone cinematography', 'storm clouds');

  return Array.from(new Set(terms.filter(Boolean)));
}

/**
 * Searches and downloads an authentic video from Pixabay API.
 * Pixabay issues free API keys instantly with zero wait times.
 */
async function fetchPixabayVideo(
  query: string,
  cachePath: string,
  options?: MotionVideoOptions
): Promise<string | null> {
  const pixabayKey = process.env.PIXABAY_API_KEY;
  if (!pixabayKey) return null;

  const candidateQueries = extractSearchTerms(
    query,
    options?.customKeywords,
    options?.voiceScript,
    options?.topic,
    options?.sceneIndex
  );

  for (const q of candidateQueries.slice(0, 6)) {
    try {
      const searchUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(q)}&video_type=all&per_page=10`;
      console.info(`[Motion Video Engine] Querying Pixabay Video API for "${q}"...`);
      const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;

      const data: any = await resp.json();
      const hits: any[] = data?.hits || [];
      if (!hits.length) continue;

      // Filter out green-screen, chroma key, or 3D animations
      const validHits = hits.filter(h => {
        const tags = String(h?.tags || '').toLowerCase();
        if (/green screen|chroma key|3d model|animation render/i.test(tags)) return false;
        // Avoid reusing the exact same video across scenes in the same reel
        const vidUrl = h?.videos?.large?.url || h?.videos?.medium?.url || h?.videos?.small?.url;
        if (vidUrl && options?.usedUrls?.has(vidUrl)) return false;
        return true;
      });

      const pool = validHits.length > 0 ? validHits : hits;
      const chosen = pool[Math.floor(Math.random() * Math.min(pool.length, 4))];
      const videoUrl = chosen?.videos?.large?.url || chosen?.videos?.medium?.url || chosen?.videos?.small?.url;
      if (!videoUrl) continue;

      console.info(`[Motion Video Engine] Downloading Pixabay video clip (${chosen.duration || 0}s, tags: "${chosen.tags}"): ${videoUrl.slice(0, 60)}...`);
      const vidResp = await fetch(videoUrl, { signal: AbortSignal.timeout(25000) });
      if (!vidResp.ok) continue;

      const arrayBuf = await vidResp.arrayBuffer();
      if (arrayBuf.byteLength < 50000) continue;

      await fs.writeFile(cachePath, Buffer.from(arrayBuf));
      if (options?.usedUrls && videoUrl) options.usedUrls.add(videoUrl);
      console.info(`[Motion Video Engine] Downloaded Pixabay video (${arrayBuf.byteLength} bytes) for "${q}" -> ${path.basename(cachePath)}`);
      return cachePath;
    } catch (err: any) {
      console.warn(`[Motion Video Engine] Pixabay fetch for "${q}" failed: ${err?.message || err}`);
    }
  }
  return null;
}

/**
 * Searches and downloads an authentic vertical 1080x1920 video from Pexels API.
 * Free tier provides 20,000 video requests/month with zero watermarks.
 */
async function fetchPexelsVideo(
  query: string,
  cachePath: string,
  options?: MotionVideoOptions
): Promise<string | null> {
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) return null;

  const candidateQueries = extractSearchTerms(
    query,
    options?.customKeywords,
    options?.voiceScript,
    options?.topic,
    options?.sceneIndex
  );

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

      // Filter out previously used video files
      const availableVideos = options?.usedUrls
        ? videos.filter((v: any) => !options.usedUrls?.has(v.url))
        : videos;
      const pool = availableVideos.length > 0 ? availableVideos : videos;

      const chosenVideo = pool[Math.floor(Math.random() * Math.min(pool.length, 4))];
      const files: any[] = chosenVideo?.video_files || [];

      // Filter for valid MP4s and sort by proximity to 1080x1920
      const mp4Files = files.filter(f => f?.file_type === 'video/mp4' && f?.link);
      if (!mp4Files.length) continue;

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
      if (options?.usedUrls && chosenVideo.url) options.usedUrls.add(chosenVideo.url);
      console.info(`[Motion Video Engine] Downloaded Pexels video (${arrayBuf.byteLength} bytes) for "${q}" -> ${path.basename(cachePath)}`);
      return cachePath;
    } catch (err: any) {
      console.warn(`[Motion Video Engine] Pexels fetch for "${q}" failed: ${err?.message || err}`);
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
  options: MotionVideoOptions = {}
): Promise<MotionVideoResult> {
  await fs.mkdir(STOCK_VIDEOS_DIR, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const cleanedQuery = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const queryHash = hashKey(cleanedQuery + (options.customKeywords ? options.customKeywords.join('-') : '') + (options.voiceScript ? options.voiceScript.slice(0, 30) : ''));
  const cachedVideoPath = path.join(STOCK_VIDEOS_DIR, `cache-${queryHash}.mp4`);

  // 1. Check local query cache first
  if (fsSync.existsSync(cachedVideoPath)) {
    const stats = await fs.stat(cachedVideoPath);
    if (stats.size > 50000) {
      await fs.copyFile(cachedVideoPath, outputPath);
      return { source: 'vault', videoPath: outputPath };
    }
  }

  // 2. Query Pexels Video Search API with custom contextual keywords and voice script
  const pexelsResult = await fetchPexelsVideo(cleanedQuery, cachedVideoPath, options);
  if (pexelsResult && fsSync.existsSync(pexelsResult)) {
    await fs.copyFile(pexelsResult, outputPath);
    return { source: 'pexels', videoPath: outputPath };
  }

  // 3. Query Pixabay Video Search API with custom keywords and voice script
  const pixabayResult = await fetchPixabayVideo(cleanedQuery, cachedVideoPath, options);
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

