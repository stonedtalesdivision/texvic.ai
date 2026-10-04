import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './database.js';
import { getAsset, markAssetUsed, selectAssets } from './assetLibrary.js';

export interface ReelScene {
  assetId: string;
  duration: number;
  crop?: 'center' | 'left' | 'right';
  zoom?: number;
  speed?: number;
  transition?: 'cut' | 'fade';
  text?: string;
}

export interface ReelComposition {
  reelId: string;
  scenes: ReelScene[];
  voicePath?: string;
  musicPath?: string;
  outputPath?: string;
  width?: number;
  height?: number;
  fps?: number;
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
  try {
    for (let i = 0; i < resolved.length; i++) {
      const { scene, asset } = resolved[i];
      const output = path.join(workDir, `scene-${i}.mp4`);
      const zoom = Math.max(1, Math.min(scene.zoom || 1, 1.5));
      const cropX = scene.crop === 'left' ? '0' : scene.crop === 'right' ? 'in_w-1080' : '(in_w-1080)/2';
      const vf = [
        `scale=ceil(1080*${zoom}/2)*2:ceil(1920*${zoom}/2)*2:force_original_aspect_ratio=increase`,
        `crop=1080:1920:${cropX}:0`
      ];
      const filters = [
        `setpts=PTS/${Math.max(0.25, Math.min(scene.speed || 1, 2))}`,
        ...vf
      ];
      await run('ffmpeg', [
        '-y', '-stream_loop', '-1', '-i', asset.file_path,
        '-t', String(Math.max(0.5, scene.duration)),
        '-vf', filters.join(','),
        '-an', '-r', String(input.fps || 30),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
        '-pix_fmt', 'yuv420p', output
      ]);
      normalized.push(output);
      markAssetUsed(asset.id, input.reelId, i + 1, {
        crop: scene.crop || 'center',
        zoom: scene.zoom || 1,
        speed: scene.speed || 1,
        transition: scene.transition || 'cut'
      });
    }

    const concatFile = path.join(workDir, 'concat.txt');
    await fs.writeFile(concatFile, normalized.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'));

    const silent = path.join(workDir, 'video.mp4');
    await run('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', concatFile,
      '-c', 'copy', '-movflags', '+faststart', silent
    ]);

    const outputPath = input.outputPath || path.join(COMPOSER_DIR, `${input.reelId}-${Date.now()}.mp4`);
    const inputs = ['-y', '-i', silent];
    if (input.voicePath) inputs.push('-i', input.voicePath);
    if (input.musicPath) inputs.push('-i', input.musicPath);

    const audioCount = Number(Boolean(input.voicePath)) + Number(Boolean(input.musicPath));
    if (!audioCount) {
      await fs.copyFile(silent, outputPath);
    } else {
      const audioInputs: string[] = [];
      if (input.voicePath) audioInputs.push('[1:a]');
      if (input.musicPath) audioInputs.push(`[${input.voicePath ? 2 : 1}:a]`);
      const mix = audioInputs.length > 1
        ? `${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=first:dropout_transition=2[a]`
        : `${audioInputs[0]}aresample=async=1[a]`;
      await run('ffmpeg', [
        ...inputs,
        '-filter_complex', mix,
        '-map', '0:v:0', '-map', '[a]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', '-movflags', '+faststart', outputPath
      ]);
    }

    return { outputPath, reelId: input.reelId, scenes: input.scenes };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export function getAssetCandidates(category?: string, tags: string[] = [], limit = 10) {
  return selectAssets({ type: 'video', category, tags, limit, avoidRecentlyUsedDays: 3 });
}
