import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ToolProfile {
  name: string;
  domain: string;
  category: 'audio_studio' | 'design_canvas' | 'video_studio' | 'code_ide' | 'llm_workspace';
  brandColor: string;
  accentColor: string;
  gradient: [string, string, string];
  iconEmoji: string;
  actionText: string;
}

const KNOWN_TOOLS: Record<string, ToolProfile> = {
  // --- Audio & Music AI ---
  'suno': {
    name: 'Suno V4 Studio',
    domain: 'suno.com/create',
    category: 'audio_studio',
    brandColor: '#ec4899',
    accentColor: '#f472b6',
    gradient: ['#be185d', '#ec4899', '#f43f5e'],
    iconEmoji: '🎵',
    actionText: 'Generate Track 🎵'
  },
  'udio': {
    name: 'Udio AI Studio',
    domain: 'udio.com/studio',
    category: 'audio_studio',
    brandColor: '#8b5cf6',
    accentColor: '#c084fc',
    gradient: ['#6d28d9', '#8b5cf6', '#d946ef'],
    iconEmoji: '🎧',
    actionText: 'Compose Audio 🎧'
  },
  'elevenlabs': {
    name: 'ElevenLabs Voice AI',
    domain: 'elevenlabs.io/speech',
    category: 'audio_studio',
    brandColor: '#3b82f6',
    accentColor: '#60a5fa',
    gradient: ['#1d4ed8', '#3b82f6', '#38bdf8'],
    iconEmoji: '🎙️',
    actionText: 'Synthesize Voice 🎙️'
  },
  'soundraw': {
    name: 'Soundraw Music AI',
    domain: 'soundraw.io/generator',
    category: 'audio_studio',
    brandColor: '#10b981',
    accentColor: '#34d399',
    gradient: ['#047857', '#10b981', '#6ee7b7'],
    iconEmoji: '🎶',
    actionText: 'Generate Stems 🎶'
  },

  // --- Design & Graphic AI ---
  'canva': {
    name: 'Canva Magic AI',
    domain: 'canva.com/design/ai',
    category: 'design_canvas',
    brandColor: '#00c4cc',
    accentColor: '#7d2ae8',
    gradient: ['#00c4cc', '#7d2ae8', '#ff3366'],
    iconEmoji: '🎨',
    actionText: 'Magic Generate 🎨'
  },
  'photoshop': {
    name: 'Adobe Photoshop AI',
    domain: 'photoshop.adobe.com',
    category: 'design_canvas',
    brandColor: '#31a8ff',
    accentColor: '#00c4cc',
    gradient: ['#001e36', '#004f98', '#31a8ff'],
    iconEmoji: '🖌️',
    actionText: 'Generative Fill ✨'
  },
  'figma': {
    name: 'Figma AI Studio',
    domain: 'figma.com/design',
    category: 'design_canvas',
    brandColor: '#f24e1e',
    accentColor: '#a259ff',
    gradient: ['#f24e1e', '#a259ff', '#1abcfe'],
    iconEmoji: '📐',
    actionText: 'Create Component 📐'
  },
  'midjourney': {
    name: 'Midjourney v7',
    domain: 'midjourney.com/explore',
    category: 'design_canvas',
    brandColor: '#6366f1',
    accentColor: '#818cf8',
    gradient: ['#4338ca', '#6366f1', '#a5b4fc'],
    iconEmoji: '✨',
    actionText: 'Upscale 4K ✨'
  },
  'flux': {
    name: 'FLUX.1 Pro AI',
    domain: 'blackforestlabs.ai/flux',
    category: 'design_canvas',
    brandColor: '#14b8a6',
    accentColor: '#2dd4bf',
    gradient: ['#0f766e', '#14b8a6', '#5eead4'],
    iconEmoji: '💫',
    actionText: 'Render Image 💫'
  },
  'recraft': {
    name: 'Recraft Vector AI',
    domain: 'recraft.ai/canvas',
    category: 'design_canvas',
    brandColor: '#f97316',
    accentColor: '#fb923c',
    gradient: ['#c2410c', '#ea580c', '#f97316'],
    iconEmoji: '✏️',
    actionText: 'Export SVG ✏️'
  },
  'ideogram': {
    name: 'Ideogram 2.0',
    domain: 'ideogram.ai/create',
    category: 'design_canvas',
    brandColor: '#f43f5e',
    accentColor: '#fb7185',
    gradient: ['#be123c', '#e11d48', '#f43f5e'],
    iconEmoji: '🖼️',
    actionText: 'Render Poster 🖼️'
  },

  // --- Video & 3D AI ---
  'luma': {
    name: 'Luma Dream Machine',
    domain: 'lumalabs.ai/dream-machine',
    category: 'video_studio',
    brandColor: '#f43f5e',
    accentColor: '#fb7185',
    gradient: ['#be123c', '#f43f5e', '#fda4af'],
    iconEmoji: '🎥',
    actionText: 'Render 3D Video 🎬'
  },
  'dream machine': {
    name: 'Luma Dream Machine',
    domain: 'lumalabs.ai/dream-machine',
    category: 'video_studio',
    brandColor: '#f43f5e',
    accentColor: '#fb7185',
    gradient: ['#be123c', '#f43f5e', '#fda4af'],
    iconEmoji: '🎥',
    actionText: 'Render 3D Video 🎬'
  },
  'kling': {
    name: 'Kling AI 1.5',
    domain: 'klingai.com/video',
    category: 'video_studio',
    brandColor: '#ef4444',
    accentColor: '#f87171',
    gradient: ['#b91c1c', '#dc2626', '#f87171'],
    iconEmoji: '🎬',
    actionText: 'Extend Clip 🎬'
  },
  'runway': {
    name: 'Runway Gen-3 Alpha',
    domain: 'runwayml.com/gen-3',
    category: 'video_studio',
    brandColor: '#8b5cf6',
    accentColor: '#a78bfa',
    gradient: ['#6d28d9', '#8b5cf6', '#c4b5fd'],
    iconEmoji: '🎞️',
    actionText: 'Render Motion 🎞️'
  },
  'sora': {
    name: 'OpenAI Sora Studio',
    domain: 'sora.com/studio',
    category: 'video_studio',
    brandColor: '#ec4899',
    accentColor: '#f472b6',
    gradient: ['#be185d', '#ec4899', '#fbcfe8'],
    iconEmoji: '✨',
    actionText: 'Generate Scene ✨'
  },
  'google vids': {
    name: 'Google Vids Workspace',
    domain: 'vids.google.com/create',
    category: 'video_studio',
    brandColor: '#4285f4',
    accentColor: '#38bdf8',
    gradient: ['#4285f4', '#9b72cb', '#fbbc05'],
    iconEmoji: '📹',
    actionText: 'Export Video 📹'
  },
  'vids': {
    name: 'Google Vids Workspace',
    domain: 'vids.google.com/create',
    category: 'video_studio',
    brandColor: '#4285f4',
    accentColor: '#38bdf8',
    gradient: ['#4285f4', '#9b72cb', '#fbbc05'],
    iconEmoji: '📹',
    actionText: 'Export Video 📹'
  },
  'pika': {
    name: 'Pika 2.0 Studio',
    domain: 'pika.art/create',
    category: 'video_studio',
    brandColor: '#eab308',
    accentColor: '#fde047',
    gradient: ['#a16207', '#ca8a04', '#eab308'],
    iconEmoji: '⚡',
    actionText: 'Generate FX ⚡'
  },

  // --- Code & Agent IDE ---
  'cursor': {
    name: 'Cursor AI Composer',
    domain: 'cursor.com/composer',
    category: 'code_ide',
    brandColor: '#0ea5e9',
    accentColor: '#38bdf8',
    gradient: ['#0284c7', '#0ea5e9', '#38bdf8'],
    iconEmoji: '💻',
    actionText: 'Accept Diff ⚡'
  },
  'windsurf': {
    name: 'Windsurf Cascade Agent',
    domain: 'codeium.com/windsurf',
    category: 'code_ide',
    brandColor: '#06b6d4',
    accentColor: '#22d3ee',
    gradient: ['#0891b2', '#06b6d4', '#67e8f9'],
    iconEmoji: '🌊',
    actionText: 'Apply Cascade 🌊'
  },
  'copilot': {
    name: 'GitHub Copilot Workspace',
    domain: 'github.com/copilot',
    category: 'code_ide',
    brandColor: '#6366f1',
    accentColor: '#818cf8',
    gradient: ['#4338ca', '#6366f1', '#a5b4fc'],
    iconEmoji: '🐙',
    actionText: 'Create PR 🐙'
  },
  'v0': {
    name: 'v0 by Vercel',
    domain: 'v0.dev/chat',
    category: 'code_ide',
    brandColor: '#38bdf8',
    accentColor: '#7dd3fc',
    gradient: ['#0f172a', '#1e293b', '#38bdf8'],
    iconEmoji: '▲',
    actionText: 'Deploy App ▲'
  },
  'bolt': {
    name: 'Bolt.new WebContainers',
    domain: 'bolt.new',
    category: 'code_ide',
    brandColor: '#f59e0b',
    accentColor: '#fbbf24',
    gradient: ['#d97706', '#f59e0b', '#fbbf24'],
    iconEmoji: '⚡',
    actionText: 'Run Fullstack ⚡'
  },

  // --- LLM & Reasoning ---
  'deepseek': {
    name: 'DeepSeek R1 Reasoning',
    domain: 'chat.deepseek.com',
    category: 'llm_workspace',
    brandColor: '#2563eb',
    accentColor: '#60a5fa',
    gradient: ['#1d4ed8', '#2563eb', '#93c5fd'],
    iconEmoji: '⚡',
    actionText: 'Run R1 Engine ⚡'
  },
  'claude': {
    name: 'Claude 3.7 Sonnet',
    domain: 'claude.ai/new',
    category: 'llm_workspace',
    brandColor: '#d97706',
    accentColor: '#fbbf24',
    gradient: ['#b45309', '#d97706', '#f59e0b'],
    iconEmoji: '🧠',
    actionText: 'Think & Solve 🧠'
  },
  'chatgpt': {
    name: 'ChatGPT 4o Canvas',
    domain: 'chatgpt.com/canvas',
    category: 'llm_workspace',
    brandColor: '#10a37f',
    accentColor: '#34d399',
    gradient: ['#047857', '#10a37f', '#34d399'],
    iconEmoji: '💬',
    actionText: 'Generate Canvas 💬'
  },
  'perplexity': {
    name: 'Perplexity Pro Research',
    domain: 'perplexity.ai/search',
    category: 'llm_workspace',
    brandColor: '#06b6d4',
    accentColor: '#22d3ee',
    gradient: ['#0e7490', '#06b6d4', '#38bdf8'],
    iconEmoji: '🔍',
    actionText: 'Deep Search 🔍'
  },
  'notebooklm': {
    name: 'NotebookLM Audio Overviews',
    domain: 'notebooklm.google.com',
    category: 'audio_studio',
    brandColor: '#4285f4',
    accentColor: '#60a5fa',
    gradient: ['#1d4ed8', '#4285f4', '#93c5fd'],
    iconEmoji: '🎙️',
    actionText: 'Generate Podcast 🎙️'
  },
  'grok': {
    name: 'Grok 3 Reasoning',
    domain: 'x.ai/grok',
    category: 'llm_workspace',
    brandColor: '#ef4444',
    accentColor: '#f87171',
    gradient: ['#991b1b', '#dc2626', '#f87171'],
    iconEmoji: '🚀',
    actionText: 'Think Deep 🚀'
  },
  'gemini': {
    name: 'Google Gemini 2.5 Flash',
    domain: 'gemini.google.com/app',
    category: 'llm_workspace',
    brandColor: '#8b5cf6',
    accentColor: '#c084fc',
    gradient: ['#6d28d9', '#8b5cf6', '#38bdf8'],
    iconEmoji: '✨',
    actionText: 'Synthesize Multi-Modal ✨'
  }
};

/**
 * Dynamically resolves tool identity, category, and theme colors
 * without ever falling back to generic "Frontier AI Studio" placeholder.
 */
export function identifyToolProfile(text: string): ToolProfile {
  const lower = text.toLowerCase();
  
  // 1. Exact match in comprehensive known dictionary
  for (const [key, profile] of Object.entries(KNOWN_TOOLS)) {
    if (lower.includes(key)) {
      return profile;
    }
  }

  // 2. Intelligent Dynamic Parser: Extract actual tool name from headline
  const match = text.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z0-9][a-zA-Z0-9]+)?)\s+(?:just|dropped|released|update|v\d|is here|ai|model|features)/i)
    || text.match(/\b([A-Z][a-zA-Z0-9]{2,15})\b/);

  const rawName = match ? match[1].trim() : 'Next-Gen AI';
  const cleanName = rawName.length > 2 && rawName.length < 24 ? rawName : 'Apex AI Studio';
  const domainSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Category detection from semantic keywords
  if (/music|song|beat|audio|sound|voice|tts|vocal|track|melody/i.test(text)) {
    return {
      name: `${cleanName} Studio`,
      domain: `${domainSlug}.ai/create`,
      category: 'audio_studio',
      brandColor: '#ec4899',
      accentColor: '#f472b6',
      gradient: ['#be185d', '#ec4899', '#f43f5e'],
      iconEmoji: '🎵',
      actionText: 'Generate Track 🎵'
    };
  }

  if (/design|canvas|image|photo|vector|art|paint|poster|logo|thumbnail/i.test(text)) {
    return {
      name: `${cleanName} Design`,
      domain: `${domainSlug}.ai/canvas`,
      category: 'design_canvas',
      brandColor: '#00c4cc',
      accentColor: '#7d2ae8',
      gradient: ['#00c4cc', '#7d2ae8', '#ec4899'],
      iconEmoji: '🎨',
      actionText: 'Generate Design 🎨'
    };
  }

  if (/video|film|clip|motion|animation|3d|render|camera|movie|vfx/i.test(text)) {
    return {
      name: `${cleanName} Video`,
      domain: `${domainSlug}.ai/studio`,
      category: 'video_studio',
      brandColor: '#f43f5e',
      accentColor: '#fb7185',
      gradient: ['#be123c', '#f43f5e', '#a855f7'],
      iconEmoji: '🎬',
      actionText: 'Render Video 🎬'
    };
  }

  if (/code|coding|dev|developer|ide|terminal|programming|agent|github|repo/i.test(text)) {
    return {
      name: `${cleanName} Code`,
      domain: `${domainSlug}.ai/editor`,
      category: 'code_ide',
      brandColor: '#0ea5e9',
      accentColor: '#38bdf8',
      gradient: ['#0284c7', '#0ea5e9', '#6366f1'],
      iconEmoji: '💻',
      actionText: 'Deploy Code ⚡'
    };
  }

  // Default to customized modern LLM Reasoning dashboard with actual tool name
  return {
    name: `${cleanName} AI`,
    domain: `chat.${domainSlug}.ai`,
    category: 'llm_workspace',
    brandColor: '#2563eb',
    accentColor: '#60a5fa',
    gradient: ['#1d4ed8', '#2563eb', '#38bdf8'],
    iconEmoji: '⚡',
    actionText: 'Run Workflow ✨'
  };
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
 * Extracts context-relevant, high-value bullet points from scene data
 * instead of static placeholder strings.
 */
function extractDynamicBulletPoints(scene: any, tool: ToolProfile): string[] {
  const points: string[] = [];
  
  if (scene?.highlight && String(scene.highlight).length > 6) {
    points.push(`✓ ${escapeXml(scene.highlight)}`);
  }
  if (scene?.subline && String(scene.subline).length > 6) {
    points.push(`✓ ${escapeXml(scene.subline)}`);
  }
  if (scene?.secondaryText && scene.secondaryText !== scene.subline && String(scene.secondaryText).length > 6) {
    points.push(`✓ ${escapeXml(scene.secondaryText)}`);
  }

  const categoryFallbacks: Record<string, string[]> = {
    audio_studio: [
      '✓ Studio-grade 48kHz audio synthesis with instant stem separation',
      '✓ Full song generation with lyrics and vocal arrangement in 12s',
      '✓ Commercial license with zero copyright strike risk'
    ],
    design_canvas: [
      '✓ 1-click vector asset generation with transparent alpha export',
      '✓ Intelligent layout reflow for all social aspect ratios (9:16, 1:1, 16:9)',
      '✓ Generative fill and magic object removal with pixel-perfect blending'
    ],
    video_studio: [
      '✓ Hyper-realistic 4K motion synthesis with cinematic lighting',
      '✓ 3D camera trajectory control (pan, orbit, zoom, dolly)',
      '✓ Temporal consistency with zero artifact morphing between cuts'
    ],
    code_ide: [
      '✓ Multi-file autonomous editing with AST awareness',
      '✓ Instant test generation and type-safety verification',
      '✓ Automated pull request and edge deployment ready'
    ],
    llm_workspace: [
      '✓ Hybrid reasoning engine switching between instant and deep compute',
      '✓ Zero hallucination verification with live web grounding',
      '✓ Saves 15+ hours of repetitive manual work weekly'
    ]
  };

  const defaults = categoryFallbacks[tool.category] || categoryFallbacks.llm_workspace;
  for (let i = 0; i < defaults.length && points.length < 3; i++) {
    points.push(defaults[i]);
  }

  return points.slice(0, 3);
}

function getCategoryBadge(tool: ToolProfile, reel: any): string {
  if (reel?.verticalBadge && reel.verticalBadge.length > 3) {
    return escapeXml(reel.verticalBadge.replace(/[\[\]]/g, '').trim().toUpperCase());
  }
  switch (tool.category) {
    case 'audio_studio':
      return '🎵 NEXT-GEN MUSIC & AUDIO AI';
    case 'design_canvas':
      return '🎨 1-CLICK AI DESIGN STUDIO';
    case 'video_studio':
      return '🎬 CINEMATIC 4K VIDEO AI';
    case 'code_ide':
      return '💻 AUTONOMOUS CODING AGENT';
    default:
      return '⚡ 2026 AI REASONING BREAKTHROUGH';
  }
}

function getBottomCallToAction(tool: ToolProfile): string {
  const shortName = tool.name.split(' ')[0].toUpperCase();
  return `💬 Comment <tspan fill="${tool.accentColor}" font-weight="900">'${shortName}'</tspan> for direct access link &amp; prompt template 👇`;
}

export function buildSoftwareScreenSvg(
  tool: ToolProfile,
  scene: any,
  index: number,
  reel: any
): string {
  const headline = escapeXml(scene?.headline || 'AI WORKFLOW');
  const highlight = escapeXml(scene?.highlight || 'NEXT-GEN TOOL');
  const subline = escapeXml(scene?.subline || scene?.secondaryText || 'Automate manual tasks in seconds');
  const url = `${tool.domain}/${index === 0 ? 'new-project' : index === 1 ? 'editor' : 'preview'}`;
  
  const g0 = tool.gradient[0];
  const g1 = tool.gradient[1];
  const g2 = tool.gradient[2];

  const bullets = extractDynamicBulletPoints(scene, tool);
  const badgeText = getCategoryBadge(tool, reel);
  const bottomCta = getBottomCallToAction(tool);

  let workspaceSvg = '';

  // =========================================================================
  // 1. AUDIO & MUSIC STUDIO (Suno, Udio, ElevenLabs, Soundraw)
  // =========================================================================
  if (tool.category === 'audio_studio') {
    workspaceSvg = `
      <g transform="translate(0, 140)">
        <!-- Top DAW Control Bar -->
        <rect width="1000" height="60" fill="#0c1322" stroke="#1e293b" stroke-width="1" />
        <text x="35" y="38" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="15" fill="#f43f5e">TEMPO: 124 BPM</text>
        <text x="220" y="38" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="15" fill="#a855f7">KEY: D-MIN</text>
        <text x="380" y="38" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="15" fill="#38bdf8">METER: 4/4</text>
        
        <!-- Master Stereo Volume LED Meter -->
        <g transform="translate(560, 20)">
          <rect width="140" height="20" rx="4" fill="#030712" />
          <rect x="2" y="2" width="100" height="16" rx="2" fill="#10b981" />
          <rect x="104" y="2" width="22" height="16" rx="2" fill="#f59e0b" />
          <rect x="128" y="2" width="10" height="16" rx="2" fill="#ef4444" />
        </g>
        <text x="715" y="36" font-family="monospace" font-size="13" fill="#94a3b8">-0.2 dB</text>

        <!-- Main Audio Waveform Visualizer Canvas -->
        <g transform="translate(40, 80)">
          <rect width="920" height="340" rx="18" fill="#030712" stroke="url(#toolGrad)" stroke-width="2" />
          
          <!-- Animated Frequency Waveform Bars -->
          <g transform="translate(30, 40)">
            <text x="10" y="20" font-family="'Segoe UI', sans-serif" font-weight="900" font-size="24" fill="#ffffff">${headline}</text>
            <text x="10" y="52" font-family="'Segoe UI', sans-serif" font-weight="600" font-size="16" fill="${tool.accentColor}">Stem Separation • Studio Master 48kHz</text>
            
            <!-- Oscilloscope Waveform Array -->
            <g transform="translate(10, 80)">
              <rect x="0" y="30" width="8" height="60" rx="4" fill="${tool.accentColor}" opacity="0.9" />
              <rect x="16" y="10" width="8" height="100" rx="4" fill="${tool.brandColor}" />
              <rect x="32" y="25" width="8" height="70" rx="4" fill="${tool.accentColor}" />
              <rect x="48" y="5" width="8" height="110" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="64" y="20" width="8" height="80" rx="4" fill="${tool.brandColor}" />
              <rect x="80" y="40" width="8" height="40" rx="4" fill="${tool.accentColor}" />
              <rect x="96" y="15" width="8" height="90" rx="4" fill="${tool.brandColor}" />
              <rect x="112" y="0" width="8" height="120" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="128" y="25" width="8" height="70" rx="4" fill="${tool.accentColor}" />
              <rect x="144" y="35" width="8" height="50" rx="4" fill="${tool.brandColor}" />
              <rect x="160" y="10" width="8" height="100" rx="4" fill="${tool.accentColor}" />
              <rect x="176" y="5" width="8" height="110" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="192" y="20" width="8" height="80" rx="4" fill="${tool.brandColor}" />
              <rect x="208" y="45" width="8" height="30" rx="4" fill="${tool.accentColor}" />
              <rect x="224" y="15" width="8" height="90" rx="4" fill="${tool.brandColor}" />
              <rect x="240" y="8" width="8" height="104" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="256" y="22" width="8" height="76" rx="4" fill="${tool.accentColor}" />
              <rect x="272" y="30" width="8" height="60" rx="4" fill="${tool.brandColor}" />
              <rect x="288" y="12" width="8" height="96" rx="4" fill="${tool.accentColor}" />
              <rect x="304" y="3" width="8" height="114" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="320" y="18" width="8" height="84" rx="4" fill="${tool.brandColor}" />
              <rect x="336" y="28" width="8" height="64" rx="4" fill="${tool.accentColor}" />
              <rect x="352" y="40" width="8" height="40" rx="4" fill="${tool.brandColor}" />
              <rect x="368" y="15" width="8" height="90" rx="4" fill="${tool.accentColor}" />
              <rect x="384" y="5" width="8" height="110" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="400" y="22" width="8" height="76" rx="4" fill="${tool.brandColor}" />
              <rect x="416" y="35" width="8" height="50" rx="4" fill="${tool.accentColor}" />
              <rect x="432" y="12" width="8" height="96" rx="4" fill="${tool.brandColor}" />
              <rect x="448" y="2" width="8" height="116" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="464" y="25" width="8" height="70" rx="4" fill="${tool.accentColor}" />
              <rect x="480" y="40" width="8" height="40" rx="4" fill="${tool.brandColor}" />
              <rect x="496" y="18" width="8" height="84" rx="4" fill="${tool.accentColor}" />
              <rect x="512" y="8" width="8" height="104" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="528" y="30" width="8" height="60" rx="4" fill="${tool.brandColor}" />
              <rect x="544" y="42" width="8" height="36" rx="4" fill="${tool.accentColor}" />
              <rect x="560" y="15" width="8" height="90" rx="4" fill="${tool.brandColor}" />
              <rect x="576" y="6" width="8" height="108" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="592" y="20" width="8" height="80" rx="4" fill="${tool.accentColor}" />
              <rect x="608" y="32" width="8" height="56" rx="4" fill="${tool.brandColor}" />
              <rect x="624" y="10" width="8" height="100" rx="4" fill="${tool.accentColor}" />
              <rect x="640" y="4" width="8" height="112" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="656" y="24" width="8" height="72" rx="4" fill="${tool.brandColor}" />
              <rect x="672" y="38" width="8" height="44" rx="4" fill="${tool.accentColor}" />
              <rect x="688" y="14" width="8" height="92" rx="4" fill="${tool.brandColor}" />
              <rect x="704" y="8" width="8" height="104" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="720" y="26" width="8" height="68" rx="4" fill="${tool.accentColor}" />
              <rect x="736" y="36" width="8" height="48" rx="4" fill="${tool.brandColor}" />
              <rect x="752" y="18" width="8" height="84" rx="4" fill="${tool.accentColor}" />
              <rect x="768" y="6" width="8" height="108" rx="4" fill="#ffffff" filter="url(#glow)" />
              <rect x="784" y="22" width="8" height="76" rx="4" fill="${tool.brandColor}" />
              <rect x="800" y="35" width="8" height="50" rx="4" fill="${tool.accentColor}" />
              <rect x="816" y="12" width="8" height="96" rx="4" fill="${tool.brandColor}" />
              <rect x="832" y="40" width="8" height="40" rx="4" fill="${tool.accentColor}" />
            </g>

            <!-- Playhead scrubber line -->
            <line x1="432" y1="50" x2="432" y2="230" stroke="#ffffff" stroke-width="2.5" filter="url(#glow)" />
            <polygon points="426,50 438,50 432,60" fill="#ffffff" />
          </g>
        </g>

        <!-- Track Arranger Rows -->
        <g transform="translate(40, 440)">
          <!-- Track 1: Vocals -->
          <rect y="0" width="920" height="70" rx="12" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />
          <rect x="12" y="15" width="130" height="40" rx="8" fill="#831843" />
          <text x="24" y="40" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="14" fill="#fbcfe8">🎤 Lead Vocals</text>
          <path d="M 160 35 Q 220 15, 280 35 T 400 35 T 520 35 T 640 35 T 760 35 T 880 35" stroke="#f472b6" stroke-width="3" fill="none" />

          <!-- Track 2: Synths -->
          <rect y="82" width="920" height="70" rx="12" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />
          <rect x="12" y="97" width="130" height="40" rx="8" fill="#4c1d95" />
          <text x="24" y="122" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="14" fill="#e9d5ff">🎹 Synth Lead</text>
          <path d="M 160 117 L 190 95 L 220 135 L 260 100 L 300 130 L 360 95 L 420 135 L 500 100 L 600 130 L 720 95 L 880 117" stroke="#c084fc" stroke-width="2.5" fill="none" />

          <!-- Track 3: 808 Drums -->
          <rect y="164" width="920" height="70" rx="12" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />
          <rect x="12" y="179" width="130" height="40" rx="8" fill="#14532d" />
          <text x="24" y="204" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="14" fill="#bbf7d0">🥁 808 Beats</text>
          <g transform="translate(160, 185)">
            <rect x="0" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="40" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="80" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="140" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="220" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="300" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="400" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="520" y="5" width="22" height="20" rx="4" fill="#22c55e" />
            <rect x="640" y="5" width="22" height="20" rx="4" fill="#22c55e" />
          </g>
        </g>

        <!-- Dynamic Context & Bullet Points Card -->
        <g transform="translate(40, 700)" filter="url(#shadow)">
          <rect width="920" height="260" rx="18" fill="rgba(15, 23, 42, 0.95)" stroke="url(#toolGrad)" stroke-width="2" />
          <text x="35" y="45" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="20" fill="#ffffff">${highlight}</text>
          <text x="35" y="80" font-family="'Segoe UI', sans-serif" font-size="15" fill="#94a3b8">${subline}</text>
          
          <g transform="translate(35, 115)">
            <text y="0" font-family="'Segoe UI', sans-serif" font-size="16" fill="#f472b6" font-weight="600">${bullets[0] || '✓ Studio-grade AI master generation'}</text>
            <text y="35" font-family="'Segoe UI', sans-serif" font-size="16" fill="#c084fc" font-weight="600">${bullets[1] || '✓ Instant stem separation for vocals &amp; instruments'}</text>
            <text y="70" font-family="'Segoe UI', sans-serif" font-size="16" fill="#38bdf8" font-weight="600">${bullets[2] || '✓ Zero copyright strikes • Commercial monetization ready'}</text>
          </g>

          <rect x="680" y="180" width="200" height="52" rx="26" fill="url(#toolGrad)" filter="url(#glow)" />
          <text x="780" y="213" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="17" fill="#ffffff">${tool.actionText}</text>
        </g>
      </g>
    `;
  }
  // =========================================================================
  // 2. DESIGN & GRAPHICS STUDIO (Canva, Photoshop, Figma, Midjourney)
  // =========================================================================
  else if (tool.category === 'design_canvas') {
    workspaceSvg = `
      <g transform="translate(0, 140)">
        <!-- Left Vertical Tool Palette -->
        <g transform="translate(30, 20)">
          <rect width="64" height="660" rx="16" fill="#0b1120" stroke="#1e293b" stroke-width="1.5" />
          <text x="22" y="50" font-size="22" fill="${tool.accentColor}">↖</text>
          <text x="22" y="115" font-size="22" fill="#94a3b8">✂</text>
          <text x="20" y="180" font-size="22" fill="#a855f7">🪄</text>
          <text x="22" y="245" font-size="22" fill="#38bdf8">🔤</text>
          <text x="22" y="310" font-size="22" fill="#10b981">🎨</text>
          <text x="22" y="375" font-size="22" fill="#f59e0b">📐</text>
          <text x="22" y="440" font-size="22" fill="#94a3b8">🔍</text>
        </g>

        <!-- Central Design Artboard with Bounding Box & Handles -->
        <g transform="translate(114, 20)">
          <rect width="580" height="660" rx="18" fill="#030712" stroke="#334155" stroke-width="1.5" />
          
          <!-- Vector Artboard Canvas -->
          <g transform="translate(40, 40)">
            <rect width="500" height="580" rx="14" fill="url(#bgGrad)" stroke="${tool.accentColor}" stroke-dasharray="6,6" stroke-width="2" />
            
            <!-- Graphic Design Focal Card -->
            <g transform="translate(40, 50)">
              <defs>
                <linearGradient id="artGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="${g0}" stop-opacity="0.8" />
                  <stop offset="50%" stop-color="${g1}" stop-opacity="0.6" />
                  <stop offset="100%" stop-color="${g2}" stop-opacity="0.9" />
                </linearGradient>
              </defs>
              <rect width="420" height="340" rx="20" fill="url(#artGrad)" filter="url(#glow)" />
              
              <!-- Floating Abstract Design Shapes -->
              <circle cx="100" cy="100" r="60" fill="#ffffff" opacity="0.15" />
              <polygon points="320,60 380,180 260,160" fill="#ffffff" opacity="0.2" />
              
              <text x="210" y="160" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="28" fill="#ffffff" letter-spacing="1">
                ${headline}
              </text>
              <text x="210" y="210" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18" fill="#fdf4ff">
                ${highlight}
              </text>
              
              <!-- Selection Transform Handles -->
              <circle cx="0" cy="0" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
              <circle cx="210" cy="0" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
              <circle cx="420" cy="0" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
              <circle cx="420" cy="170" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
              <circle cx="420" cy="340" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
              <circle cx="210" cy="340" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
              <circle cx="0" cy="340" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
              <circle cx="0" cy="170" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
            </g>

            <rect x="40" y="420" width="420" height="50" rx="10" fill="#0f172a" stroke="#1e293b" />
            <text x="60" y="452" font-family="'Segoe UI', sans-serif" font-weight="600" font-size="15" fill="#38bdf8">🎨 Auto-Color Palette Extracted • 300 DPI Ultra HD</text>
          </g>
        </g>

        <!-- Right Layer Stack & Inspector Panel -->
        <g transform="translate(714, 20)">
          <rect width="256" height="660" rx="16" fill="#0b1120" stroke="#1e293b" stroke-width="1.5" />
          <text x="24" y="40" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="15" fill="#ffffff">LAYERS</text>
          
          <rect x="18" y="60" width="220" height="50" rx="10" fill="#1e293b" stroke="${tool.accentColor}" stroke-width="1.5" />
          <text x="32" y="92" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="13" fill="#ffffff">👁️ 🔤 Headline Text</text>
          
          <rect x="18" y="120" width="220" height="50" rx="10" fill="#0f172a" stroke="#1e293b" />
          <text x="32" y="152" font-family="'Segoe UI', sans-serif" font-size="13" fill="#94a3b8">👁️ 🪄 Magic Fill Area</text>
          
          <rect x="18" y="180" width="220" height="50" rx="10" fill="#0f172a" stroke="#1e293b" />
          <text x="32" y="212" font-family="'Segoe UI', sans-serif" font-size="13" fill="#94a3b8">👁️ 🖼️ 4K AI Background</text>

          <!-- Inspector Specs -->
          <g transform="translate(18, 260)">
            <text y="0" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="13" fill="#64748b">CANVAS SPECS</text>
            <text y="30" font-family="monospace" font-size="13" fill="#38bdf8">Width: 1080 px</text>
            <text y="55" font-family="monospace" font-size="13" fill="#38bdf8">Height: 1920 px</text>
            <text y="80" font-family="monospace" font-size="13" fill="#a855f7">Color: DCI-P3</text>
          </g>
        </g>

        <!-- Dynamic Context Card & Output Details -->
        <g transform="translate(30, 700)" filter="url(#shadow)">
          <rect width="940" height="260" rx="18" fill="rgba(15, 23, 42, 0.95)" stroke="url(#toolGrad)" stroke-width="2" />
          <text x="35" y="45" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="20" fill="#ffffff">${highlight}</text>
          <text x="35" y="80" font-family="'Segoe UI', sans-serif" font-size="15" fill="#94a3b8">${subline}</text>
          
          <g transform="translate(35, 115)">
            <text y="0" font-family="'Segoe UI', sans-serif" font-size="16" fill="#38bdf8" font-weight="600">${bullets[0]}</text>
            <text y="35" font-family="'Segoe UI', sans-serif" font-size="16" fill="#a855f7" font-weight="600">${bullets[1]}</text>
            <text y="70" font-family="'Segoe UI', sans-serif" font-size="16" fill="#34d399" font-weight="600">${bullets[2]}</text>
          </g>

          <rect x="700" y="180" width="200" height="52" rx="26" fill="url(#toolGrad)" filter="url(#glow)" />
          <text x="800" y="213" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="17" fill="#ffffff">${tool.actionText}</text>
        </g>
      </g>
    `;
  }
  // =========================================================================
  // 3. VIDEO & 3D STUDIO (Luma, Kling, Runway, Google Vids, Sora)
  // =========================================================================
  else if (tool.category === 'video_studio') {
    workspaceSvg = `
      <g transform="translate(0, 140)">
        <!-- Video Player Monitor (16:9 Cinema Viewport) -->
        <g transform="translate(50, 20)">
          <rect width="900" height="480" rx="18" fill="#000000" stroke="url(#toolGrad)" stroke-width="2" />
          
          <defs>
            <linearGradient id="camGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#18181b" />
              <stop offset="50%" stop-color="#27272a" />
              <stop offset="100%" stop-color="#09090b" />
            </linearGradient>
          </defs>
          <rect x="12" y="12" width="876" height="400" rx="12" fill="url(#camGrad)" />
          
          <!-- 3D Camera Grid & Orbit Motion Arc -->
          <circle cx="450" cy="210" r="140" fill="none" stroke="${tool.accentColor}" stroke-dasharray="6,6" stroke-width="1.8" opacity="0.6" />
          <line x1="450" y1="70" x2="450" y2="350" stroke="#334155" stroke-width="1" />
          <line x1="310" y1="210" x2="590" y2="210" stroke="#334155" stroke-width="1" />
          
          <text x="450" y="195" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="32" fill="#ffffff">
            ${headline}
          </text>
          <text x="450" y="245" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="20" fill="${tool.accentColor}">
            ${highlight}
          </text>

          <!-- 3D Camera Trajectory Marker -->
          <circle cx="550" cy="110" r="10" fill="${tool.brandColor}" filter="url(#glow)" />
          <text x="570" y="115" font-family="monospace" font-size="13" fill="#e2e8f0">Camera Path (360° Orbit)</text>

          <!-- Timeline Scrubber Bar on Video Monitor -->
          <rect y="420" width="900" height="60" rx="12" fill="#090d16" />
          <polygon points="35,442 35,458 49,450" fill="${tool.accentColor}" />
          <rect x="75" y="447" width="670" height="6" rx="3" fill="#334155" />
          <rect x="75" y="447" width="460" height="6" rx="3" fill="${tool.accentColor}" />
          <circle cx="535" cy="450" r="7" fill="#ffffff" filter="url(#glow)" />
          <text x="765" y="454" font-family="monospace" font-size="14" fill="#94a3b8">00:06.4 / 00:15.0</text>
        </g>

        <!-- Multi-Track Video Timeline Below Monitor -->
        <g transform="translate(50, 520)">
          <!-- Video Track V1 -->
          <rect y="0" width="900" height="60" rx="10" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
          <rect x="10" y="10" width="90" height="40" rx="6" fill="#1e3a8a" />
          <text x="24" y="35" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="13" fill="#93c5fd">V1 Video</text>
          <rect x="115" y="10" width="380" height="40" rx="6" fill="#1d4ed8" stroke="#3b82f6" stroke-width="1.5" />
          <text x="135" y="35" font-family="'Segoe UI', sans-serif" font-weight="600" font-size="13" fill="#ffffff">🎬 Scene 01: Dynamic Motion</text>
          <rect x="505" y="10" width="380" height="40" rx="6" fill="#1e3a8a" />
          <text x="525" y="35" font-family="'Segoe UI', sans-serif" font-weight="600" font-size="13" fill="#94a3b8">🎬 Scene 02: Cinematic Reveal</text>

          <!-- Audio Track A1 -->
          <rect y="70" width="900" height="60" rx="10" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
          <rect x="10" y="80" width="90" height="40" rx="6" fill="#4c1d95" />
          <text x="24" y="105" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="13" fill="#d8b4fe">A1 Audio</text>
          <path d="M 120 100 Q 180 80, 240 100 T 360 100 T 480 100 T 600 100 T 720 100 T 840 100" stroke="#c084fc" stroke-width="2.5" fill="none" />
        </g>

        <!-- Dynamic Context Card with Bullet Points -->
        <g transform="translate(50, 680)" filter="url(#shadow)">
          <rect width="900" height="280" rx="18" fill="rgba(15, 23, 42, 0.95)" stroke="url(#toolGrad)" stroke-width="2" />
          <text x="35" y="45" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="20" fill="#ffffff">${highlight}</text>
          <text x="35" y="80" font-family="'Segoe UI', sans-serif" font-size="15" fill="#94a3b8">${subline}</text>
          
          <g transform="translate(35, 120)">
            <text y="0" font-family="'Segoe UI', sans-serif" font-size="16" fill="#f43f5e" font-weight="600">${bullets[0]}</text>
            <text y="35" font-family="'Segoe UI', sans-serif" font-size="16" fill="#a855f7" font-weight="600">${bullets[1]}</text>
            <text y="70" font-family="'Segoe UI', sans-serif" font-size="16" fill="#38bdf8" font-weight="600">${bullets[2]}</text>
          </g>

          <rect x="660" y="195" width="200" height="52" rx="26" fill="url(#toolGrad)" filter="url(#glow)" />
          <text x="760" y="228" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="17" fill="#ffffff">${tool.actionText}</text>
        </g>
      </g>
    `;
  }
  // =========================================================================
  // 4. CODE & AGENT IDE (Cursor, Windsurf, Copilot, v0, Bolt)
  // =========================================================================
  else if (tool.category === 'code_ide') {
    workspaceSvg = `
      <g transform="translate(0, 140)">
        <!-- File Explorer Sidebar -->
        <g transform="translate(30, 20)">
          <rect width="210" height="660" rx="14" fill="#0b1120" stroke="#1e293b" stroke-width="1.5" />
          <text x="25" y="35" font-family="'Segoe UI', sans-serif" font-size="12" font-weight="800" fill="#64748b" letter-spacing="1">PROJECT FILES</text>
          <text x="25" y="70" font-size="14" fill="#94a3b8">📁 src/ai</text>
          <text x="45" y="105" font-size="14" fill="#38bdf8">📄 agent.ts</text>
          <text x="45" y="140" font-size="14" fill="#94a3b8">📄 pipeline.py</text>
          <text x="45" y="175" font-size="14" fill="#94a3b8">📄 workflow.sql</text>
        </g>

        <!-- Syntax-Highlighted Code Editor Window -->
        <g transform="translate(254, 20)">
          <rect width="716" height="660" rx="14" fill="#030712" stroke="#1e293b" stroke-width="1.5" />
          <rect width="716" height="42" rx="14" fill="#0f172a" />
          <text x="25" y="27" font-family="monospace" font-size="14" fill="#38bdf8">agent.ts • AI Automated Patch</text>

          <g transform="translate(25, 75)" font-family="monospace" font-size="15">
            <text y="0" fill="#64748b">01  import { createAutonomousWorkflow } from '@ai/core';</text>
            <text y="30" fill="#64748b">02  </text>
            <text y="60" fill="#c084fc">03  export async function <tspan fill="#60a5fa">executeBreakthrough</tspan>() {</text>
            <text y="90" fill="#94a3b8">04    // ${headline}</text>
            
            <!-- Green Diff Insertion Lines -->
            <rect x="-10" y="108" width="670" height="65" rx="8" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" stroke-width="1" />
            <text y="130" fill="#34d399">+05    const agent = await initModel({ tool: "${tool.name}" });</text>
            <text y="160" fill="#34d399">+06    return await agent.streamReasoning({ realtime: true });</text>
            
            <text y="200" fill="#c084fc">07  }</text>
          </g>

          <!-- Integrated Terminal Pane at Bottom of Editor -->
          <g transform="translate(15, 480)">
            <rect width="686" height="160" rx="10" fill="#0a0f1d" stroke="#1e293b" stroke-width="1" />
            <text x="20" y="30" font-family="monospace" font-size="13" fill="#64748b">$ npx run autonomous-agent --benchmark</text>
            <text x="20" y="65" font-family="monospace" font-size="14" fill="#34d399">✓ 0 lint errors • 100% test suites passed (42ms)</text>
            <text x="20" y="100" font-family="monospace" font-size="14" fill="#38bdf8">⚡ Production artifact generated and deployed to edge</text>
          </g>
        </g>

        <!-- Dynamic Context & Action Card -->
        <g transform="translate(30, 700)" filter="url(#shadow)">
          <rect width="940" height="260" rx="18" fill="rgba(15, 23, 42, 0.95)" stroke="url(#toolGrad)" stroke-width="2" />
          <text x="35" y="45" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="20" fill="#ffffff">${highlight}</text>
          <text x="35" y="80" font-family="'Segoe UI', sans-serif" font-size="15" fill="#94a3b8">${subline}</text>
          
          <g transform="translate(35, 115)">
            <text y="0" font-family="'Segoe UI', sans-serif" font-size="16" fill="#38bdf8" font-weight="600">${bullets[0]}</text>
            <text y="35" font-family="'Segoe UI', sans-serif" font-size="16" fill="#34d399" font-weight="600">${bullets[1]}</text>
            <text y="70" font-family="'Segoe UI', sans-serif" font-size="16" fill="#c084fc" font-weight="600">${bullets[2]}</text>
          </g>

          <rect x="700" y="180" width="200" height="52" rx="26" fill="url(#toolGrad)" filter="url(#glow)" />
          <text x="800" y="213" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="17" fill="#ffffff">${tool.actionText}</text>
        </g>
      </g>
    `;
  }
  // =========================================================================
  // 5. LLM REASONING & RESEARCH (DeepSeek, Claude, ChatGPT, Perplexity)
  // =========================================================================
  else {
    workspaceSvg = `
      <g transform="translate(0, 140)">
        <!-- Chat History Column -->
        <g transform="translate(50, 20)">
          <rect width="900" height="940" rx="20" fill="#0b1120" stroke="#1e293b" stroke-width="1.5" />
          
          <!-- User Prompt Message Bubble -->
          <g transform="translate(35, 35)">
            <rect width="830" height="110" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1" />
            <circle cx="45" cy="45" r="18" fill="${tool.brandColor}" />
            <text x="40" y="51" font-size="14" fill="#ffffff">👤</text>
            <text x="80" y="45" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="16" fill="#ffffff">Prompt Request</text>
            <text x="80" y="78" font-family="'Segoe UI', sans-serif" font-size="16" fill="#e2e8f0">
              "${headline} — ${highlight}"
            </text>
          </g>

          <!-- Deep Reasoning Accordion Stream -->
          <g transform="translate(35, 165)">
            <rect width="830" height="70" rx="12" fill="rgba(30, 41, 59, 0.5)" stroke="${tool.accentColor}" stroke-width="1" />
            <text x="25" y="42" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="16" fill="${tool.accentColor}">
              🧠 Deep Reasoning Stream (Synthesizing Architecture • 14s) ▾
            </text>
          </g>

          <!-- Assistant Solution Artifact Canvas -->
          <g transform="translate(35, 255)">
            <rect width="830" height="640" rx="16" fill="#030712" stroke="url(#toolGrad)" stroke-width="2" />
            <rect width="830" height="50" rx="16" fill="#0f172a" />
            <text x="30" y="32" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="16" fill="#ffffff">
              ⚡ ${tool.name} Solution Artifact
            </text>

            <g transform="translate(30, 80)">
              <text y="0" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="24" fill="#ffffff">
                ${highlight}
              </text>
              <text y="40" font-family="'Segoe UI', sans-serif" font-size="17" fill="#94a3b8">
                ${subline}
              </text>

              <!-- Dynamic Metrics / Insight Card -->
              <rect y="80" width="770" height="220" rx="14" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
              <g transform="translate(30, 130)">
                <text y="0" font-family="'Segoe UI', sans-serif" font-size="16" fill="#34d399" font-weight="600">${bullets[0]}</text>
                <text y="45" font-family="'Segoe UI', sans-serif" font-size="16" fill="#38bdf8" font-weight="600">${bullets[1]}</text>
                <text y="90" font-family="'Segoe UI', sans-serif" font-size="16" fill="#e2e8f0" font-weight="600">${bullets[2]}</text>
              </g>
            </g>

            <!-- Bottom Floating Action -->
            <rect x="580" y="550" width="210" height="52" rx="26" fill="url(#toolGrad)" filter="url(#glow)" />
            <text x="685" y="583" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-weight="800" font-size="17" fill="#ffffff">${tool.actionText}</text>
          </g>
        </g>
      </g>
    `;
  }

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0b0f17" />
        <stop offset="50%" stop-color="#111827" />
        <stop offset="100%" stop-color="#070a0f" />
      </linearGradient>
      <linearGradient id="toolGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${g0}" />
        <stop offset="50%" stop-color="${g1}" />
        <stop offset="100%" stop-color="${g2}" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#000000" flood-opacity="0.6" />
      </filter>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Canvas Background with Ambient Light Ring -->
    <rect width="1080" height="1920" fill="url(#bgGrad)" />
    <circle cx="540" cy="700" r="480" fill="${tool.brandColor}" opacity="0.16" filter="url(#glow)" />

    <!-- 1. BROWSER WINDOW CONTAINER (Centered in 1080x1920 Safe Zone) -->
    <g transform="translate(40, 260)" filter="url(#shadow)">
      <rect width="1000" height="1360" rx="28" fill="#0f172a" stroke="#334155" stroke-width="2" />
      
      <!-- Window Title Bar -->
      <g>
        <rect width="1000" height="70" rx="28" fill="#0b1120" />
        
        <!-- macOS Window Control Dots -->
        <circle cx="40" cy="35" r="7" fill="#ef4444" />
        <circle cx="65" cy="35" r="7" fill="#f59e0b" />
        <circle cx="90" cy="35" r="7" fill="#10b981" />

        <!-- Tool Identity Badge & URL Bar -->
        <text x="125" y="42" font-size="20">${tool.iconEmoji}</text>
        <text x="155" y="42" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="18" fill="#ffffff">${tool.name}</text>
        
        <!-- Simulated Omnibox URL -->
        <rect x="420" y="16" width="310" height="38" rx="10" fill="#030712" stroke="#1e293b" />
        <text x="440" y="40" font-family="monospace" font-size="13" fill="#94a3b8">🔒 ${url}</text>

        <!-- Right Export / Share Buttons -->
        <rect x="750" y="16" width="100" height="38" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1" />
        <text x="782" y="40" font-family="'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="14" fill="#94a3b8">Share</text>
        
        <rect x="864" y="16" width="110" height="38" rx="10" fill="${tool.brandColor}" />
        <text x="895" y="40" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="14" fill="#ffffff">Export</text>
      </g>

      <!-- Workspace Content (Dynamic Archetype) -->
      ${workspaceSvg}
    </g>

    <!-- Top Safe Zone Badge (Category-specific, Never Generic) -->
    <g transform="translate(540, 180)" text-anchor="middle">
      <rect x="-260" y="-30" width="520" height="50" rx="25" fill="#0f172a" stroke="${tool.accentColor}" stroke-width="2" filter="url(#glow)" />
      <text x="0" y="3" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="20" fill="${tool.accentColor}" letter-spacing="2">
        ${badgeText}
      </text>
    </g>

    <!-- Bottom Action Ribbon (Targeted Tool-Specific Call to Action) -->
    <g transform="translate(540, 1720)" text-anchor="middle">
      <rect x="-440" y="-40" width="880" height="62" rx="31" fill="rgba(15, 23, 42, 0.95)" stroke="#334155" stroke-width="1.8" filter="url(#shadow)" />
      <text x="0" y="-1" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="21" fill="#ffffff">
        ${bottomCta}
      </text>
    </g>
  </svg>
  `;
}

/**
 * Renders an authentic, animated Software Tutorial Video for any scene
 * with dynamic camera zoom, playhead tracking, and crisp UI vector fidelity.
 */
export async function renderSoftwareTutorialVideo(
  scene: any,
  index: number,
  reel: any,
  outputPath: string,
  durationSeconds: number
): Promise<string> {
  const scratchDir = path.join(process.cwd(), 'data', 'media', 'generated-scenes');
  await fs.mkdir(scratchDir, { recursive: true });

  const topicText = `${reel?.title || ''} ${reel?.niche || ''} ${scene?.headline || ''}`;
  const toolProfile = identifyToolProfile(topicText);

  const baseSvg = buildSoftwareScreenSvg(toolProfile, scene, index, reel);
  const baseImgPath = outputPath.replace(/\.mp4$/, '-ui.png');

  await sharp(Buffer.from(baseSvg))
    .png()
    .toFile(baseImgPath);

  // Dynamic zoom focus coordinates based on scene index:
  // Scene 1: Focus on the input/waveform/artboard center
  // Scene 2: Focus on timeline / layers / reasoning
  // Scene 3: Focus on the outcome / export card
  const yCenter = index === 0 ? '0.38' : index === 1 ? '0.50' : '0.32';
  const totalFrames = Math.max(90, Math.round(durationSeconds * 30));

  console.info(`[Software Screen Engine] Rendering ${durationSeconds.toFixed(1)}s real ${toolProfile.category} video for "${toolProfile.name}" (Scene ${index + 1})...`);

  await execFileAsync('ffmpeg', [
    '-y',
    '-loop', '1', '-i', baseImgPath,
    '-t', String(durationSeconds),
    '-filter_complex',
    `[0:v]scale=1200:2133,zoompan=z='min(zoom+0.0008,1.14)':x='iw/2-(iw/zoom/2)':y='ih*${yCenter}-(ih/zoom*${yCenter})':d=${totalFrames}:s=1080x1920:fps=30[v]`,
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    outputPath
  ]);

  return outputPath;
}
