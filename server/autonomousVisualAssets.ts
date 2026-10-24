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
    { model: 'flux', timeoutMs: 35000, delayAfterFail: 1000 },
    { model: 'flux-realism', timeoutMs: 35000, delayAfterFail: 1200 },
    { model: 'turbo', timeoutMs: 15000, delayAfterFail: 0 }
  ];

  await acquireFluxSlot();
  try {
    for (let attempt = 0; attempt < retryModels.length; attempt++) {
      const { model, timeoutMs, delayAfterFail } = retryModels[attempt];
      const seed = Math.floor(Math.random() * 900000) + 100000;
      const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1080&height=1920&nologo=true&model=${model}&seed=${seed}`;
      const rawImagePath = path.join(rawImageDir, `flux-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`);

      try {
        console.info(`[Pollinations AI] Attempt ${attempt + 1}/3 (${model}) for: "${finalPrompt.slice(0, 75)}..."`);
        const resp = await fetch(fluxUrl, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

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
  const overlayPng = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}-overlay.png`);

  const rawHeadline = String(scene?.onScreenText || scene?.headline || scene?.hookText || sceneTitle(scene)).trim().slice(0, 72);
  const rawHighlight = String(scene?.highlight || '').trim().slice(0, 64);
  const rawSubline = String(scene?.subline || scene?.secondaryText || '').trim().slice(0, 140);

  const palette = themePalette(scene, index);
  const rawAccent = String(scene?.accentColor || palette.accent || '#d4af37').replace('#', '').trim();
  const accentHex = /^[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : palette.accent.replace('#', '');
  const badge = cleanBadgeText(reel?.verticalBadge, index).replace(/[\[\]]/g, '').trim();

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
  const DARK_GRADE_FILTER = 'eq=saturation=0.45:contrast=1.25:brightness=-0.12,vignette=PI/4';

  for (let c = 0; c < cuts.length; c++) {
    const cut = cuts[c];
    const cutNonce = `${nonce}-c${c}`;
    const cutOutPath = path.join(GENERATED_DIR, `${safeId}-sc${index}-cut${c}-${cutNonce}.mp4`);
    tempFilesToClean.push(cutOutPath);

    let cutSuccess = false;

    // A. Archival Image Beat: RESTRICTED STRICTLY TO Scene 0 Cut 0 (The Opening Hook)
    // and queried strictly with the clean subject entity name (never with scene keywords!)
    const isArchivalHook = (index === 0 && c === 0 && cut.type === 'archival_image');
    if (isArchivalHook) {
      const rawArchivalPath = path.join(GENERATED_DIR, `${safeId}-raw-archival-${cutNonce}.mp4`);
      tempFilesToClean.push(rawArchivalPath);
      try {
        const archivalRes = await fetchAndAnimateArchivalClip(cleanSubject, cutDuration, c, rawArchivalPath, {
          topic: cleanSubject,
          usedTitles: extraOpts?.usedArchivalTitles,
          usedUrls: extraOpts?.usedVideoUrls
        });

        if (archivalRes.videoPath && fsSync.existsSync(archivalRes.videoPath)) {
          // Apply unified Dark Archive color grading to the archival video cut
          await execFileAsync('ffmpeg', [
            '-y',
            '-i', archivalRes.videoPath,
            '-t', String(cutDuration),
            '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,${DARK_GRADE_FILTER},setsar=1,fps=30`,
            '-an', '-threads', '2',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
            '-pix_fmt', 'yuv420p', cutOutPath
          ]);

          if (fsSync.existsSync(cutOutPath) && (await fs.stat(cutOutPath)).size > 20000) {
            cutFiles.push(cutOutPath);
            cutSuccess = true;
            console.info(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: ✅ Authentic archival opening hook locked ("${archivalRes.title || cleanSubject}").`);
          }
        }
      } catch (archErr: any) {
        console.warn(`[Autonomous Visual Producer] Archival hook cut notice:`, archErr?.message?.slice(0, 80));
      }
    }

    // B. AI Pollinations FLUX + Ken Burns Zoompan Beat (Strictly Clause-Synced, Era-Locked Visuals)
    if (!cutSuccess) {
      const rawFluxPath = path.join(GENERATED_DIR, `${safeId}-raw-flux-${cutNonce}.mp4`);
      tempFilesToClean.push(rawFluxPath);
      try {
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
          // Apply unified Dark Archive color grading to the AI-generated visual cut
          await execFileAsync('ffmpeg', [
            '-y',
            '-i', fluxRes.videoPath,
            '-t', String(cutDuration),
            '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,${DARK_GRADE_FILTER},setsar=1,fps=30`,
            '-an', '-threads', '2',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
            '-pix_fmt', 'yuv420p', cutOutPath
          ]);

          if (fsSync.existsSync(cutOutPath) && (await fs.stat(cutOutPath)).size > 20000) {
            cutFiles.push(cutOutPath);
            cutSuccess = true;
            console.info(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: ✅ Context-locked AI visual cut locked.`);
          }
        }
      } catch (fluxErr: any) {
        console.warn(`[Autonomous Visual Producer] Flux cut ${c + 1} notice:`, fluxErr?.message?.slice(0, 80));
      }
    }

    // C. Procedural Dark Gradient if Pollinations AI retries fail
    // (Completely eliminates Pexels/Pixabay and generic stock footage fallbacks)
    if (!cutSuccess) {
      console.warn(`[Autonomous Visual Producer] Cut ${c + 1}/${numCuts}: Generating dark archival procedural gradient fallback.`);
      const bgHex = palette.bg.replace('#', '0x');
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', `gradients=s=1080x1920:c0=${bgHex}:c1=0x06070a:x0=0:y0=0:x1=1080:y1=1920`,
        '-t', String(cutDuration),
        '-vf', `${DARK_GRADE_FILTER},setsar=1,fps=30`,
        '-an', '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
        '-pix_fmt', 'yuv420p', cutOutPath
      ]);
      cutFiles.push(cutOutPath);
    }
  }

  // 2. Concatenate cuts into seamless chapter background video
  const chapterBgPath = path.join(GENERATED_DIR, `${safeId}-chapter-bg-${index}-${nonce}.mp4`);
  tempFilesToClean.push(chapterBgPath);

  const concatListPath = path.join(GENERATED_DIR, `${safeId}-concat-${index}-${nonce}.txt`);
  tempFilesToClean.push(concatListPath);

  const concatContent = cutFiles.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(concatListPath, concatContent);

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    chapterBgPath
  ]);

  // 3. Render HUD Overlay (Preserves exact UI/HUD: Top capsule/progress bar, Bottom chapter label bar)
  const totalScenes = Math.max(1, extraOpts?.totalScenes || reel?.scenes?.length || 5);
  const defaultChapterLabels = [
    'ARCHIVAL RECORD',
    'HISTORICAL ORIGIN',
    'PRIMARY ANALYSIS',
    'FORENSIC EVIDENCE',
    'CLASSIFIED ANOMALY',
    'UNSOLVED RESOLUTION'
  ];
  const chapterLabel = scene?.chapterLabel || defaultChapterLabels[index] || 'INVESTIGATION FILE';
  const subjectPrefix = cleanSubject.toUpperCase().slice(0, 28);
  const dwellText = `${subjectPrefix} // ${chapterLabel}`;

  const template = index === 0 ? 'full-bleed-cinematic' : index === 1 ? 'classified-dossier' : 'satellite-telemetry';

  await renderOverlayToPng({
    badge,
    headline: rawHeadline,
    highlight: rawHighlight,
    subline: rawSubline,
    dwellText,
    accentColor: `#${accentHex}`,
    progressPercent: Math.round(((index + 1) / totalScenes) * 100),
    branding: persona.brand || 'THE UNTOLD ARCHIVE',
    template,
    interactiveWidget: scene.interactiveWidget
  }, overlayPng);

  // 4. Composite HUD Overlay on top of the graded cuts (Overlay stays 100% full brightness!)
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', chapterBgPath,
    '-loop', '1', '-i', overlayPng,
    '-t', String(duration),
    '-filter_complex', '[0:v]setsar=1[bg];[bg][1:v]overlay=0:0[v]',
    '-map', '[v]',
    '-an', '-r', '30',
    '-threads', '2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
  ]);

  // Cleanup temporary cut files
  await Promise.allSettled(tempFilesToClean.map(f => fs.rm(f, { force: true, maxRetries: 3, retryDelay: 100 })));
  await fs.rm(overlayPng, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});

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
