import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);
const TTS_DIR = path.join(process.cwd(), 'data', 'media', 'tts');

export interface TTSOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
}

// Top natural creator & cinematic documentary voices in Microsoft Edge Neural TTS
export const CREATOR_VOICES = {
  deepDocumentaryMale: 'en-US-ChristopherNeural',         // Deep, authoritative, mysterious narrator (Vox / Discovery / Untold Mysteries)
  cinematicStorytellerMale: 'en-US-EricNeural',           // Rich, calm, cinematic storytelling tone
  naturalCreatorMale: 'en-US-AndrewMultilingualNeural',   // Warm, highly expressive conversational voice
  casualPodcastMale: 'en-US-BrianMultilingualNeural',     // Dynamic creator/YouTuber delivery
  britishNarratorMale: 'en-GB-RyanNeural',                // Mysterious, sophisticated British documentary voice
  authorityMale: 'en-US-ChristopherNeural',               // Deep, crisp dramatic anchor
  naturalCreatorFemale: 'en-US-AvaMultilingualNeural',    // Warm, authentic female storyteller
  expressiveFemale: 'en-US-EmmaMultilingualNeural',       // Articulate, captivating female narrator
  mysteriousFemale: 'en-GB-SoniaNeural',                  // Chilling, atmospheric British storyteller
};

/**
 * Automatically resolves the most human, atmospheric voice based on post topic and mood
 */
export function resolveBestVoiceForTopic(topicOrNiche = '', mood = ''): string {
  const text = `${topicOrNiche} ${mood}`.toLowerCase();
  if (/scary|spooky|horror|creepy|dark|unsolved|mystery|paranormal|conspiracy|crime|heist|dossier|classified|ancient|ruins|island|abyss|ocean/i.test(text)) {
    return CREATOR_VOICES.deepDocumentaryMale;
  }
  if (/history|historical|civilization|documentary|archive|dossier/i.test(text)) {
    return CREATOR_VOICES.cinematicStorytellerMale;
  }
  if (/tech|ai|software|future|breakthrough|productivity/i.test(text)) {
    return CREATOR_VOICES.naturalCreatorMale;
  }
  return CREATOR_VOICES.deepDocumentaryMale;
}

/**
 * Normalizes text for natural human breathing rhythm and clean pronunciation.
 * Strips emojis, formatting, and XML-breaking entities that crash edge-tts SSML parsing.
 */
export function humanizeSpeechText(text: string): string {
  return text
    // Strip markdown formatting & brackets
    .replace(/[*#`[\]()_~]/g, ' ')
    // Strip emojis and non-standard unicode symbols that crash SSML
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '')
    // Normalize quotes & dashes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*--\s*/g, ', ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/&/g, ' and ')
    .replace(/[<>]/g, '')
    .replace(/\.{3,}/g, '... ')
    .replace(/:\s+/g, '. ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Probe exact audio duration in seconds using ffprobe.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch (err) {
    console.warn(`[TTS Engine] Error probing audio duration for ${filePath}:`, err);
    return 0;
  }
}

let hasAttemptedUpgrade = false;

/**
 * Executes edge-tts trying all available CLI entrypoints across Windows & Linux Docker
 */
async function executeEdgeTTS(cliArgs: string[], timeoutMs = 45000): Promise<{ stdout: string; stderr: string }> {
  const candidates: { cmd: string; prefix: string[] }[] = [];

  if (process.platform === 'win32') {
    candidates.push({ cmd: 'python', prefix: ['-m', 'edge_tts'] });
    candidates.push({ cmd: 'python3', prefix: ['-m', 'edge_tts'] });
    candidates.push({ cmd: 'edge-tts', prefix: [] });
    const appData = process.env.APPDATA || '';
    if (appData) {
      candidates.push({ cmd: path.join(appData, 'Python', 'Python314', 'Scripts', 'edge-tts.exe'), prefix: [] });
      candidates.push({ cmd: path.join(appData, 'Python', 'Scripts', 'edge-tts.exe'), prefix: [] });
    }
  } else {
    // Linux / Docker environment
    candidates.push({ cmd: 'edge-tts', prefix: [] });
    candidates.push({ cmd: '/usr/local/bin/edge-tts', prefix: [] });
    candidates.push({ cmd: '/usr/bin/edge-tts', prefix: [] });
    candidates.push({ cmd: 'python3', prefix: ['-m', 'edge_tts'] });
    candidates.push({ cmd: 'python', prefix: ['-m', 'edge_tts'] });
  }

  let lastError: any = null;
  for (const candidate of candidates) {
    try {
      const fullArgs = [...candidate.prefix, ...cliArgs];
      return await execFileAsync(candidate.cmd, fullArgs, { timeout: timeoutMs });
    } catch (err: any) {
      lastError = err;
      if (err?.code === 'ENOENT') {
        // Binary or python executable not found, try next candidate
        continue;
      }
      // Check for 403 / handshake error from Microsoft Edge TTS and auto-heal
      const errStr = String(err?.stderr || err?.message || '');
      if ((errStr.includes('403') || errStr.includes('WSServerHandshakeError') || errStr.includes('Sec-MS-GEC')) && !hasAttemptedUpgrade) {
        hasAttemptedUpgrade = true;
        console.warn('[TTS Engine] Detected 403 Forbidden handshake from Microsoft Edge TTS. Attempting automatic upgrade to latest edge-tts...');
        try {
          const pipCmd = process.platform === 'win32' ? 'python' : 'python3';
          await execFileAsync(pipCmd, ['-m', 'pip', 'install', '--upgrade', 'edge-tts']);
          console.log('[TTS Engine] edge-tts upgraded successfully! Retrying synthesis with candidate...');
          return await execFileAsync(candidate.cmd, [...candidate.prefix, ...cliArgs], { timeout: timeoutMs });
        } catch (upgradeErr) {
          console.warn('[TTS Engine] Auto-upgrade failed:', upgradeErr);
        }
      }
    }
  }

  throw lastError || new Error('No working edge-tts execution candidate found.');
}

/**
 * Synthesizes a clean silent audio segment of exact duration using ffmpeg.
 * Used as a zero-dropout sync fallback so scenes never lose alignment.
 */
export async function generateSilentAudioSegment(durationSec: number, outputPath?: string): Promise<string> {
  await fs.mkdir(TTS_DIR, { recursive: true });
  const target = outputPath || path.join(TTS_DIR, `silence-${Date.now()}-${crypto.randomBytes(2).toString('hex')}.mp3`);
  const safeDur = Math.max(0.5, durationSec);

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(safeDur),
    '-c:a', 'libmp3lame',
    '-ar', '44100',
    '-b:a', '192k',
    target
  ]);

  return target;
}

/**
 * Pads an audio segment with trailing silence so it precisely matches the target scene duration.
 * Converts to standardized 44.1kHz stereo MP3 to prevent audio/visual drift.
 */
export async function padAudioSegment(filePath: string, targetDurationSec: number, outputPath?: string): Promise<string> {
  await fs.mkdir(TTS_DIR, { recursive: true });
  const currentDur = await getAudioDuration(filePath);
  if (currentDur >= targetDurationSec - 0.05) {
    return filePath;
  }
  const paddedPath = outputPath || path.join(TTS_DIR, `padded-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.mp3`);
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', filePath,
      '-af', 'apad',
      '-t', targetDurationSec.toFixed(3),
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '192k',
      paddedPath
    ]);
    return paddedPath;
  } catch (err) {
    console.warn(`[TTS Engine] Padding audio segment failed, falling back to original:`, err);
    return filePath;
  }
}

/**
 * Generate human-like neural audio voiceover from script text.
 * Completely free, zero API key required, low latency (~1.5s).
 * Features multi-voice fallback, temp-file argument passing, and backoff retries.
 */
export async function generateSpeech(
  text: string,
  outputPath?: string,
  options: TTSOptions = {}
): Promise<string> {
  await fs.mkdir(TTS_DIR, { recursive: true });

  const cleanedText = humanizeSpeechText(text);

  if (!cleanedText) {
    throw new Error('TTS text cannot be empty');
  }

  const primaryVoice = options.voice || CREATOR_VOICES.deepDocumentaryMale;
  const targetPath = outputPath || path.join(TTS_DIR, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);

  // Natural human speech cadence is +0% to +3% speed (never robotic chipmunk +20%)
  const rate = options.rate || '+2%';
  // Slight pitch reduction adds chest resonance and dramatic gravity to narration
  const pitch = options.pitch || '-2Hz';

  // Write text to a temporary UTF-8 text file to eliminate command-line encoding & length bugs
  const tempTextFile = path.join(TTS_DIR, `tts-text-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);
  await fs.writeFile(tempTextFile, cleanedText, 'utf8');

  // Fallback voice candidates if primary voice encounters a service glitch
  const candidateVoices = [
    primaryVoice,
    CREATOR_VOICES.deepDocumentaryMale,
    CREATOR_VOICES.cinematicStorytellerMale,
    CREATOR_VOICES.naturalCreatorMale,
    'en-US-GuyNeural'
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  try {
    let lastError: any = null;

    for (let attempt = 0; attempt < candidateVoices.length; attempt++) {
      const voiceToUse = candidateVoices[attempt];
      const args = [
        '--file', tempTextFile,
        '--write-media', targetPath,
        '--voice', voiceToUse,
        '--rate', rate,
        '--pitch', pitch
      ];

      try {
        await executeEdgeTTS(args, 45000);

        // Verify audio file was produced and has valid data
        if (fsSync.existsSync(targetPath)) {
          const stat = await fs.stat(targetPath);
          if (stat.size >= 500) {
            return targetPath;
          }
          // File too small or 0 bytes - delete and retry
          try { await fs.unlink(targetPath); } catch {}
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[TTS Engine] Attempt ${attempt + 1} with voice "${voiceToUse}" failed:`, err?.message || err);
        try { if (fsSync.existsSync(targetPath)) await fs.unlink(targetPath); } catch {}
        // Small backoff before retrying with fallback voice
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // Secondary Tier: Universal Zero-Dependency Web HTTP Speech Synthesis
    // Requires ZERO Python, ZERO pip packages, ZERO edge-tts installation. Works natively on ANY Ubuntu VPS / Docker.
    console.warn(`[TTS Engine] CLI edge-tts unavailable on this host (${lastError?.message || 'not installed'}). Falling back to Zero-Dependency Web HTTP Speech Synthesizer...`);
    return await generateSpeechViaHttp(cleanedText, targetPath);
  } catch (primaryErr) {
    console.warn(`[TTS Engine] Primary edge-tts failed completely (${primaryErr}). Attempting Web HTTP Speech Synthesizer fallback...`);
    return await generateSpeechViaHttp(cleanedText, targetPath);
  } finally {
    try { await fs.unlink(tempTextFile); } catch {}
  }
}

function splitTextIntoSpeechChunks(text: string, maxLen = 170): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxLen) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Universal Zero-Dependency Web HTTP Speech Synthesizer.
 * Fetches neural MP3 audio over HTTPS directly in Node.js without requiring Python, pip, or edge-tts.
 * Automatically polishes vocal frequencies with FFmpeg for authentic broadcast tone.
 */
export async function generateSpeechViaHttp(text: string, outputPath: string): Promise<string> {
  await fs.mkdir(TTS_DIR, { recursive: true });
  const chunks = splitTextIntoSpeechChunks(text);
  const buffers: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=en&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      throw new Error(`Web HTTP TTS fetch failed with HTTP status ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    buffers.push(Buffer.from(arrayBuffer));
  }

  const combined = Buffer.concat(buffers);
  const rawPath = outputPath.replace(/\.mp3$/, `-raw-${Date.now()}.mp3`);
  await fs.writeFile(rawPath, combined);

  try {
    // Polish vocal frequencies: subtle pitch calibration (-3%) & warm low-end EQ for documentary resonance
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawPath,
      '-af', 'asetrate=44100*0.97,aresample=44100,equalizer=f=110:width_type=o:width=1.5:g=3,equalizer=f=3200:width_type=o:width=1.2:g=1.5',
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '192k',
      outputPath
    ]);
  } catch {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawPath,
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '192k',
      outputPath
    ]);
  } finally {
    try { await fs.unlink(rawPath); } catch {}
  }

  return outputPath;
}

/**
 * Concatenate multiple audio segments into a single track
 */
export async function concatenateAudioTracks(segmentPaths: string[], outputPath: string): Promise<string> {
  if (segmentPaths.length === 0) throw new Error('No audio paths provided');
  if (segmentPaths.length === 1) {
    await fs.copyFile(segmentPaths[0], outputPath);
    return outputPath;
  }

  const concatList = path.join(TTS_DIR, `concat-${Date.now()}.txt`);
  const content = segmentPaths
    .map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');

  await fs.writeFile(concatList, content, 'utf8');

  try {
    await execFileAsync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
      '-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '192k',
      outputPath
    ]);
    return outputPath;
  } finally {
    try { await fs.rm(concatList, { force: true }); } catch {}
  }
}
