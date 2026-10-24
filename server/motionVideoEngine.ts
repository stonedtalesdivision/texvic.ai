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
// Strictly banned abstract or textbook words that break stock video search
const BANNED_ABSTRACT_TERMS = new Set([
  'isotopic', 'spectral', 'anomaly', 'discrepancy', 'endures', 'aerospace',
  'physics', 'hypothesis', 'boundaries', 'experimentation', 'signature',
  'ratio', 'ratios', 'enduring', 'reconsider', 'telemetry', 'verdict',
  'implications', 'theoretical', 'paradigm', 'academic', 'perspective'
]);

// Curated dark documentary atmospheric fallback queries for The Untold Archive
export const DARK_ARCHIVE_FALLBACK_QUERIES = [
  'ancient book candlelight',
  'dark museum archive',
  'microscope lab dark',
  'old map compass',
  'dusty library candlelight',
  'ancient manuscripts dark'
];

/**
 * Distills scene narration, topic context, and custom keywords into crisp 1-2 word search keywords
 * that stock video APIs (Pixabay/Pexels) have high-volume tags for.
 * Strictly eliminates abstract academic terms and maps directly to physical objects/actions.
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
        const cleanCt = ct.trim().toLowerCase().replace(/[^\w\s-]/g, ' ');
        const words = cleanCt.split(/\s+/).filter(w => !BANNED_ABSTRACT_TERMS.has(w));
        const filteredTerm = words.join(' ').trim();
        if (filteredTerm.length >= 3) {
          terms.push(filteredTerm);
        }
      }
    }
  }

  // 2. Concrete Physical Visual Domain Mappings (derived directly from spoken narration)
  // Manuscripts, Ciphers, Ancient Inscriptions & Rare Books (e.g. Voynich)
  if (/voynich|manuscript|cipher|parchment|folio|vellum|undeciphered|cryptanalyst|ancient text|script/i.test(combined)) {
    if (sceneIndex === 0) terms.push('ancient book candlelight', 'old parchment book', 'ancient manuscript');
    else if (sceneIndex === 1) terms.push('magnifying glass paper', 'quill pen ink', 'old library archive');
    else if (sceneIndex === 2) terms.push('microscope lab dark', 'laser light dark', 'laboratory analysis');
    else terms.push('dusty books dark', 'old book pages', 'candlelight manuscript');
  }

  // Forensic Science, Laboratory Tests & Chemical Investigation
  if (/forensic|chemical|laboratory|test|microscope|analysis|carbon|dating|fiber|ultraviolet|x-ray|lens/i.test(combined)) {
    terms.push('microscope lab dark', 'laser microscope lens', 'ultraviolet light', 'chemical flask dark', 'laboratory glass');
  }

  // Declassified Files, Archives, Microfilm & Government Folders
  if (/classified|declassified|dossier|record|archive|intelligence|cia|fbi|kgb|paperwork|files/i.test(combined)) {
    terms.push('typewriter dark', 'file cabinet dark', 'vintage paper document', 'dark archive room', 'microfilm archive');
  }

  // Aviation, Aircraft & Sky
  if (/airplane|aircraft|flight|aviation|airborne|pilot|cockpit|hijack|boeing|airbus|jet|lufthansa/i.test(combined)) {
    if (sceneIndex === 0) terms.push('airplane night', 'airplane flight', 'aircraft');
    else if (sceneIndex === 1) terms.push('airplane cockpit', 'runway night', 'airport lights');
    else terms.push('radar screen', 'airplane night', 'radar');
  }

  // Desert, Dunes & Wasteland
  if (/desert|dunes|sand|sahara|yemen|arabian|arid|wasteland/i.test(combined)) {
    terms.push('desert dunes', 'sand storm', 'desert night', 'desert aerial');
  }

  // Money, Vaults, Gold & Cash
  if (/cash|money|ransom|million|bank|vault|gold|currency|dollar|safe deposit/i.test(combined)) {
    terms.push('gold bars dark', 'bank vault door', 'counting money dark', 'safe vault');
  }

  // Ocean, Deep Sea & Marine Abyss
  if (/ocean|sea|underwater|deep sea|shipwreck|atlantic|pacific|water|diver|abyss|hydrophone|bloop/i.test(combined)) {
    terms.push('deep ocean dark', 'underwater dark', 'ocean waves storm', 'scuba diver deep');
  }

  // Submarines & Naval Sonar
  if (/submarine|torpedo|submersible|azorian|glomar|k-129|periscope|sonar/i.test(combined)) {
    terms.push('submarine underwater', 'sonar radar dark', 'deep ocean dark');
  }

  // Underground Caves, Catacombs & Tunnels
  if (/derinkuyu|tunnel|underground|cavern|cave|subterranean|catacomb/i.test(combined)) {
    terms.push('underground tunnel dark', 'dark cave torch', 'ancient cave rock', 'catacomb dark');
  }

  // Nuclear Bunkers & Blast Doors
  if (/bunker|blast door|greenbrier|cheyenne|norad|fallout|shelter|silo/i.test(combined)) {
    terms.push('underground bunker', 'vault door heavy', 'military tunnel dark');
  }

  // Radar, Antennas & Satellites
  if (/radar|satellite|antenna|telemetry|signal|tracking|surveillance|terminal/i.test(combined)) {
    terms.push('radar screen dark', 'satellite space dark', 'antenna night', 'server room dark');
  }

  // Ancient Ruins, Roman Concrete, Pyramids & Architecture
  if (/ancient|pyramid|temple|ruins|archaeology|roman|concrete|monument|tomb|pharaoh/i.test(combined)) {
    terms.push('ancient ruins dark', 'ancient temple night', 'roman ruins stone', 'pyramid dark');
  }

  // Arctic, Ice & Permafrost
  if (/arctic|snow|permafrost|ice|svalbard|glacier|polar|doomsday vault/i.test(combined)) {
    terms.push('arctic mountain blizzard', 'glacier ice dark', 'snow night mountain');
  }

  // Drilling, Boreholes & Earth Crust
  if (/borehole|kola|drilling|mantle|drill rig|deep hole/i.test(combined)) {
    terms.push('drilling rig night', 'drill machine industrial', 'mine tunnel dark');
  }

  // Volcanoes & Lava
  if (/volcano|eruption|lava|magma|crater/i.test(combined)) {
    terms.push('lava flow night', 'volcano dark', 'smoke mountain');
  }

  // Ships, Ports & Containers
  if (/canal|ship|cargo|vessel|panama|harbor|port|container|suez/i.test(combined)) {
    terms.push('cargo ship night', 'ocean port night', 'shipping vessel dark');
  }

  // 3. Concrete Physical Noun Extraction from Voice Script (Strictly no abstract words)
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
    'nobody', 'talking', 'comment', 'share', 'follow', 'below',
    ...Array.from(BANNED_ABSTRACT_TERMS)
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

  // 4. Dark Documentary Atmospheric Fallbacks (NEVER sunny beaches or abstract paint marbles!)
  for (const fallback of DARK_ARCHIVE_FALLBACK_QUERIES) {
    terms.push(fallback);
  }

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
/**
 * Local stock video vault reuse is disabled to prevent cross-topic clip contamination.
 */
async function findLocalVaultVideo(keywords: string[]): Promise<string | null> {
  return null;
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

