import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HF_WORK_DIR = path.join(process.cwd(), 'data', 'media', 'hyperframes-work');

export interface HyperframesComposeScene {
  assetId: string;
  filePath: string;
  duration: number;
  speechDuration?: number;
  chapterLabel?: string;
  headline?: string;
  highlight?: string;
  subline?: string;
  narrationText?: string;
  voiceScript?: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface HyperframesComposeInput {
  reelId: string;
  scenes: HyperframesComposeScene[];
  totalDuration: number;
  masterAudioPath?: string;
  outputPath: string;
  reelTitle?: string;
  verticalBadge?: string;
  accentColor?: string;
  fps?: number;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Builds a dynamic, ultra-crisp 1080x1920 HyperFrames HTML composition
 * with animated video cuts, CSS vignette, glowing kinetic typography,
 * telemetry HUD, dynamic progress bar, and synced broadcast master audio.
 */
export async function composeWithHyperframes(
  input: HyperframesComposeInput
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  await fs.mkdir(HF_WORK_DIR, { recursive: true });
  const nonce = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const compDir = path.join(HF_WORK_DIR, `hf-${input.reelId}-${nonce}`);
  await fs.mkdir(compDir, { recursive: true });

  const cleanSubject = String(input.reelTitle || 'Historical Event')
    .replace(/^(documented archival anomaly|declassified dossier|archival anomaly|case file|investigation file)[\s\:\-]+/i, '')
    .split(/[:\-\—\(]/)[0]
    .trim()
    .toUpperCase();

  const accent = input.accentColor || '#d4af37';
  const fps = input.fps || 30;
  const totalDur = Number(input.totalDuration.toFixed(2));
  const badgeText = input.verticalBadge ? input.verticalBadge.replace(/[\[\]]/g, '').trim() : 'CLASSIFIED RECORD';

  try {
    // 1. Copy or Symlink media files into compDir for zero-latency local HTTP serving by HyperFrames
    const localVideos: Array<{ filename: string; start: number; duration: number; scene: HyperframesComposeScene }> = [];
    let currentTime = 0;

    for (let i = 0; i < input.scenes.length; i++) {
      const sc = input.scenes[i];
      const filename = `scene-${i}.mp4`;
      const destPath = path.join(compDir, filename);

      try {
        await fs.copyFile(sc.filePath, destPath);
      } catch (copyErr) {
        // Fallback: Hardlink
        try {
          await fs.link(sc.filePath, destPath);
        } catch {
          // If hardlink fails across volumes, read and write buffer
          const buf = await fs.readFile(sc.filePath);
          await fs.writeFile(destPath, buf);
        }
      }

      const dur = Number(sc.duration.toFixed(2));
      localVideos.push({
        filename,
        start: Number(currentTime.toFixed(2)),
        duration: dur,
        scene: sc
      });
      currentTime += dur;
    }

    let localAudioName: string | null = null;
    if (input.masterAudioPath && fsSync.existsSync(input.masterAudioPath)) {
      localAudioName = 'master-audio.wav';
      const destAudio = path.join(compDir, localAudioName);
      try {
        await fs.copyFile(input.masterAudioPath, destAudio);
      } catch {
        const buf = await fs.readFile(input.masterAudioPath);
        await fs.writeFile(destAudio, buf);
      }
    }

    // 2. Write hyperframes.json
    const hfConfig = {
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      paths: { assets: '.' }
    };
    await fs.writeFile(path.join(compDir, 'hyperframes.json'), JSON.stringify(hfConfig, null, 2));

    // 3. Construct Kinetic Subtitles (Word groups)
    const subtitleClips: Array<{ start: number; duration: number; html: string }> = [];

    for (const item of localVideos) {
      const sc = item.scene;
      const sceneWords = Array.isArray(sc.words) && sc.words.length > 0 ? sc.words : null;

      if (sceneWords && sceneWords.length > 0) {
        // Chunk into groups of 3 words
        const GROUP_SIZE = 3;
        for (let w = 0; w < sceneWords.length; w += GROUP_SIZE) {
          const chunk = sceneWords.slice(w, w + GROUP_SIZE);
          const chunkStart = item.start + (chunk[0].start || 0);
          const chunkEnd = item.start + (chunk[chunk.length - 1].end || (chunk[0].start + 1.2));
          const chunkDur = Math.max(0.4, Number((chunkEnd - chunkStart).toFixed(2)));

          const formattedHtml = chunk
            .map((wordObj, idx) => {
              const cleanWord = escapeHtml(wordObj.word || '');
              return `<span class="sub-word" data-word-idx="${idx}">${cleanWord}</span>`;
            })
            .join(' ');

          subtitleClips.push({
            start: Number(chunkStart.toFixed(2)),
            duration: chunkDur,
            html: formattedHtml
          });
        }
      } else {
        // Fallback: Clause-based subtitles
        const narration = sc.narrationText || sc.voiceScript || '';
        const clauses = narration.split(/(?<=[,.;!?])\s+/).filter(Boolean);
        const clauseStep = clauses.length > 0 ? item.duration / clauses.length : item.duration;

        clauses.forEach((cl, cIdx) => {
          const cStart = item.start + cIdx * clauseStep;
          const cDur = Math.max(0.6, Number(clauseStep.toFixed(2)));
          subtitleClips.push({
            start: Number(cStart.toFixed(2)),
            duration: cDur,
            html: `<span class="sub-word highlight">${escapeHtml(cl)}</span>`
          });
        });
      }
    }

    // 4. Construct Full HTML5 Composition Template
    const videoElementsHtml = localVideos
      .map(v => `<video class="clip scene-video" data-start="${v.start}" data-duration="${v.duration}" src="./${v.filename}" muted playsinline></video>`)
      .join('\n      ');

    const audioElementHtml = localAudioName
      ? `<audio id="master-audio" class="clip" data-start="0" data-duration="${totalDur}" src="./${localAudioName}"></audio>`
      : '';

    const chapterHudHtml = localVideos
      .map((v, i) => {
        const label = v.scene.chapterLabel || `INVESTIGATION PART ${i + 1}`;
        return `
      <div class="clip chapter-hud" data-start="${v.start}" data-duration="${v.duration}">
        <div class="chapter-line">
          <span class="chapter-badge">[ SECTION 0${i + 1} // ${escapeHtml(label)} ]</span>
        </div>
        <div class="chapter-subject">${escapeHtml(cleanSubject)} // DOSSIER FILE 0${i + 1}</div>
      </div>`;
      })
      .join('\n');

    const subtitlesHtml = subtitleClips
      .map(
        s => `
      <div class="clip subtitle-box" data-start="${s.start}" data-duration="${s.duration}">
        <div class="subtitle-text">${s.html}</div>
      </div>`
      )
      .join('\n');

    const fullHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800;900&family=Space+Mono:wght@400;700&family=Syne:wght@800;900&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      :root {
        --accent: ${accent};
        --ground: #07080a;
        --hud-bg: rgba(9, 10, 14, 0.72);
        --border-gold: rgba(212, 175, 55, 0.35);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 1080px; height: 1920px;
        overflow: hidden;
        background: var(--ground);
        font-family: 'Inter', -apple-system, sans-serif;
        color: #ffffff;
      }
      #root {
        position: relative;
        width: 1080px; height: 1920px;
        overflow: hidden;
      }

      /* 1. Video Tracks */
      .scene-video {
        position: absolute;
        inset: 0;
        width: 1080px; height: 1920px;
        object-fit: cover;
      }

      /* 2. Archival Dark Grading, Radial Vignette & Scanlines */
      .vignette-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        box-shadow: inset 0 0 170px rgba(0, 0, 0, 0.88);
        background: radial-gradient(circle at 50% 50%, transparent 40%, rgba(4, 5, 8, 0.80) 100%);
      }
      .scanlines {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
        background-size: 100% 4px;
        opacity: 0.6;
      }

      /* 3. Top Telemetry & Capsule Header */
      .top-hud-bar {
        position: absolute;
        top: 60px; left: 44px; right: 44px;
        height: 74px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        pointer-events: none;
        z-index: 50;
      }
      .rec-badge {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: 'Space Mono', monospace;
        font-size: 20px;
        font-weight: 700;
        color: #e2e8f0;
        background: var(--hud-bg);
        border: 1px solid rgba(255,255,255,0.15);
        padding: 8px 16px;
        border-radius: 9999px;
        letter-spacing: 0.05em;
      }
      .rec-dot {
        width: 12px; height: 12px;
        border-radius: 50%;
        background: #e11d48;
        box-shadow: 0 0 10px #e11d48;
      }
      .brand-capsule {
        font-family: 'Space Mono', monospace;
        font-size: 21px;
        font-weight: 700;
        color: var(--accent);
        background: var(--hud-bg);
        border: 1px solid var(--border-gold);
        padding: 9px 24px;
        border-radius: 9999px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .telemetry-meta {
        font-family: 'Space Mono', monospace;
        font-size: 19px;
        color: #94a3b8;
        background: var(--hud-bg);
        border: 1px solid rgba(255,255,255,0.15);
        padding: 8px 16px;
        border-radius: 9999px;
      }

      /* 4. Top Animated Progress Bar */
      .progress-track {
        position: absolute;
        top: 154px; left: 44px; right: 44px;
        height: 6px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 9999px;
        overflow: hidden;
        z-index: 50;
      }
      .progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #d4af37, #fef08a);
        box-shadow: 0 0 12px rgba(212, 175, 55, 0.8);
      }

      /* 5. Bottom Chapter Dossier Bar */
      .chapter-hud {
        position: absolute;
        bottom: 120px; left: 44px; right: 44px;
        padding: 22px 28px;
        background: rgba(8, 9, 13, 0.82);
        border: 1px solid var(--border-gold);
        border-left: 6px solid var(--accent);
        border-radius: 12px;
        backdrop-filter: blur(12px);
        z-index: 50;
      }
      .chapter-line {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 6px;
      }
      .chapter-badge {
        font-family: 'Space Mono', monospace;
        font-size: 22px;
        font-weight: 700;
        color: var(--accent);
        letter-spacing: 0.06em;
      }
      .chapter-subject {
        font-family: 'Space Mono', monospace;
        font-size: 18px;
        color: #94a3b8;
        letter-spacing: 0.04em;
      }

      /* 6. Kinetic Word-by-Word Subtitles */
      .subtitle-box {
        position: absolute;
        bottom: 740px;
        left: 44px;
        right: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        z-index: 60;
        pointer-events: none;
      }
      .subtitle-text {
        font-family: 'Inter', sans-serif;
        font-size: 54px;
        font-weight: 800;
        line-height: 1.25;
        letter-spacing: -0.02em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.95);
        text-shadow: 0 4px 18px rgba(0, 0, 0, 0.95), 0 0 30px rgba(0, 0, 0, 0.8);
        padding: 12px 24px;
      }
      .sub-word {
        display: inline-block;
        padding: 0 6px;
        transition: transform 0.15s ease, color 0.15s ease;
      }
      .sub-word.highlight, .sub-word:first-child {
        color: var(--accent);
        text-shadow: 0 0 25px rgba(212, 175, 55, 0.85);
        transform: scale(1.06);
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${totalDur}"
      data-width="1080"
      data-height="1920"
    >
      <!-- Video Clips -->
      ${videoElementsHtml}

      <!-- Master Audio -->
      ${audioElementHtml}

      <!-- Atmospheric Overlays -->
      <div class="clip vignette-overlay" data-start="0" data-duration="${totalDur}"></div>
      <div class="clip scanlines" data-start="0" data-duration="${totalDur}"></div>

      <!-- Top Persistent HUD -->
      <div class="clip top-hud-bar" data-start="0" data-duration="${totalDur}">
        <div class="rec-badge">
          <div class="rec-dot"></div>
          <span>REC 30FPS</span>
        </div>
        <div class="brand-capsule">THE UNTOLD ARCHIVE // ${escapeHtml(badgeText)}</div>
        <div class="telemetry-meta">L-35MM // ISO 800</div>
      </div>

      <!-- Progress Track -->
      <div class="clip progress-track" data-start="0" data-duration="${totalDur}">
        <div class="progress-fill"></div>
      </div>

      <!-- Dynamic Chapter Hud -->
      ${chapterHudHtml}

      <!-- Kinetic Subtitles -->
      ${subtitlesHtml}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      // Animate progress bar fill across total duration
      tl.fromTo(".progress-fill", 
        { width: "0%" }, 
        { width: "100%", duration: ${totalDur}, ease: "none" }, 
        0
      );

      // Subtle breath on recording dot
      tl.fromTo(".rec-dot",
        { opacity: 1 },
        { opacity: 0.35, duration: 0.6, repeat: -1, yoyo: true, ease: "power1.inOut" },
        0
      );

      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>`;

    await fs.writeFile(path.join(compDir, 'index.html'), fullHtml, 'utf8');

    // 5. Render via HyperFrames CLI
    console.info(`[HyperFrames Compositor] 🎬 Starting studio render for Reel ${input.reelId} (${totalDur}s, 1080x1920 @ ${fps}fps)...`);

    const cliCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const cliArgs = ['hyperframes', 'render', '--output', input.outputPath, '--fps', String(fps), '--format', 'mp4'];

    if (process.platform === 'linux' || process.env.HYPERFRAMES_NO_GPU === '1') {
      cliArgs.push('--no-browser-gpu');
    }

    await execFileAsync(cliCmd, cliArgs, {
      cwd: compDir,
      shell: process.platform === 'win32',
      maxBuffer: 1024 * 1024 * 32,
      timeout: 180000 // 3 minutes timeout for long-form Reel
    });

    if (fsSync.existsSync(input.outputPath) && (await fs.stat(input.outputPath)).size > 50000) {
      console.info(`[HyperFrames Compositor] ✅ High-retention Reel rendered: ${input.outputPath} (${(await fs.stat(input.outputPath)).size} bytes)`);
      return { success: true, outputPath: input.outputPath };
    }

    return { success: false, error: 'HyperFrames completed but output file was missing or empty.' };
  } catch (err: any) {
    console.warn('[HyperFrames Compositor] Render error notice:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  } finally {
    try {
      await fs.rm(compDir, { recursive: true, force: true });
    } catch {}
  }
}
