import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

const execFileAsync = promisify(execFile);
const TTS_DIR = path.join(process.cwd(), 'data', 'media', 'tts');

export interface TTSOptions {
  voice?: string;
  rate?: string;
  volume?: string;
}

// Top natural creator voices in Microsoft Edge Neural TTS
export const CREATOR_VOICES = {
  naturalCreatorMale: 'en-US-AndrewMultilingualNeural',   // Ultra-natural conversational creator delivery
  casualPodcastMale: 'en-US-BrianMultilingualNeural',     // Friendly, dynamic tech YouTuber vibe
  authorityMale: 'en-US-ChristopherNeural',               // Confident, crisp tech anchor
  naturalCreatorFemale: 'en-US-AvaMultilingualNeural',    // Warm, authentic female creator delivery
  expressiveFemale: 'en-US-EmmaMultilingualNeural',       // High-energy, articulate host
};

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

/**
 * Generate human-like neural audio voiceover from script text.
 * Completely free, zero API key required, low latency (~1.5s).
 */
export async function generateSpeech(
  text: string,
  outputPath?: string,
  options: TTSOptions = {}
): Promise<string> {
  await fs.mkdir(TTS_DIR, { recursive: true });

  const cleanedText = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[*_#`[\]()]/g, '')
    .trim();

  if (!cleanedText) {
    throw new Error('TTS text cannot be empty');
  }

  const voice = options.voice || CREATOR_VOICES.naturalCreatorMale;
  const targetPath = outputPath || path.join(TTS_DIR, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);

  const args = [
    '-m', 'edge_tts',
    '--text', cleanedText,
    '--write-media', targetPath,
    '--voice', voice,
    '--rate', options.rate || '+20%'
  ];

  const pythonCmd = process.platform === 'win32'
    ? 'python'
    : (fsSync.existsSync('/usr/bin/python3') && !fsSync.existsSync('/usr/bin/python') ? 'python3' : 'python');

  try {
    await execFileAsync(pythonCmd, args, { timeout: 45000 });
    
    // Verify audio file was produced
    const stat = await fs.stat(targetPath);
    if (stat.size < 500) {
      throw new Error(`TTS output file too small (${stat.size} bytes)`);
    }

    return targetPath;
  } catch (err: any) {
    console.error(`[TTS Engine] Edge-TTS error for text "${cleanedText.slice(0, 40)}...":`, err?.message || err);
    throw err;
  }
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
      '-c', 'copy', outputPath
    ]);
    return outputPath;
  } finally {
    try { await fs.rm(concatList, { force: true }); } catch {}
  }
}
