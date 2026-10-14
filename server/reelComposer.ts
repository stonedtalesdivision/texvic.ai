import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './database.js';
import { getAsset, markAssetUsed, selectAssets } from './assetLibrary.js';
import { generateKineticAssSubtitles, type TimedSceneNarration } from './kineticSubtitleEngine.js';
import { composeCinematicAudio } from './cinematicAudioEngine.js';

export interface ReelScene {
  assetId: string;
  duration: number;
  crop?: 'center' | 'left' | 'right';
  zoom?: number;
  speed?: number;
  transition?: 'cut' | 'fade';
  text?: string;
  narrationText?: string;
  voiceScript?: string;
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

  const normalized: string[] = [];
  const sceneCutTimestamps: number[] = [];
  let runningTime = 0;

  try {
    // 1. Process and normalize each scene video track
    for (let i = 0; i < resolved.length; i++) {
      const { scene, asset } = resolved[i];
      const output = path.join(workDir, `scene-${i}.mp4`);
      sceneCutTimestamps.push(runningTime);
      const sceneDur = Math.max(0.5, scene.duration);
      runningTime += sceneDur;
      
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

      // Subtle documentary film grading & vignette
      vf.push('eq=contrast=1.06:saturation=1.12:brightness=-0.01');
      vf.push('vignette=PI/4.5');

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
        text: s.narrationText || s.voiceScript || s.text || '',
        duration: s.duration
      }));

      if (timedNarrations.some(t => t.text.trim().length > 0)) {
        try {
          assPath = await generateKineticAssSubtitles(timedNarrations, {
            accentHex: input.accentColor || '#d4af37',
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
    }

    // 5. Final Assembly & Export
    const outputPath = input.outputPath || path.join(COMPOSER_DIR, `${input.reelId}-${Date.now()}.mp4`);
    const finalArgs: string[] = ['-y', '-i', silentVideoPath];

    if (masterAudioPath && fsSync.existsSync(masterAudioPath)) {
      finalArgs.push('-i', masterAudioPath);
    } else if (input.voicePath) {
      finalArgs.push('-i', input.voicePath);
    }

    const videoFilters: string[] = [];
    if (assPath && fsSync.existsSync(assPath)) {
      const escapedAss = escapeFilterPath(assPath);
      videoFilters.push(`ass='${escapedAss}'`);
    }

    if (videoFilters.length > 0) {
      finalArgs.push(
        '-vf', videoFilters.join(','),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'
      );
    } else {
      finalArgs.push('-c:v', 'copy');
    }

    if (masterAudioPath && fsSync.existsSync(masterAudioPath)) {
      finalArgs.push('-c:a', 'aac', '-b:a', '192k', '-map', '0:v:0', '-map', '1:a:0', '-shortest');
    } else if (input.voicePath) {
      finalArgs.push('-c:a', 'aac', '-b:a', '192k', '-map', '0:v:0', '-map', '1:a:0', '-shortest');
    }

    finalArgs.push('-movflags', '+faststart', outputPath);
    await run('ffmpeg', finalArgs);

    console.info(`[Reel Composer] 🚀 Viral Reel Mastered successfully: ${outputPath}`);
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
