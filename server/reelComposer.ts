import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './database.js';
import { getAsset, markAssetUsed, selectAssets } from './assetLibrary.js';
import { generateKineticAssSubtitles, type TimedSceneNarration } from './kineticSubtitleEngine.js';
import { composeCinematicAudio } from './cinematicAudioEngine.js';
import { composeWithHyperframes } from './hyperframesCompositor.js';
import { renderOverlayToPng } from './vectorOverlayEngine.js';
import { getActivePersona } from './themePage.js';

export interface ReelScene {
  assetId: string;
  duration: number;
  speechDuration?: number;
  audioDuration?: number;
  words?: any[];
  crop?: 'center' | 'left' | 'right';
  zoom?: number;
  speed?: number;
  transition?: 'cut' | 'fade';
  text?: string;
  narrationText?: string;
  voiceScript?: string;
  voiceText?: string;
  chapterLabel?: string;
  headline?: string;
  highlight?: string;
  subline?: string;
}

export interface ReelComposition {
  reelId: string;
  scenes: ReelScene[];
  voicePath?: string;
  musicPath?: string;
  subtitlesPath?: string;
  outputPath?: string;
  width?: number;
  height?: number;
  fps?: number;
  accentColor?: string;
  verticalBadge?: string;
}

const COMPOSER_DIR = path.join(process.cwd(), 'data', 'media', 'composed');

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-3000)}`)));
  });
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * State-of-the-art Reel Composer (Option A Architecture):
 * - Word-by-word kinetic karaoke subtitles (.ass) with dynamic golden highlights
 * - Broadcast audio mastering: Sidechain compression music ducking + Sub-bass impact + Cut whooshes
 * - Cinematic 35mm film grading (contrast, saturation, subtle vignette)
 */
export async function composeReel(input: ReelComposition): Promise<{ outputPath: string; reelId: string; scenes: ReelScene[] }> {
  if (!input.scenes.length) throw new Error('At least one scene is required.');
  await fs.mkdir(COMPOSER_DIR, { recursive: true });

  const resolved = input.scenes.map(scene => {
    const asset = getAsset(scene.assetId);
    if (!asset) throw new Error(`Asset not found: ${scene.assetId}`);
    if (asset.type !== 'video') throw new Error(`Asset is not a video: ${scene.assetId}`);
    return { scene, asset };
  });

  const workDir = path.join(COMPOSER_DIR, `work-${input.reelId}-${crypto.randomBytes(3).toString('hex')}`);
  await fs.mkdir(workDir, { recursive: true });

  let reelRecord: any = null;
  try {
    reelRecord = db.prepare('SELECT title, niche FROM reels WHERE id = ?').get(input.reelId) as any;
  } catch {}

  const persona = getActivePersona();
  const verticalBadge = (input.verticalBadge || reelRecord?.niche || persona.vertical_badge || 'UNTOLD EVENTS')
    .replace(/[\[\]]/g, '')
    .trim()
    .toUpperCase();
  const branding = persona.brand || 'The Untold Archive';
  const cleanSubject = String(reelRecord?.title || 'HISTORICAL EVENT')
    .replace(/^(documented archival anomaly|declassified dossier|archival anomaly|case file|investigation file)[\s\:\-]+/i, '')
    .split(/[:\-\—\(]/)[0]
    .trim()
    .toUpperCase();
  const accentHex = input.accentColor || '#d4af37';

  const normalized: string[] = [];
  const sceneCutTimestamps: number[] = [];
  const sceneIntervals: Array<{ start: number; end: number; chapterLabel: string }> = [];
  const hudPngs: string[] = [];
  let runningTime = 0;

  try {
    // 1. Process and normalize each scene video track
    for (let i = 0; i < resolved.length; i++) {
      const { scene, asset } = resolved[i];
      const output = path.join(workDir, `scene-${i}.mp4`);
      const sceneStart = runningTime;
      const sceneDur = Math.max(0.5, scene.duration);
      const sceneEnd = sceneStart + sceneDur;
      sceneCutTimestamps.push(sceneStart);
      runningTime += sceneDur;

      const chapterLabel = (scene as any).chapterLabel || `PART 0${i + 1}`;
      sceneIntervals.push({ start: sceneStart, end: sceneEnd, chapterLabel });

      // Pre-render transparent HUD overlay plate for scene
      const dwellText = `${cleanSubject} // ${chapterLabel}`;
      const hudPng = path.join(workDir, `hud-${i}.png`);
      try {
        await renderOverlayToPng({
          badge: verticalBadge,
          branding,
          dwellText,
          accentColor: accentHex,
          hideProgressBar: true,
          headline: '',
          highlight: '',
          subline: ''
        }, hudPng);
        hudPngs.push(hudPng);
      } catch (hudErr) {
        console.warn(`[Reel Composer] Notice generating scene ${i} HUD plate:`, hudErr);
      }
      
      const isFullVertical = (asset.width === 1080 && asset.height === 1920) || asset.source === 'ffmpeg-autonomous-visual-producer';
      const vf: string[] = [];

      if (isFullVertical) {
        vf.push('scale=1080:1920:force_original_aspect_ratio=decrease');
        vf.push('pad=1080:1920:(ow-iw)/2:(oh-ih)/2');
      } else {
        const zoom = Math.max(1, Math.min(scene.zoom || 1, 1.25));
        const cropX = scene.crop === 'left' ? '0' : scene.crop === 'right' ? 'in_w-1080' : '(in_w-1080)/2';
        const cropY = '(in_h-1920)/2';
        vf.push(`scale=ceil(1080*${zoom}/2)*2:ceil(1920*${zoom}/2)*2:force_original_aspect_ratio=increase`);
        vf.push(`crop=1080:1920:${cropX}:${cropY}`);
      }
      vf.push('setsar=1');

      // For non-autonomous footage, apply unified Dark Archive grade (autonomous clips already graded before HUD)
      if (!isFullVertical) {
        vf.push('eq=saturation=0.45:contrast=1.25:brightness=-0.12');
        vf.push('vignette=PI/4');
      }

      const filters = [
        `setpts=PTS/${Math.max(0.25, Math.min(scene.speed || 1, 2))}`,
        ...vf
      ];

      await run('ffmpeg', [
        '-y', '-stream_loop', '-1', '-i', asset.file_path,
        '-t', String(sceneDur),
        '-vf', filters.join(','),
        '-an', '-r', String(input.fps || 30),
        '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
        '-pix_fmt', 'yuv420p', output
      ]);
      normalized.push(output);

      markAssetUsed(asset.id, input.reelId, i + 1, {
        crop: isFullVertical ? 'center' : (scene.crop || 'center'),
        zoom: isFullVertical ? 1 : (scene.zoom || 1),
        speed: scene.speed || 1,
        transition: scene.transition || 'cut'
      });
    }

    // 2. Concatenate video clips into silent master video
    const concatFile = path.join(workDir, 'concat.txt');
    await fs.writeFile(concatFile, normalized.map(file => `file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));

    const silentVideoPath = path.join(workDir, 'silent_video.mp4');
    await run('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', concatFile,
      '-c', 'copy', '-movflags', '+faststart', silentVideoPath
    ]);

    const totalDuration = runningTime;

    // 3. Generate Word-by-Word Kinetic Subtitles (.ass)
    let assPath: string | null = input.subtitlesPath || null;
    if (!assPath) {
      const timedNarrations: TimedSceneNarration[] = input.scenes.map(s => ({
        text: s.narrationText || s.voiceScript || s.voiceText || s.text || '',
        duration: s.duration,
        speechDuration: s.speechDuration || s.audioDuration || s.duration,
        words: s.words || []
      }));

      if (timedNarrations.some(t => t.text.trim().length > 0)) {
        try {
          assPath = await generateKineticAssSubtitles(timedNarrations, {
            accentHex: accentHex,
            wordsPerGroup: 3,
            marginV: 840
          });
          console.info(`[Reel Composer] ✅ Kinetic ASS subtitles synthesized: ${assPath}`);
        } catch (err: any) {
          console.warn('[Reel Composer] Subtitle generation notice:', err?.message || err);
        }
      }
    }

    // 4. Generate Broadcast Audio with Dynamic Sidechain Ducking and SFX
    let masterAudioPath: string | null = null;
    if (input.voicePath || input.musicPath) {
      try {
        masterAudioPath = await composeCinematicAudio({
          voicePath: input.voicePath,
          musicPath: input.musicPath,
          sceneCutTimestamps,
          totalDuration,
          workDir
        });
        console.info(`[Reel Composer] ✅ Broadcast master audio compiled with ducking & SFX: ${masterAudioPath}`);
      } catch (err: any) {
        console.warn('[Reel Composer] Sidechain audio composition fallback:', err?.message || err);
      }

      // Robust Fallback: If composeCinematicAudio failed, mix voice and music directly so music is never dropped!
      if ((!masterAudioPath || !fsSync.existsSync(masterAudioPath)) && input.voicePath && input.musicPath && fsSync.existsSync(input.musicPath)) {
        try {
          const directMix = path.join(workDir, `direct-mix-${Date.now()}.wav`);
          await run('ffmpeg', [
            '-y',
            '-i', input.voicePath,
            '-stream_loop', '-1', '-i', input.musicPath,
            '-filter_complex', `[0:a]volume=1.45,aformat=sample_rates=44100:channel_layouts=stereo[v];[1:a]atrim=0:${totalDuration},volume=0.20,aformat=sample_rates=44100:channel_layouts=stereo[m];[v][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]`,
            '-map', '[out]',
            '-t', String(totalDuration),
            '-c:a', 'pcm_s16le',
            directMix
          ]);
          if (fsSync.existsSync(directMix) && fsSync.statSync(directMix).size > 1000) {
            masterAudioPath = directMix;
            console.info(`[Reel Composer] ✅ Direct dual-track voice+music audio compiled: ${masterAudioPath}`);
          }
        } catch (directErr: any) {
          console.warn('[Reel Composer] Direct audio mix fallback notice:', directErr?.message || directErr);
        }
      }
    }

    // 5. Studio-Grade HyperFrames Composition Engine (optimized for short clips <= 25s)
    const outputPath = input.outputPath || path.join(COMPOSER_DIR, `${input.reelId}-${Date.now()}.mp4`);
    const skipHyperframes = totalDuration > 25 || process.env.SKIP_HYPERFRAMES === '1';

    if (!skipHyperframes) {
      try {
        console.info(`[Reel Composer] 🎨 Attempting studio render via HyperFrames Compositor Engine...`);
        const hfScenes = resolved.map((r, i) => ({
          assetId: r.scene.assetId,
          filePath: normalized[i] && fsSync.existsSync(normalized[i]) ? normalized[i] : r.asset.file_path,
          duration: Math.max(0.5, r.scene.duration),
          speechDuration: r.scene.speechDuration,
          chapterLabel: (r.scene as any).chapterLabel || `PART 0${i + 1}`,
          headline: (r.scene as any).headline,
          highlight: (r.scene as any).highlight,
          subline: (r.scene as any).subline,
          narrationText: r.scene.narrationText || r.scene.voiceScript || r.scene.voiceText || r.scene.text,
          words: r.scene.words
        }));

        const hfResult = await composeWithHyperframes({
          reelId: input.reelId,
          scenes: hfScenes,
          totalDuration,
          backgroundVideoPath: silentVideoPath,
          masterAudioPath: (masterAudioPath && fsSync.existsSync(masterAudioPath)) ? masterAudioPath : input.voicePath,
          outputPath,
          reelTitle: reelRecord?.title || cleanSubject,
          verticalBadge: verticalBadge,
          accentColor: accentHex,
          fps: input.fps || 30
        });

        if (hfResult.success && hfResult.outputPath && fsSync.existsSync(hfResult.outputPath)) {
          console.info(`[Reel Composer] 🏆 HyperFrames Compositor completed broadcast master: ${hfResult.outputPath}`);
          return { outputPath: hfResult.outputPath, reelId: input.reelId, scenes: input.scenes };
        }
        console.warn(`[Reel Composer] HyperFrames compositor notice (${hfResult.error || 'unspecified'}), falling back to direct FFmpeg assembly...`);
      } catch (hfErr: any) {
        console.warn(`[Reel Composer] HyperFrames compositor exception, continuing with FFmpeg fallback:`, hfErr?.message || hfErr);
      }
    } else {
      console.info(`[Reel Composer] ⚡ Multi-scene Reel (${totalDuration.toFixed(1)}s > 25s): Using high-performance studio FFmpeg compositor with full Archival HUD overlay.`);
    }

    // 6. Final Assembly & Export (Guaranteed Studio Archival HUD Overlay)
    const finalArgs: string[] = ['-y', '-i', silentVideoPath];

    // Collect valid scene HUD PNG overlay plates
    const validHudInputs: Array<{ path: string; start: number; end: number }> = [];
    for (let i = 0; i < hudPngs.length; i++) {
      if (fsSync.existsSync(hudPngs[i])) {
        finalArgs.push('-i', hudPngs[i]);
        validHudInputs.push({
          path: hudPngs[i],
          start: sceneIntervals[i].start,
          end: sceneIntervals[i].end
        });
      }
    }

    // Audio input
    let audioInputIndex = -1;
    if (masterAudioPath && fsSync.existsSync(masterAudioPath)) {
      audioInputIndex = 1 + validHudInputs.length;
      finalArgs.push('-i', masterAudioPath);
    } else if (input.voicePath) {
      audioInputIndex = 1 + validHudInputs.length;
      finalArgs.push('-i', input.voicePath);
    } else if (input.musicPath && fsSync.existsSync(input.musicPath)) {
      audioInputIndex = 1 + validHudInputs.length;
      finalArgs.push('-stream_loop', '-1', '-i', input.musicPath);
    }

    // Assemble video filter graph: HUD scene overlays + Animated Glowing Progress Bar + Kinetic ASS Subtitles
    const complexFilters: string[] = [];
    let lastStream = '0:v';

    validHudInputs.forEach((item, idx) => {
      const inputIdx = 1 + idx;
      const nextStream = `v_hud_${idx}`;
      complexFilters.push(`[${lastStream}][${inputIdx}:v]overlay=0:0:enable='between(t,${item.start},${item.end})'[${nextStream}]`);
      lastStream = nextStream;
    });

    const animProgressBar = `drawbox=x=120:y=85:w=840:h=6:color=0x1e293b@0.75:t=fill,drawbox=x=120:y=85:w='840*(t/${totalDuration})':h=6:color=${accentHex.replace('#', '0x')}@0.95:t=fill`;
    let finalFilters = animProgressBar;

    if (assPath && fsSync.existsSync(assPath)) {
      const escapedAss = escapeFilterPath(assPath);
      finalFilters += `,ass='${escapedAss}'`;
    }

    complexFilters.push(`[${lastStream}]${finalFilters}[outv]`);

    finalArgs.push(
      '-filter_complex', complexFilters.join(';'),
      '-map', '[outv]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'
    );

    if (audioInputIndex !== -1) {
      finalArgs.push('-map', `${audioInputIndex}:a:0`, '-c:a', 'aac', '-b:a', '192k', '-shortest');
    }

    finalArgs.push('-movflags', '+faststart', outputPath);
    await run('ffmpeg', finalArgs);

    console.info(`[Reel Composer] 🚀 Studio Reel Mastered with Archival HUD & Subtitles: ${outputPath}`);
    return { outputPath, reelId: input.reelId, scenes: input.scenes };
  } finally {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}
  }
}

export function getAssetCandidates(category?: string, tags: string[] = [], limit = 10) {
  return selectAssets({ type: 'video', category, tags, limit, avoidRecentlyUsedDays: 3 });
}
