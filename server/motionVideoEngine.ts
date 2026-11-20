import 'dotenv/config';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordVisualUsage } from './database.js';

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

export interface MotionVideoOptions {
  targetDuration?: number;
  customKeywords?: string[];
  voiceScript?: string;
  topic?: string;
  sceneIndex?: number;
  usedUrls?: Set<string>;
  reelId?: string;
}

// Strictly banned abstract or textbook words that break stock video search
const BANNED_ABSTRACT_TERMS = new Set([
  'isotopic', 'spectral', 'anomaly', 'discrepancy', 'endures', 'aerospace',
  'physics', 'hypothesis', 'boundaries', 'experimentation', 'signature',
  'ratio', 'ratios', 'enduring', 'reconsider', 'telemetry', 'verdict',
  'implications', 'theoretical', 'paradigm', 'academic', 'perspective',
  'documented', 'investigation', 'verifiable', 'aftermath', 'mechanism'
]);

// Curated high-volume visual search terms organized by historical documentary archetype
const THEMATIC_ARCHETYPE_QUERIES: Record<string, { regex: RegExp; queries: string[] }> = {
  polar_arctic: {
    regex: /arctic|antarctic|antarctica|ice|glacier|blizzard|permafrost|snow|polar|expedition|byrd|highjump|svalbard|vostok/i,
    queries: [
      'arctic blizzard snow', 'glacier ice aerial', 'snow mountain blizzard',
      'icebreaker ship arctic', 'frozen compass ice', 'polar ice sheet',
      'antarctic mountain snow', 'naval ship icy sea', 'snow blizzard night'
    ]
  },
  maritime_ocean: {
    regex: /ocean|sea|underwater|submarine|shipwreck|sonar|naval|abyss|atlantic|pacific|sailor|vessel|bloop|mariana|torpedo|diver|reef/i,
    queries: [
      'deep ocean waves dark', 'underwater dark ocean', 'shipwreck underwater dark',
      'submarine underwater dark', 'naval radar screen', 'foggy harbor night',
      'ocean storm night', 'sonar screen green', 'cargo vessel night', 'deep sea submersible'
    ]
  },
  heists_vaults: {
    regex: /heist|vault|bank|safe|gold|diamond|currency|cash|ransom|robbery|jewelry|bullion|lock|combination|antwerp/i,
    queries: [
      'heavy bank vault door', 'vault gears mechanism', 'gold bars dark',
      'safe dial combination', 'security camera dark', 'counting cash dark',
      'iron safe lock', 'jewelry vault dark', 'bank safe interior'
    ]
  },
  espionage_cold_war: {
    regex: /cia|kgb|spy|espionage|intelligence|covert|operation|classified|dossier|telegram|operative|surveillance|defector|interrogation|pastorius/i,
    queries: [
      'classified paper folder', 'vintage typewriter ribbon', 'microfilm viewer dark',
      'teletype tape machine', 'telephone switchboard vintage', 'cipher machine dials',
      'briefcase dark desk', 'foggy street lamp night', 'vintage reel to reel tape', 'file cabinet dark'
    ]
  },
  aviation_aerospace: {
    regex: /airplane|aircraft|flight|cockpit|aviation|pilot|hangar|radar|airport|runway|crash|jet|airspace|hijack|boeing|airbus/i,
    queries: [
      'airplane cockpit dials', 'runway night fog', 'radar screen dark',
      'aircraft hangar dark', 'airplane flight night', 'air traffic control screen',
      'vintage airplane propeller', 'clouds flying dusk'
    ]
  },
  ancient_ruins: {
    regex: /ancient|archaeology|ruins|temple|pyramid|monolith|tomb|pharaoh|excavation|artifact|sarcophagus|roman|greek|stone|inscription|hieroglyph|giza|gobekli|sumerian|maya/i,
    queries: [
      'ancient stone ruins', 'temple ruins night', 'ancient stone monolith',
      'archaeological excavation dark', 'torchlight stone chamber', 'pyramid dark night',
      'ancient carved stone', 'dusty artifact excavation', 'ancient stone tomb', 'roman pillars ruins'
    ]
  },
  subterranean_bunkers: {
    regex: /bunker|tunnel|catacomb|cave|underground|cavern|subterranean|derinkuyu|blast door|silo|shelter|fallout|cheyenne|norad/i,
    queries: [
      'underground bunker concrete', 'heavy blast door gears', 'dark tunnel lantern',
      'catacomb skull dark', 'cave stalactite dark', 'subterranean hallway dark',
      'mine shaft tunnel', 'iron bunker door'
    ]
  },
  forensic_science: {
    regex: /forensic|chemical|laboratory|lab|microscope|analysis|carbon|dating|fiber|ultraviolet|x-ray|specimen|test tube|dna|poison/i,
    queries: [
      'vintage microscope optical', 'chemical beaker bubbles', 'laboratory glassware dark',
      'laser light dark lab', 'ultraviolet light dark', 'forensic evidence table',
      'pipette chemical drop', 'scientific lab dark'
    ]
  },
  manuscripts_ciphers: {
    regex: /voynich|manuscript|parchment|cipher|vellum|folio|calligraphy|quill|medieval|scroll|scribe|library|codex|alchemy/i,
    queries: [
      'aged vellum parchment', 'quill ink calligraphy', 'magnifying glass parchment',
      'leather bound tome', 'ancient library shelves', 'wax seal document',
      'vintage brass compass', 'hourglass sand dark'
    ]
  },
  industrial_drilling: {
    regex: /borehole|kola|drilling|drill|mantle|mine|factory|machinery|industrial|iron|foundry|steam|gears|pipeline/i,
    queries: [
      'industrial machinery heavy', 'drill bit rotating', 'steam pipe pressure gauge',
      'iron foundry spark', 'oil rig night', 'deep mine shaft',
      'industrial gears rotating', 'factory smokestack night'
    ]
  },
  space_cosmic: {
    regex: /space|satellite|signal|radio|astronomy|telescope|observatory|telemetry|orbit|pulsar|alien|cosmic/i,
    queries: [
      'radio telescope array', 'satellite earth orbit', 'observatory dome night',
      'starry night sky dark', 'oscilloscope signal screen', 'radar dish rotating',
      'deep space stars'
    ]
  },
  desert_arid: {
    regex: /desert|dunes|sand|sahara|yemen|arabian|arid|wasteland/i,
    queries: [
      'desert dunes night', 'sand storm wind', 'desert aerial dusk', 'sand ripples dark'
    ]
  }
};

// 40+ diverse dark documentary atmospheric fallback terms rotated dynamically
export const GENERAL_ATMOSPHERIC_FALLBACKS = [
  'foggy street lamp night', 'dark forest fog', 'storm clouds thunder',
  'lantern darkness', 'vintage clock ticking', 'rain window dark night',
  'shadowy figure night', 'old tape recorder reels', 'compass needle spinning',
  'dark water ripples', 'iron gate opening', 'dust motes light beam',
  'vintage radio dials', 'smoke dark background', 'moon clouds dark night',
  'railroad tracks night fog', 'abandoned hallway dark', 'vintage car headlights night',
  'dramatic lightning storm', 'dark room silhouette', 'footsteps dark pavement',
  'heavy wooden door lock', 'foggy city skyline night', 'vintage metal compass',
  'shadows moving wall', 'vintage binoculars dark', 'neon sign dark alley',
  'mist rising water night', 'telephone ringing dark room', 'archive boxes dark shelf'
];

export const DARK_ARCHIVE_FALLBACK_QUERIES = GENERAL_ATMOSPHERIC_FALLBACKS;

// Strict negative filter regex against modern civilian domestic / lifestyle footage
export const BANNED_STOCK_TAGS = /sofa|couch|bedroom|living[-_]?room|student|homework|school|classroom|studying?|laptop|casual|girl[-_]?reading|woman[-_]?reading|boy[-_]?reading|man[-_]?reading|kid|child|teen|teenager|cute|domestic|home[-_]?interior|coffee[-_]?cup|office[-_]?meeting|corporate|handshake|fitness|workout|gym|dancing|smile|smiling|family|fashion[-_]?model|clothing[-_]?store|shopping/i;

/**
 * Returns concrete physical visual search queries matched to a topic's historical archetype.
 */
export function getThematicArchetypeQueries(
  subject: string,
  topicContext?: string,
  voiceScript?: string
): string[] {
  const combined = `${subject} ${topicContext || ''} ${voiceScript || ''}`.toLowerCase();
  const matches: string[] = [];
  for (const arch of Object.values(THEMATIC_ARCHETYPE_QUERIES)) {
    if (arch.regex.test(combined)) {
      matches.push(...arch.queries);
    }
  }
  return matches.length > 0 ? matches : GENERAL_ATMOSPHERIC_FALLBACKS;
}

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

  // 1. Explicit contextual terms from LLM/scene metadata (cleaned of abstract words)
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

  // 2. Concrete noun extraction from speech & query
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
    'room', 'rooms', 'bedroom', 'living', 'farmer', 'digging', 'ditch', 'simple',
    'people', 'person', 'woman', 'girl', 'boy', 'man', 'student', 'homework',
    'sofa', 'couch', 'chair', 'bed', 'desk', 'laptop', 'coffee', 'cup', 'table',
    'school', 'casual', 'study', 'studying', 'reading', 'read', 'books', 'book',
    'office', 'meeting', 'class', 'classroom', 'exploit', 'shared', 'trust',
    'officials', 'cover', 'coverup', 'institutional', 'negligence', 'theory',
    'without', 'tripping', 'alarms', 'priceless', 'volumes', 'vanished',
    ...Array.from(BANNED_ABSTRACT_TERMS)
  ]);

  const cleanSpeechWords = speechText.replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopWords.has(w));

  if (cleanSpeechWords.length >= 2) {
    terms.push(`${cleanSpeechWords[0]} ${cleanSpeechWords[1]}`);
  }
  if (cleanSpeechWords.length >= 3) {
    terms.push(`${cleanSpeechWords[1]} ${cleanSpeechWords[2]}`);
  }

  // 3. Match topic archetypes
  for (const arch of Object.values(THEMATIC_ARCHETYPE_QUERIES)) {
    if (arch.regex.test(combined)) {
      const qList = arch.queries;
      const startIdx = (sceneIndex * 2 + Math.floor(Math.random() * qList.length)) % qList.length;
      for (let i = 0; i < 3; i++) {
        terms.push(qList[(startIdx + i) % qList.length]);
      }
    }
  }

  // 4. Dynamic Atmospheric Fallbacks (NEVER a single static query!)
  const poolLen = GENERAL_ATMOSPHERIC_FALLBACKS.length;
  const randOffset = (sceneIndex * 5 + Math.floor(Math.random() * poolLen)) % poolLen;
  terms.push(GENERAL_ATMOSPHERIC_FALLBACKS[randOffset]);
  terms.push(GENERAL_ATMOSPHERIC_FALLBACKS[(randOffset + 7) % poolLen]);

  return Array.from(new Set(terms.filter(Boolean)));
}

/**
 * Searches and downloads an authentic video from Pixabay API with deduplication.
 */
async function fetchPixabayVideo(
  query: string,
  outputPath: string,
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
      const searchUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(q)}&video_type=all&per_page=20`;
      console.info(`[Motion Video Engine] Querying Pixabay Video API for "${q}"...`);
      const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;

      const data: any = await resp.json();
      const hits: any[] = data?.hits || [];
      if (!hits.length) continue;

      // Filter out green-screen, animations, and recently used clips
      const validHits = hits.filter(h => {
        const tags = String(h?.tags || '').toLowerCase();
        if (/green screen|chroma key|3d model|animation render/i.test(tags)) return false;
        // Strictly filter out domestic, casual, modern civilian lifestyle stock footage
        if (BANNED_STOCK_TAGS.test(tags)) return false;
        const vidUrl = h?.videos?.medium?.url || h?.videos?.large?.url || h?.videos?.small?.url;
        if (!vidUrl) return false;
        if (options?.usedUrls?.has(vidUrl)) return false;
        if (h.id && options?.usedUrls?.has(String(h.id))) return false;
        return true;
      });

      if (!validHits.length) continue;

      // Pick randomly from valid pool to avoid always choosing hit 0
      const chosen = validHits[Math.floor(Math.random() * validHits.length)];
      const videoUrl = chosen?.videos?.medium?.url || chosen?.videos?.large?.url || chosen?.videos?.small?.url;
      if (!videoUrl) continue;

      const assetCachePath = path.join(STOCK_VIDEOS_DIR, `pixabay-${chosen.id}.mp4`);

      // If already downloaded and not in usedUrls, copy directly
      if (fsSync.existsSync(assetCachePath) && (await fs.stat(assetCachePath)).size > 50000) {
        await fs.copyFile(assetCachePath, outputPath);
        if (options?.usedUrls) {
          options.usedUrls.add(videoUrl);
          if (chosen.id) options.usedUrls.add(String(chosen.id));
        }
        recordVisualUsage({
          assetType: 'stock_video',
          source: 'pixabay',
          sourceUrl: videoUrl,
          identifier: String(chosen.id),
          query: q,
          reelId: options?.reelId
        });
        console.info(`[Motion Video Engine] Locked cached Pixabay video (${chosen.duration || 0}s, tags: "${chosen.tags}") for "${q}".`);
        return outputPath;
      }

      console.info(`[Motion Video Engine] Downloading Pixabay video clip (${chosen.duration || 0}s, tags: "${chosen.tags}"): ${videoUrl.slice(0, 60)}...`);
      const vidResp = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) });
      if (!vidResp.ok) continue;

      const arrayBuf = await vidResp.arrayBuffer();
      if (arrayBuf.byteLength < 50000) continue;

      await fs.writeFile(assetCachePath, Buffer.from(arrayBuf));
      await fs.copyFile(assetCachePath, outputPath);

      if (options?.usedUrls) {
        options.usedUrls.add(videoUrl);
        if (chosen.id) options.usedUrls.add(String(chosen.id));
      }
      recordVisualUsage({
        assetType: 'stock_video',
        source: 'pixabay',
        sourceUrl: videoUrl,
        identifier: String(chosen.id),
        query: q,
        reelId: options?.reelId
      });
      console.info(`[Motion Video Engine] Downloaded Pixabay video (${arrayBuf.byteLength} bytes) for "${q}" -> pixabay-${chosen.id}.mp4`);
      return outputPath;
    } catch (err: any) {
      console.warn(`[Motion Video Engine] Pixabay fetch for "${q}" failed: ${err?.message || err}`);
    }
  }
  return null;
}

/**
 * Searches and downloads an authentic vertical 1080x1920 video from Pexels API with deduplication.
 */
async function fetchPexelsVideo(
  query: string,
  outputPath: string,
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

  for (const q of candidateQueries.slice(0, 5)) {
    try {
      const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=15`;
      console.info(`[Motion Video Engine] Querying Pexels Video API for "${q}"...`);
      
      const resp = await fetch(searchUrl, {
        headers: { Authorization: pexelsKey },
        signal: AbortSignal.timeout(10000)
      });

      if (!resp.ok) continue;

      const data: any = await resp.json();
      const videos = data?.videos || [];
      if (!videos.length) continue;

      // Filter out previously used video files across recent reels & banned lifestyle stock
      const availableVideos = videos.filter((v: any) => {
        if (options?.usedUrls?.has(v.url)) return false;
        if (v.id && options?.usedUrls?.has(String(v.id))) return false;
        const videoSlug = String(v?.url || '').toLowerCase();
        if (BANNED_STOCK_TAGS.test(videoSlug)) return false;
        const mp4Files = (v?.video_files || []).filter((f: any) => f?.file_type === 'video/mp4' && f?.link);
        if (mp4Files.some((f: any) => options?.usedUrls?.has(f.link))) return false;
        return true;
      });

      if (!availableVideos.length) continue;

      const chosenVideo = availableVideos[Math.floor(Math.random() * availableVideos.length)];
      const files: any[] = chosenVideo?.video_files || [];

      // Filter for valid MP4s and sort by proximity to 1080x1920
      const mp4Files = files.filter(f => f?.file_type === 'video/mp4' && f?.link && !options?.usedUrls?.has(f.link));
      if (!mp4Files.length) continue;

      const bestFile = mp4Files.find(f => f.width === 1080 && f.height === 1920) ||
                       mp4Files.find(f => f.quality === 'hd') ||
                       mp4Files.find(f => (f.height || 0) > (f.width || 0)) ||
                       mp4Files[0];

      if (!bestFile?.link) continue;

      const assetCachePath = path.join(STOCK_VIDEOS_DIR, `pexels-${chosenVideo.id}.mp4`);

      if (fsSync.existsSync(assetCachePath) && (await fs.stat(assetCachePath)).size > 50000) {
        await fs.copyFile(assetCachePath, outputPath);
        if (options?.usedUrls) {
          if (chosenVideo.url) options.usedUrls.add(chosenVideo.url);
          if (bestFile.link) options.usedUrls.add(bestFile.link);
          if (chosenVideo.id) options.usedUrls.add(String(chosenVideo.id));
        }
        recordVisualUsage({
          assetType: 'stock_video',
          source: 'pexels',
          sourceUrl: bestFile.link,
          identifier: String(chosenVideo.id),
          query: q,
          reelId: options?.reelId
        });
        console.info(`[Motion Video Engine] Locked cached Pexels video (${chosenVideo.id}) for "${q}".`);
        return outputPath;
      }

      console.info(`[Motion Video Engine] Downloading Pexels video (${bestFile.width}x${bestFile.height}): ${bestFile.link.slice(0, 50)}...`);
      const vidResp = await fetch(bestFile.link, { signal: AbortSignal.timeout(25000) });
      if (!vidResp.ok) continue;

      const arrayBuf = await vidResp.arrayBuffer();
      if (arrayBuf.byteLength < 50000) continue;

      await fs.writeFile(assetCachePath, Buffer.from(arrayBuf));
      await fs.copyFile(assetCachePath, outputPath);

      if (options?.usedUrls) {
        if (chosenVideo.url) options.usedUrls.add(chosenVideo.url);
        if (bestFile.link) options.usedUrls.add(bestFile.link);
        if (chosenVideo.id) options.usedUrls.add(String(chosenVideo.id));
      }
      recordVisualUsage({
        assetType: 'stock_video',
        source: 'pexels',
        sourceUrl: bestFile.link,
        identifier: String(chosenVideo.id),
        query: q,
        reelId: options?.reelId
      });
      console.info(`[Motion Video Engine] Downloaded Pexels video (${arrayBuf.byteLength} bytes) for "${q}" -> pexels-${chosenVideo.id}.mp4`);
      return outputPath;
    } catch (err: any) {
      console.warn(`[Motion Video Engine] Pexels fetch for "${q}" failed: ${err?.message || err}`);
    }
  }
  return null;
}

/**
 * Local stock video vault reuse is disabled to prevent cross-topic clip contamination.
 */
async function findLocalVaultVideo(keywords: string[]): Promise<string | null> {
  return null;
}

/**
 * High-speed Motion Video Engine with cross-reel deduplication.
 * Resolves authentic moving vertical video footage matching the reel scene's subject.
 * 
 * Order of resolution:
 * 1. Queries Pexels Video API (if PEXELS_API_KEY is configured).
 * 2. Queries Pixabay Video API (if PIXABAY_API_KEY is configured).
 * 3. Falls back to graceful indicator if no network video available.
 */
export async function fetchBestMotionVideo(
  query: string,
  outputPath: string,
  options: MotionVideoOptions = {}
): Promise<MotionVideoResult> {
  await fs.mkdir(STOCK_VIDEOS_DIR, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const cleanedQuery = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Query Pexels Video Search API with custom contextual keywords and voice script
  const pexelsResult = await fetchPexelsVideo(cleanedQuery, outputPath, options);
  if (pexelsResult && fsSync.existsSync(outputPath)) {
    return { source: 'pexels', videoPath: outputPath };
  }

  // 2. Query Pixabay Video Search API with custom keywords and voice script
  const pixabayResult = await fetchPixabayVideo(cleanedQuery, outputPath, options);
  if (pixabayResult && fsSync.existsSync(outputPath)) {
    return { source: 'pixabay', videoPath: outputPath };
  }

  // 3. Query local vault for category matches
  const keywords = cleanedQuery.split(/\s+/).filter(w => w.length >= 3);
  const vaultMatch = await findLocalVaultVideo(keywords);
  if (vaultMatch && fsSync.existsSync(vaultMatch)) {
    await fs.copyFile(vaultMatch, outputPath);
    return { source: 'vault', videoPath: outputPath };
  }

  return { source: 'fallback', videoPath: outputPath };
}
