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

export function formatKaraokeWords(line: string, accentColor: string): string {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  const impactMatches = words.map(w => {
    const clean = w.replace(/[^a-zA-Z0-9$%]/g, '');
    return IMPACT_WORD_PATTERN.test(clean) || /^\d+/.test(clean);
  });

  const hasAnyImpact = impactMatches.some(Boolean);
  let fallbackHighlightIdx = -1;
  if (!hasAnyImpact && words.length > 0) {
    let maxLen = 0;
    words.forEach((w, idx) => {
      const clean = w.replace(/[^a-zA-Z0-9]/g, '');
      if (clean.length > maxLen && clean.length >= 3) {
        maxLen = clean.length;
        fallbackHighlightIdx = idx;
      }
    });
    if (fallbackHighlightIdx === -1) fallbackHighlightIdx = 0;
  }

  return words.map((w, idx) => {
    const isImpact = impactMatches[idx] || (idx === fallbackHighlightIdx);
    const escaped = escapeXml(w);
    const trailingSpace = idx < words.length - 1 ? ' ' : '';
    if (isImpact) {
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
  const dwellText = escapeXml(opts.dwellText || 'Comment "STORY" below for the declassified file 📜');
  const branding = escapeXml(opts.branding || activePersona.brand || 'THE UNTOLD ARCHIVE');
  const progressPercent = Math.max(0, Math.min(100, opts.progressPercent ?? 50));
  const progressWidth = Math.round(840 * (progressPercent / 100));

  const rawHeadline = opts.headline || '';
  const rawHighlight = opts.highlight || '';
  const rawSubline = opts.subline || '';

  // Determine template archetype if not explicitly passed
  let template = opts.template;
  if (!template) {
    if (opts.interactiveWidget?.type === 'pause-challenge' || /pause|inspect|challenge|spot\s+the|0:0[1-9]|unredacted/i.test(rawHeadline + ' ' + rawHighlight + ' ' + rawSubline)) {
      template = 'pause-challenge';
    } else if (/split|satisfying|screen|dual|accelerator|retention|kinetic/i.test(rawHeadline + ' ' + rawHighlight)) {
      template = 'split-screen';
    } else if (/satellite|island|bunker|ocean|borehole|tibet|radar|coordinates/i.test(rawHeadline + ' ' + rawHighlight)) {
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

    <!-- Progress Indicator Bar (Safe Zone y=90) -->
    <rect x="120" y="85" width="840" height="6" rx="3" fill="#1e293b" opacity="0.75" />
    <rect x="120" y="85" width="${progressWidth}" height="6" rx="3" fill="url(#accentGrad)" filter="url(#glow)" />
  `;

  let mainContentSvg = '';

  if (template === 'classified-dossier') {
    // =========================================================================
    // TEMPLATE 1: CLASSIFIED DOSSIER / DECLASSIFIED INVESTIGATION
    // =========================================================================
    const headlineLines = wrapSvgText(rawHeadline.toUpperCase(), 20);
    const highlightLines = rawHighlight ? wrapSvgText(rawHighlight.toUpperCase(), 22).map(escapeXml) : [];
    const sublineLines = rawSubline ? wrapSvgText(rawSubline, 32).map(escapeXml) : [];

    const cardY = 620;
    let textY = cardY + 160;

    const headlineElements = headlineLines.map((line, idx) => {
      const y = textY + idx * 58;
      return `<text xml:space="preserve" x="140" y="${y}" font-family="'Segoe UI', 'Impact', Roboto, sans-serif" font-size="48" font-weight="900" letter-spacing="-0.5" filter="url(#shadow)">${formatKaraokeWords(line, accent)}</text>`;
    }).join('\n');
    textY += headlineLines.length * 58 + 14;

    const highlightElements = highlightLines.map((line, idx) => {
      const y = textY + idx * 50;
      return `
        <!-- Fluorescent Highlighter Stroke Behind Text -->
        <rect x="135" y="${y - 36}" width="780" height="44" rx="4" fill="rgba(251, 191, 36, 0.28)" />
        <text x="140" y="${y}" font-family="'Segoe UI', Roboto, sans-serif" font-size="40" font-weight="900" fill="${accent}" letter-spacing="0.5" filter="url(#glow)">${line}</text>
      `;
    }).join('\n');
    if (highlightLines.length > 0) textY += highlightLines.length * 50 + 16;

    const sublineElements = sublineLines.map((line, idx) => {
      const y = textY + idx * 36;
      return `<text x="140" y="${y}" font-family="'Courier New', Courier, monospace" font-size="25" font-weight="600" fill="#cbd5e1">${line}</text>`;
    }).join('\n');

    mainContentSvg = `
      <g>
        <!-- Declassified Dossier Folder Card -->
        <g transform="translate(100, ${cardY})">
          <rect width="880" height="640" rx="28" fill="rgba(8, 12, 22, 0.88)" stroke="rgba(251, 191, 36, 0.35)" stroke-width="1.8" filter="url(#shadow)" />
          
          <!-- Confidential Intelligence Tag -->
          <g transform="translate(40, 36)">
            <rect width="320" height="42" rx="6" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="1.8" />
            <text x="160" y="28" text-anchor="middle" font-family="'Courier New', monospace" font-size="19" font-weight="900" fill="#ef4444" letter-spacing="3">
              CONFIDENTIAL // DOSSIER
            </text>
          </g>

          <!-- File ID Watermark -->
          <text x="840" y="62" text-anchor="end" font-family="'Courier New', monospace" font-size="14" font-weight="700" fill="#64748b" letter-spacing="1">
            REC: ${branding.slice(0, 12)}
          </text>

          <line x1="40" y1="96" x2="840" y2="96" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
        </g>

        <!-- Dynamic Content Texts -->
        ${headlineElements}
        ${highlightElements}
        ${sublineElements}

        <!-- Bottom Action Pill -->
        <g transform="translate(140, ${cardY + 550})">
          <rect width="800" height="56" rx="18" fill="rgba(251, 191, 36, 0.12)" stroke="rgba(251, 191, 36, 0.4)" stroke-width="1.2" />
          <text x="400" y="36" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#fef08a">
            ${dwellText}
          </text>
        </g>
      </g>
    `;

  } else if (template === 'satellite-telemetry') {
    // =========================================================================
    // TEMPLATE 2: SATELLITE TELEMETRY & RECONNAISSANCE HUD
    // =========================================================================
    const headlineLines = wrapSvgText(rawHeadline.toUpperCase(), 20);
    const highlightLines = rawHighlight ? wrapSvgText(rawHighlight.toUpperCase(), 22).map(escapeXml) : [];
    const sublineLines = rawSubline ? wrapSvgText(rawSubline, 34).map(escapeXml) : [];

    const startY = 820;
    let currentY = startY;

    const headlineElements = headlineLines.map((line, idx) => {
      const y = currentY + idx * 56;
      return `<text xml:space="preserve" x="140" y="${y}" font-family="'Segoe UI', 'Impact', sans-serif" font-size="50" font-weight="900" letter-spacing="-0.5" filter="url(#shadow)">${formatKaraokeWords(line, '#38bdf8')}</text>`;
    }).join('\n');
    currentY += headlineLines.length * 56 + 14;

    const highlightElements = highlightLines.map((line, idx) => {
      const y = currentY + idx * 48;
      return `<text x="140" y="${y}" font-family="'Segoe UI', Roboto, sans-serif" font-size="40" font-weight="900" fill="#38bdf8" letter-spacing="1" filter="url(#glow)">${line}</text>`;
    }).join('\n');
    if (highlightLines.length > 0) currentY += highlightLines.length * 48 + 14;

    const sublineElements = sublineLines.map((line, idx) => {
      const y = currentY + idx * 36;
      return `<text x="140" y="${y}" font-family="'Segoe UI', Roboto, sans-serif" font-size="25" font-weight="500" fill="#cbd5e1" filter="url(#shadow)">${line}</text>`;
    }).join('\n');

    mainContentSvg = `
      <g>
        <!-- Reconnaissance HUD Reticle & Corner Brackets -->
        <g stroke="#38bdf8" stroke-width="2" fill="none" opacity="0.6">
          <path d="M 100 240 L 160 240 M 100 240 L 100 300" />
          <path d="M 980 240 L 920 240 M 980 240 L 980 300" />
          <path d="M 100 1380 L 160 1380 M 100 1380 L 100 1320" />
          <path d="M 980 1380 L 920 1380 M 980 1380 L 980 1320" />
        </g>

        <!-- Top Telemetry Readout -->
        <g transform="translate(100, 180)">
          <rect width="880" height="42" rx="8" fill="rgba(6, 18, 38, 0.75)" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.2" />
          <text x="24" y="27" font-family="'Courier New', monospace" font-size="17" font-weight="700" fill="#38bdf8" letter-spacing="1.5">
            [ SATELLITE RECON ] • TOPOGRAPHIC SCAN
          </text>
          <text x="856" y="27" text-anchor="end" font-family="'Courier New', monospace" font-size="16" font-weight="700" fill="#94a3b8">
            REC // INTEL
          </text>
        </g>

        <!-- Center Target Crosshair -->
        <g transform="translate(540, 520)" opacity="0.4" stroke="#38bdf8" stroke-width="1.5">
          <circle cx="0" cy="0" r="80" fill="none" stroke-dasharray="8,6" />
          <line x1="-120" y1="0" x2="-20" y2="0" />
          <line x1="20" y1="0" x2="120" y2="0" />
          <line x1="0" y1="-120" x2="0" y2="-20" />
          <line x1="0" y1="20" x2="0" y2="120" />
        </g>

        <!-- Soft Lower Third Text Backplate (70% transparent so footage shows through) -->
        <rect x="80" y="760" width="920" height="540" rx="24" fill="rgba(3, 7, 18, 0.72)" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" />

        <!-- Floating Typography -->
        ${headlineElements}
        ${highlightElements}
        ${sublineElements}

        <!-- Bottom Telemetry Coordinates -->
        <g transform="translate(100, 1240)">
          <text x="40" y="24" font-family="'Courier New', monospace" font-size="17" font-weight="700" fill="#38bdf8">
            COORDINATES VERIFIED • ${badge}
          </text>
        </g>
      </g>
    `;

  } else if (template === 'split-screen') {
    // =========================================================================
    // TEMPLATE 4: SPLIT-SCREEN RETENTION ACCELERATOR (Top: Core Narrative, Bottom: Satisfying B-Roll)
    // =========================================================================
    const headlineLines = wrapSvgText(rawHeadline.toUpperCase(), 18);
    const highlightLines = rawHighlight ? wrapSvgText(rawHighlight.toUpperCase(), 22).map(escapeXml) : [];
    const sublineLines = rawSubline ? wrapSvgText(rawSubline, 32).map(escapeXml) : [];

    const topStartY = 280;
    const headlineElements = headlineLines.map((line, idx) => {
      const y = topStartY + idx * 56;
      return `<text xml:space="preserve" x="540" y="${y}" text-anchor="middle" font-family="'Segoe UI', 'Impact', Roboto, sans-serif" font-size="48" font-weight="900" letter-spacing="-0.5" filter="url(#shadow)">${formatKaraokeWords(line, accent)}</text>`;
    }).join('\n');

    const highlightElements = highlightLines.map((line, idx) => {
      const y = 1440 + idx * 48;
      return `<text x="540" y="${y}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="40" font-weight="900" fill="${accent}" letter-spacing="1" filter="url(#glow)">${line}</text>`;
    }).join('\n');

    const sublineElements = sublineLines.map((line, idx) => {
      const y = 1520 + (highlightLines.length > 0 ? 35 : 0) + idx * 34;
      return `<text x="540" y="${y}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" fill="#f1f5f9" filter="url(#shadow)">${line}</text>`;
    }).join('\n');

    mainContentSvg = `
      <g>
        <!-- Top Pill Badge (Safe zone y=150) -->
        <g transform="translate(100, 150)">
          <rect width="880" height="44" rx="22" fill="rgba(8, 12, 22, 0.7)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.2" />
          <text x="32" y="28" font-family="'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="${accent}" letter-spacing="1.5">
            [ PRIMARY FEED: ${badge} ]
          </text>
          <text x="848" y="28" text-anchor="end" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#e2e8f0">
            ${branding}
          </text>
        </g>

        <!-- Top Section Headline -->
        ${headlineElements}

        <!-- Center Glowing Laser Divider (y=960) -->
        <line x1="0" y1="960" x2="1080" y2="960" stroke="${accent}" stroke-width="3" filter="url(#glow)" />
        <line x1="0" y1="960" x2="1080" y2="960" stroke="#ffffff" stroke-width="1" opacity="0.8" />
        
        <!-- Center Cyber HUD Badge -->
        <g transform="translate(320, 938)">
          <rect width="440" height="44" rx="22" fill="#090d16" stroke="${accent}" stroke-width="2" />
          <circle cx="28" cy="22" r="5" fill="${accent}" />
          <text x="220" y="28" text-anchor="middle" font-family="'Courier New', monospace" font-size="14" font-weight="900" fill="#ffffff" letter-spacing="1.5">
            RETENTION ACCELERATOR // B-ROLL
          </text>
        </g>

        <!-- Cyber Tick Corner Marks -->
        <g stroke="${accent}" stroke-width="2" fill="none" opacity="0.7">
          <path d="M 60 935 L 60 985" />
          <path d="M 1020 935 L 1020 985" />
        </g>

        <!-- Bottom B-Roll Region Karaoke & Subtitles (y=1400-1600) -->
        <rect x="100" y="1370" width="880" height="240" rx="20" fill="rgba(3, 7, 18, 0.65)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
        ${highlightElements}
        ${sublineElements}

        <!-- Bottom CTA Pill -->
        <g transform="translate(140, 1650)">
          <rect width="800" height="50" rx="25" fill="rgba(0, 0, 0, 0.75)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.2" />
          <text x="400" y="32" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="700" fill="#ffffff">
            ${dwellText}
          </text>
        </g>
      </g>
    `;
  } else if (template === 'pause-challenge') {
    // =========================================================================
    // TEMPLATE 6: 0.5s PAUSE & INSPECT CHALLENGE (Algorithm Retention Multiplier)
    // =========================================================================
    const widget = opts.interactiveWidget || {};
    const pauseTarget = escapeXml(widget.pauseTarget || '0:04');
    const anomalyClue = escapeXml(widget.anomalyClue || rawHighlight || 'COORDINATES: 47°09\'S 126°43\'W');
    const challengeHeadline = wrapSvgText((rawHeadline || 'PAUSE TO READ THE SECRET').toUpperCase(), 18);

    const challengeElements = challengeHeadline.map((line, idx) => {
      const y = 620 + idx * 56;
      return `<text xml:space="preserve" x="540" y="${y}" text-anchor="middle" font-family="'Segoe UI', 'Impact', Roboto, sans-serif" font-size="50" font-weight="900" letter-spacing="-0.5" filter="url(#shadow)">${formatKaraokeWords(line, '#f87171')}</text>`;
    }).join('\n');

    mainContentSvg = `
      <g>
        <!-- Top Alert Badge Bar -->
        <g transform="translate(100, 140)">
          <rect width="880" height="52" rx="26" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="2" />
          <circle cx="36" cy="26" r="7" fill="#ef4444" />
          <text x="60" y="34" font-family="'Segoe UI', Impact, sans-serif" font-size="20" font-weight="900" fill="#fca5a5" letter-spacing="2">
            ⚠️ 0.5s ALGORITHMIC RETENTION CHALLENGE
          </text>
          <text x="844" y="34" text-anchor="end" font-family="'Courier New', monospace" font-size="16" font-weight="900" fill="#ffffff">
            REWIND &amp; PAUSE
          </text>
        </g>

        <!-- Challenge Headline Text -->
        ${challengeElements}

        <!-- Secret Declassified Document Frame (Center y=700) -->
        <g transform="translate(80, 700)">
          <rect width="920" height="660" rx="28" fill="rgba(8, 12, 24, 0.94)" stroke="#ef4444" stroke-width="2.5" filter="url(#shadow)" />
          
          <!-- Document Header -->
          <g transform="translate(40, 36)">
            <rect width="400" height="38" rx="6" fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" stroke-width="1.5" />
            <text x="20" y="25" font-family="'Courier New', monospace" font-size="17" font-weight="900" fill="#ef4444" letter-spacing="2">
              DECLASSIFIED ARCHIVE // LEAK
            </text>
          </g>
          <text x="880" y="62" text-anchor="end" font-family="'Courier New', monospace" font-size="15" font-weight="700" fill="#64748b">
            DOSSIER #${branding.slice(0, 10)}
          </text>

          <!-- Redacted Blackout Bars -->
          <rect x="40" y="100" width="480" height="26" rx="4" fill="#334155" opacity="0.9" />
          <rect x="40" y="140" width="680" height="26" rx="4" fill="#334155" opacity="0.9" />

          <!-- UNREDACTED ANOMALY EVIDENCE BOX -->
          <g transform="translate(40, 195)">
            <rect width="840" height="150" rx="18" fill="rgba(234, 179, 8, 0.16)" stroke="#eab308" stroke-width="2.2" filter="url(#glow)" />
            <text x="30" y="44" font-family="'Courier New', monospace" font-size="18" font-weight="700" fill="#fde047">
              [ UNREDACTED ANOMALY CLUE • PAUSE TARGET: ${pauseTarget} ]
            </text>
            <text x="30" y="90" font-family="'Courier New', monospace" font-size="28" font-weight="900" fill="#ffffff" letter-spacing="1">
              ${anomalyClue}
            </text>
            <text x="30" y="126" font-family="'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="600" fill="#cbd5e1">
              Only 5% of viewers notice what is hidden in this frame.
            </text>
          </g>

          <!-- More Redacted Bars -->
          <rect x="40" y="375" width="580" height="26" rx="4" fill="#334155" opacity="0.9" />
          <rect x="40" y="415" width="760" height="26" rx="4" fill="#334155" opacity="0.9" />

          <!-- Angled PAUSE Stamp -->
          <g transform="translate(620, 480) rotate(-8)">
            <rect width="260" height="68" rx="10" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="3" />
            <text x="130" y="46" text-anchor="middle" font-family="'Segoe UI', Impact, sans-serif" font-size="28" font-weight="900" fill="#ef4444" letter-spacing="3">
              PAUSE TO READ
            </text>
          </g>

          <!-- Bottom Micro-Challenge CTA Button -->
          <g transform="translate(40, 560)">
            <rect width="840" height="66" rx="20" fill="rgba(255, 255, 255, 0.1)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.2" />
            <text x="420" y="42" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="21" font-weight="800" fill="#ffffff">
              🔍 PAUSE AT ${pauseTarget} &amp; COMMENT WHAT YOU SPOT 👇
            </text>
          </g>
        </g>

        <!-- Bottom Safe Zone Footnote -->
        <g transform="translate(140, 1640)">
          <rect width="800" height="52" rx="26" fill="rgba(0, 0, 0, 0.75)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.2" />
          <text x="400" y="33" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="700" fill="#ffffff">
            ${dwellText}
          </text>
        </g>
      </g>
    `;

  } else {
    // =========================================================================
    // TEMPLATE 3: FULL-BLEED CINEMATIC FOOTAGE (Leaves 90% of Video Visible!)
    // =========================================================================
    const headlineLines = wrapSvgText(rawHeadline.toUpperCase(), 18);
    const highlightLines = rawHighlight ? wrapSvgText(rawHighlight.toUpperCase(), 20).map(escapeXml) : [];
    const sublineLines = rawSubline ? wrapSvgText(rawSubline, 32).map(escapeXml) : [];

    const startY = 880;
    let currentY = startY;

    const headlineElements = headlineLines.map((line, idx) => {
      const y = currentY + idx * 62;
      return `<text xml:space="preserve" x="540" y="${y}" text-anchor="middle" font-family="'Segoe UI', 'Impact', Roboto, sans-serif" font-size="54" font-weight="900" letter-spacing="-0.5" filter="url(#shadow)">${formatKaraokeWords(line, accent)}</text>`;
    }).join('\n');
    currentY += headlineLines.length * 62 + 14;

    const highlightElements = highlightLines.map((line, idx) => {
      const y = currentY + idx * 52;
      return `<text x="540" y="${y}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="900" fill="${accent}" letter-spacing="1" filter="url(#glow)">${line}</text>`;
    }).join('\n');
    if (highlightLines.length > 0) currentY += highlightLines.length * 52 + 16;

    const sublineElements = sublineLines.map((line, idx) => {
      const y = currentY + idx * 36;
      return `<text x="540" y="${y}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="600" fill="#f1f5f9" filter="url(#shadow)">${line}</text>`;
    }).join('\n');

    mainContentSvg = `
      <g>
        <!-- Top Minimalist Pill Header -->
        <g transform="translate(100, 160)">
          <rect width="880" height="46" rx="23" fill="rgba(8, 12, 22, 0.65)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.2" />
          <text x="32" y="30" font-family="'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="800" fill="${accent}" letter-spacing="1.5">
            [ ${badge} ]
          </text>
          <text x="848" y="30" text-anchor="end" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#e2e8f0">
            ${branding}
          </text>
        </g>

        <!-- Subtle Text Shadow Gradient Behind Floating Typography -->
        <rect x="0" y="780" width="1080" height="660" fill="url(#centerFade)" opacity="0.6" />

        <!-- Bold Floating Words directly over 4K Footage -->
        ${headlineElements}
        ${highlightElements}
        ${sublineElements}

        <!-- Bottom CTA Pill -->
        <g transform="translate(140, 1380)">
          <rect width="800" height="54" rx="27" fill="rgba(0, 0, 0, 0.65)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.2" />
          <text x="400" y="35" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#ffffff">
            ${dwellText}
          </text>
        </g>
      </g>
    `;
  }

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
