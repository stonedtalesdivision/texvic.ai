import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from './database.js';
import { getActivePersona } from './themePage.js';
import { wrapSvgText, formatKaraokeWords } from './vectorOverlayEngine.js';

const execFileAsync = promisify(execFile);
const COVERS_DIR = path.join(process.cwd(), 'data', 'media', 'covers');

export interface ReelCoverOptions {
  reelId: string;
  title: string;
  niche?: string;
  accentColor?: string;
  badge?: string;
  baseImagePath?: string;
  videoPath?: string;
  publicBaseUrl?: string;
}

function escapeXml(unsafe: string): string {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an automated, broadcast-grade 1080x1920 high-CTR Reel Cover image.
 * Uses high-contrast documentary framing, curiosity-gap title typography,
 * dark vignette readability plates, and classified dossier pills.
 */
export async function generateReelCover(
  options: ReelCoverOptions
): Promise<{ coverPath: string; coverUrl?: string }> {
  await fs.mkdir(COVERS_DIR, { recursive: true });
  const coverPath = path.join(COVERS_DIR, `${options.reelId}-cover.jpg`);

  const persona = getActivePersona();
  const branding = (persona.brand || 'The Untold Archive').toUpperCase();
  const rawBadge = (options.badge || options.niche || (persona as any)?.vertical_badge || 'UNTOLD DOSSIER')
    .replace(/[\[\]]/g, '')
    .trim()
    .toUpperCase();
  const accent = options.accentColor || '#d4af37';

  // 1. Prepare base background frame (extract from video or use existing image)
  let workingFramePath: string | null = null;
  const tempFiles: string[] = [];

  if (options.baseImagePath && fsSync.existsSync(options.baseImagePath)) {
    workingFramePath = options.baseImagePath;
  } else if (options.videoPath && fsSync.existsSync(options.videoPath)) {
    const extractedFrame = path.join(COVERS_DIR, `temp-frame-${options.reelId}-${Date.now()}.jpg`);
    tempFiles.push(extractedFrame);
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', '00:00:01.200',
        '-i', options.videoPath,
        '-frames:v', '1',
        '-q:v', '2',
        extractedFrame
      ]);
      if (fsSync.existsSync(extractedFrame) && (await fs.stat(extractedFrame)).size > 5000) {
        workingFramePath = extractedFrame;
      }
    } catch (frameErr) {
      console.warn(`[Thumbnail Engine] Notice extracting frame from video:`, frameErr);
    }
  }

  // 2. Format title lines for maximum mobile readability (clean curiosity-gap uppercase)
  const cleanTitle = String(options.title || 'THE DECLASSIFIED DOSSIER')
    .replace(/^(documented archival anomaly|declassified dossier|archival anomaly|case file|investigation file)[\s\:\-]+/i, '')
    .split(/[:\-\—\(]/)[0]
    .trim()
    .toUpperCase();

  const titleLines = wrapSvgText(cleanTitle, 18).slice(0, 4);

  // Identify high-impact focus words in title lines
  const formattedTitleSvg = titleLines.map((line, idx) => {
    const yPos = 920 + (idx * 84);
    const words = line.split(/\s+/);
    // Highlight the most significant word in gold accent
    const longestWord = [...words].sort((a, b) => b.length - a.length)[0] || '';
    
    const lineTspans = words.map(w => {
      const isHighlight = w.length >= 4 && w === longestWord && idx <= 1;
      const fill = isHighlight ? accent : '#ffffff';
      return `<tspan fill="${fill}">${escapeXml(w)} </tspan>`;
    }).join('');

    return `<text x="540" y="${yPos}" text-anchor="middle" font-family="'Segoe UI', 'DejaVu Sans', Arial, sans-serif" font-weight="900" font-size="70" letter-spacing="1.5">${lineTspans}</text>`;
  }).join('\n');

  // 3. Construct Sharp SVG cover overlay
  const overlaySvg = `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Dark gradient vignette for pristine mobile text contrast -->
        <linearGradient id="vignetteGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#05070a" stop-opacity="0.85" />
          <stop offset="25%" stop-color="#05070a" stop-opacity="0.45" />
          <stop offset="45%" stop-color="#05070a" stop-opacity="0.55" />
          <stop offset="68%" stop-color="#05070a" stop-opacity="0.88" />
          <stop offset="100%" stop-color="#030406" stop-opacity="0.97" />
        </linearGradient>

        <linearGradient id="accentLineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0" />
          <stop offset="50%" stop-color="${accent}" stop-opacity="1" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Gradient contrast wash -->
      <rect x="0" y="0" width="1080" height="1920" fill="url(#vignetteGrad)" />

      <!-- Top Capsule: [ DOSSIER ] | BRANDING -->
      <g transform="translate(540, 240)">
        <rect x="-380" y="-36" width="760" height="72" rx="36" fill="#0d1117" fill-opacity="0.90" stroke="#30363d" stroke-width="2" />
        <rect x="-376" y="-32" width="752" height="64" rx="32" fill="none" stroke="${accent}" stroke-opacity="0.30" stroke-width="1.5" />
        
        <circle cx="-330" cy="0" r="6" fill="${accent}" />
        <text x="-310" y="8" font-family="'Segoe UI', Arial, sans-serif" font-weight="900" font-size="24" fill="${accent}" letter-spacing="3">[ ${escapeXml(rawBadge)} ]</text>
        <text x="340" y="8" text-anchor="end" font-family="'Segoe UI', Arial, sans-serif" font-weight="700" font-size="22" fill="#e6edf3" letter-spacing="2">${escapeXml(branding)}</text>
      </g>

      <!-- Decorative Forensic Crosshairs -->
      <g stroke="#ffffff" stroke-opacity="0.15" stroke-width="1.5">
        <line x1="80" y1="360" x2="120" y2="360" />
        <line x1="80" y1="360" x2="80" y2="400" />
        <line x1="1000" y1="360" x2="960" y2="360" />
        <line x1="1000" y1="360" x2="1000" y2="400" />
        <line x1="80" y1="1600" x2="120" y2="1600" />
        <line x1="80" y1="1600" x2="80" y2="1560" />
        <line x1="1000" y1="1600" x2="960" y2="1600" />
        <line x1="1000" y1="1600" x2="1000" y2="1560" />
      </g>

      <!-- Main Title Block -->
      <g>
        <text x="540" y="800" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="28" fill="${accent}" letter-spacing="6">DECLASSIFIED INVESTIGATION</text>
        
        <!-- Golden Accent Rule -->
        <line x1="240" y1="835" x2="840" y2="835" stroke="url(#accentLineGrad)" stroke-width="3" />

        ${formattedTitleSvg}
      </g>

      <!-- Bottom Forensic Pill (High-CTR Hook Prompt) -->
      <g transform="translate(540, 1480)">
        <rect x="-340" y="-34" width="680" height="68" rx="34" fill="#161b22" fill-opacity="0.94" stroke="${accent}" stroke-width="2" />
        <circle cx="-290" cy="0" r="7" fill="#ef4444" />
        <text x="-260" y="9" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="23" fill="#ffffff" letter-spacing="3.5">DOCUMENTARY ARCHIVE</text>
        <text x="290" y="9" text-anchor="end" font-family="'Segoe UI', Arial, sans-serif" font-weight="900" font-size="22" fill="${accent}" letter-spacing="2">SWIPE / WATCH ▶</text>
      </g>
    </svg>
  `;

  try {
    let basePipeline: ReturnType<typeof sharp>;

    if (workingFramePath && fsSync.existsSync(workingFramePath)) {
      basePipeline = sharp(workingFramePath)
        .resize(1080, 1920, { fit: 'cover', position: 'center' })
        .modulate({ saturation: 0.70, brightness: 0.85 });
    } else {
      // Solid dark archival slate background
      basePipeline = sharp({
        create: {
          width: 1080,
          height: 1920,
          channels: 3,
          background: { r: 12, g: 15, b: 22 }
        }
      });
    }

    const overlayBuffer = Buffer.from(overlaySvg);

    await basePipeline
      .composite([{ input: overlayBuffer, top: 0, left: 0 }])
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(coverPath);

    console.info(`[Thumbnail Engine] 📸 High-CTR Reel Cover generated: ${coverPath}`);

    // Update database record
    const host = options.publicBaseUrl || process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '';
    const coverUrl = host ? `${host.replace(/\/$/, '')}/data/media/covers/${path.basename(coverPath)}` : `/data/media/covers/${path.basename(coverPath)}`;

    try {
      db.prepare('UPDATE reels SET cover_path = ?, cover_url = ? WHERE id = ?').run(coverPath, coverUrl, options.reelId);
    } catch (dbErr) {
      console.warn('[Thumbnail Engine] Notice updating reel cover in database:', dbErr);
    }

    return { coverPath, coverUrl };
  } finally {
    await Promise.allSettled(tempFiles.map(f => fs.rm(f, { force: true })));
  }
}
