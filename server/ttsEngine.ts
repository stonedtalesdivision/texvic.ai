import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { GoogleGenAI } from '@google/genai';

const execFileAsync = promisify(execFile);
const TTS_DIR = path.join(process.cwd(), 'data', 'media', 'tts');

export interface TTSOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
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
 */
export function resolveBestVoiceForTopic(topicOrNiche = '', mood = ''): string {
  const text = `${topicOrNiche} ${mood}`.toLowerCase();
  if (/scary|spooky|horror|creepy|dark|unsolved|mystery|paranormal|conspiracy|crime|heist|dossier|classified|ancient|ruins|island|abyss|ocean|nuclear/i.test(text)) {
    return CREATOR_VOICES.deepDocumentaryMale;
  }
  if (/history|historical|civilization|documentary|archive|dossier/i.test(text)) {
    return CREATOR_VOICES.cinematicStorytellerMale;
  }
  if (/tech|ai|software|future|breakthrough|productivity/i.test(text)) {
    return CREATOR_VOICES.authorityMale;
  }
  return CREATOR_VOICES.deepDocumentaryMale;
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
 * Generate human-like neural audio voiceover from script text.
 * Completely free, zero API key required, low latency (~1.5s).
 * Primary Engine: Microsoft Edge Neural TTS (1.20x speed, natural male neural voices).
 * Fallback: Gemini 3.8 Flash TTS (Charon) -> Tier 3 HTTPS TTS.
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

  // =========================================================================
  // Tier 1: Gemini 3.8 Flash TTS (Deep Hollywood Charon / Fenrir Documentary Baritone)
  // Highly reliable studio-grade male narrator with zero local Python/CLI dependencies
  // =========================================================================
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    try {
      const geminiVoice = cleanVoice && ['Charon', 'Fenrir', 'Puck', 'Orpheus'].includes(cleanVoice)
        ? cleanVoice
        : resolveGeminiVoiceForTopic('', '');
      const geminiResult = await generateSpeechWithGemini(cleanedText, targetPath, geminiVoice);
      try {
        if (fsSync.existsSync(geminiResult) && geminiResult !== cachePath) {
          await fs.copyFile(geminiResult, cachePath);
        }
      } catch {}
      return geminiResult;
    } catch (geminiErr: any) {
      console.warn('[TTS Engine] Tier 1 Gemini TTS unavailable, trying Edge Neural TTS:', geminiErr?.message || geminiErr);
    }
  }

  // =========================================================================
  // Tier 2: Microsoft Edge Neural TTS (Natural Male Neural Voices)
  // Deep adult male documentary baritones: Christopher / Guy / Eric / Andrew / Brian / Ryan
  // =========================================================================
  const primaryVoice = cleanVoice || CREATOR_VOICES.deepDocumentaryMale;
  const rate = options.rate || '+0%';   // 1.0x natural human speech rate
  const pitch = options.pitch || '-4Hz'; // Rich, authoritative documentary chest resonance

  const tempTextFile = path.join(activeTtsDir, `tts-text-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);
  await fs.writeFile(tempTextFile, cleanedText, 'utf8');

  // Multi-candidate male neural voices (all high-fidelity adult male narrators)
  const candidateVoices = [
    primaryVoice,
    CREATOR_VOICES.deepDocumentaryMale,      // en-US-ChristopherNeural (Mature authoritative documentary baritone)
    CREATOR_VOICES.cinematicStorytellerMale,  // en-US-EricNeural (Calm, rich storytelling baritone)
    'en-US-GuyNeural',                       // en-US-GuyNeural (Crisp broadcast anchor)
    CREATOR_VOICES.naturalCreatorMale,       // en-US-AndrewMultilingualNeural (Warm natural conversational tone)
    CREATOR_VOICES.casualPodcastMale,        // en-US-BrianMultilingualNeural (Dynamic, human creator delivery)
    CREATOR_VOICES.britishNarratorMale       // en-GB-RyanNeural (Refined British documentary baritone)
  ].filter((v, i, arr) => arr.indexOf(v) === i);

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
            console.log(`[TTS Engine] 🎙️ Natural male voiceover synthesized via Edge Neural TTS (${voiceToUse} @ 1.0x).`);
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
        console.warn(`[TTS Engine] Edge-TTS candidate "${voiceToUse}" failed:`, err?.message || err);
        try { if (fsSync.existsSync(targetPath)) await fs.unlink(targetPath); } catch {}
        await new Promise(r => setTimeout(r, 400));
      }
    }
  } finally {
    try { await fs.unlink(tempTextFile); } catch {}
  }

  // =========================================================================
  // Tier 2: Offline Piper Neural Male TTS (Guaranteed 100% Male Documentary Baritone)
  // Zero network requests, zero cloud API limits, zero female robotic voice
  // =========================================================================
  console.warn('[TTS Engine] Invoking Tier 2 Offline Piper Neural Male TTS (Ryan Baritone)...');
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
      '--file', tempTextFile
    ], { timeout: 35000 });

    if (!fsSync.existsSync(rawWav) || fsSync.statSync(rawWav).size < 500) {
      throw new Error('Piper TTS produced empty or invalid WAV output');
    }

    // Convert raw WAV to standardized 44.1kHz broadcast stereo MP3 with warmth EQ & compand
    const broadcastFilter = 'volume=1.25,aformat=sample_rates=44100:channel_layouts=stereo,equalizer=f=120:width_type=o:width=1.2:g=2.5,compand=attacks=0.02:decays=0.2:points=-80/-80|-45/-30|-20/-10|0/-2:soft-knee=6';
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
  options: { topic?: string; mood?: string; voice?: string } = {}
): Promise<{
  sceneAudioPaths: (string | null)[];
  sceneDurations: number[];
  masterAudioPath: string;
  totalDuration: number;
  voiceUsed: string;
}> {
  const activeTtsDir = await ensureTtsDir();
  // Strictly preserve the 1-to-1 array mapping with scenes (never filter out empty elements!)
  const cleanedTexts = sceneTexts.map(t => (t ? humanizeSpeechText(t) : ''));
  const hasAnySpeech = cleanedTexts.some(t => t && t.trim().length > 0);

  if (!hasAnySpeech) {
    throw new Error('generateCohesiveReelSpeech: No valid scene texts provided.');
  }

  // 1. Try Gemini 3.8 Flash TTS for ALL scenes with a single locked voice
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    const geminiVoice = resolveGeminiVoiceForTopic(options.topic || '', options.mood || '');
    try {
      console.log(`[TTS Engine] 🔒 Attempting locked Gemini 3.8 Flash TTS (${geminiVoice}) across all ${cleanedTexts.length} scene(s)...`);
      const paths: (string | null)[] = [];
      const durations: number[] = [];
      let allGeminiSuccess = true;

      for (let i = 0; i < cleanedTexts.length; i++) {
        const text = cleanedTexts[i];
        if (!text || text.trim().length === 0) {
          paths.push(null);
          durations.push(0);
          continue;
        }

        const segPath = path.join(activeTtsDir, `gemini-scene-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}.mp3`);
        let sceneSuccess = false;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await generateSpeechWithGemini(text, segPath, geminiVoice);
            if (fsSync.existsSync(segPath) && (await fs.stat(segPath)).size >= 500) {
              const dur = await getAudioDuration(segPath);
              paths.push(segPath);
              durations.push(dur);
              sceneSuccess = true;
              break;
            }
          } catch (e: any) {
            console.warn(`[TTS Engine] Gemini attempt ${attempt + 1} for scene ${i + 1} failed:`, e?.message || e);
            if (/429|RESOURCE_EXHAUSTED|404|NOT_FOUND|400|INVALID_ARGUMENT/i.test(String(e?.message || e))) {
              console.warn('[TTS Engine] Gemini TTS unavailable or quota exhausted. Fast failing to Edge Neural TTS...');
              allGeminiSuccess = false;
              break;
            }
            await new Promise(r => setTimeout(r, 600));
          }
        }

        if (!sceneSuccess) {
          allGeminiSuccess = false;
          break;
        }
      }

      if (allGeminiSuccess && paths.length === cleanedTexts.length) {
        const validPaths = paths.filter((p): p is string => Boolean(p));
        const masterPath = path.join(activeTtsDir, `master-reel-${Date.now()}.mp3`);
        await concatenateAudioTracks(validPaths, masterPath);
        const totalDur = await getAudioDuration(masterPath);

        console.log(`[TTS Engine] ✅ Cohesive voiceover complete via Gemini (${geminiVoice}): ${totalDur.toFixed(1)}s across ${validPaths.length} scene(s).`);
        return {
          sceneAudioPaths: paths,
          sceneDurations: durations,
          masterAudioPath: masterPath,
          totalDuration: totalDur,
          voiceUsed: `Gemini-${geminiVoice}`
        };
      }
    } catch (geminiErr: any) {
      console.warn(`[TTS Engine] Gemini bulk synthesis failed (${geminiErr?.message || geminiErr}). Rolling over ENTIRE reel to Edge Neural TTS...`);
    }
  }

  // 2. Try Edge Neural TTS for ALL scenes with a single locked candidate voice
  // Every candidate voice is an authentic, deep adult MALE documentary narrator
  const primaryEdgeVoice = options.voice || resolveBestVoiceForTopic(options.topic || '', options.mood || '');
  const candidateVoices = [
    primaryEdgeVoice,
    CREATOR_VOICES.deepDocumentaryMale,      // en-US-ChristopherNeural (Mature authoritative documentary baritone)
    CREATOR_VOICES.cinematicStorytellerMale,  // en-US-EricNeural (Calm, rich storytelling baritone)
    'en-US-GuyNeural',                       // en-US-GuyNeural (Crisp broadcast anchor)
    CREATOR_VOICES.naturalCreatorMale,       // en-US-AndrewMultilingualNeural (Warm natural conversational tone)
    CREATOR_VOICES.casualPodcastMale,        // en-US-BrianMultilingualNeural (Dynamic, human creator delivery)
    CREATOR_VOICES.britishNarratorMale       // en-GB-RyanNeural (Refined British documentary baritone)
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  for (const edgeVoice of candidateVoices) {
    try {
      console.log(`[TTS Engine] 🔒 Attempting locked Edge Neural MALE TTS (${edgeVoice}) across all ${cleanedTexts.length} scene(s)...`);
      const paths: (string | null)[] = [];
      const durations: number[] = [];
      let success = true;

      for (let i = 0; i < cleanedTexts.length; i++) {
        const text = cleanedTexts[i];
        if (!text || text.trim().length === 0) {
          paths.push(null);
          durations.push(0);
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
              '--rate', '+0%',
              '--pitch', '-4Hz'
            ], 28000);

            if (fsSync.existsSync(segPath) && (await fs.stat(segPath)).size >= 500) {
              const dur = await getAudioDuration(segPath);
              paths.push(segPath);
              durations.push(dur);
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
          voiceUsed: edgeVoice
        };
      }
    } catch (edgeErr: any) {
      console.warn(`[TTS Engine] Edge voice "${edgeVoice}" failed for batch:`, edgeErr?.message || edgeErr);
    }
  }

  // 3. Fallback: Offline Piper Neural Male TTS (Guaranteed 100% Male Documentary Baritone)
  console.warn(`[TTS Engine] Rolling over ENTIRE reel to Offline Piper Neural MALE TTS (Ryan Baritone)...`);
  const paths: (string | null)[] = [];
  const durations: number[] = [];

  for (let i = 0; i < cleanedTexts.length; i++) {
    const text = cleanedTexts[i];
    if (!text || text.trim().length === 0) {
      paths.push(null);
      durations.push(0);
      continue;
    }

    const segPath = path.join(activeTtsDir, `piper-scene-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}.mp3`);
    await generateSpeechWithPiper(text, segPath);
    const dur = await getAudioDuration(segPath);
    paths.push(segPath);
    durations.push(dur);
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
    voiceUsed: 'Piper-RyanBaritoneMale'
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
          style: 'documentary narrator, mature adult male, deep baritone, authoritative, serious, captivating'
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
    // Convert to broadcast 44.1kHz stereo MP3 at 1.20x speed with subtle warm low-end EQ
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawWav,
      '-af', 'atempo=1.20,equalizer=f=95:width_type=o:width=1.5:g=2.5,equalizer=f=3400:width_type=o:width=1.2:g=1.2',
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
      '-af', 'atempo=1.20',
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
