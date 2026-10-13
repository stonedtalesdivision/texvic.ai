import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { getActivePersona } from './themePage.js';
const execFileAsync = promisify(execFile);
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const MEDIA_DIR = path.join(process.cwd(), 'data', 'media', 'reels');

function resolveFontFile(): string {
  const candidates = [
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc'
  ];
  for (const c of candidates) {
    if (fsSync.existsSync(c)) {
      return c.replace(/\\/g, '/').replace(/:/g, '\\:');
    }
  }
  return '';
}

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
      const persona = getActivePersona();
      const brandName = persona.brand || 'TEXVIC.Ai';
      const handleName = persona.handle || '@texvic_ai';
      const textFile = path.join(workDir, `scene-${i}.txt`);
      const segment = path.join(workDir, `segment-${i}.mp4`);
      await fs.writeFile(textFile, text || brandName, 'utf8');

      const fontFile = resolveFontFile();
      const fontArg = fontFile ? `fontfile='${fontFile}':` : '';
      const escapedTextFile = escapeFilterPath(textFile);
      const accent = ffmpegColor(scene.accentColor);
      const badge = i === 0 ? '• BREAKTHROUGH •' : i === 1 ? '• DEEP DIVE •' : '• FUTURE TECH •';

      const filterParts = [
        // Top dynamic progress bar (centered in safe zone at y=90)
        `drawbox=x=130:y=90:w='820*t/${duration}':h=8:color=${accent}@0.95:t=fill`,
        // Category pill badge (centered at y=560)
        `drawbox=x=(iw-340)/2:y=560:w=340:h=46:color=black@0.72:t=fill`,
        `drawbox=x=(iw-340)/2:y=560:w=340:h=46:color=${accent}@0.85:t=2`,
        `drawtext=${fontArg}text='${badge}':fontcolor=${accent}:fontsize=22:x=(w-text_w)/2:y=573`,
        // Frosted glassmorphism text card (820px wide, centered at x=130, leaves 130px clear on right for Instagram action buttons!)
        `drawbox=x=130:y=640:w=820:h=460:color=black@0.68:t=fill`,
        `drawbox=x=130:y=640:w=820:h=460:color=white@0.18:t=2`,
        // Main typography with high contrast & drop shadow inside card
        `drawtext=${fontArg}expansion=none:textfile='${escapedTextFile}':fontcolor=white:fontsize=52:line_spacing=16:x=(w-text_w)/2:y=690:shadowcolor=black@0.9:shadowx=4:shadowy=4`,
        // Bottom branding tag (at y=1380, cleanly above Instagram's caption and audio label)
        `drawtext=${fontArg}text='${brandName}  |  Follow ${handleName}':fontcolor=white@0.85:fontsize=24:x=(w-text_w)/2:y=1380:shadowcolor=black@0.8:shadowx=2:shadowy=2`
      ];

      // Multi-layer electronic beat synthesis
      const kick = `0.48*sin(2*PI*(46+130*exp(-38*mod(t,${1 / beatRate}))))*exp(-9*mod(t,${1 / beatRate}))`;
      const bass = `0.26*sin(2*PI*55*t)*(0.65+0.35*sin(2*PI*${beatRate * 2}*t))`;
      const lead = `0.15*sin(2*PI*(${baseFreq}+55*mod(floor(t*${beatRate * 4}),4))*t)*(0.7+0.3*cos(2*PI*${beatRate}*t))`;
      const audioExpr = `${kick}+${bass}+${lead}`;

      await execFileAsync(ffmpegPath, [
        '-y',
        '-f', 'lavfi',
        '-i', `gradients=s=1080x1920:c0=${accent}:c1=0x0a0a16:x0=0:y0=0:x1=1080:y1=1920`,
        '-f', 'lavfi',
        '-i', `aevalsrc=exprs='${audioExpr}':s=48000:d=${duration}`,
        '-vf', filterParts.join(','),
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
    await fs.writeFile(concatFile, segmentPaths.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\\\''")}'`).join('\n'), 'utf8');

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
