import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerAsset, selectAssets, resolveAssetDiskPath, markAssetUsed, type MediaAsset } from './assetLibrary.js';
import { renderOverlayToPng } from './vectorOverlayEngine.js';
import { fetchWikimediaArchivalImage, fetchAndAnimateArchivalClip } from './archivalMediaEngine.js';
import { renderSoftwareTutorialVideo } from './softwareScreenEngine.js';
import { getActivePersona } from './themePage.js';
import {
  extractContextualSceneKeywords,
  ensureChapterCuts,
  detectHistoricalEra,
  splitNarrationIntoVisualBeats,
  buildContextualCutPrompt
} from './contentIntelligence.js';

const execFileAsync = promisify(execFile);
const GENERATED_DIR = path.join(process.cwd(), 'data', 'media', 'generated-scenes');

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function resolveFontFile(): string | null {
  const candidates = [
    process.env.FONT_PATH,
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc'
  ].filter(Boolean) as string[];

  for (const font of candidates) {
    if (fsSync.existsSync(font)) return font;
  }
  return null;
}

function hashNumber(input: string): number {
  return crypto.createHash('sha256').update(input).digest().readUInt32BE(0);
}

function hueToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  const sector = Math.floor(hue / 60);
  const rgb = sector === 0 ? [c, x, 0]
    : sector === 1 ? [x, c, 0]
    : sector === 2 ? [0, c, x]
    : sector === 3 ? [0, x, c]
    : sector === 4 ? [x, 0, c]
    : [c, 0, x];
  return '#' + rgb.map(value => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('');
}

function themePalette(scene: any, index: number): { bg: string; accent: string } {
  // Curated documentary palette for @theuntoldarch: dark charcoal, archival black, antique gold, telemetry cyan
  const archivalBackgrounds = ['#08080a', '#0d0e12', '#111216'];
  const documentaryAccents = ['#d4af37', '#e2d9cc', '#0284c7', '#c25a3f', '#64748b'];

  const seed = hashNumber(JSON.stringify({ theme: scene?.visualTheme || '', hook: scene?.hookText || '', index }));
  const bg = archivalBackgrounds[seed % archivalBackgrounds.length];
  const accent = documentaryAccents[(seed + index) % documentaryAccents.length];

  return { bg, accent };
}

function sceneTitle(scene: any): string {
  const persona = getActivePersona();
  const defaultBrand = persona.brand || 'THE UNTOLD ARCHIVE';
  return String(scene?.hookText || scene?.secondaryText || scene?.visualTheme || defaultBrand).trim().slice(0, 72);
}

function wrapText(text: string, maxCharsPerLine = 22): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxCharsPerLine) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function cleanBadgeText(badgeText?: string, index = 0): string {
  if (badgeText) {
    const stripped = badgeText.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (stripped.length >= 2) return `[ ${stripped} ]`;
  }
  return index === 0 ? '[ BREAKTHROUGH ]' : index === 1 ? '[ DEEP DIVE ]' : '[ FUTURE INTEL ]';
}

// Sequential throttling & concurrency limiter for Pollinations AI (max 2 concurrent, 1200ms spacing)
let activeFluxRequests = 0;
const MAX_CONCURRENT_FLUX = 2;
let lastFluxRequestTimestamp = 0;
const MIN_FLUX_INTERVAL_MS = 1200;

async function acquireFluxSlot(): Promise<void> {
  while (activeFluxRequests >= MAX_CONCURRENT_FLUX) {
    await new Promise(r => setTimeout(r, 200));
  }
  activeFluxRequests++;
  const now = Date.now();
  const timeSinceLast = now - lastFluxRequestTimestamp;
  if (timeSinceLast < MIN_FLUX_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_FLUX_INTERVAL_MS - timeSinceLast));
  }
  lastFluxRequestTimestamp = Date.now();
}

function releaseFluxSlot(): void {
  activeFluxRequests = Math.max(0, activeFluxRequests - 1);
}

export interface FluxClipOptions {
  topic?: string;
  historicalEra?: string;
  spokenClause?: string;
  prompt?: string;
  voiceScript?: string;
}

/**
 * Generates an authentic AI visual via Pollinations FLUX endpoint:
 * https://image.pollinations.ai/prompt/{encoded_prompt}?width=1080&height=1920&nologo=true&model={model}&seed={seed}
 * Uses a 3-attempt retry loop with exponential backoff & model fallback:
 * Attempt 1: model=flux (timeout 35s)
 * Attempt 2: model=flux-realism (timeout 35s)
 * Attempt 3: model=turbo (timeout 15s - renders in 2s, never times out)
 * and renders it into a 1080x1920 vertical video clip with FFmpeg Ken Burns zoompan motion.
 */
export async function fetchAndAnimatePollinationsFluxClip(
  query: string,
  cutDuration: number,
  animIndex: number,
  outputPath: string,
  options?: FluxClipOptions
): Promise<{ source: 'pollinations-flux' | null; videoPath: string | null }> {
  const rawImageDir = path.join(process.cwd(), 'data', 'media', 'temp');
  await fs.mkdir(rawImageDir, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const safeTopic = (options?.topic || query).split(/[:\-\—\(]/)[0].trim() || 'Historical Event';
  const safeEra = options?.historicalEra || detectHistoricalEra(safeTopic, `${query} ${options?.voiceScript || ''}`);
  const safeClause = options?.spokenClause || query;

  // Enforce strict era-locked, clause-synced prompt builder
  const finalPrompt = options?.prompt || buildContextualCutPrompt(safeTopic, '', safeEra, safeClause, animIndex);

  const retryModels = [
    { model: 'turbo', timeoutMs: 6000, delayAfterFail: 0 },
    { model: 'flux', timeoutMs: 8000, delayAfterFail: 0 }
  ];

  await acquireFluxSlot();
  try {
    for (let attempt = 0; attempt < retryModels.length; attempt++) {
      const { model, timeoutMs, delayAfterFail } = retryModels[attempt];
      const seed = Math.floor(Math.random() * 900000) + 100000;
      const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1080&height=1920&nologo=true&model=${model}&seed=${seed}`;
      const rawImagePath = path.join(rawImageDir, `flux-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`);

      try {
        console.info(`[Pollinations AI] Attempt ${attempt + 1}/${retryModels.length} (${model}) for: "${finalPrompt.slice(0, 75)}..."`);
        const resp = await fetch(fluxUrl, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        if (resp.status === 402) {
          console.warn(`[Pollinations AI] Attempt ${attempt + 1} (${model}) returned HTTP 402 (Payment Required) - skipping Pollinations.`);
          break;
        }

        if (!resp.ok) {
          console.warn(`[Pollinations AI] Attempt ${attempt + 1} (${model}) returned HTTP ${resp.status}`);
          if (delayAfterFail > 0) await new Promise(r => setTimeout(r, delayAfterFail));
          continue;
        }

        const buf = await resp.arrayBuffer();
        if (buf.byteLength < 10000) {
          console.warn(`[Pollinations AI] Attempt ${attempt + 1} (${model}) returned undersized image (${buf.byteLength} bytes)`);
          if (delayAfterFail > 0) await new Promise(r => setTimeout(r, delayAfterFail));
          continue;
        }

        await fs.writeFile(rawImagePath, Buffer.from(buf));

        const duration = Math.max(1.5, Math.min(cutDuration || 3.0, 6.0));
        const cameraType = Math.abs(animIndex) % 3;

        let zoomFilter = '';
        if (cameraType === 0) {
          zoomFilter = `scale=1200:2133:force_original_aspect_ratio=increase,crop=1200:2133,zoompan=z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1`;
        } else if (cameraType === 1) {
          zoomFilter = `scale=1200:2133:force_original_aspect_ratio=increase,crop=1200:2133,zoompan=z='max(1.25-0.0015*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1`;
        } else {
          zoomFilter = `scale=1280:2276:force_original_aspect_ratio=increase,crop=1280:2276,zoompan=z=1.12:x='if(lte(on,1),(iw-iw/zoom)/2,x+0.8)':y='(ih-ih/zoom)/2':d=1:s=1080x1920:fps=30,setsar=1`;
        }

        console.info(`[Pollinations AI] 🎨 Animating AI visual cut (${model}) "${finalPrompt.slice(0, 50)}..." (${duration.toFixed(1)}s, Camera ${cameraType + 1})...`);
        await execFileAsync('ffmpeg', [
          '-y',
          '-loop', '1',
          '-i', rawImagePath,
          '-t', String(duration),
          '-vf', zoomFilter,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '20',
          '-pix_fmt', 'yuv420p',
          '-an',
          outputPath
        ], { maxBuffer: 1024 * 1024 * 8 });

        try { await fs.unlink(rawImagePath); } catch {}

        if (fsSync.existsSync(outputPath) && (await fs.stat(outputPath)).size > 15000) {
          return {
            source: 'pollinations-flux',
            videoPath: outputPath
          };
        }
      } catch (attemptErr: any) {
        console.warn(`[Pollinations AI] Attempt ${attempt + 1} (${model}) error:`, attemptErr?.message || attemptErr);
        try { await fs.unlink(rawImagePath); } catch {}
        if (delayAfterFail > 0) await new Promise(r => setTimeout(r, delayAfterFail));
      }
    }
  } catch (fluxErr: any) {
    console.warn(`[Pollinations AI] Cut generation failed for "${query}":`, fluxErr?.message || fluxErr);
  } finally {
    releaseFluxSlot();
  }

  return { source: null, videoPath: null };
}

/**
 * Extracts smart candidate search queries for a single cut
 */
function getCutSearchTerms(
  cleanSubject: string,
  spokenClause?: string,
  cutQuery?: string,
  keywords: string[] = []
): string[] {
  const terms: string[] = [];

  // 1. Scene-specific B-roll keywords (highest relevance if provided)
  for (const kw of keywords) {
    const cleanKw = kw.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (cleanKw.length >= 3) terms.push(cleanKw);
  }

  // 2. Spoken clause core words (if distinct from subject)
  if (spokenClause && spokenClause !== cleanSubject) {
    const words = spokenClause
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !/^(this|that|with|from|have|will|your|what|when|where|into|about|there|their|would|could|should|which|because|deliberately|completely|documented|archival|investigation|requires|below|above|before|after|while|since)$/i.test(w));
    if (words.length >= 2) terms.push(`${words[0]} ${words[1]}`);
    if (words.length >= 1) terms.push(words[0]);
    if (words.length >= 3) terms.push(words[1]);
  }

  // 3. Cut query (if distinct from subject)
  if (cutQuery && cutQuery !== cleanSubject) {
    const qWords = cutQuery
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !/^(scene|visual|photo|ultra|high|cinematic|footage|documentary|archival)$/i.test(w));
    if (qWords.length >= 2) terms.push(`${qWords[0]} ${qWords[1]}`);
    if (qWords.length >= 1) terms.push(qWords[0]);
  }

  // 4. Subject entity core nouns (filtering verbs like "avoid", "stops", "why")
  const subjectWords = cleanSubject
    .replace(/^(why|how|the|what|who|where|when|inside|case|unsolved|secret|truth|real|documented)\s+/i, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !/^(avoid|avoids|avoiding|stops|fails|prohibits|secret|history|mystery|untold|archive)$/i.test(w));

  if (subjectWords.length >= 2) {
    terms.push(`${subjectWords[0]} ${subjectWords[subjectWords.length - 1]}`);
  }
  for (const sw of subjectWords) {
    terms.push(sw);
  }

  // 5. Entire clean subject
  const strippedSubject = cleanSubject.replace(/^(why|how|the|what|who|where|when|inside)\s+/i, '').trim();
  if (strippedSubject) terms.push(strippedSubject);

  // Fallback defaults
  terms.push('aerial view', 'mountain landscape', 'documentary investigation');

  // Deduplicate and filter
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of terms) {
    const lower = t.toLowerCase().trim();
    if (lower.length >= 3 && !seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  return result;
}

/**
 * Tier 1: Pixabay Stock Photo API fetcher
 */
async function fetchPixabayImageForCut(
  candidates: string[],
  outputPath: string
): Promise<{ source: 'pixabay-photo'; title?: string } | null> {
  const pixabayKey = process.env.PIXABAY_API_KEY;
  if (!pixabayKey) return null;

  for (const term of candidates.slice(0, 5)) {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      try {
        const url = `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(term)}&image_type=photo&orientation=${orientation}&per_page=6&safesearch=true`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;

        const data: any = await res.json();
        const hits = data?.hits || [];
        if (!hits.length) continue;

        const hit = hits[Math.floor(Math.random() * Math.min(hits.length, 3))];
        const imgUrl = hit?.largeImageURL || hit?.webformatURL || hit?.imageURL;
        if (!imgUrl) continue;

        const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(10000) });
        if (!imgRes.ok) continue;

        const buf = await imgRes.arrayBuffer();
        if (buf.byteLength > 20000) {
          await fs.writeFile(outputPath, Buffer.from(buf));
          console.info(`[Autonomous Visual Producer] 📸 Pixabay locked photo for "${term}" (${orientation}, ${buf.byteLength} bytes)`);
          return { source: 'pixabay-photo', title: hit?.tags || term };
        }
      } catch (err: any) {
        console.warn(`[Autonomous Visual Producer] Pixabay notice for "${term}":`, err?.message?.slice(0, 80));
      }
    }
  }
  return null;
}

/**
 * Tier 2: Wikimedia Commons Archival Photography & Records
 */
async function fetchWikimediaImageForCut(
  candidates: string[],
  outImagePath: string,
  extraOpts?: { usedUrls?: Set<string>; usedTitles?: Set<string>; index?: number }
): Promise<{ source: 'wikimedia-commons'; title?: string } | null> {
  for (const term of candidates.slice(0, 4)) {
    try {
      const res = await fetchWikimediaArchivalImage(term, {
        fallbackTerms: candidates.slice(1),
        usedUrls: extraOpts?.usedUrls,
        usedTitles: extraOpts?.usedTitles,
        index: extraOpts?.index
      });
      if (res?.filePath && fsSync.existsSync(res.filePath)) {
        await fs.copyFile(res.filePath, outImagePath);
        console.info(`[Autonomous Visual Producer] 🏛️ Wikimedia record locked for "${term}": ${res.title}`);
        return { source: 'wikimedia-commons', title: res.title };
      }
    } catch (err: any) {
      console.warn(`[Autonomous Visual Producer] Wikimedia notice for "${term}":`, err?.message?.slice(0, 80));
    }
  }
  return null;
}

/**
 * Tier 4: Find any existing local archival / stock cache image
 */
async function findCachedArchivalImage(): Promise<string | null> {
  const dirs = [
    path.join(process.cwd(), 'data', 'media', 'archival-cache'),
    path.join(process.cwd(), 'data', 'media', 'stock-cache')
  ];
  for (const dir of dirs) {
    if (!fsSync.existsSync(dir)) continue;
    try {
      const files = await fs.readdir(dir);
      const images = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f));
      if (images.length > 0) {
        const picked = images[Math.floor(Math.random() * images.length)];
        const fullPath = path.join(dir, picked);
        if (fsSync.existsSync(fullPath) && (await fs.stat(fullPath)).size > 15000) {
          return fullPath;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Animates a photographic visual into a 1080x1920 vertical video clip with Ken Burns zoompan motion
 */
async function animateImageToCutVideo(
  imagePath: string,
  duration: number,
  animIndex: number,
  outputPath: string
): Promise<boolean> {
  const cameraType = Math.abs(animIndex) % 3;
  let zoomFilter = '';
  if (cameraType === 0) {
    // Camera 1: Cinematic Zoom-In
    zoomFilter = `scale=1200:2133:force_original_aspect_ratio=increase,crop=1200:2133,zoompan=z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1`;
  } else if (cameraType === 1) {
    // Camera 2: Cinematic Revealing Zoom-Out
    zoomFilter = `scale=1200:2133:force_original_aspect_ratio=increase,crop=1200:2133,zoompan=z='max(1.25-0.0015*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1`;
  } else {
    // Camera 3: Subtle Forensic Drift / Pan
    zoomFilter = `scale=1280:2276:force_original_aspect_ratio=increase,crop=1280:2276,zoompan=z=1.12:x='if(lte(on,1),(iw-iw/zoom)/2,x+0.8)':y='(ih-ih/zoom)/2':d=1:s=1080x1920:fps=30,setsar=1`;
  }

  // Atmospheric dark documentary color grade: preserving clarity, saturation, and contrast while adding film vignette
  const gradeFilter = 'eq=saturation=0.70:contrast=1.12:brightness=-0.02,vignette=PI/4';

  await execFileAsync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-t', duration.toFixed(2),
    '-vf', `${zoomFilter},${gradeFilter}`,
    '-an', '-threads', '2',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    outputPath
  ]);

  return fsSync.existsSync(outputPath) && (await fs.stat(outputPath)).size > 20000;
}

/**
 * Tier 5: Procedural Visible Documentary Slate (Visible telemetry grid - NEVER PITCH BLACK!)
 */
async function generateVisibleDocumentarySlate(
  cutDuration: number,
  accentHex: string,
  outputPath: string
): Promise<void> {
  const safeHex = /^[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : 'd4af37';
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x151c28:s=1080x1920:d=${cutDuration.toFixed(2)}:r=30`,
    '-vf', `drawgrid=w=120:h=120:t=1:c=0x${safeHex}@0.08,vignette=PI/3.5,eq=contrast=1.1:brightness=0.02,setsar=1`,
    '-an', '-threads', '2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p',
    outputPath
  ]);
}

async function renderGeneratedScene(
  scene: any,
  index: number,
  reel: any,
  extraOpts?: {
    usedVideoUrls?: Set<string>;
    usedArchivalTitles?: Set<string>;
    totalScenes?: number;
    forcedDuration?: number;
  }
): Promise<string> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const duration = extraOpts?.forcedDuration
    ? Math.max(2.5, Math.min(extraOpts.forcedDuration, 35))
    : Math.max(3, Math.min(Number(scene?.durationSeconds || 8), 25));
  const safeId = String(reel?.id || 'autonomous').replace(/[^a-zA-Z0-9_-]/g, '-');
  const nonce = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const output = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.mp4`);

  const rawHeadline = String(scene?.onScreenText || scene?.headline || scene?.hookText || sceneTitle(scene)).trim().slice(0, 72);
  const palette = themePalette(scene, index);
  const rawAccent = String(scene?.accentColor || palette.accent || '#d4af37').replace('#', '').trim();
  const accentHex = /^[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : palette.accent.replace('#', '');

  const persona = getActivePersona();
  const cleanSubject = String(reel?.title || '').replace(/^(documented archival anomaly|declassified dossier|archival anomaly|case file|investigation file)[\s\:\-]+/i, '').split(/[:\-\—\(]/)[0].trim() || 'The Untold Archive Secret';
  const topicContext = `${reel?.title || ''} ${reel?.niche || ''} ${scene?.headline || ''} ${scene?.subline || ''}`;
  const isSoftwareNiche = /software|programming|developer|coding|web dev|ai tools/i.test(String(reel?.niche || persona.niche || ''));
  const isPhysicalHardware = /humanoid|boston dynamics|physical robot|quadruped|drone flight|hardware chip fabrication|battery breakthrough/i.test(topicContext);
  const isExplicitTool = /suno|udio|canva|photoshop|figma|luma|kling|runway|sora|pika|cursor|windsurf|deepseek|claude|chatgpt|v0|bolt|flux|midjourney|recraft|elevenlabs/i.test(topicContext);

  // 0. Escape Hatch: Software Screen Tutorial if explicitly requested
  const preferSoftwareScreen = isSoftwareNiche && !isPhysicalHardware && isExplicitTool && index === 1;
  if (preferSoftwareScreen) {
    try {
      console.info(`[Autonomous Visual Producer] Producing real software studio video (scene ${index + 1}): "${rawHeadline.slice(0, 50)}"...`);
      await renderSoftwareTutorialVideo(scene, index, reel, output, duration);
      if (fsSync.existsSync(output) && (await fs.stat(output)).size > 50000) {
        return output;
      }
    } catch (tutErr: any) {
      console.warn(`[Autonomous Visual Producer] Software studio render notice, falling back to documentary visual engine:`, tutErr?.message || tutErr);
    }
  }

  // 1. Dynamic Audio-Synced Visual Slicing (3-Second Cut Rule)
  const historicalEra = scene?.historicalEra || detectHistoricalEra(cleanSubject, topicContext);
  const numCuts = Math.max(2, Math.ceil(duration / 3.0));
  const cutDuration = Number((duration / numCuts).toFixed(2));
  const cuts = ensureChapterCuts(scene, index, numCuts, cleanSubject, topicContext);

  console.info(`[Autonomous Visual Producer] 🎬 Chapter ${index + 1} (${duration.toFixed(1)}s, ${historicalEra}): Slicing into ${numCuts} dynamic cuts (~${cutDuration.toFixed(1)}s each) for "${scene?.chapterLabel || 'INVESTIGATION'}"`);

  const cutFiles: string[] = [];
  const tempFilesToClean: string[] = [];

  for (let c = 0; c < cuts.length; c++) {
    const cut = cuts[c];
    const cutNonce = `${nonce}-c${c}`;
    const cutOutPath = path.join(GENERATED_DIR, `${safeId}-sc${index}-cut${c}-${cutNonce}.mp4`);
    const cutImgPath = path.join(GENERATED_DIR, `${safeId}-sc${index}-cut${c}-${cutNonce}.jpg`);
    tempFilesToClean.push(cutOutPath, cutImgPath);

    let cutSuccess = false;
    const candidateTerms = getCutSearchTerms(
      cleanSubject,
      cut.spokenClause,
      cut.query,
      scene?.bRollKeywords || scene?.visualBeats || []
    );

    // Tier 1: Authentic Pixabay Stock Photography (Fastest, highest resolution, topic-accurate)
    if (!cutSuccess) {
      try {
        const pixRes = await fetchPixabayImageForCut(candidateTerms, cutImgPath);
        if (pixRes && fsSync.existsSync(cutImgPath) && (await fs.stat(cutImgPath)).size > 15000) {
          const animated = await animateImageToCutVideo(cutImgPath, cutDuration, c + index, cutOutPath);
          if (animated) {
            cutFiles.push(cutOutPath);
            cutSuccess = true;
            console.info(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: ✅ Pixabay photography locked ("${pixRes.title || candidateTerms[0]}").`);
          }
        }
      } catch (pixErr: any) {
        console.warn(`[Autonomous Visual Producer] Pixabay cut notice:`, pixErr?.message?.slice(0, 80));
      }
    }

    // Tier 2: Authentic Wikimedia Commons Archival Photography & Records
    if (!cutSuccess) {
      try {
        const wikiRes = await fetchWikimediaImageForCut(candidateTerms, cutImgPath, {
          usedUrls: extraOpts?.usedVideoUrls,
          usedTitles: extraOpts?.usedArchivalTitles,
          index: c + index
        });
        if (wikiRes && fsSync.existsSync(cutImgPath) && (await fs.stat(cutImgPath)).size > 15000) {
          const animated = await animateImageToCutVideo(cutImgPath, cutDuration, c + index, cutOutPath);
          if (animated) {
            cutFiles.push(cutOutPath);
            cutSuccess = true;
            console.info(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: ✅ Authentic Wikimedia archival record locked ("${wikiRes.title || candidateTerms[0]}").`);
          }
        }
      } catch (wikiErr: any) {
        console.warn(`[Autonomous Visual Producer] Wikimedia cut notice:`, wikiErr?.message?.slice(0, 80));
      }
    }

    // Tier 3: AI Pollinations FLUX + Ken Burns Zoompan (Strictly non-blocking)
    if (!cutSuccess) {
      try {
        const rawFluxPath = path.join(GENERATED_DIR, `${safeId}-raw-flux-${cutNonce}.mp4`);
        tempFilesToClean.push(rawFluxPath);
        const spokenClause = cut.spokenClause || cut.query;
        const prompt = cut.prompt || buildContextualCutPrompt(cleanSubject, topicContext, historicalEra, spokenClause, c);

        const fluxRes = await fetchAndAnimatePollinationsFluxClip(cut.query, cutDuration, c, rawFluxPath, {
          topic: cleanSubject,
          historicalEra,
          spokenClause,
          prompt,
          voiceScript: scene?.voiceScript
        });

        if (fluxRes.videoPath && fsSync.existsSync(fluxRes.videoPath)) {
          cutFiles.push(fluxRes.videoPath);
          cutSuccess = true;
          console.info(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: ✅ Context-locked AI visual cut locked.`);
        }
      } catch (fluxErr: any) {
        console.warn(`[Autonomous Visual Producer] Flux cut notice:`, fluxErr?.message?.slice(0, 80));
      }
    }

    // Tier 4: Local Archival / Stock Cache Fallback
    if (!cutSuccess) {
      try {
        const cachedImg = await findCachedArchivalImage();
        if (cachedImg) {
          await fs.copyFile(cachedImg, cutImgPath);
          const animated = await animateImageToCutVideo(cutImgPath, cutDuration, c + index, cutOutPath);
          if (animated) {
            cutFiles.push(cutOutPath);
            cutSuccess = true;
            console.info(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: ✅ Local archival cache image animated.`);
          }
        }
      } catch (cacheErr: any) {
        console.warn(`[Autonomous Visual Producer] Local cache fallback notice:`, cacheErr?.message?.slice(0, 80));
      }
    }

    // Tier 5: Procedural Visible Documentary Slate (Visible telemetry grid - NEVER PITCH BLACK!)
    if (!cutSuccess) {
      console.warn(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: Generating visible telemetry slate grid.`);
      await generateVisibleDocumentarySlate(cutDuration, accentHex, cutOutPath);
      cutFiles.push(cutOutPath);
    }
  }

  // 2. Concatenate cuts into seamless chapter background video directly to output
  const concatListPath = path.join(GENERATED_DIR, `${safeId}-concat-${index}-${nonce}.txt`);
  tempFilesToClean.push(concatListPath);

  const concatContent = cutFiles.map(f => `file '${path.resolve(f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(concatListPath, concatContent);

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    output
  ]);

  // Cleanup temporary cut files
  await Promise.allSettled(tempFilesToClean.map(f => fs.rm(f, { force: true, maxRetries: 3, retryDelay: 100 })));

  return output;
}

export async function ensureAutonomousVisualAssets(
  reel: any,
  options?: { sceneDurations?: number[] }
): Promise<{ assets: MediaAsset[]; generated: number }> {
  let scenes: any[] = [];
  if (Array.isArray(reel?.scenes) && reel.scenes.length > 0) {
    scenes = reel.scenes;
  } else if (reel?.scenes_json) {
    try {
      const parsed = typeof reel.scenes_json === 'string' ? JSON.parse(reel.scenes_json) : reel.scenes_json;
      if (Array.isArray(parsed) && parsed.length > 0) scenes = parsed;
    } catch {}
  }

  // Resilient fallback: If no scenes could be parsed from DB, synthesize a 6-chapter investigative documentary
  if (!scenes.length) {
    const rawTitle = String(reel?.title || 'The Untold Archive Secret').trim();
    const title = rawTitle
      .replace(/^(documented archival anomaly|declassified dossier|archival anomaly|case file|investigation file)[\s\:\-]+/i, '')
      .replace(/\s*\([^\)]*index[^\)]*\)/gi, '')
      .replace(/\s*\([^\)]*#\d+[^\)]*\)/gi, '')
      .replace(/:\s+.*$/, '')
      .trim() || 'This documented event';
    const caption = String(reel?.caption || '').trim();
    const cleanCaption = caption
      .split(/🗳️|Drop \[A\]|Vote below|Follow @|📌 Save|🚀 Share/i)[0]
      .replace(/#\w+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '')
      .trim();
    const captionSentences = cleanCaption.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15);
    const ensurePeriod = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

    const isOperationGenre = /operation|espionage|spy|sabotage|heist|infiltrat|military|covert|fbi|cia|pastorius/i.test(`${title} ${cleanCaption}`);

    const sc1Voice = captionSentences[0]
      ? ensurePeriod(captionSentences[0])
      : (isOperationGenre ? `Deep in declassified files lies the true story of ${title}.` : `Deep in historical records lies the documented account of ${title}.`);
    const sc2Voice = captionSentences[1]
      ? ensurePeriod(captionSentences[1])
      : (isOperationGenre ? `The covert mission was planned in extreme secrecy under wartime command.` : `Initial researchers originally recorded this as standard historical documentation.`);
    const sc3Voice = captionSentences[2]
      ? ensurePeriod(captionSentences[2])
      : (isOperationGenre ? `Then an unexpected breakdown in the field completely compromised the operation.` : `Archival investigators uncovered major contradictions in the primary record.`);
    const sc4Voice = captionSentences[3]
      ? ensurePeriod(captionSentences[3])
      : (isOperationGenre ? `A confidential confession broke the mission open and shattered official expectations.` : `Critical discoveries challenged mainstream assumptions about what occurred.`);
    const sc5Voice = captionSentences[4]
      ? ensurePeriod(captionSentences[4])
      : `Classified archives preserve details that standard history textbooks never recorded.`;
    const sc6Voice = captionSentences[5]
      ? ensurePeriod(captionSentences[5])
      : `The official records document what happened, but the full implications remain debated. Which theory do you believe?`;

    const calcSceneDur = (script: string, minSec = 7.5) => {
      const words = script.trim().split(/\s+/).filter(Boolean).length;
      return Math.max(minSec, Number(((words / 2.2) + 1.0).toFixed(1)));
    };

    const labels = isOperationGenre
      ? [
          'ARCHIVAL DOSSIER',
          'THE OPERATION',
          'TURNING POINT',
          'THE BETRAYAL',
          'CLASSIFIED COVERUP',
          'HISTORICAL VERDICT'
        ]
      : [
          'ARCHIVAL RECORD',
          'HISTORICAL ORIGIN',
          'PRIMARY INQUIRY',
          'CRITICAL EVIDENCE',
          'CLASSIFIED DOSSIER',
          'HISTORICAL VERDICT'
        ];
    const voices = [sc1Voice, sc2Voice, sc3Voice, sc4Voice, sc5Voice, sc6Voice];

    scenes = voices.map((v, i) => {
      const dur = calcSceneDur(v, 7.5);
      const numCuts = Math.max(2, Math.ceil(dur / 3.0));
      const historicalEra = detectHistoricalEra(title, v);
      const visualBeats = splitNarrationIntoVisualBeats(v, numCuts);
      const cuts = ensureChapterCuts({ voiceScript: v, historicalEra, visualBeats }, i, numCuts, title);
      return {
        id: `sc-gen-${i + 1}`,
        order: i + 1,
        chapterLabel: labels[i],
        durationSeconds: dur,
        hookText: title,
        headline: labels[i],
        highlight: labels[i],
        subline: `${title} // ${labels[i]}`,
        voiceScript: v,
        historicalEra,
        visualBeats,
        bRollKeywords: visualBeats,
        archivalQuery: title,
        imagePrompt: `Cinematic archival view of ${title}`,
        visualTheme: i % 2 === 0 ? 'minimal-dark' : 'monochrome-bold',
        accentColor: '#d4af37',
        pacingEffect: 'subtle-drift',
        visualFormat: i === 0 ? 'full-bleed-cinematic' : i === 1 ? 'classified-dossier' : 'satellite-telemetry',
        cuts
      };
    });
    reel.scenes = scenes;
  }

  const assets: MediaAsset[] = [];
  const used = new Set<string>();
  const usedVideoUrls = new Set<string>();
  const usedArchivalTitles = new Set<string>();

  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    const forcedDuration = options?.sceneDurations?.[index];
    const theme = String(scene?.visualTheme || '').toLowerCase();
    const tags = ['documentary', 'archival', 'untold-archive', ...theme.split(/[^a-z0-9]+/i).filter(Boolean).slice(0, 5)];

    // Render each chapter with dynamic 3-second cuts, dark archive grade, and sharp vector overlay
    const sourcePath = await renderGeneratedScene(scene, index, reel, {
      usedVideoUrls,
      usedArchivalTitles,
      totalScenes: scenes.length,
      forcedDuration
    });

    try {
      const generated = await registerAsset({
        type: 'video', sourcePath, category: 'autonomous-generated', tags,
        duration: forcedDuration || Math.max(2, Math.min(Number(scene?.durationSeconds || 3), 35)), width: 1080, height: 1920,
        source: 'ffmpeg-autonomous-visual-producer', prompt: sceneTitle(scene),
        mood: String(reel?.audio?.mood || 'cinematic'), camera: String(scene?.camera || 'motion-graphics'),
        metadata: { reelId: String(reel.id || ''), sceneIndex: index, visualTheme: scene?.visualTheme || null, pacingEffect: scene?.pacingEffect || null }
      });
      assets.push(generated);
      used.add(generated.id);
    } finally {
      try {
        await fs.rm(sourcePath, { force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // Non-blocking cleanup fallback on Windows
      }
    }
  }
  return { assets, generated: assets.filter(asset => asset.source === 'ffmpeg-autonomous-visual-producer').length };
}
