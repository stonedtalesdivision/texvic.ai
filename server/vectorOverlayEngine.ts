import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getActivePersona } from './themePage.js';

export interface InteractiveWidgetOptions {
  type?: 'poll' | 'pause-challenge' | 'dilemma';
  question?: string;
  optionA?: string;
  optionB?: string;
  percentA?: number;
  percentB?: number;
  pauseTarget?: string;
  anomalyClue?: string;
  callToAction?: string;
}

export interface OverlayOptions {
  badge?: string;
  headline: string;
  highlight?: string;
  subline?: string;
  dwellText?: string;
  accentColor?: string;
  progressPercent?: number;
  hideProgressBar?: boolean;
  branding?: string;
  template?: 'full-bleed-cinematic' | 'classified-dossier' | 'satellite-telemetry' | 'lower-third' | 'split-screen' | 'pause-challenge';
  interactiveWidget?: InteractiveWidgetOptions;
}

export function wrapSvgText(text: string, maxCharsPerLine = 22): string[] {
  const words = String(text || '').trim().split(/\s+/);
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
  return lines;
}

function escapeXml(unsafe: string): string {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const IMPACT_WORD_PATTERN = /^(lost|doomsday|secret|secrets|stolen|heist|never|banned|truth|archive|warning|found|killed|disappeared|classified|hidden|conspiracy|unsolved|trillion|billion|million|cad|autocad|rhino|revit|bim|ai|pros|pro|shortcut|shortcuts|trick|tricks|hack|hacks|mistake|mistakes|blueprint|blueprints|rule|rules|workflow|workflows|drawing|drawings|render|rendering|speed|faster|fast|free|stop|destroys|destroy|illegal|power|powerful|ultimate|cheat|code|floorplan|3d|\$\d+.*|\d+[%a-z]*)$/i;

export function formatKaraokeWords(line: string, accentColor: string, explicitHighlight?: string): string {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  const explicitTerms = new Set(
    (explicitHighlight || '')
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9$%#]/gi, ''))
      .filter(w => w.length >= 2)
  );

  // Identify candidate words and score them to pick EXACTLY ONE primary focus keyword (never whole sentence)
  let bestIdx = -1;
  let bestScore = -1;

  words.forEach((w, idx) => {
    const hasMarkdownBold = /^\*\*.*\*\*$/.test(w) || w.includes('**');
    const clean = w.replace(/[^a-zA-Z0-9$%#]/g, '').toLowerCase();
    const isExplicit = explicitTerms.has(clean);
    const isImpact = IMPACT_WORD_PATTERN.test(clean);
    const hasDigits = /^\d+/.test(clean);

    let score = 0;
    if (hasMarkdownBold) score += 50;
    if (isExplicit) score += 40;
    if (isImpact) score += 30;
    if (hasDigits) score += 20;
    if (clean.length >= 4) score += Math.min(clean.length, 10);

    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });

  // If no word met impact criteria, fallback to the longest substantive word
  if (bestIdx === -1 && words.length > 0) {
    let maxLen = 0;
    words.forEach((w, idx) => {
      const clean = w.replace(/[^a-zA-Z0-9]/g, '');
      if (clean.length > maxLen) {
        maxLen = clean.length;
        bestIdx = idx;
      }
    });
    if (bestIdx === -1) bestIdx = 0;
  }

  return words.map((w, idx) => {
    const isFocusWord = (idx === bestIdx);
    const cleanDisplay = w.replace(/\*\*/g, '');
    const escaped = escapeXml(cleanDisplay);
    const trailingSpace = idx < words.length - 1 ? ' ' : '';
    if (isFocusWord) {
      return `<tspan fill="${accentColor}" font-weight="900">${escaped}${trailingSpace}</tspan>`;
    }
    return `<tspan fill="#ffffff" font-weight="800">${escaped}${trailingSpace}</tspan>`;
  }).join('');
}

/**
 * Builds a state-of-the-art 1080x1920 documentary overlay with 3 diverse visual archetypes:
 * 1. full-bleed-cinematic: Leaves 90% of screen visible for 4K b-roll / archival footage (Vox / Magnates Media style)
 * 2. classified-dossier: Authentic declassified government archive file with red "TOP SECRET" stamp and highlighter
 * 3. satellite-telemetry: Military satellite reconnaissance HUD with glowing coordinates and target crosshairs
 */
export function buildSceneSvg(opts: OverlayOptions): string {
  const activePersona = getActivePersona();
  const accent = (opts.accentColor || '#fbbf24').replace(/^#?([0-9a-fA-F]{6})$/, '#$1');
  const badge = escapeXml(opts.badge || 'UNTOLD MYSTERY');
  const dwellText = escapeXml(opts.dwellText || `${activePersona.brand || 'THE UNTOLD ARCHIVE'} • HISTORICAL DOSSIER`);
  const branding = escapeXml(opts.branding || activePersona.brand || 'THE UNTOLD ARCHIVE');
  const progressPercent = Math.max(0, Math.min(100, opts.progressPercent ?? 50));
  const progressWidth = Math.round(840 * (progressPercent / 100));

  const rawHeadline = opts.headline || '';
  const rawHighlight = opts.highlight || '';
  const rawSubline = opts.subline || '';

  // Determine template archetype if not explicitly passed
  let template = opts.template;
  if (!template || template === 'pause-challenge') {
    if (/satellite|island|bunker|ocean|borehole|tibet|radar|coordinates/i.test(rawHeadline + ' ' + rawHighlight)) {
      template = 'satellite-telemetry';
    } else if (/heist|classified|fbi|cia|nazi|gold|bank|secret|document|wire/i.test(rawHeadline + ' ' + rawHighlight)) {
      template = 'classified-dossier';
    } else {
      template = 'full-bleed-cinematic';
    }
  }

  // Top progress bar and subtle safe zone vignette
  const headerSvg = `
    <!-- Ambient Top & Bottom Vignettes (leaves video vibrant in center) -->
    <rect x="0" y="0" width="1080" height="260" fill="url(#topVignette)" opacity="0.65" />
    <rect x="0" y="1420" width="1080" height="500" fill="url(#bottomVignette)" opacity="0.85" />

    ${opts.hideProgressBar ? '' : `
    <!-- Progress Indicator Bar (Safe Zone y=90) -->
    <rect x="120" y="85" width="840" height="6" rx="3" fill="#1e293b" opacity="0.75" />
    <rect x="120" y="85" width="${progressWidth}" height="6" rx="3" fill="url(#accentGrad)" filter="url(#glow)" />
    `}
  `;

  // Minimalist Archival Framing: Leaves 100% of the video center clear for 4K B-roll and kinetic subtitles
  const cornerColor = accent || '#d4af37';
  const mainContentSvg = `
    <g>
      <!-- Sleek Glassmorphic Archival Header Capsule (Safe zone y=140) -->
      <g transform="translate(100, 140)">
        <rect width="880" height="52" rx="26" fill="rgba(8, 12, 22, 0.72)" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1.2" filter="url(#shadow)" />
        <circle cx="36" cy="26" r="6" fill="${cornerColor}" filter="url(#glow)" />
        <text x="56" y="33" font-family="'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="800" fill="${cornerColor}" letter-spacing="1.5">
          [ ${badge} ]
        </text>
        <text x="844" y="33" text-anchor="end" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#f1f5f9" letter-spacing="0.8">
          ${branding}
        </text>
      </g>

      <!-- Minimalist Documentary Camera Framing Reticles (Authentic Film Archive Feel) -->
      <g stroke="${cornerColor}" stroke-width="2" fill="none" opacity="0.45">
        <path d="M 100 240 L 140 240 M 100 240 L 100 280" />
        <path d="M 980 240 L 940 240 M 980 240 L 980 280" />
        <path d="M 100 1480 L 140 1480 M 100 1480 L 100 1440" />
        <path d="M 980 1480 L 940 1480 M 980 1480 L 980 1440" />
      </g>

      <!-- Subtle Bottom Dwell Pill (Safe zone y=1680) -->
      <g transform="translate(140, 1660)">
        <rect width="800" height="46" rx="23" fill="rgba(3, 7, 18, 0.70)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
        <text x="400" y="29" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#94a3b8" letter-spacing="1">
          ${dwellText}
        </text>
      </g>
    </g>
  `;

  return `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000000" flood-opacity="0.9" />
        </filter>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${accent}" flood-opacity="0.5" />
        </filter>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${accent}" />
          <stop offset="100%" stop-color="#38bdf8" />
        </linearGradient>
        <linearGradient id="topVignette" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="bottomVignette" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.9" />
        </linearGradient>
        <linearGradient id="centerFade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="25%" stop-color="#000000" stop-opacity="0.75" />
          <stop offset="80%" stop-color="#000000" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </linearGradient>
      </defs>

      ${headerSvg}
      ${mainContentSvg}
    </svg>
  `;
}

export async function renderOverlayToPng(opts: OverlayOptions, outputPath: string): Promise<string> {
  const svg = buildSceneSvg(opts);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .png({ quality: 95, compressionLevel: 6 })
    .toFile(outputPath);
  return outputPath;
}
