import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerAsset, selectAssets, resolveAssetDiskPath, markAssetUsed, type MediaAsset } from './assetLibrary.js';
import { renderSoftwareTutorialVideo } from './softwareScreenEngine.js';
import { getActivePersona } from './themePage.js';
import { fetchBestMotionVideo } from './motionVideoEngine.js';
import { fetchWikimediaArchivalImage, fetchAndAnimateArchivalClip } from './archivalMediaEngine.js';
import { fetchBestFreeVisual } from './freeStockAssets.js';
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

/**
 * Procedural Visible Documentary Slate (Visible telemetry grid - NEVER PITCH BLACK!)
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

/**
 * Renders an authentic documentary scene visual using the resilient multi-tier pipeline:
 * Tier 1: Real script-connected vertical motion video footage (Pexels / Pixabay)
 * Tier 2: Authentic verified historical records & photography from Wikimedia Commons (Ken Burns zoompan)
 * Tier 3: High-resolution stock photography (Pixabay / Pexels Photo API via fetchBestFreeVisual)
 * Tier 4: Procedural visible telemetry documentary slate
 */
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
  const imagePath = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.png`);
  const motionVideoPath = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}-motion.mp4`);

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

  let hasMotionVideo = false;
  let hasCustomImage = false;

  // 0. Direct Source Visual (e.g. from Carousel Slide to Reel Conversion)
  if (scene?.sourceImagePath && fsSync.existsSync(scene.sourceImagePath)) {
    try {
      await fs.copyFile(scene.sourceImagePath, imagePath);
      hasCustomImage = true;
      console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Locked source slide graphic "${path.basename(scene.sourceImagePath)}".`);
    } catch {}
  }

  // 0b. Escape Hatch: Software Screen Tutorial if explicitly requested
  const preferSoftwareScreen = isSoftwareNiche && !isPhysicalHardware && isExplicitTool && index === 1;
  if (preferSoftwareScreen && !hasCustomImage) {
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

  // 1. PRIMARY: Authentic Motion Video Footage from Pixabay / Pexels / Vault (Connected directly to voiceScript!)
  const topic = String(reel?.title || reel?.niche || 'cinematic documentary').trim();
  const voiceScript = String(scene?.voiceScript || scene?.narrationText || scene?.text || '').trim();

  let customKeywords = Array.isArray(scene?.bRollKeywords) && scene.bRollKeywords.length > 0
    ? scene.bRollKeywords
    : (Array.isArray(scene?.visualBeats) && scene.visualBeats.length > 0 ? scene.visualBeats : undefined);

  if (!customKeywords && (scene?.highlight || rawHeadline || reel?.title)) {
    const candidateWords = [scene?.highlight, rawHeadline, reel?.title].filter(Boolean)
      .join(' ')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !/^(this|that|with|from|have|will|your|about|what|when|where|scene|video|ultra|stop)$/i.test(w));
    if (candidateWords.length > 0) {
      customKeywords = candidateWords.slice(0, 4);
    }
  }

  const motionQuery = [
    voiceScript.slice(0, 80),
    rawHeadline,
    cleanSubject || topic
  ].filter(Boolean).join(' ');

  console.info(`[Autonomous Visual Producer] 🎬 Resolving script-connected motion video (scene ${index + 1}): "${rawHeadline.slice(0, 45)}"...`);
  try {
    const motionResult = await fetchBestMotionVideo(motionQuery, motionVideoPath, {
      targetDuration: duration,
      customKeywords,
      voiceScript,
      topic: cleanSubject || topic,
      sceneIndex: index,
      usedUrls: extraOpts?.usedVideoUrls
    });
    if (motionResult?.source !== 'fallback' && fsSync.existsSync(motionVideoPath)) {
      const vStats = await fs.stat(motionVideoPath);
      if (vStats.size > 50000) {
        hasMotionVideo = true;
        console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Real motion B-roll video ready via ${motionResult.source} (${vStats.size} bytes).`);
      }
    }
  } catch (err: any) {
    console.info(`[Autonomous Visual Producer] Motion video fetch skipped: ${err?.message?.slice(0, 100) || String(err)}`);
  }

  // 2. SECONDARY: Authentic Verified Archival Media (Wikimedia Commons)
  if (!hasMotionVideo && !hasCustomImage) {
    const archivalQuery = String(scene?.archivalQuery || '').trim();
    const shouldTryArchival = Boolean(archivalQuery) || (
      /history|heist|mystery|incident|disaster|ancient|classified|expedition|bunker|island|vault|war|treaty|monument|manuscript|borehole|ocean|event|conspiracy|discovery|archive/i.test(topicContext)
    );

    if (shouldTryArchival) {
      try {
        const targetQuery = archivalQuery || cleanSubject || rawHeadline;
        const fallbackList = [cleanSubject, ...(Array.isArray(scene?.bRollKeywords) ? scene.bRollKeywords : (Array.isArray(scene?.visualBeats) ? scene.visualBeats : []))].filter(Boolean);
        console.info(`[Autonomous Visual Producer] 🏛️ Resolving verified archival record (scene ${index + 1}): "${targetQuery.slice(0, 50)}"...`);
        const archivalResult = await fetchWikimediaArchivalImage(targetQuery, {
          fallbackTerms: fallbackList,
          usedUrls: extraOpts?.usedVideoUrls,
          usedTitles: extraOpts?.usedArchivalTitles,
          index
        });
        if (archivalResult?.filePath && fsSync.existsSync(archivalResult.filePath)) {
          const aStats = await fs.stat(archivalResult.filePath);
          if (aStats.size > 25000) {
            await fs.copyFile(archivalResult.filePath, imagePath);
            hasCustomImage = true;
            console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Authentic archival document locked from Wikimedia Commons (${aStats.size} bytes): "${archivalResult.title}".`);
          }
        }
      } catch (archErr: any) {
        console.info(`[Autonomous Visual Producer] Archival lookup skipped: ${archErr?.message?.slice(0, 80) || String(archErr)}`);
      }
    }
  }

  // 3. User-Uploaded VPS Background Video Priority Check
  if (!hasMotionVideo && !hasCustomImage) {
    try {
      const customBackgrounds = selectAssets({ type: 'video', category: 'custom-background', limit: 10 });
      const userVideos = customBackgrounds.length > 0
        ? customBackgrounds
        : selectAssets({ type: 'video', category: 'b-roll', limit: 10 });

      if (userVideos.length > 0) {
        const chosen = userVideos[index % userVideos.length];
        const diskPath = resolveAssetDiskPath(chosen);
        if (diskPath && fsSync.existsSync(diskPath)) {
          await fs.copyFile(diskPath, motionVideoPath);
          const vStats = await fs.stat(motionVideoPath);
          if (vStats.size > 20000) {
            hasMotionVideo = true;
            markAssetUsed(chosen.id, reel?.id || 'reel', index + 1);
            console.info(`[Autonomous Visual Producer] 🎬 Scene ${index + 1}: Prioritizing user-uploaded background video "${chosen.filename}".`);
          }
        }
      }
    } catch (userVidErr: any) {
      console.warn(`[Autonomous Visual Producer] User video selection notice:`, userVidErr?.message || userVidErr);
    }
  }

  // 4. TERTIARY: High-Resolution Topic-Specific Photographic Visual (Pixabay Photo API / Pexels via fetchBestFreeVisual)
  if (!hasMotionVideo && !hasCustomImage) {
    try {
      const topic = String(reel?.title || reel?.niche || 'cinematic documentary').trim();
      const query = [
        rawHeadline,
        cleanSubject || topic,
        scene?.imagePrompt || scene?.visualTheme || 'cinematic 35mm documentary photography'
      ].filter(Boolean).join(', ');

      console.info(`[Autonomous Visual Producer] Fetching best free visual (scene ${index + 1}): "${rawHeadline.slice(0, 50)}"...`);
      const freeVisual = await fetchBestFreeVisual(query, imagePath, {
        orientation: 'portrait',
        preferStock: true,
        customKeywords: scene?.bRollKeywords || scene?.visualBeats,
        fallbackTopic: cleanSubject || topic
      });

      if (freeVisual?.path && fsSync.existsSync(imagePath)) {
        const stats = await fs.stat(imagePath);
        if (stats.size > 10000) {
          hasCustomImage = true;
          console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Visual ready via ${freeVisual.source} (${stats.size} bytes).`);
        }
      }
    } catch (err: any) {
      console.info(`[Autonomous Visual Producer] Free visual engine fallback triggered: ${err?.message?.slice(0, 100) || String(err)}`);
    }
  }

  // 5. Render Scene Video with unified Dark Archive 35mm grade (1080x1920 @ 30fps)
  const DARK_GRADE = 'eq=saturation=0.55:contrast=1.20:brightness=-0.08,vignette=PI/4,noise=alls=6:allf=t';

  try {
    if (hasMotionVideo) {
      // Real moving video footage scaled, cropped, graded, and trimmed to exact duration
      await execFileAsync('ffmpeg', [
        '-y',
        '-stream_loop', '-1', '-i', motionVideoPath,
        '-t', String(duration),
        '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,${DARK_GRADE},setsar=1,fps=30`,
        '-an', '-r', '30',
        '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
      ], { maxBuffer: 1024 * 1024 * 8 });
    } else if (hasCustomImage) {
      // Dynamic authentic Ken Burns camera animations for archival document or photo
      const cameraType = index % 3;
      let zoomFilter = '';
      if (cameraType === 0) {
        zoomFilter = `scale=1200:2133:force_original_aspect_ratio=increase,crop=1200:2133,zoompan=z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,${DARK_GRADE},setsar=1`;
      } else if (cameraType === 1) {
        zoomFilter = `scale=1200:2133:force_original_aspect_ratio=increase,crop=1200:2133,zoompan=z='max(1.25-0.0015*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,${DARK_GRADE},setsar=1`;
      } else {
        zoomFilter = `scale=1280:2276:force_original_aspect_ratio=increase,crop=1280:2276,zoompan=z=1.12:x='if(lte(on,1),(iw-iw/zoom)/2,x+0.8)':y='(ih-ih/zoom)/2':d=1:s=1080x1920:fps=30,${DARK_GRADE},setsar=1`;
      }

      await execFileAsync('ffmpeg', [
        '-y',
        '-loop', '1', '-i', imagePath,
        '-t', String(duration),
        '-vf', zoomFilter,
        '-an', '-r', '30',
        '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
      ], { maxBuffer: 1024 * 1024 * 8 });
    } else {
      // Procedural visible telemetry documentary slate (never pitch black)
      await generateVisibleDocumentarySlate(duration, accentHex, output);
    }

    return output;
  } finally {
    await Promise.allSettled([
      fs.rm(motionVideoPath, { force: true, maxRetries: 3, retryDelay: 100 }),
      fs.rm(imagePath, { force: true, maxRetries: 3, retryDelay: 100 })
    ]);
  }
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

    // Render each chapter visual with authentic motion video footage or archival Ken Burns animation
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
