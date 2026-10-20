import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TimedWord } from './ttsEngine.js';

export interface KineticSubtitleOptions {
  accentHex?: string; // e.g. '#d4af37' or '#00f0ff'
  fontName?: string;
  fontSize?: number;
  wordsPerGroup?: number;
  marginV?: number;
}

/**
 * Converts a hex color (#RRGGBB) to ASS color format (&H00BBGGRR)
 */
function hexToAssColor(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H00${b}${g}${r}`.toUpperCase();
  }
  return '&H0000D7FF'; // Default warm gold
}

/**
 * Formats seconds into ASS timestamp format: H:MM:SS.CC (centiseconds)
 */
function formatAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);

  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  const csStr = String(cs).padStart(2, '0');
  return `${hrs}:${mStr}:${sStr}.${csStr}`;
}

/**
 * Scores word importance to highlight key nouns, numbers, and dramatic terms in gold
 */
function isEmphasisWord(word: string): boolean {
  const clean = word.replace(/[^a-zA-Z0-9]/g, '');
  if (/\d/.test(clean)) return true; // Numbers (2,000, 50, etc.)
  if (clean.length >= 7) return true; // Long impactful nouns
  const dramaticKeywords = [
    'secret', 'hidden', 'ancient', 'classified', 'lost', 'proof', 'truth',
    'banned', 'mystery', 'discovered', 'evidence', 'unseen', 'sealed',
    'forbidden', 'never', 'shocking', 'formula', 'unknown', 'record',
    'roman', 'concrete', 'pyramid', 'ocean', 'space', 'timeline'
  ];
  return dramaticKeywords.includes(clean.toLowerCase());
}


export interface TimedSceneNarration {
  text: string;
  duration: number;        // Total visual scene duration (including buffer, e.g. 6.0s)
  speechDuration?: number; // Actual speech audio duration (e.g. 2.8s)
  words?: TimedWord[];     // Exact millisecond word timestamps from neural TTS
}

/**
 * Generates an Advanced SubStation Alpha (.ass) subtitle file engineered for
 * viral short-form retention: 2-3 words per burst, centered safe-zone, bold font,
 * and intelligent golden keyword highlights perfectly synchronized to the voiceover.
 */
export async function generateKineticAssSubtitles(
  scenes: TimedSceneNarration[],
  options: KineticSubtitleOptions = {}
): Promise<string> {
  const workDir = path.join(process.cwd(), 'data', 'media', 'subtitles');
  await fs.mkdir(workDir, { recursive: true });

  const defaultFont = process.platform === 'win32' ? 'Arial' : 'DejaVu Sans';
  const font = options.fontName || defaultFont;
  const fontSize = options.fontSize || 72;
  const marginV = options.marginV || 860; // Sweet spot in lower-center vertical safe zone
  const accentAssColor = hexToAssColor(options.accentHex || '#d4af37');

  const assHeader = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: KineticBold,${font},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,2,60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');

  const events: string[] = [];
  let currentTime = 0;

  for (const scene of scenes) {
    const rawText = String(scene.text || '').trim();
    const sceneDur = Math.max(1, scene.duration);

    if (!rawText) {
      currentTime += sceneDur;
      continue;
    }

    const words = rawText.split(/\s+/).filter(Boolean);
    if (!words.length) {
      currentTime += sceneDur;
      continue;
    }

    // Pathway 1: Exact Millisecond Word Timing Spotlight (via Neural TTS word boundaries)
    if (scene.words && scene.words.length > 0) {
      const maxPerChunk = options.wordsPerGroup || 3;
      const timedWords = scene.words;
      const chunks: TimedWord[][] = [];

      for (let i = 0; i < timedWords.length; i += maxPerChunk) {
        chunks.push(timedWords.slice(i, i + maxPerChunk));
      }

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        const nextChunk = chunks[cIdx + 1];

        for (let j = 0; j < chunk.length; j++) {
          const word = chunk[j];
          const wordStart = word.start;
          const nextWordStart = j < chunk.length - 1
            ? chunk[j + 1].start
            : (nextChunk ? nextChunk[0].start : word.end + 0.12);

          const wordEnd = Math.max(wordStart + 0.12, Math.min(nextWordStart, word.end + 0.25));

          const absStart = currentTime + wordStart;
          const absEnd = currentTime + wordEnd;

          // Spotlight current spoken word in golden accent color; adjacent words in clean white
          const formattedWords = chunk.map((cw, wIdx) => {
            const clean = cw.word.toUpperCase();
            if (wIdx === j) {
              return `{\\c${accentAssColor}&}${clean}{\\r}`;
            }
            return clean;
          });

          const lineText = formattedWords.join(' ');
          const startStr = formatAssTime(absStart);
          const endStr = formatAssTime(absEnd);

          events.push(`Dialogue: 0,${startStr},${endStr},KineticBold,,0,0,0,,${lineText}`);
        }
      }
    } else {
      // Pathway 2: Resilient fallback proportional pacing bounded strictly by speechDuration
      const speechDur = Math.max(0.8, scene.speechDuration || (words.length / 2.5));
      const chunks: string[][] = [];
      const maxPerChunk = options.wordsPerGroup || 3;
      for (let i = 0; i < words.length; i += maxPerChunk) {
        chunks.push(words.slice(i, i + maxPerChunk));
      }

      const totalChars = words.reduce((acc, w) => acc + Math.max(1, w.length), 0) || 1;
      let chunkStartTime = currentTime;

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunkWords = chunks[cIdx];
        const chunkChars = chunkWords.reduce((acc, w) => acc + Math.max(1, w.length), 0);
        const isLastChunk = cIdx === chunks.length - 1;

        const chunkDur = isLastChunk
          ? Math.max(0.4, (currentTime + speechDur) - chunkStartTime)
          : (speechDur * (chunkChars / totalChars));

        const chunkEndTime = chunkStartTime + Math.max(0.35, chunkDur);

        // Highlight active or emphasis word in this chunk
        let highlightedIdx = chunkWords.findIndex(w => isEmphasisWord(w));
        if (highlightedIdx === -1 && chunkWords.length > 0) {
          highlightedIdx = chunkWords.length - 1;
        }

        const formattedWords = chunkWords.map((word, wIdx) => {
          const cleanWord = word.toUpperCase();
          if (wIdx === highlightedIdx) {
            return `{\\c${accentAssColor}&}${cleanWord}{\\r}`;
          }
          return cleanWord;
        });

        const lineText = formattedWords.join(' ');
        const startStr = formatAssTime(chunkStartTime);
        const endStr = formatAssTime(chunkEndTime);

        events.push(`Dialogue: 0,${startStr},${endStr},KineticBold,,0,0,0,,${lineText}`);
        chunkStartTime = chunkEndTime;
      }
    }

    currentTime += sceneDur;
  }

  const assContent = assHeader + '\n' + events.join('\n') + '\n';
  const assPath = path.join(workDir, `kinetic-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.ass`);
  await fs.writeFile(assPath, assContent, 'utf-8');
  return assPath;
}
