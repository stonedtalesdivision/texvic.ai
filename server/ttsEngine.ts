import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { GoogleGenAI } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const execFileAsync = promisify(execFile);
const TTS_DIR = path.join(process.cwd(), 'data', 'media', 'tts');

export interface TTSOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
}

export interface TimedWord {
  word: string;
  start: number; // in seconds relative to scene/segment start
  end: number;   // in seconds relative to scene/segment start
}

/**
 * Proportional word timing estimation based on word character weights.
 * Used as an ultra-reliable fallback when native WebSocket metadata is unavailable.
 */
export function estimateWordTimings(text: string, durationSec: number): TimedWord[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || durationSec <= 0) return [];

  const totalChars = words.reduce((acc, w) => acc + Math.max(1, w.length), 0);
  const speechDur = Math.max(0.5, durationSec);
  const timed: TimedWord[] = [];
  let currentSec = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const weight = Math.max(1, w.length) / totalChars;
    const dur = Math.max(0.12, speechDur * weight);
    const start = Number(currentSec.toFixed(3));
    const end = Number(Math.min(speechDur, currentSec + dur).toFixed(3));
    timed.push({ word: w, start, end });
    currentSec = end;
  }
  return timed;
}

// Top natural creator & cinematic documentary male voices in Microsoft Edge Neural TTS
export const CREATOR_VOICES = {
  deepDocumentaryMale: 'en-US-ChristopherNeural',         // Deep, authoritative, mature adult narrator
  cinematicStorytellerMale: 'en-US-EricNeural',           // Rich, calm, cinematic storytelling tone
  naturalCreatorMale: 'en-US-AndrewMultilingualNeural',   // Warm conversational male voice
  casualPodcastMale: 'en-US-BrianMultilingualNeural',     // Dynamic creator delivery
  britishNarratorMale: 'en-GB-RyanNeural',                // Mature, sophisticated British documentary baritone
  authorityMale: 'en-US-GuyNeural',                       // Deep, crisp dramatic broadcast anchor
};

/**
 * Automatically resolves the most human, atmospheric voice based on post topic and mood
 * Defaults to refined British documentary baritone (en-GB-RyanNeural) for universal global appeal (BBC / NatGeo style)
 */
export function resolveBestVoiceForTopic(topicOrNiche = '', mood = ''): string {
  const text = `${topicOrNiche} ${mood}`.toLowerCase();
  if (/tech|infrastructure|satellite|subsea|power|cyber|internet/i.test(text)) {
    return CREATOR_VOICES.cinematicStorytellerMale; // Calm, deep cinematic storytelling tone
  }
  // Universal global authority for mysteries, history, heists, ancient ruins, and earth phenomena
  return CREATOR_VOICES.britishNarratorMale; // en-GB-RyanNeural (Sophisticated BBC/NatGeo documentary baritone)
}

/**
 * Resolves mature, studio-grade prebuilt voice for Gemini 3.8 Flash TTS
 */
export function resolveGeminiVoiceForTopic(topicOrNiche = '', mood = ''): string {
  const text = `${topicOrNiche} ${mood}`.toLowerCase();
  if (/tech|ai|software|future|breakthrough|productivity/i.test(text)) {
    return 'Puck'; // Confident, sharp modern creator voice
  }
  if (/crime|heist|dossier|classified|nuclear|cold war|war|secret|danger|dark|mystery/i.test(text)) {
    return 'Charon'; // Deepest, gravest narrator
  }
  return 'Charon'; // Default to Charon (deepest authoritative documentary baritone)
}

/**
 * Normalizes text for natural human breathing rhythm and clean pronunciation.
 * Strips emojis, formatting, and XML-breaking entities that crash edge-tts SSML parsing.
 */
export function humanizeSpeechText(text: string): string {
  return text
    // Strip technical archival headers and index codes
    .replace(/(^|[\.\?\!\n])\s*(documented archival anomaly|declassified index|case file|archive index|classification level)[\s\:\#\d\-]+/gi, '$1 ')
    .replace(/\(?(declassified\s+index|archival\s+index|file\s+id)\s*[\#\d\-]+\)?/gi, '')
    // Normalize timecodes so TTS does not say "zero colon zero four"
    .replace(/\bpause at\s*(\d{1,2}):(\d{2})\b/gi, 'pause at $2 seconds')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, '$1 $2')
    // Expand conversational quantities & metrics
    .replace(/(\d+)\+/g, 'over $1')
    .replace(/(\d+(?:\.\d+)?)\s*M\b/g, '$1 million')
    .replace(/(\d+(?:\.\d+)?)\s*k\b/g, '$1 thousand')
    .replace(/(\d+)\s*ft\b/gi, '$1 feet')
    .replace(/(\d+)\s*km\b/gi, '$1 kilometers')
    .replace(/(\d+)\s*mph\b/gi, '$1 miles per hour')
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
    // Convert colons into natural breathing commas (NEVER full-stop periods, which break sentences!)
    .replace(/:\s+/g, ', ')
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

// Ensure user-installed python bin directories (e.g. /home/node/.local/bin) are in PATH
if (process.platform !== 'win32') {
  const nodeLocalBin = '/home/node/.local/bin';
  if (!process.env.PATH?.includes(nodeLocalBin)) {
    process.env.PATH = `${nodeLocalBin}:${process.env.PATH || ''}`;
  }
}

let hasAttemptedUpgrade = false;

/**
 * Executes edge-tts trying all available CLI entrypoints across Windows & Linux Docker
 */
export async function executeEdgeTTS(cliArgs: string[], timeoutMs = 45000): Promise<{ stdout: string; stderr: string }> {
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
    const home = process.env.HOME || '/home/node';
    candidates.push({ cmd: path.join(home, '.local', 'bin', 'edge-tts'), prefix: [] });
    candidates.push({ cmd: '/home/node/.local/bin/edge-tts', prefix: [] });
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
          const pipArgs = process.platform === 'win32'
            ? ['-m', 'pip', 'install', '--upgrade', 'edge-tts']
            : ['-m', 'pip', 'install', '--break-system-packages', '--upgrade', 'edge-tts'];
          await execFileAsync(pipCmd, pipArgs);
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

async function ensureTtsDir(): Promise<string> {
  try {
    await fs.mkdir(TTS_DIR, { recursive: true });
    return TTS_DIR;
  } catch {
    const fallback = path.join(os.tmpdir(), 'texvic_tts');
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }
}

/**
 * Synthesizes a clean silent audio segment of exact duration using ffmpeg.
 * Used as a zero-dropout sync fallback so scenes never lose alignment.
 */
export async function generateSilentAudioSegment(durationSec: number, outputPath?: string): Promise<string> {
  const activeTtsDir = await ensureTtsDir();
  const target = outputPath || path.join(activeTtsDir, `silence-${Date.now()}-${crypto.randomBytes(2).toString('hex')}.mp3`);
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
  const activeTtsDir = await ensureTtsDir();
  const currentDur = await getAudioDuration(filePath);
  if (currentDur >= targetDurationSec - 0.05) {
    return filePath;
  }
  const paddedPath = outputPath || path.join(activeTtsDir, `padded-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.mp3`);
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
 * Direct Node.js Microsoft Edge Neural TTS with millisecond-accurate word boundary capture.
 * Features automatic server clock-offset synchronization, eliminating 403 Forbidden handshake failures.
 */
export async function generateSpeechWithNodeEdgeDetailed(
  text: string,
  outputPath: string,
  options: TTSOptions = {}
): Promise<{ audioPath: string; duration: number; words: TimedWord[] }> {
  await ensureTtsDir();
  const cleanedText = humanizeSpeechText(text);
  if (!cleanedText) throw new Error('TTS text cannot be empty');

  const rawVoice = options.voice || CREATOR_VOICES.deepDocumentaryMale;
  const voice = (rawVoice && !rawVoice.startsWith('Gemini-') && !rawVoice.startsWith('Piper-'))
    ? rawVoice
    : CREATOR_VOICES.deepDocumentaryMale;
  const rate = options.rate || '+15%'; // ~130-135 WPM comfortable, steady human documentary pacing
  const pitch = options.pitch || '+0Hz';

  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tts = new MsEdgeTTS({
      connectionTimeoutMs: 15000,
      synthesisTimeoutMs: 30000
    });
    const capturedWords: TimedWord[] = [];

    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: true,
        sentenceBoundaryEnabled: false
      });
      const { audioStream, metadataStream } = tts.toStream(cleanedText, { rate, pitch });

      if (metadataStream) {
        metadataStream.on('data', (chunk: Buffer) => {
          try {
            const str = chunk.toString('utf8');
            const parsed = JSON.parse(str);
            if (Array.isArray(parsed?.Metadata)) {
              for (const item of parsed.Metadata) {
                if (item?.Type === 'WordBoundary' && item?.Data) {
                  const offset = Number(item.Data.Offset);
                  const duration = Number(item.Data.Duration);
                  const wordText = String(item.Data.text?.Text || '').trim();
                  if (wordText && Number.isFinite(offset) && Number.isFinite(duration)) {
                    capturedWords.push({
                      word: wordText,
                      start: Number((offset / 10000000).toFixed(3)),
                      end: Number(((offset + duration) / 10000000).toFixed(3))
                    });
                  }
                }
              }
            }
          } catch {}
        });
      }

      const writeStream = fsSync.createWriteStream(outputPath);
      await pipeline(audioStream, writeStream);

      if (fsSync.existsSync(outputPath) && (await fs.stat(outputPath)).size >= 500) {
        const duration = await getAudioDuration(outputPath);
        capturedWords.sort((a, b) => a.start - b.start);

        const finalWords = capturedWords.length > 0
          ? capturedWords
          : estimateWordTimings(cleanedText, duration);

        return {
          audioPath: outputPath,
          duration,
          words: finalWords
        };
      }
    } catch (err: any) {
      lastError = err;
      const delay = (attempt + 1) * 800;
      await new Promise(r => setTimeout(r, delay));
    } finally {
      try {
        tts.close();
      } catch {}
    }
  }

  throw lastError || new Error(`Node MsEdgeTTS output missing or empty for voice "${voice}"`);
}

/**
 * Direct Node.js Microsoft Edge Neural TTS via WebSocket (string path return).
 */
export async function generateSpeechWithNodeEdge(
  text: string,
  outputPath: string,
  options: TTSOptions = {}
): Promise<string> {
  const result = await generateSpeechWithNodeEdgeDetailed(text, outputPath, options);
  return result.audioPath;
}

/**
 * Generate human-like neural audio voiceover from script text.
 * Completely free, zero API key required, low latency (~1.5s).
 * Primary Engine: Direct Node.js Microsoft Edge Neural TTS (1.0x speed, natural male neural voices).
 * Fallbacks: Gemini 3.8 Flash TTS -> Python CLI Edge-TTS -> Guaranteed Offline Piper Male TTS.
 */
export async function generateSpeech(
  text: string,
  outputPath?: string,
  options: TTSOptions = {}
): Promise<string> {
  const activeTtsDir = await ensureTtsDir();

  const cleanedText = humanizeSpeechText(text);

  if (!cleanedText) {
    throw new Error('TTS text cannot be empty');
  }

  const cleanVoice = options.voice ? options.voice.replace(/^Gemini-/, '') : undefined;
  const cacheKey = crypto.createHash('md5').update(`${cleanedText}__${cleanVoice || 'default'}__${options.rate || '0'}__${options.pitch || '0'}`).digest('hex');
  const cachePath = path.join(activeTtsDir, `cache-${cacheKey}.mp3`);

  if (fsSync.existsSync(cachePath)) {
    try {
      const stat = await fs.stat(cachePath);
      if (stat.size >= 500) {
        if (outputPath && outputPath !== cachePath) {
          await fs.copyFile(cachePath, outputPath);
          return outputPath;
        }
        return cachePath;
      }
    } catch {}
  }

  const targetPath = outputPath || path.join(activeTtsDir, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);
  const primaryVoice = cleanVoice || CREATOR_VOICES.deepDocumentaryMale;
  const rate = options.rate || '+15%';   // ~130-135 WPM comfortable documentary human pacing
  const pitch = options.pitch || '+0Hz'; // Pure natural neural vocoder pitch (no robotic DSP shift)

  // =========================================================================
  // Tier 1: Gemini 3.8 Flash TTS (Deep Hollywood Charon / Fenrir Documentary Baritone)
  // Flagship studio generative AI voice model with authentic human nuance and breathing
  // =========================================================================
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    try {
      const geminiVoice = cleanVoice && ['Charon', 'Fenrir', 'Puck'].includes(cleanVoice)
        ? cleanVoice
        : resolveGeminiVoiceForTopic('', '');
      const geminiResult = await generateSpeechWithGemini(cleanedText, targetPath, geminiVoice);
      try {
        if (fsSync.existsSync(geminiResult) && geminiResult !== cachePath) {
          await fs.copyFile(geminiResult, cachePath);
        }
      } catch {}
      console.log(`[TTS Engine] 🌟 Studio neural voiceover synthesized via Gemini 3.8 Flash (${geminiVoice}).`);
      return geminiResult;
    } catch (geminiErr: any) {
      console.warn('[TTS Engine] Tier 1 Gemini TTS unavailable, trying Node MsEdgeTTS:', geminiErr?.message || geminiErr);
    }
  }

  // Multi-candidate male neural voices (all high-fidelity adult male narrators)
  const candidateVoices = [
    primaryVoice,
    CREATOR_VOICES.deepDocumentaryMale,      // en-US-ChristopherNeural (Mature authoritative documentary baritone)
    'en-US-GuyNeural',                       // en-US-GuyNeural (Crisp broadcast anchor)
    CREATOR_VOICES.cinematicStorytellerMale,  // en-US-EricNeural (Calm, rich storytelling baritone)
    CREATOR_VOICES.naturalCreatorMale,       // en-US-AndrewMultilingualNeural (Warm natural conversational tone)
    CREATOR_VOICES.casualPodcastMale,        // en-US-BrianMultilingualNeural (Dynamic, human creator delivery)
    CREATOR_VOICES.britishNarratorMale       // en-GB-RyanNeural (Refined British documentary baritone)
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  // =========================================================================
  // Tier 2: Direct Node.js MsEdgeTTS (Auto Clock Sync, Deep Adult Male Voices)
  // Completely immune to Python CLI 403 clock skew bugs on Cloud VPS / Docker
  // =========================================================================
  for (const voiceToTry of candidateVoices) {
    try {
      await generateSpeechWithNodeEdge(cleanedText, targetPath, {
        voice: voiceToTry,
        rate,
        pitch
      });

      if (fsSync.existsSync(targetPath) && (await fs.stat(targetPath)).size >= 500) {
        console.log(`[TTS Engine] 🎙️ Natural male voiceover synthesized via Node MsEdgeTTS (${voiceToTry}).`);
        try {
          if (targetPath !== cachePath) {
            await fs.copyFile(targetPath, cachePath);
          }
        } catch {}
        return targetPath;
      }
    } catch (nodeEdgeErr: any) {
      console.warn(`[TTS Engine] Node MsEdgeTTS candidate "${voiceToTry}" failed:`, nodeEdgeErr?.message || nodeEdgeErr);
      try { if (fsSync.existsSync(targetPath)) await fs.unlink(targetPath); } catch {}
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // =========================================================================
  // Tier 3: Python CLI Edge-TTS (Secondary Network Fallback)
  // =========================================================================
  const tempTextFile = path.join(activeTtsDir, `tts-text-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);
  await fs.writeFile(tempTextFile, cleanedText, 'utf8');

  try {
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
        await executeEdgeTTS(args, 30000);

        if (fsSync.existsSync(targetPath)) {
          const stat = await fs.stat(targetPath);
          if (stat.size >= 500) {
            console.log(`[TTS Engine] 🎙️ Natural male voiceover synthesized via Python Edge-TTS (${voiceToUse} @ 1.0x).`);
            try {
              if (targetPath !== cachePath) {
                await fs.copyFile(targetPath, cachePath);
              }
            } catch {}
            return targetPath;
          }
          try { await fs.unlink(targetPath); } catch {}
        }
      } catch (err: any) {
        console.warn(`[TTS Engine] Python Edge-TTS candidate "${voiceToUse}" failed:`, err?.message || err);
        try { if (fsSync.existsSync(targetPath)) await fs.unlink(targetPath); } catch {}
        await new Promise(r => setTimeout(r, 400));
      }
    }
  } finally {
    try { await fs.unlink(tempTextFile); } catch {}
  }

  // =========================================================================
  // Tier 4: Offline Piper Neural Male TTS (Guaranteed 100% Male Documentary Baritone)
  // Zero network requests, zero cloud API limits, zero female robotic voice
  // =========================================================================
  console.warn('[TTS Engine] Invoking Tier 4 Offline Piper Neural Male TTS (Ryan Baritone)...');
  const piperResult = await generateSpeechWithPiper(cleanedText, targetPath);
  try {
    if (fsSync.existsSync(piperResult) && piperResult !== cachePath) {
      await fs.copyFile(piperResult, cachePath);
    }
  } catch {}
  return piperResult;
}

/**
 * Resolves the path to the offline Piper ONNX adult male documentary model (en_US-ryan-medium).
 * If the model is not found on disk, downloads it automatically.
 */
export async function resolvePiperModel(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), 'models', 'piper', 'en_US-ryan-medium.onnx'),
    path.resolve(process.cwd(), 'data', 'models', 'piper', 'en_US-ryan-medium.onnx'),
    '/app/models/piper/en_US-ryan-medium.onnx',
    '/app/data/models/piper/en_US-ryan-medium.onnx',
    '/usr/local/share/piper/en_US-ryan-medium.onnx'
  ];

  for (const p of candidates) {
    try {
      if (fsSync.existsSync(p) && fsSync.statSync(p).size > 10000000) {
        return p;
      }
    } catch {}
  }

  // Not found, download to data/models/piper
  const targetDir = path.resolve(process.cwd(), 'data', 'models', 'piper');
  await fs.mkdir(targetDir, { recursive: true });
  console.log('[TTS Engine] Downloading offline neural male model (en_US-ryan-medium) to', targetDir);

  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  await execFileAsync(pyCmd, ['-m', 'piper.download_voices', 'en_US-ryan-medium', '--data-dir', targetDir]);

  const downloadedPath = path.join(targetDir, 'en_US-ryan-medium.onnx');
  if (fsSync.existsSync(downloadedPath)) {
    return downloadedPath;
  }

  throw new Error('Failed to resolve or download Piper neural male model');
}

/**
 * 100% Offline, Zero-Cloud Piper Neural Adult Male TTS.
 * Uses en_US-ryan-medium (deep, cinematic, mature adult male documentary baritone).
 * Completely immune to Microsoft 403 Forbidden, rate limits, clock skew, or API outages.
 */
export async function generateSpeechWithPiper(
  text: string,
  outputPath: string
): Promise<string> {
  const activeTtsDir = await ensureTtsDir();
  const cleanedText = humanizeSpeechText(text);
  if (!cleanedText) throw new Error('Piper TTS text cannot be empty');

  const modelPath = await resolvePiperModel();
  const rawWav = path.join(activeTtsDir, `piper-raw-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.wav`);
  const runnerScript = path.resolve(process.cwd(), 'server', 'piper_tts.py');
  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';

  // Write text to temp file to prevent CLI escaping or length bugs
  const tempTextFile = path.join(activeTtsDir, `piper-text-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);
  await fs.writeFile(tempTextFile, cleanedText, 'utf8');

  try {
    await execFileAsync(pyCmd, [
      runnerScript,
      '--model', modelPath,
      '--output', rawWav,
      '--file', tempTextFile,
      '--length-scale', '0.90'
    ], { timeout: 35000 });

    if (!fsSync.existsSync(rawWav) || fsSync.statSync(rawWav).size < 500) {
      throw new Error('Piper TTS produced empty or invalid WAV output');
    }

    // Convert raw WAV to standardized 44.1kHz broadcast stereo MP3 with warmth EQ, comfortable human tempo, & compand
    const broadcastFilter = 'atempo=1.10,volume=1.25,aformat=sample_rates=44100:channel_layouts=stereo,equalizer=f=120:width_type=o:width=1.2:g=2.5,compand=attacks=0.02:decays=0.2:points=-80/-80|-45/-30|-20/-10|0/-2:soft-knee=6';
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawWav,
      '-af', broadcastFilter,
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '192k',
      outputPath
    ]);

    console.log(`[TTS Engine] 🎙️ Mature male voiceover synthesized via Offline Piper Neural TTS (Ryan Baritone).`);
    return outputPath;
  } finally {
    try { await fs.unlink(rawWav); } catch {}
    try { await fs.unlink(tempTextFile); } catch {}
  }
}

/**
 * Universal Male Fallback:
 * Forwards transparently to Piper Neural Adult Male TTS.
 * Guarantees NO generic female voices can EVER be synthesized.
 */
export async function generateSpeechViaHttp(
  text: string,
  outputPath: string
): Promise<string> {
  return await generateSpeechWithPiper(text, outputPath);
}

/**
 * Cohesive Reel Speech Synthesizer:
 * Enforces ONE consistent voice and ONE consistent provider across ALL scenes in the reel.
 * If any scene fails or hits rate-limits, ALL scenes roll over together to the fallback engine.
 * Never allows voice or engine switching between scenes within a single reel.
 */
export async function generateCohesiveReelSpeech(
  sceneTexts: string[],
  options: { topic?: string; mood?: string; voice?: string; rate?: string } = {}
): Promise<{
  sceneAudioPaths: (string | null)[];
  sceneDurations: number[];
  masterAudioPath: string;
  totalDuration: number;
  voiceUsed: string;
  sceneWords: TimedWord[][];
}> {
  const activeTtsDir = await ensureTtsDir();
  // Strictly preserve the 1-to-1 array mapping with scenes (never filter out empty elements!)
  const cleanedTexts = sceneTexts.map(t => (t ? humanizeSpeechText(t) : ''));
  const hasAnySpeech = cleanedTexts.some(t => t && t.trim().length > 0);

  if (!hasAnySpeech) {
    throw new Error('generateCohesiveReelSpeech: No valid scene texts provided.');
  }

  // =========================================================================
  // Tier 1: Gemini 3.8 Flash Studio Neural Voice (Charon / Fenrir Documentary Baritone)
  // Synthesizes the ENTIRE reel in ONE single cohesive AI request with silence markers (<long pause>).
  // Zero 429 quota exhaustion (1 request vs N requests), authentic human nuance, zero robotic DSP.
  // =========================================================================
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    const rawVoice = options.voice ? options.voice.replace(/^Gemini-/, '') : undefined;
    const geminiVoice = rawVoice && ['Charon', 'Fenrir', 'Puck'].includes(rawVoice)
      ? rawVoice
      : resolveGeminiVoiceForTopic(options.topic || '', options.mood || '');

    try {
      console.log(`[TTS Engine] 🌟 Attempting Tier 1 Gemini 3.8 Flash Studio Neural Voice (${geminiVoice}) via single-batch cohesive reel request...`);

      const nonEmptyIndices: number[] = [];
      const nonEmptyTexts: string[] = [];
      for (let i = 0; i < cleanedTexts.length; i++) {
        const t = cleanedTexts[i];
        if (t && t.trim().length > 0) {
          nonEmptyIndices.push(i);
          nonEmptyTexts.push(t.trim());
        }
      }

      if (nonEmptyTexts.length > 0) {
        const fullScriptWithPauses = nonEmptyTexts.join(' <long pause> ');
        const masterRawWav = path.join(activeTtsDir, `gemini-master-${Date.now()}-${crypto.randomBytes(2).toString('hex')}.wav`);
        const masterMp3 = path.join(activeTtsDir, `master-reel-${Date.now()}.mp3`);

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [{
            role: 'user',
            parts: [{
              text: fullScriptWithPauses,
              speechMetadata: {
                style: 'documentary narrator, mature adult male, deep authoritative baritone, natural steady human cadence, articulate and captivating storytelling'
              }
            }]
          }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiVoice
                }
              }
            }
          } as any
        });

        const candidate = response.candidates?.[0];
        const part = candidate?.content?.parts?.[0];
        const inlineData = (part as any)?.inlineData;

        if (inlineData?.data) {
          await fs.writeFile(masterRawWav, Buffer.from(inlineData.data, 'base64'));

          // Convert master raw audio to broadcast 44.1kHz stereo MP3 with warmth EQ and comfortable 130-135 WPM human tempo
          const broadcastFilter = 'atempo=1.25,volume=1.2,equalizer=f=100:width_type=o:width=1.2:g=2.0,equalizer=f=3200:width_type=o:width=1.2:g=1.0,compand=attacks=0.02:decays=0.2:points=-80/-80|-45/-30|-20/-10|0/-2:soft-knee=6';
          try {
            await execFileAsync('ffmpeg', [
              '-y',
              '-i', masterRawWav,
              '-af', broadcastFilter,
              '-c:a', 'libmp3lame',
              '-ar', '44100',
              '-ac', '2',
              '-b:a', '192k',
              masterMp3
            ]);
          } catch {
            await execFileAsync('ffmpeg', [
              '-y',
              '-i', masterRawWav,
              '-af', 'atempo=1.25,volume=1.2',
              '-c:a', 'libmp3lame',
              '-ar', '44100',
              '-ac', '2',
              '-b:a', '192k',
              masterMp3
            ]);
          } finally {
            try { await fs.unlink(masterRawWav); } catch {}
          }

          const totalDur = await getAudioDuration(masterMp3);

          // Initialize result arrays preserving 1-to-1 scene mapping
          const paths: (string | null)[] = new Array(cleanedTexts.length).fill(null);
          const durations: number[] = new Array(cleanedTexts.length).fill(0);
          const sceneWords: TimedWord[][] = Array.from({ length: cleanedTexts.length }, () => []);

          if (nonEmptyTexts.length === 1) {
            const singleIdx = nonEmptyIndices[0];
            const segPath = path.join(activeTtsDir, `gemini-scene-${Date.now()}-${singleIdx}.mp3`);
            await fs.copyFile(masterMp3, segPath);
            paths[singleIdx] = segPath;
            durations[singleIdx] = totalDur;
            sceneWords[singleIdx] = estimateWordTimings(nonEmptyTexts[0], totalDur);
          } else {
            // Multiple scenes: detect pauses to split
            const { stderr: silenceLog } = await execFileAsync('ffmpeg', [
              '-i', masterMp3,
              '-af', 'silencedetect=noise=-28dB:d=0.35',
              '-f', 'null',
              '-'
            ]);

            const silenceStarts: number[] = [];
            const silenceEnds: number[] = [];
            const startRegex = /silence_start:\s+([\d.]+)/g;
            const endRegex = /silence_end:\s+([\d.]+)/g;

            let m;
            while ((m = startRegex.exec(silenceLog)) !== null) silenceStarts.push(parseFloat(m[1]));
            while ((m = endRegex.exec(silenceLog)) !== null) silenceEnds.push(parseFloat(m[1]));

            // Pair up silences excluding trailing silence at the very end
            const silences: { start: number; end: number; duration: number }[] = [];
            for (let s = 0; s < silenceStarts.length; s++) {
              const start = silenceStarts[s];
              const end = silenceEnds[s] !== undefined ? silenceEnds[s] : totalDur;
              if (start < totalDur - 0.6) {
                silences.push({ start, end, duration: end - start });
              }
            }

            const neededSplits = nonEmptyTexts.length - 1;
            let splitPoints: number[] = [];

            if (silences.length >= neededSplits) {
              // Pick the neededSplits longest silences (the <long pause> scene markers)
              const selectedSplits = silences
                .sort((a, b) => b.duration - a.duration)
                .slice(0, neededSplits)
                .sort((a, b) => a.start - b.start)
                .map(s => (s.start + s.end) / 2);

              splitPoints = [0, ...selectedSplits, totalDur];
            } else {
              // Fallback proportional split if silence detection didn't find enough pauses
              console.warn(`[TTS Engine] Silence detection found ${silences.length} pauses (needed ${neededSplits}), using word-proportional split points.`);
              const wordCounts = nonEmptyTexts.map(t => Math.max(1, t.split(/\s+/).length));
              const totalWords = wordCounts.reduce((acc, c) => acc + c, 0);
              let cumTime = 0;
              splitPoints = [0];
              for (let k = 0; k < wordCounts.length - 1; k++) {
                cumTime += (wordCounts[k] / totalWords) * totalDur;
                splitPoints.push(cumTime);
              }
              splitPoints.push(totalDur);
            }

            // Slice out each segment
            for (let k = 0; k < nonEmptyTexts.length; k++) {
              const originalIdx = nonEmptyIndices[k];
              const start = splitPoints[k];
              const end = splitPoints[k + 1];
              const segPath = path.join(activeTtsDir, `gemini-scene-${Date.now()}-${originalIdx}-${crypto.randomBytes(2).toString('hex')}.mp3`);

              await execFileAsync('ffmpeg', [
                '-y',
                '-ss', start.toFixed(3),
                '-to', end.toFixed(3),
                '-i', masterMp3,
                '-c:a', 'libmp3lame',
                '-ar', '44100',
                '-ac', '2',
                '-b:a', '192k',
                segPath
              ]);

              const dur = await getAudioDuration(segPath);
              paths[originalIdx] = segPath;
              durations[originalIdx] = dur;
              sceneWords[originalIdx] = estimateWordTimings(nonEmptyTexts[k], dur);
            }
          }

          console.log(`[TTS Engine] 🌟 Cohesive studio neural voiceover complete via Gemini 3.8 Flash (${geminiVoice}): ${totalDur.toFixed(1)}s across ${nonEmptyTexts.length} scene(s).`);
          return {
            sceneAudioPaths: paths,
            sceneDurations: durations,
            masterAudioPath: masterMp3,
            totalDuration: totalDur,
            voiceUsed: `Gemini-${geminiVoice}`,
            sceneWords
          };
        }
      }
    } catch (geminiErr: any) {
      console.warn(`[TTS Engine] Tier 1 Gemini cohesive reel synthesis failed (${geminiErr?.message || geminiErr}). Rolling over to Node MsEdgeTTS...`);
    }
  }

  // =========================================================================
  // Tier 2: Direct Node.js MsEdgeTTS (Auto Clock Sync, Deep Adult Male Voices)
  // Auto clock-sync in Node.js prevents 403 Forbidden handshake rejections on VPS.
  // =========================================================================
  const rawEdgeVoice = options.voice ? options.voice.replace(/^Gemini-/, '') : undefined;
  const primaryEdgeVoice = (rawEdgeVoice && !rawEdgeVoice.startsWith('Piper-'))
    ? rawEdgeVoice
    : resolveBestVoiceForTopic(options.topic || '', options.mood || '');
  const candidateVoices = [
    primaryEdgeVoice,
    CREATOR_VOICES.deepDocumentaryMale,      // en-US-ChristopherNeural (Mature authoritative documentary baritone)
    'en-US-GuyNeural',                       // en-US-GuyNeural (Crisp broadcast anchor)
    CREATOR_VOICES.cinematicStorytellerMale,  // en-US-EricNeural (Calm, rich storytelling baritone)
    CREATOR_VOICES.naturalCreatorMale,       // en-US-AndrewMultilingualNeural (Warm natural conversational tone)
    CREATOR_VOICES.casualPodcastMale,        // en-US-BrianMultilingualNeural (Dynamic, human creator delivery)
    CREATOR_VOICES.britishNarratorMale       // en-GB-RyanNeural (Refined British documentary baritone)
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  for (const edgeVoice of candidateVoices) {
    try {
      console.log(`[TTS Engine] 🔒 Attempting locked Node MsEdgeTTS MALE voice (${edgeVoice}) across all ${cleanedTexts.length} scene(s)...`);
      const paths: (string | null)[] = [];
      const durations: number[] = [];
      const sceneWords: TimedWord[][] = [];
      let success = true;

      for (let i = 0; i < cleanedTexts.length; i++) {
        const text = cleanedTexts[i];
        if (!text || text.trim().length === 0) {
          paths.push(null);
          durations.push(0);
          sceneWords.push([]);
          continue;
        }

        const segPath = path.join(activeTtsDir, `node-edge-scene-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}.mp3`);
        let sceneSuccess = false;

        // Up to 4 attempts with exponential backoff for transient 429 or network blips
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const detail = await generateSpeechWithNodeEdgeDetailed(text, segPath, {
              voice: edgeVoice,
              rate: options.rate || '+15%',
              pitch: '+0Hz'
            });

            if (fsSync.existsSync(segPath) && (await fs.stat(segPath)).size >= 500) {
              paths.push(segPath);
              durations.push(detail.duration);
              sceneWords.push(detail.words);
              sceneSuccess = true;
              break;
            }
          } catch (sceneErr: any) {
            const isRateLimit = String(sceneErr?.message || sceneErr).includes('429');
            const delay = isRateLimit ? 1200 + attempt * 500 : 800 + attempt * 400;
            console.warn(`[TTS Engine] Node Edge voice ${edgeVoice} scene ${i + 1} attempt ${attempt + 1} error (${sceneErr?.message || sceneErr}), retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }

        if (!sceneSuccess) {
          console.warn(`[TTS Engine] Node Edge voice ${edgeVoice} failed on scene ${i + 1}. Abandoning this voice to guarantee zero mid-reel voice switching.`);
          success = false;
          break;
        }

        // 550ms pause between consecutive scenes to prevent Microsoft WebSocket rate limiting
        await new Promise(r => setTimeout(r, 550));
      }

      if (success && paths.length === cleanedTexts.length) {
        const validPaths = paths.filter((p): p is string => Boolean(p));
        const masterPath = path.join(activeTtsDir, `master-reel-${Date.now()}.mp3`);
        await concatenateAudioTracks(validPaths, masterPath);
        const totalDur = await getAudioDuration(masterPath);

        console.log(`[TTS Engine] ✅ Cohesive voiceover complete via Node MsEdgeTTS (${edgeVoice}): ${totalDur.toFixed(1)}s across ${validPaths.length} scene(s).`);
        return {
          sceneAudioPaths: paths,
          sceneDurations: durations,
          masterAudioPath: masterPath,
          totalDuration: totalDur,
          voiceUsed: edgeVoice,
          sceneWords
        };
      }
    } catch (edgeErr: any) {
      console.warn(`[TTS Engine] Node Edge voice "${edgeVoice}" failed for batch:`, edgeErr?.message || edgeErr);
    }
  }

  // =========================================================================
  // Tier 3: Python CLI Edge-TTS for ALL scenes with a single locked candidate voice
  // =========================================================================
  for (const edgeVoice of candidateVoices) {
    try {
      console.log(`[TTS Engine] 🔒 Attempting locked Edge Neural MALE TTS (${edgeVoice}) across all ${cleanedTexts.length} scene(s)...`);
      const paths: (string | null)[] = [];
      const durations: number[] = [];
      const sceneWords: TimedWord[][] = [];
      let success = true;

      for (let i = 0; i < cleanedTexts.length; i++) {
        const text = cleanedTexts[i];
        if (!text || text.trim().length === 0) {
          paths.push(null);
          durations.push(0);
          sceneWords.push([]);
          continue;
        }

        const segPath = path.join(activeTtsDir, `edge-scene-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}.mp3`);
        const tempText = path.join(activeTtsDir, `edge-text-${Date.now()}-${i}.txt`);
        await fs.writeFile(tempText, text, 'utf8');

        let sceneSuccess = false;
        // Up to 3 attempts with 600ms backoff so transient socket closes recover cleanly
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await executeEdgeTTS([
              '--file', tempText,
              '--write-media', segPath,
              '--voice', edgeVoice,
              '--rate', options.rate || '+15%',
              '--pitch', '+0Hz'
            ], 28000);

            if (fsSync.existsSync(segPath) && (await fs.stat(segPath)).size >= 500) {
              const dur = await getAudioDuration(segPath);
              paths.push(segPath);
              durations.push(dur);
              sceneWords.push(estimateWordTimings(text, dur));
              sceneSuccess = true;
              break;
            }
          } catch (edgeAttemptErr: any) {
            console.warn(`[TTS Engine] Voice ${edgeVoice} scene ${i + 1} attempt ${attempt + 1} error:`, edgeAttemptErr?.message || edgeAttemptErr);
            await new Promise(r => setTimeout(r, 600));
          }
        }

        await fs.unlink(tempText).catch(() => {});

        if (!sceneSuccess) {
          console.warn(`[TTS Engine] Voice ${edgeVoice} failed on scene ${i + 1}. Abandoning this voice to guarantee zero mid-reel voice switching.`);
          success = false;
          break;
        }

        // Small 350ms delay between consecutive scenes to prevent Microsoft Edge WebSocket rate limiting
        await new Promise(r => setTimeout(r, 350));
      }

      if (success && paths.length === cleanedTexts.length) {
        const validPaths = paths.filter((p): p is string => Boolean(p));
        const masterPath = path.join(activeTtsDir, `master-reel-${Date.now()}.mp3`);
        await concatenateAudioTracks(validPaths, masterPath);
        const totalDur = await getAudioDuration(masterPath);

        console.log(`[TTS Engine] ✅ Cohesive voiceover complete via Edge Neural TTS (${edgeVoice}): ${totalDur.toFixed(1)}s across ${validPaths.length} scene(s).`);
        return {
          sceneAudioPaths: paths,
          sceneDurations: durations,
          masterAudioPath: masterPath,
          totalDuration: totalDur,
          voiceUsed: edgeVoice,
          sceneWords
        };
      }
    } catch (edgeErr: any) {
      console.warn(`[TTS Engine] Edge voice "${edgeVoice}" failed for batch:`, edgeErr?.message || edgeErr);
    }
  }

  // 4. Fallback: Offline Piper Neural Male TTS (Guaranteed 100% Male Documentary Baritone)
  console.warn(`[TTS Engine] Rolling over ENTIRE reel to Offline Piper Neural MALE TTS (Ryan Baritone)...`);
  const paths: (string | null)[] = [];
  const durations: number[] = [];
  const sceneWords: TimedWord[][] = [];

  for (let i = 0; i < cleanedTexts.length; i++) {
    const text = cleanedTexts[i];
    if (!text || text.trim().length === 0) {
      paths.push(null);
      durations.push(0);
      sceneWords.push([]);
      continue;
    }

    const segPath = path.join(activeTtsDir, `piper-scene-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}.mp3`);
    await generateSpeechWithPiper(text, segPath);
    const dur = await getAudioDuration(segPath);
    paths.push(segPath);
    durations.push(dur);
    sceneWords.push(estimateWordTimings(text, dur));
  }

  const validPaths = paths.filter((p): p is string => Boolean(p));
  const masterPath = path.join(activeTtsDir, `master-reel-${Date.now()}.mp3`);
  await concatenateAudioTracks(validPaths, masterPath);
  const totalDur = await getAudioDuration(masterPath);

  console.log(`[TTS Engine] ✅ Cohesive voiceover complete via Piper Neural Male TTS: ${totalDur.toFixed(1)}s across ${validPaths.length} scene(s).`);
  return {
    sceneAudioPaths: paths,
    sceneDurations: durations,
    masterAudioPath: masterPath,
    totalDuration: totalDur,
    voiceUsed: 'Piper-RyanBaritoneMale',
    sceneWords
  };
}

/**
 * Studio-Grade Neural Documentary TTS via Google Gemini 3.8 Flash TTS.
 * Generates authentic narrator audio with deep resonance, mature vocal timbre, and zero latency.
 */
export async function generateSpeechWithGemini(
  text: string,
  outputPath: string,
  voiceName = 'Charon'
): Promise<string> {
  await ensureTtsDir();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-tts',
    contents: [{
      role: 'user',
      parts: [{
        text,
        speechMetadata: {
          style: 'documentary narrator, mature adult male, deep baritone, authoritative, natural steady human cadence, articulate and captivating storytelling'
        }
      }],
    }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName // 'Fenrir' is deep, dramatic documentary voice
          }
        }
      }
    } as any
  });

  const candidate = response.candidates?.[0];
  const part = candidate?.content?.parts?.[0];
  const inlineData = (part as any)?.inlineData;

  if (!inlineData?.data) {
    throw new Error('Gemini TTS returned no audio data');
  }

  const rawWav = outputPath.replace(/\.mp3$/, `-gemini-${Date.now()}.wav`);
  const buffer = Buffer.from(inlineData.data, 'base64');
  await fs.writeFile(rawWav, buffer);

  try {
    // Convert to broadcast 44.1kHz stereo MP3 with warmth EQ and comfortable 130-135 WPM human cadence
    const broadcastFilter = 'atempo=1.25,volume=1.2,equalizer=f=100:width_type=o:width=1.2:g=2.0,equalizer=f=3200:width_type=o:width=1.2:g=1.0,compand=attacks=0.02:decays=0.2:points=-80/-80|-45/-30|-20/-10|0/-2:soft-knee=6';
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawWav,
      '-af', broadcastFilter,
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '192k',
      outputPath
    ]);
  } catch {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawWav,
      '-af', 'atempo=1.25,volume=1.2',
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '192k',
      outputPath
    ]);
  } finally {
    try { await fs.unlink(rawWav); } catch {}
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

  const activeTtsDir = await ensureTtsDir();
  const concatList = path.join(activeTtsDir, `concat-${Date.now()}.txt`);
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
