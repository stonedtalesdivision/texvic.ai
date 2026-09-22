import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const execFileAsync = promisify(execFile);
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const MEDIA_DIR = path.join(process.cwd(), 'data', 'media', 'reels');

function safeText(value: string): string {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function ffmpegColor(hex?: string): string {
  const value = String(hex || '#7c3aed').replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(value) ? `0x${value}` : '0x7c3aed';
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export async function renderReelToMp4(reel: {
  id: string;
  duration?: number;
  scenes?: Array<{
    durationSeconds?: number;
    hookText?: string;
    secondaryText?: string;
    accentColor?: string;
  }>;
}): Promise<{ videoUrl: string; filePath: string }> {
  const scenes = Array.isArray(reel.scenes) && reel.scenes.length
    ? reel.scenes
    : [{ durationSeconds: reel.duration || 8, hookText: 'SARLX.Ai', secondaryText: 'AI-powered social growth', accentColor: '#7c3aed' }];

  const workDir = path.join(MEDIA_DIR, reel.id);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });

  const segmentPaths: string[] = [];

  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const duration = Math.max(1, Math.min(15, Number(scene.durationSeconds || 2)));
      const text = [safeText(scene.hookText || ''), safeText(scene.secondaryText || '')]
        .filter(Boolean)
        .join('\n');
      const textFile = path.join(workDir, `scene-${i}.txt`);
      const segment = path.join(workDir, `segment-${i}.mp4`);
      await fs.writeFile(textFile, text || 'SARLX.Ai', 'utf8');

      const drawText = [
        `drawtext=textfile='${escapeFilterPath(textFile)}'`,
        'fontcolor=white',
        'fontsize=72',
        'line_spacing=18',
        'x=(w-text_w)/2',
        'y=(h-text_h)/2',
        'box=1',
        'boxcolor=black@0.35',
        'boxborderw=36'
      ].join(':');

      await execFileAsync(ffmpegPath, [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${ffmpegColor(scene.accentColor)}:s=1080x1920:r=30:d=${duration}`,
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-vf', drawText,
        '-t', String(duration),
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        segment
      ]);

      segmentPaths.push(segment);
    }

    const concatFile = path.join(workDir, 'concat.txt');
    await fs.writeFile(concatFile, segmentPaths.map(p => `file '${p.replace(/'/g, "'\\\\''")}'`).join('\n'), 'utf8');

    const outputPath = path.join(MEDIA_DIR, `${reel.id}.mp4`);
    await execFileAsync(ffmpegPath, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c', 'copy',
      outputPath
    ]);

    const appUrl = (process.env.APP_URL || '').replace(/\\/$/, '');
    if (!appUrl) throw new Error('APP_URL is required so Meta can fetch the rendered video.');
    return {
      videoUrl: `${appUrl}/media/reels/${encodeURIComponent(reel.id)}.mp4`,
      filePath: outputPath
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
