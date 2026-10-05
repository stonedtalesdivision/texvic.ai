import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
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

async function renderGeneratedScene(scene: any, index: number, reel: any): Promise<string> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const duration = Math.max(2, Math.min(Number(scene?.durationSeconds || 3), 12));
  const safeId = String(reel?.id || 'autonomous').replace(/[^a-zA-Z0-9_-]/g, '-');
  const nonce = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const output = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.mp4`);
  const imagePath = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.png`);
  const titleFile = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}.txt`);
  const subtitleFile = path.join(GENERATED_DIR, `${safeId}-scene-${index}-${nonce}-sub.txt`);
  const title = sceneTitle(scene);
  const subtitle = String(scene?.secondaryText || '').trim().slice(0, 110);

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini image generation unavailable: GEMINI_API_KEY is not configured.');
  }

  const topic = String(reel?.title || reel?.niche || 'AI technology');
  const visualTheme = String(scene?.visualTheme || 'cinematic technology');
  const visualPrompt = [
    'Create a premium vertical 9:16 editorial visual for an Instagram Reel.',
    `Topic: ${topic}.`,
    `Scene concept: ${title}.`,
    `Supporting idea: ${subtitle || 'show the concrete subject visually'}.`,
    `Visual direction: ${visualTheme}.`,
    'Make the subject concrete and immediately recognizable, not an abstract AI background.',
    'Use cinematic lighting, strong depth, realistic materials, a clear focal subject, modern social-media composition, and a visually surprising detail.',
    'Do not render any words, captions, logos, UI, watermarks, charts, or typography in the image.',
    'Leave clean negative space around the upper and lower thirds for video text overlays.'
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
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini image generation returned no image data.');
  }

  await fs.writeFile(imagePath, Buffer.from(imagePart.inlineData.data, 'base64'));
  await fs.writeFile(titleFile, title, 'utf8');
  await fs.writeFile(subtitleFile, subtitle, 'utf8');

  const seed = hashNumber(JSON.stringify({ theme: scene?.visualTheme || '', hook: scene?.hookText || '', index }));
  const accent = hueToHex(seed % 360, 85, 62);
  const filter = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920:(iw-1080)/2:(ih-1920)/2',
    `drawbox=x=0:y=0:w=1080:h=1920:color=black@0.12:t=fill`,
    `drawtext=fontfile='${FONT_PATH}':textfile='${titleFile}':fontcolor=white@0.96:fontsize=64:line_spacing=16:x=(w-text_w)/2:y=h*0.40-text_h/2:shadowcolor=black@0.7:shadowx=3:shadowy=3`,
    `drawtext=fontfile='${FONT_PATH}':textfile='${subtitleFile}':fontcolor=white@0.86:fontsize=30:line_spacing=10:x=(w-text_w)/2:y=h*0.58:shadowcolor=black@0.6:shadowx=2:shadowy=2`,
    `drawbox=x=72:y=72:w=936:h=8:color='${accent}@0.9':t=fill`,
    `drawtext=fontfile='${FONT_PATH}':text='SARLX.AI':fontcolor='${accent}':fontsize=30:x=(w-text_w)/2:y=h*0.88`
  ].join(',');

  try {
    await execFileAsync('ffmpeg', [
      '-y', '-loop', '1', '-i', imagePath, '-t', String(duration),
      '-vf', filter,
      '-an', '-r', '30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
    ], { maxBuffer: 1024 * 1024 * 8 });
    return output;
  } finally {
    await Promise.all([
      fs.rm(imagePath, { force: true }),
      fs.rm(titleFile, { force: true }),
      fs.rm(subtitleFile, { force: true })
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
    const tags = ['autonomous', 'generated', 'ai', 'technology', ...theme.split(/[^a-z0-9]+/i).filter(Boolean).slice(0, 5)];
    let candidates = selectAssets({ type: 'video', tags, limit: 12, excludeIds: [...used], avoidRecentlyUsedDays: 3 })
      .filter(asset => asset.source !== 'ffmpeg-autonomous-visual-producer');
    if (!candidates.length) {
      candidates = selectAssets({ type: 'video', limit: 12, excludeIds: [...used], avoidRecentlyUsedDays: 3 })
        .filter(asset => asset.source !== 'ffmpeg-autonomous-visual-producer');
    }
    if (candidates[0]) { assets.push(candidates[0]); used.add(candidates[0].id); continue; }
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
      await fs.rm(sourcePath, { force: true });
    }
  }
  return { assets, generated: assets.filter(asset => asset.source === 'ffmpeg-autonomous-visual-producer').length };
}
