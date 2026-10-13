import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();
import { CarouselSlide } from '../src/types.js';
import { createMediaSignature } from './videoEngine.js';
import { getActivePersona } from './themePage.js';

const POSTS_MEDIA_DIR = path.join(process.cwd(), 'data', 'media', 'posts');

function xmlEscape(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(text: string, maxChars = 40): string[] {
  const words = String(text || '').trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxChars) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function parseSteps(text: string): { num: string; title: string; body: string }[] {
  const stepRegex = /(?:^|\s)(?:(\d+)\.|\bStep\s*(\d+)[:\s])\s*([^.]+?)(?::|\s*[-–—]\s*|\.\s*)([^\d]+?(?=(?:\s\d+\.|\sStep\s*\d+|$)))/gi;
  const matches: { num: string; title: string; body: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = stepRegex.exec(text)) !== null && matches.length < 3) {
    const num = m[1] || m[2] || String(matches.length + 1);
    const title = m[3]?.trim() || `Step ${num}`;
    const body = m[4]?.trim() || '';
    if (body || title) {
      matches.push({
        num: num.padStart(2, '0'),
        title: title.slice(0, 36),
        body: body.slice(0, 110)
      });
    }
  }

  if (matches.length < 2) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 12);
    if (sentences.length >= 2 && sentences.length <= 4) {
      return sentences.slice(0, 3).map((s, idx) => {
        const parts = s.split(/:\s*/);
        if (parts.length === 2 && parts[0].length < 28) {
          return {
            num: String(idx + 1).padStart(2, '0'),
            title: parts[0].trim(),
            body: parts[1].trim()
          };
        }
        return {
          num: String(idx + 1).padStart(2, '0'),
          title: `Action Principle ${idx + 1}`,
          body: s.trim()
        };
      });
    }
  }

  return matches;
}

interface Palette {
  bg0: string;
  bg1: string;
  accent: string;
  accent2: string;
  badge: string;
}

function getPalette(theme: string, slideNum: number, totalSlides: number = 5): Palette {
  const t = (theme || '').toLowerCase();

  let badge = 'AI INTEL';
  if (slideNum === 1) badge = 'BREAKTHROUGH';
  else if (slideNum === totalSlides) badge = 'SAVE & IMPLEMENT';
  else if (slideNum === 2) badge = 'STACK INSIGHT';
  else if (slideNum === 3) badge = 'FRAMEWORK';
  else if (slideNum === 4) badge = 'BENCHMARK';

  if (t === 'emerald' || t === 'green') {
    return { bg0: '#061c1e', bg1: '#020d12', accent: '#10b981', accent2: '#34d399', badge };
  }
  if (t === 'indigo' || t === 'purple') {
    return { bg0: '#150c2e', bg1: '#080514', accent: '#8b5cf6', accent2: '#a78bfa', badge };
  }
  if (t === 'amber' || t === 'orange') {
    return { bg0: '#261603', bg1: '#0f0801', accent: '#f59e0b', accent2: '#fbbf24', badge };
  }
  if (t === 'rose' || t === 'red') {
    return { bg0: '#280812', bg1: '#100307', accent: '#f43f5e', accent2: '#fb7185', badge };
  }
  return { bg0: '#051d2d', bg1: '#020d16', accent: '#38bdf8', accent2: '#818cf8', badge };
}

export interface RenderedCarouselSlide {
  slideNumber: number;
  filePath: string;
  filename: string;
  url: string;
}

/**
 * Builds a Canva-grade 1080x1350 (4:5 portrait) carousel slide.
 * Uses glassmorphism cards, ambient glowing mesh gradients, verified badges, and high-retention CTAs.
 */
function buildSlideSvg(
  slide: CarouselSlide,
  index: number,
  totalSlides: number,
  displayHandle: string,
  topicTitle: string
): string {
  const slideNum = slide.slideNumber || index + 1;
  const isFirst = slideNum === 1;
  const isLast = slideNum === totalSlides;
  const p = getPalette(slide.theme || '', slideNum, totalSlides);
  const progressBarWidth = Math.round((slideNum / totalSlides) * 1080);

  // Split headline for balanced 2-line rendering
  const headlineWords = String(slide.headline || 'CORE BREAKTHROUGH').trim().split(/\s+/);
  let hLine1 = '';
  let hLine2 = '';
  if (headlineWords.length <= 4) {
    hLine1 = headlineWords.slice(0, 2).join(' ');
    hLine2 = headlineWords.slice(2).join(' ');
  } else {
    const half = Math.ceil(headlineWords.length / 2);
    hLine1 = headlineWords.slice(0, half).join(' ');
    hLine2 = headlineWords.slice(half).join(' ');
  }
  if (!hLine2) {
    hLine2 = hLine1;
    hLine1 = '';
  }

  // Detect content archetype
  const rawBody = String(slide.bodyText || '');
  const steps = parseSteps(rawBody);
  const hasSteps = steps.length >= 2;
  const isComparison = /vs|versus|instead of|old way|legacy|replace/i.test(slide.headline + ' ' + rawBody);
  const metricMatch = rawBody.match(/\b(\d+(?:,\d+)?(?:\.\d+)?(?:x|%|\+)?|\$\d+(?:,\d+)?)\b/i);

  let dynamicContentSvg = '';

  if (isFirst) {
    // -------------------------------------------------------------------------
    // SLIDE 1: CANVA HERO COVER (Maximum Feed Clickthrough)
    // -------------------------------------------------------------------------
    const introLines = wrapLines(rawBody, 36);
    dynamicContentSvg = `
      <g transform="translate(90, 480)">
        <!-- Frosted Hero Container Card -->
        <rect width="900" height="430" rx="32" fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5" />
        <line x1="0" y1="40" x2="0" y2="390" stroke="${p.accent}" stroke-width="6" stroke-linecap="round" />
        
        <text x="48" y="70" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="18" fill="${p.accent}" letter-spacing="2">EXECUTIVE SUMMARY</text>
        ${introLines.slice(0, 3).map((line, i) => `
          <text x="48" y="${130 + i * 44}" font-family="'Segoe UI', Roboto, sans-serif" font-weight="500" font-size="28" fill="#f1f5f9">${xmlEscape(line)}</text>
        `).join('')}

        <!-- Glowing Swipe Hook Pill -->
        <rect x="48" y="290" width="804" height="84" rx="20" fill="rgba(56, 189, 248, 0.12)" stroke="${p.accent}" stroke-width="1.5" />
        <text x="450" y="342" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="24" fill="${p.accent2}">
          ⚡ ${xmlEscape(slide.takeaway || 'Swipe to see the full breakdown →')}
        </text>
      </g>
    `;
  } else if (isLast) {
    // -------------------------------------------------------------------------
    // SLIDE 5: VIRAL SAVE & COMMENT CTA (Drives Saves & Algorithm Ranking)
    // -------------------------------------------------------------------------
    dynamicContentSvg = `
      <g transform="translate(90, 440)">
        <rect width="900" height="500" rx="36" fill="rgba(16, 185, 129, 0.06)" stroke="rgba(16, 185, 129, 0.35)" stroke-width="2" />
        <circle cx="450" cy="110" r="44" fill="rgba(16, 185, 129, 0.2)" stroke="${p.accent}" stroke-width="2" />
        <text x="450" y="125" text-anchor="middle" font-size="36">📌</text>

        <text x="450" y="200" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="36" fill="#ffffff">
          SAVE THIS BLUEPRINT
        </text>
        <text x="450" y="245" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="500" font-size="22" fill="#94a3b8">
          ${xmlEscape(rawBody.slice(0, 100))}
        </text>

        <!-- High-Intent Comment Trigger -->
        <rect x="50" y="300" width="800" height="96" rx="22" fill="rgba(16, 185, 129, 0.15)" stroke="${p.accent}" stroke-width="1.5" />
        <text x="450" y="345" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="22" fill="${p.accent2}">
          💬 Comment "ACCESS" below for the direct link 👇
        </text>
        <text x="450" y="375" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="500" font-size="17" fill="#cbd5e1">
          Our automated assistant will DM you the complete guide instantly.
        </text>

        <!-- Verified Follow Button -->
        <g transform="translate(325, 425)">
          <rect width="250" height="46" rx="23" fill="#ffffff" />
          <text x="125" y="30" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="16" fill="#000000">
            + FOLLOW ${xmlEscape(displayHandle.toUpperCase())}
          </text>
        </g>
      </g>
    `;
  } else if (hasSteps) {
    // -------------------------------------------------------------------------
    // SLIDE WITH NUMBERED PROCESS STEPS
    // -------------------------------------------------------------------------
    const itemCount = Math.min(steps.length, 3);
    const cardHeight = itemCount === 2 ? 180 : 145;
    const cardGap = itemCount === 2 ? 210 : 165;
    const startY = 430;

    dynamicContentSvg = `
      <g transform="translate(90, ${startY})">
        ${steps.slice(0, itemCount).map((st, idx) => `
          <g transform="translate(0, ${idx * cardGap})">
            <rect width="900" height="${cardHeight}" rx="24" fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1.5" />
            
            <!-- Number Pill -->
            <rect x="28" y="28" width="60" height="46" rx="12" fill="${p.accent}" fill-opacity="0.15" stroke="${p.accent}" stroke-width="1.5" />
            <text x="58" y="58" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="22" font-weight="900" fill="${p.accent}">${st.num}</text>
            
            <!-- Content -->
            <text x="110" y="58" font-family="'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="800" fill="#ffffff">${xmlEscape(st.title)}</text>
            <text x="110" y="98" font-family="'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="500" fill="#cbd5e1">${xmlEscape(st.body.slice(0, 60))}</text>
            ${st.body.length > 60 ? `<text x="110" y="126" font-family="'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="500" fill="#cbd5e1">${xmlEscape(st.body.slice(60, 120))}</text>` : ''}
          </g>
        `).join('')}
      </g>
      <!-- Step Takeaway Callout -->
      <g transform="translate(90, 960)">
        <rect width="900" height="64" rx="16" fill="${p.accent}" fill-opacity="0.1" stroke="${p.accent}" stroke-opacity="0.3" stroke-width="1.2" />
        <text x="40" y="40" font-family="'Segoe UI', Roboto, sans-serif" font-weight="bold" font-size="18" fill="${p.accent2}">PRO TIP: ${xmlEscape(slide.takeaway || 'Implement this order for maximum leverage.')}</text>
      </g>
    `;
  } else if (metricMatch && slideNum === 4) {
    // -------------------------------------------------------------------------
    // GIANT METRIC / BENCHMARK CALLOUT
    // -------------------------------------------------------------------------
    const metricVal = metricMatch[1];
    dynamicContentSvg = `
      <g transform="translate(90, 450)">
        <rect width="900" height="480" rx="36" fill="rgba(255, 255, 255, 0.04)" stroke="${p.accent}" stroke-opacity="0.35" stroke-width="2" />
        <circle cx="450" cy="200" r="180" fill="${p.accent}" opacity="0.12" />
        
        <text x="450" y="180" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="108" fill="${p.accent}" letter-spacing="-1">
          ${xmlEscape(metricVal)}
        </text>
        <text x="450" y="245" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="30" fill="#ffffff" letter-spacing="3">
          VERIFIED METRIC
        </text>
        
        <rect x="120" y="295" width="660" height="2" fill="rgba(255, 255, 255, 0.1)" />
        
        <text x="450" y="355" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="500" font-size="24" fill="#cbd5e1">
          ${xmlEscape(rawBody.slice(0, 90))}
        </text>
        <text x="450" y="415" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="22" fill="${p.accent2}">
          ⚡ ${xmlEscape(slide.takeaway || 'The highest performance-to-cost ratio available.')}
        </text>
      </g>
    `;
  } else {
    // -------------------------------------------------------------------------
    // STANDARD / DEEP DIVE CONCEPT CARD
    // -------------------------------------------------------------------------
    const bodyLines = wrapLines(rawBody, 36);
    dynamicContentSvg = `
      <g transform="translate(90, 440)">
        <rect width="900" height="340" rx="28" fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5" />
        <circle cx="48" cy="48" r="8" fill="${p.accent}" />
        <text x="72" y="55" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="17" fill="${p.accent}" letter-spacing="2">THE BREAKTHROUGH</text>

        ${bodyLines.map((line, i) => `
          <text x="48" y="${120 + i * 42}" font-family="'Segoe UI', Roboto, sans-serif" font-size="26" fill="#f1f5f9" font-weight="500">${xmlEscape(line)}</text>
        `).join('')}

        <!-- Takeaway Banner -->
        <rect x="0" y="380" width="900" height="110" rx="22" fill="${p.accent}" fill-opacity="0.1" stroke="${p.accent}" stroke-opacity="0.3" stroke-width="1.5" />
        <text x="44" y="425" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="16" fill="${p.accent}" letter-spacing="1">KEY TAKEAWAY:</text>
        <text x="44" y="462" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" fill="#ffffff" font-weight="bold">${xmlEscape(slide.takeaway || 'Build lean and move fast.')}</text>
      </g>
    `;
  }

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Deep Background Radial Mesh -->
      <radialGradient id="mesh" cx="75%" cy="20%" r="75%">
        <stop offset="0%" stop-color="${p.bg0}" />
        <stop offset="60%" stop-color="${p.bg1}" />
        <stop offset="100%" stop-color="#020408" />
      </radialGradient>
      <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${p.accent}" />
        <stop offset="100%" stop-color="${p.accent2}" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.9" />
      </filter>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="${p.accent}" flood-opacity="0.5" />
      </filter>
    </defs>

    <!-- Deep Dark Canvas -->
    <rect width="1080" height="1350" fill="url(#mesh)" />

    <!-- Top Swipe Progress Bar -->
    <rect x="0" y="0" width="${progressBarWidth}" height="8" fill="url(#accentGrad)" filter="url(#glow)" />

    <!-- Dot Matrix Blueprint Grid -->
    <pattern id="dotGrid" width="48" height="48" patternUnits="userSpaceOnUse">
      <circle cx="24" cy="24" r="1.5" fill="rgba(255, 255, 255, 0.05)" />
    </pattern>
    <rect width="1080" height="1350" fill="url(#dotGrid)" />

    <!-- Ambient Glow Orbs -->
    <circle cx="150" cy="250" r="240" fill="${p.accent}" opacity="0.08" />
    <circle cx="920" cy="1100" r="280" fill="${p.accent2}" opacity="0.06" />

    <!-- HEADER BAR -->
    <!-- Profile Branding (Left) -->
    <g transform="translate(90, 80)">
      <rect width="210" height="44" rx="22" fill="rgba(255, 255, 255, 0.06)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.2" />
      <circle cx="22" cy="22" r="12" fill="${p.accent}" />
      <text x="22" y="27" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-weight="900" font-size="12" fill="#000">S</text>
      <text x="44" y="28" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="16" fill="#ffffff">${xmlEscape(displayHandle)}</text>
      <circle cx="188" cy="22" r="8" fill="#38bdf8" />
      <text x="188" y="26" text-anchor="middle" font-size="11" fill="#000" font-weight="900">✓</text>
    </g>

    <!-- Category Pill (Center) -->
    <g transform="translate(430, 80)">
      <rect width="220" height="44" rx="22" fill="rgba(56, 189, 248, 0.1)" stroke="${p.accent}" stroke-width="1.2" />
      <text x="110" y="28" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="13" fill="${p.accent}" letter-spacing="2">
        • ${xmlEscape(p.badge)} •
      </text>
    </g>

    <!-- Slide Counter Pill (Right) -->
    <g transform="translate(860, 80)">
      <rect width="130" height="44" rx="22" fill="rgba(255, 255, 255, 0.06)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.2" />
      <text x="65" y="28" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="14" fill="#cbd5e1" letter-spacing="1">
        ${slideNum} / ${totalSlides}
      </text>
    </g>

    <!-- HEADLINE SECTION -->
    <g transform="translate(90, 220)">
      ${hLine1 ? `<text x="0" y="50" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="50" fill="#ffffff" letter-spacing="-0.5" filter="url(#shadow)">${xmlEscape(hLine1)}</text>` : ''}
      <text x="0" y="${hLine1 ? 115 : 65}" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="50" fill="url(#accentGrad)" letter-spacing="-0.5">${xmlEscape(hLine2)}</text>
    </g>

    <!-- DYNAMIC MIDDLE SECTION -->
    ${dynamicContentSvg}

    <!-- FOOTER BAR -->
    <line x1="90" y1="1260" x2="990" y2="1260" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.2" />
    <text x="90" y="1295" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18" fill="#fbbf24">
      ${isLast ? '📌 TAP BOOKMARK TO SAVE THIS' : '⚡ SWIPE NEXT →'}
    </text>
    <text x="990" y="1295" text-anchor="end" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="16" fill="#64748b" letter-spacing="2">
      ${xmlEscape(getActivePersona().brand || 'TEXVIC.AI')}
    </text>
  </svg>
  `;
}

export async function renderCarouselPostSlides(post: {
  id: string;
  title: string;
  slides?: CarouselSlide[];
  brandHandle?: string;
}): Promise<RenderedCarouselSlide[]> {
  await fs.mkdir(POSTS_MEDIA_DIR, { recursive: true });
  dotenv.config({ override: true });
  const appUrl = (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');
  const persona = getActivePersona();
  const rawHandle = post.brandHandle || persona.handle || '@texvic_ai';
  const displayHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;

  const slides = Array.isArray(post.slides) && post.slides.length > 0
    ? post.slides
    : [
        {
          slideNumber: 1,
          headline: post.title || 'Breaking AI Updates',
          bodyText: 'The latest models, secret tools, and advancements shifting the tech world this week.',
          takeaway: 'Swipe to see what changed →',
          theme: 'cyan'
        },
        {
          slideNumber: 2,
          headline: 'The Big Breakthrough',
          bodyText: 'A major capability leap just rolled out that makes everyday creation and work 10x faster.',
          takeaway: 'Key takeaway',
          theme: 'indigo'
        },
        {
          slideNumber: 3,
          headline: 'Top Tools & Hacks',
          bodyText: '1. Instant Automation: delegate repetitive tasks. 2. Creative Superpowers: generate 4k visuals. 3. Smart Prompting: get instant answers.',
          takeaway: 'Try these today',
          theme: 'emerald'
        },
        {
          slideNumber: 4,
          headline: 'Why It Matters',
          bodyText: 'Everyday creators and users can now build and automate what used to take entire teams weeks to complete.',
          takeaway: 'Mind-blowing speed',
          theme: 'amber'
        },
        {
          slideNumber: 5,
          headline: 'The Final Verdict',
          bodyText: 'Which new tool or breakthrough are you testing first? Drop your thoughts below!',
          takeaway: 'Bookmark for reference 📌',
          theme: 'emerald'
        }
      ];

  const totalSlides = slides.length;
  const safePostId = String(post.id).replace(/[^a-zA-Z0-9_-]/g, '-');
  const renderedSlides: RenderedCarouselSlide[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideNum = slide.slideNumber || i + 1;
    const filename = `${safePostId}-slide-${slideNum}.jpg`;
    const outputPath = path.join(POSTS_MEDIA_DIR, filename);

    const svg = buildSlideSvg(slide, i, totalSlides, displayHandle, post.title);

    await sharp(Buffer.from(svg))
      .jpeg({ quality: 95, mozjpeg: true })
      .toFile(outputPath);

    const token = createMediaSignature(filename);
    const url = `${appUrl}/media/posts/${encodeURIComponent(filename)}?token=${token}`;

    renderedSlides.push({
      slideNumber: slideNum,
      filePath: outputPath,
      filename,
      url
    });
  }

  return renderedSlides;
}
