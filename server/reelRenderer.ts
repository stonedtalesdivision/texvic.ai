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
  audio?: {
    bpm?: number;
    dropTimestamp?: number;
    mood?: string;
  };
}): Promise<{ videoUrl: string; filePath: string }> {
  const scenes = Array.isArray(reel.scenes) && reel.scenes.length
    ? reel.scenes
    : [{ durationSeconds: reel.duration || 8, hookText: 'TEXVIC', secondaryText: 'AI-powered content', accentColor: '#7c3aed' }];
  const bpm = Math.max(70, Math.min(180, Number(reel.audio?.bpm || 120)));
  const mood = String(reel.audio?.mood || 'high energy').toLowerCase();
  const baseFreq = mood.includes('lofi') || mood.includes('chill') ? 196 : mood.includes('ambient') ? 174 : mood.includes('deep') ? 110 : 220;
  const melodyFreq = mood.includes('trap') ? 330 : mood.includes('lofi') ? 293.66 : 440;
  const beatRate = bpm / 60;

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
        '-i', `aevalsrc=0.10*sin(2*PI*${baseFreq}*t)+0.055*sin(2*PI*${melodyFreq}*t)*(0.45+0.55*sin(2*PI*${beatRate}*t))+0.08*sin(2*PI*65*t)*(0.35+0.65*sin(2*PI*${beatRate}*t)):s=48000:d=${duration}`,
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

    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    if (!appUrl) throw new Error('APP_URL is required so Meta can fetch the rendered video.');
    return {
      videoUrl: `${appUrl}/media/reels/${encodeURIComponent(reel.id)}.mp4`,
      filePath: outputPath
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
