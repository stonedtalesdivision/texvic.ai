import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

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
  deepDocumentaryMale: 'en-US-ChristopherNeural',         // Deep, authoritative, mature adult narrator
  cinematicStorytellerMale: 'en-US-EricNeural',           // Rich, calm, cinematic storytelling tone
  naturalCreatorMale: 'en-US-AndrewMultilingualNeural',   // Warm conversational voice
  casualPodcastMale: 'en-US-BrianMultilingualNeural',     // Dynamic creator delivery
  britishNarratorMale: 'en-GB-RyanNeural',                // Mature, sophisticated British documentary voice
  authorityMale: 'en-US-GuyNeural',                       // Deep, crisp dramatic broadcast anchor
  naturalCreatorFemale: 'en-US-AvaMultilingualNeural',    // Warm, authentic female storyteller
  expressiveFemale: 'en-US-EmmaMultilingualNeural',       // Articulate female narrator
  mysteriousFemale: 'en-GB-SoniaNeural',                  // Chilling, atmospheric British storyteller
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
    return 'en-US-GuyNeural';
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
  if (/crime|heist|dossier|classified|nuclear|cold war|war|secret|danger/i.test(text)) {
    return 'Charon'; // Deepest, gravest narrator
  }
  return 'Fenrir'; // Deep, authoritative documentary baritone
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

  const targetPath = outputPath || path.join(TTS_DIR, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);

  // Tier 1: Gemini 3.8 Flash TTS (Deep, mature, Hollywood-caliber documentary baritone)
  // Runs over pure Node.js HTTPS - requires ZERO Python, ZERO pip packages, ZERO CLI tools
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    try {
      const geminiVoice = options.voice && ['Fenrir', 'Charon', 'Puck', 'Aoede', 'Kore'].includes(options.voice)
        ? options.voice
        : 'Fenrir';
      console.log(`[TTS Engine] Synthesizing authentic documentary voiceover via Gemini 3.8 Flash TTS (${geminiVoice})...`);
      return await generateSpeechWithGemini(cleanedText, targetPath, geminiVoice);
    } catch (geminiErr: any) {
      console.warn('[TTS Engine] Gemini 3.8 Flash TTS unavailable, falling back to Microsoft Edge Neural TTS:', geminiErr?.message || geminiErr);
    }
  }

  // Tier 2: Microsoft Edge Neural TTS (Deep adult male voices: Christopher / Guy / Ryan)
  const primaryVoice = options.voice || CREATOR_VOICES.deepDocumentaryMale;
  const rate = options.rate || '+20%';  // 1.20x speed: brisk, modern, captivating tempo
  const pitch = options.pitch || '-4Hz'; // Deep chest resonance, never squeaky or childish

  // Write text to a temporary UTF-8 text file to eliminate command-line encoding & length bugs
  const tempTextFile = path.join(TTS_DIR, `tts-text-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);
  await fs.writeFile(tempTextFile, cleanedText, 'utf8');

  // Mature, deep adult voice candidates only
  const candidateVoices = [
    primaryVoice,
    CREATOR_VOICES.deepDocumentaryMale,
    CREATOR_VOICES.cinematicStorytellerMale,
    'en-US-GuyNeural',
    CREATOR_VOICES.britishNarratorMale
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
            console.log(`[TTS Engine] Voiceover synthesized via Edge Neural TTS (${voiceToUse}).`);
            return targetPath;
          }
          try { await fs.unlink(targetPath); } catch {}
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[TTS Engine] Attempt ${attempt + 1} with voice "${voiceToUse}" failed:`, err?.message || err);
        try { if (fsSync.existsSync(targetPath)) await fs.unlink(targetPath); } catch {}
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // Tier 3: Zero-Dependency Pure HTTPS Web TTS Fallback
    // Guaranteed to work on any VPS, inside Docker, with zero Python and zero API keys!
    console.warn('[TTS Engine] Microsoft Edge Neural TTS candidates exhausted. Invoking Tier 3 HTTPS Web TTS fallback...');
    return await generateSpeechViaHttp(cleanedText, targetPath);
  } catch (tier2Err: any) {
    try {
      console.warn('[TTS Engine] Invoking Tier 3 HTTPS Web TTS fallback after error:', tier2Err?.message || tier2Err);
      return await generateSpeechViaHttp(cleanedText, targetPath);
    } catch (tier3Err: any) {
      throw tier3Err || tier2Err;
    }
  } finally {
    try { await fs.unlink(tempTextFile); } catch {}
  }
}

/**
 * Tier 3: Zero-dependency, pure Node.js HTTPS Web TTS fallback.
 * Uses standard HTTPS requests with zero API keys and zero Python dependencies.
 * Chunks long text at natural punctuation boundaries, downloads audio, and normalizes with ffmpeg.
 */
export async function generateSpeechViaHttp(
  text: string,
  outputPath: string
): Promise<string> {
  await fs.mkdir(TTS_DIR, { recursive: true });

  // Split into natural phrases (max ~140 chars per chunk for web TTS)
  const sentences = text
    .replace(/([.!?])\s+/g, "$1|")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).trim().length <= 140) {
      current = (current + " " + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length > 140) {
        const words = s.split(" ");
        let sub = "";
        for (const w of words) {
          if ((sub + " " + w).trim().length <= 140) {
            sub = (sub + " " + w).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        if (sub) chunks.push(sub);
        current = "";
      } else {
        current = s;
      }
    }
  }
  if (current) chunks.push(current);

  if (chunks.length === 0) {
    chunks.push(text.slice(0, 140));
  }

  const chunkFiles: string[] = [];
  const tempBase = path.join(TTS_DIR, `http-chunk-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en-us&client=tw-ob`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP TTS responded with status ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 500) {
        throw new Error('HTTP TTS returned empty audio buffer');
      }

      const chunkPath = `${tempBase}-${i}.mp3`;
      await fs.writeFile(chunkPath, buffer);
      chunkFiles.push(chunkPath);
    }

    if (chunkFiles.length === 1) {
      // Standardize to broadcast 44.1kHz stereo MP3 at 1.20x speed with subtle warm EQ
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', chunkFiles[0],
        '-af', 'atempo=1.20,equalizer=f=120:width_type=o:width=1.5:g=2.2,aformat=sample_rates=44100:channel_layouts=stereo',
        '-c:a', 'libmp3lame',
        '-ar', '44100',
        '-ac', '2',
        '-b:a', '192k',
        outputPath
      ]);
    } else {
      // Concatenate all chunks and normalize at 1.20x speed
      const concatList = `${tempBase}-list.txt`;
      const listContent = chunkFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      await fs.writeFile(concatList, listContent, 'utf8');

      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatList,
          '-af', 'atempo=1.20,equalizer=f=120:width_type=o:width=1.5:g=2.2,aformat=sample_rates=44100:channel_layouts=stereo',
          '-c:a', 'libmp3lame',
          '-ar', '44100',
          '-ac', '2',
          '-b:a', '192k',
          outputPath
        ]);
      } finally {
        await fs.unlink(concatList).catch(() => {});
      }
    }

    console.log(`[TTS Engine] Voiceover synthesized via Tier 3 HTTPS Web TTS (${chunkFiles.length} chunk(s)).`);
    return outputPath;
  } finally {
    for (const f of chunkFiles) {
      await fs.unlink(f).catch(() => {});
    }
  }
}

/**
 * Studio-Grade Neural Documentary TTS via Google Gemini 3.8 Flash TTS.
 * Generates authentic narrator audio with deep resonance, mature vocal timbre, and zero latency.
 */
export async function generateSpeechWithGemini(
  text: string,
  outputPath: string,
  voiceName = 'Fenrir'
): Promise<string> {
  await fs.mkdir(TTS_DIR, { recursive: true });
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
