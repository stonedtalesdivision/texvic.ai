import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import { promisify } from 'node:util';
import { registerAsset, selectAssets, type MediaAsset } from './assetLibrary.js';
import { renderOverlayToPng } from './vectorOverlayEngine.js';
import { fetchBestFreeVisual } from './freeStockAssets.js';
import { fetchBestMotionVideo } from './motionVideoEngine.js';
import { fetchWikimediaArchivalImage } from './archivalMediaEngine.js';
import { renderSoftwareTutorialVideo } from './softwareScreenEngine.js';
import { getActivePersona } from './themePage.js';

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
  const seed = hashNumber(JSON.stringify({ theme: scene?.visualTheme || '', hook: scene?.hookText || '', index }));
  const hue = seed % 360;
  const accentHue = (hue + 42 + index * 17) % 360;
  return { bg: hueToHex(hue, 55, 8), accent: hueToHex(accentHue, 85, 62) };
}

function sceneTitle(scene: any): string {
  return String(scene?.hookText || scene?.secondaryText || scene?.visualTheme || 'SARLX.AI').trim().slice(0, 72);
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

async function renderGeneratedScene(scene: any, index: number, reel: any): Promise<string> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const duration = Math.max(3, Math.min(Number(scene?.durationSeconds || 8), 25));
  const safeId = String(reel?.id || 'autonomous').replace(/[^a-zA-Z0-9_-]/g, '-');
  const nonce = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const output = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.mp4`);
  const imagePath = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.png`);
  const overlayPng = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}-overlay.png`);

  const rawHeadline = String(scene?.headline || scene?.hookText || sceneTitle(scene) || 'SARLX.AI').trim().slice(0, 72);
  const rawHighlight = String(scene?.highlight || '').trim().slice(0, 64);
  const rawSubline = String(scene?.subline || scene?.secondaryText || '').trim().slice(0, 140);

  const seed = hashNumber(JSON.stringify({ theme: scene?.visualTheme || '', hook: scene?.hookText || '', index }));
  const palette = themePalette(scene, index);
  const rawAccent = String(scene?.accentColor || palette.accent || '#38bdf8').replace('#', '').trim();
  const accentHex = /^[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : palette.accent.replace('#', '');
  const badge = cleanBadgeText(reel?.verticalBadge, index).replace(/[\[\]]/g, '').trim();

  const driftDirection = index % 2 === 0 ? '-' : '+';
  const motionVideoPath = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}-motion.mp4`);
  let hasMotionVideo = false;
  let hasCustomImage = false;

  const persona = getActivePersona();
  const topicContext = `${reel?.title || ''} ${reel?.niche || ''} ${scene?.headline || ''} ${scene?.subline || ''}`;
  const isSoftwareNiche = /software|programming|developer|coding|web dev|ai tools/i.test(String(reel?.niche || persona.niche || ''));
  const isPhysicalHardware = /humanoid|boston dynamics|physical robot|quadruped|drone flight|hardware chip fabrication|battery breakthrough/i.test(topicContext);
  const isExplicitTool = /suno|udio|canva|photoshop|figma|luma|kling|runway|sora|pika|cursor|windsurf|deepseek|claude|chatgpt|v0|bolt|flux|midjourney|recraft|elevenlabs/i.test(topicContext);

  // 0. Direct Source Visual (e.g. from Carousel Slide to Reel Conversion)
  if (scene?.sourceImagePath && fsSync.existsSync(scene.sourceImagePath)) {
    try {
      await fs.copyFile(scene.sourceImagePath, imagePath);
      hasCustomImage = true;
      console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Locked source slide graphic "${path.basename(scene.sourceImagePath)}".`);
    } catch {}
  }

  const preferSoftwareScreen = isSoftwareNiche && !isPhysicalHardware && isExplicitTool && index === 1;
  if (preferSoftwareScreen && !hasCustomImage) {
    try {
      console.info(`[Autonomous Visual Producer] Producing real software studio video (scene ${index + 1}): "${rawHeadline.slice(0, 50)}"...`);
      await renderSoftwareTutorialVideo(scene, index, reel, output, duration);
      if (fsSync.existsSync(output) && (await fs.stat(output)).size > 50000) {
        console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Real software studio video ready (${(await fs.stat(output)).size} bytes).`);
        return output;
      }
    } catch (tutErr: any) {
      console.warn(`[Autonomous Visual Producer] Software studio render error, falling back to documentary visual engine:`, tutErr?.message || tutErr);
    }
  }

  // 1. Primary Archival Media Engine: Search Wikimedia Commons for real historical records/photos
  const archivalQuery = String(scene?.archivalQuery || '').trim();
  const shouldTryArchival = Boolean(archivalQuery) || (
    /history|heist|mystery|incident|disaster|ancient|classified|expedition|bunker|island|vault|war|treaty|monument|manuscript|borehole|ocean/i.test(topicContext) && (index === 1 || Boolean(scene?.archivalQuery))
  );

  if (shouldTryArchival) {
    try {
      const targetQuery = archivalQuery || [rawHeadline, reel?.title].filter(Boolean).join(' ');
      console.info(`[Autonomous Visual Producer] 🏛️ Resolving authentic archival record (scene ${index + 1}): "${targetQuery.slice(0, 50)}"...`);
      const archivalResult = await fetchWikimediaArchivalImage(targetQuery);
      if (archivalResult?.filePath && fsSync.existsSync(archivalResult.filePath)) {
        const aStats = await fs.stat(archivalResult.filePath);
        if (aStats.size > 25000) {
          await fs.copyFile(archivalResult.filePath, imagePath);
          hasCustomImage = true;
          console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Authentic archival document locked from Wikimedia Commons (${aStats.size} bytes).`);
        }
      }
    } catch (archErr: any) {
      console.info(`[Autonomous Visual Producer] Archival lookup skipped: ${archErr?.message?.slice(0, 80) || String(archErr)}`);
    }
  }

  // 2. Authentic Motion Video Footage: Pexels Video API, Pixabay, or Local Vault
  if (!hasCustomImage) {
    try {
      const topic = String(reel?.title || reel?.niche || 'cinematic documentary').trim();
      const customKeywords = Array.isArray(scene?.bRollKeywords) && scene.bRollKeywords.length > 0
        ? scene.bRollKeywords
        : undefined;

      const motionQuery = [
        rawHeadline,
        topic,
        scene?.imagePrompt || scene?.visualTheme || 'cinematic documentary aerial footage'
      ].filter(Boolean).join(' ');

      console.info(`[Autonomous Visual Producer] Resolving real motion B-roll video (scene ${index + 1}): "${rawHeadline.slice(0, 50)}"...`);
      const motionResult = await fetchBestMotionVideo(motionQuery, motionVideoPath, {
        targetDuration: duration,
        customKeywords
      });
      if (motionResult?.source !== 'fallback' && fsSync.existsSync(motionVideoPath)) {
        const vStats = await fs.stat(motionVideoPath);
        if (vStats.size > 50000) {
          hasMotionVideo = true;
          console.info(`[Autonomous Visual Producer] Scene ${index + 1}: Real motion B-roll ready via ${motionResult.source} (${vStats.size} bytes).`);
        }
      }
    } catch (err: any) {
      console.info(`[Autonomous Visual Producer] Motion video fetch skipped: ${err?.message?.slice(0, 100) || String(err)}`);
    }
  }

  // 3. High-Resolution Photographic Visual (Pollinations FLUX.1 / Stock Engine) if motion video is not found
  if (!hasMotionVideo && !hasCustomImage) {
    try {
      const topic = String(reel?.title || reel?.niche || 'cinematic documentary').trim();
      const query = [
        rawHeadline,
        topic,
        scene?.imagePrompt || scene?.visualTheme || 'cinematic 35mm documentary photography'
      ].filter(Boolean).join(', ');

      console.info(`[Autonomous Visual Producer] Fetching best free visual (scene ${index + 1}): "${rawHeadline.slice(0, 50)}"...`);
      const freeVisual = await fetchBestFreeVisual(query, imagePath, {
        orientation: 'portrait',
        preferStock: true
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

  // 4. Gemini Image API fallback
  if (!hasCustomImage && !hasMotionVideo && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    try {
      const topic = String(reel?.title || reel?.niche || 'Untold World Mystery');
      const visualPrompt = [
        'Create a premium vertical 9:16 cinematic documentary visual for an educational Instagram Reel.',
        `Topic: ${topic}.`,
        `Scene concept: ${rawHeadline}.`,
        'Atmospheric 35mm film photograph, dramatic lighting, authentic historical realism, cinematic depth of field.',
        'Do not render any text, words, captions, logos, or watermarks.',
        'Leave clean composition in the center third for overlay graphics.'
      ].join(' ');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: visualPrompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: '9:16',
            imageSize: '1K'
          }
        }
      });

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((part: any) => part?.inlineData?.data);
      if (imagePart?.inlineData?.data) {
        await fs.writeFile(imagePath, Buffer.from(imagePart.inlineData.data, 'base64'));
        hasCustomImage = true;
      }
    } catch (err: any) {
      console.info(`[Autonomous Visual Producer] Gemini image generation fallback triggered: ${err?.message?.slice(0, 140) || String(err)}`);
    }
  }

  try {
    const totalScenes = Math.max(1, reel?.scenes?.length || 3);
    const requestedFormat = scene?.visualFormat || scene?.visualTemplate;
    const validFormats = ['full-bleed-cinematic', 'classified-dossier', 'satellite-telemetry', 'lower-third', 'split-screen', 'pause-challenge'];
    let template: 'full-bleed-cinematic' | 'classified-dossier' | 'satellite-telemetry' | 'lower-third' | 'split-screen' | 'pause-challenge';

    if (requestedFormat && validFormats.includes(requestedFormat)) {
      template = requestedFormat as any;
    } else if (scene?.interactiveWidget?.type === 'pause-challenge') {
      template = 'pause-challenge';
    } else {
      // Dynamic sequence rotation for viral retention:
      // Scene 1: Full-Bleed 4K Cinema Hook
      // Scene 2: 0.5s Pause Challenge / Classified Dossier Investigation
      // Scene 3: Satellite Telemetry Investigative Cross-Examination / Pinned Poll Direction
      template = index === 0 ? 'full-bleed-cinematic' : index === 1 ? 'pause-challenge' : 'satellite-telemetry';
    }

    const dwellText = template === 'pause-challenge'
      ? '🔍 Pause at 0:04 and comment what you spotted in the document'
      : index === 0
      ? '📌 Save this archive file before starting your research'
      : index === 1
      ? `🔥 Follow ${persona.handle} for untold declassified cases`
      : '🗳️ Vote in the pinned poll below & drop your theory 📜';

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

    if (template === 'split-screen') {
      // 2-Tier Split-Screen: Top 1080x960 (Primary visual), Bottom 1080x960 (Kinetic B-Roll loop)
      const topInput = hasMotionVideo ? motionVideoPath : (hasCustomImage ? imagePath : null);
      const bgHex = palette.bg.replace('#', '0x');
      const bottomInput = `gradients=s=1080x960:c0=${bgHex}:c1=0x030712:x0=0:y0=0:x1=1080:y1=960`;

      if (topInput && hasMotionVideo) {
        await execFileAsync('ffmpeg', [
          '-y',
          '-stream_loop', '-1', '-i', topInput,
          '-f', 'lavfi', '-i', bottomInput,
          '-loop', '1', '-i', overlayPng,
          '-t', String(duration),
          '-filter_complex',
          '[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(in_w-1080)/2:(in_h-960)/2,fps=30[top];' +
          '[1:v]fps=30[bot];' +
          '[top][bot]vstack[stacked];' +
          '[stacked][2:v]overlay=0:0[v]',
          '-map', '[v]',
          '-an', '-r', '30',
          '-threads', '2',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
        ], { maxBuffer: 1024 * 1024 * 8 });
      } else if (topInput && hasCustomImage) {
        await execFileAsync('ffmpeg', [
          '-y',
          '-loop', '1', '-i', topInput,
          '-f', 'lavfi', '-i', bottomInput,
          '-loop', '1', '-i', overlayPng,
          '-t', String(duration),
          '-filter_complex',
          `[0:v]scale=1200:1066:force_original_aspect_ratio=increase,crop=1080:960:(in_w-1080)/2:(in_h-960)/2 ${driftDirection} (t*10)[top];` +
          `[1:v]fps=30[bot];` +
          `[top][bot]vstack[stacked];` +
          `[stacked][2:v]overlay=0:0[v]`,
          '-map', '[v]',
          '-an', '-r', '30',
          '-threads', '2',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
        ], { maxBuffer: 1024 * 1024 * 8 });
      } else {
        await execFileAsync('ffmpeg', [
          '-y',
          '-f', 'lavfi', '-i', `gradients=s=1080x960:c0=0x0a192f:c1=0x020c1b:x0=0:y0=0:x1=1080:y1=960`,
          '-f', 'lavfi', '-i', bottomInput,
          '-loop', '1', '-i', overlayPng,
          '-t', String(duration),
          '-filter_complex',
          '[0:v]fps=30[top];' +
          '[1:v]fps=30[bot];' +
          '[top][bot]vstack[stacked];' +
          '[stacked][2:v]overlay=0:0[v]',
          '-map', '[v]',
          '-an', '-r', '30',
          '-threads', '2',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
        ], { maxBuffer: 1024 * 1024 * 8 });
      }
    } else if (hasMotionVideo) {
      // REAL MOVING VIDEO BACKGROUND composited with Sharp SVG overlay in 1 fast pass!
      await execFileAsync('ffmpeg', [
        '-y',
        '-stream_loop', '-1', '-i', motionVideoPath,
        '-loop', '1', '-i', overlayPng,
        '-t', String(duration),
        '-filter_complex',
        '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,fps=30[bg];' +
        '[bg][1:v]overlay=0:0[v]',
        '-map', '[v]',
        '-an', '-r', '30',
        '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
      ], { maxBuffer: 1024 * 1024 * 8 });
    } else if (hasCustomImage) {
      // Dynamic camera drift with Sharp SVG overlay in 1 fast pass
      await execFileAsync('ffmpeg', [
        '-y',
        '-loop', '1', '-i', imagePath,
        '-loop', '1', '-i', overlayPng,
        '-t', String(duration),
        '-filter_complex',
        `[0:v]scale=1200:2133:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2 ${driftDirection} (t*14)[bg];` +
        `[bg][1:v]overlay=0:0[v]`,
        '-map', '[v]',
        '-an', '-r', '30',
        '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
      ], { maxBuffer: 1024 * 1024 * 8 });
    } else {
      // Procedural animated gradient with Sharp SVG overlay
      const bgHex = palette.bg.replace('#', '0x');
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', `gradients=s=1080x1920:c0=${bgHex}:c1=0x0a0a16:x0=0:y0=0:x1=1080:y1=1920`,
        '-loop', '1', '-i', overlayPng,
        '-t', String(duration),
        '-filter_complex', '[0:v][1:v]overlay=0:0[v]',
        '-map', '[v]',
        '-an', '-r', '30',
        '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
      ], { maxBuffer: 1024 * 1024 * 8 });
    }

    return output;
  } finally {
    await Promise.allSettled([
      fs.rm(motionVideoPath, { force: true, maxRetries: 3, retryDelay: 100 }),
      fs.rm(imagePath, { force: true, maxRetries: 3, retryDelay: 100 }),
      fs.rm(overlayPng, { force: true, maxRetries: 3, retryDelay: 100 })
    ]);
  }
}

export async function ensureAutonomousVisualAssets(reel: any): Promise<{ assets: MediaAsset[]; generated: number }> {
  const scenes = Array.isArray(reel?.scenes) ? reel.scenes : [];
  if (!scenes.length) return { assets: [], generated: 0 };
  const assets: MediaAsset[] = [];
  const used = new Set<string>();
  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    const theme = String(scene?.visualTheme || '').toLowerCase();
    const tags = ['documentary', 'archival', 'untold-archive', ...theme.split(/[^a-z0-9]+/i).filter(Boolean).slice(0, 5)];
    // Render each scene with fresh contextual archival/motion media and sharp vector overlay
    const sourcePath = await renderGeneratedScene(scene, index, reel);
    try {
      const generated = await registerAsset({
        type: 'video', sourcePath, category: 'autonomous-generated', tags,
        duration: Math.max(2, Math.min(Number(scene?.durationSeconds || 3), 12)), width: 1080, height: 1920,
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
