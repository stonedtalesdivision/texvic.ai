import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerAsset, selectAssets, type MediaAsset } from './assetLibrary.js';

const execFileAsync = promisify(execFile);
const GENERATED_DIR = path.join(process.cwd(), 'data', 'media', 'generated-scenes');
const FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

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

async function renderGeneratedScene(scene: any, index: number, reelId: string): Promise<string> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const duration = Math.max(2, Math.min(Number(scene?.durationSeconds || 3), 12));
  const palette = themePalette(scene, index);
  const title = sceneTitle(scene);
  const safeId = reelId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const nonce = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const output = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.mp4`);
  const titleFile = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.txt`);
  await fs.writeFile(titleFile, title, 'utf8');
  const motion = index % 3;
  const boxX = motion === 0 ? "iw*0.06+sin(t*0.65)*iw*0.035" : motion === 1 ? "iw*0.52+cos(t*0.45)*iw*0.10" : "iw*0.18+sin(t*0.35)*iw*0.12";
  const boxY = motion === 2 ? "ih*0.16+cos(t*0.55)*ih*0.10" : "ih*0.42+sin(t*0.40)*ih*0.09";
  const filter = [
    `drawbox=x='${boxX}':y='${boxY}':w='iw*0.72':h='ih*0.42':color='${palette.accent}@0.18':t=fill`,
    `drawbox=x='iw*0.12+cos(t*0.28)*iw*0.08':y='ih*0.64+sin(t*0.33)*ih*0.06':w='iw*0.46':h='ih*0.012':color='${palette.accent}@0.75':t=fill`,
    `drawtext=fontfile='${FONT_PATH}':textfile='${titleFile}':fontcolor=white@0.92:fontsize=64:line_spacing=18:x=(w-text_w)/2:y=h*0.46-text_h/2:shadowcolor=black@0.55:shadowx=3:shadowy=3:alpha='0.78+0.18*sin(t*2)'`,
    `drawtext=fontfile='${FONT_PATH}':text='SARLX.AI':fontcolor='${palette.accent}':fontsize=30:x=(w-text_w)/2:y=h*0.76`
  ].join(',');
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `color=c=${palette.bg}:s=1080x1920:r=30`, '-t', String(duration),
      '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
    ], { maxBuffer: 1024 * 1024 * 8 });
    return output;
  } finally {
    await fs.rm(titleFile, { force: true });
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
    const tags = ['autonomous', 'generated', 'ai', 'technology', ...theme.split(/[^a-z0-9]+/i).filter(Boolean).slice(0, 5)];
    let candidates = selectAssets({ type: 'video', tags, limit: 8, excludeIds: [...used], avoidRecentlyUsedDays: 3 });
    if (!candidates.length) candidates = selectAssets({ type: 'video', limit: 8, excludeIds: [...used], avoidRecentlyUsedDays: 3 });
    if (candidates[0]) { assets.push(candidates[0]); used.add(candidates[0].id); continue; }
    const sourcePath = await renderGeneratedScene(scene, index, String(reel.id || 'autonomous'));
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
      await fs.rm(sourcePath, { force: true });
    }
  }
  return { assets, generated: assets.filter(asset => asset.source === 'ffmpeg-autonomous-visual-producer').length };
}
