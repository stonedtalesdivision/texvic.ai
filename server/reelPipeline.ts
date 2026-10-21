import fs from 'node:fs';
import path from 'node:path';
import { db } from './database.js';
import { ensureAutonomousVisualAssets } from './autonomousVisualAssets.js';
import { ensureAutonomousAudioAsset } from './autonomousAudio.js';
import { composeReel } from './reelComposer.js';
import dotenv from 'dotenv';
import { createVideoJob, saveVideoOutput, createMediaSignature } from './videoEngine.js';
import { generateSpeech, generateSpeechWithNodeEdgeDetailed, generateCohesiveReelSpeech, generateSilentAudioSegment, padAudioSegment, CREATOR_VOICES, resolveBestVoiceForTopic, concatenateAudioTracks, getAudioDuration, generateSpeechViaHttp, generateSpeechWithPiper, type TimedWord } from './ttsEngine.js';

export function normalizeVideoUrl(videoUrl: string): string {
  if (!videoUrl) return '';
  dotenv.config({ override: true });
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (!appUrl) return videoUrl;

  try {
    const parsed = new URL(videoUrl, appUrl);
    const match = parsed.pathname.match(/\/media\/reels\/(.+)$/);
    if (match) {
      const filename = decodeURIComponent(match[1]);
      const token = createMediaSignature(filename);
      return `${appUrl}/media/reels/${encodeURIComponent(filename)}?token=${token}`;
    }
    if (videoUrl.startsWith('/')) {
      return `${appUrl}${videoUrl}`;
    }
  } catch {
    if (videoUrl.startsWith('/')) {
      return `${appUrl}${videoUrl}`;
    }
  }
  return videoUrl;
}

/**
 * Sanitizes voice narration text for natural, fluid TTS speech:
 * - Strips timecodes (e.g. "00:14:", "12:30 PM:") so TTS doesn't read out numbers and colons
 * - Strips bullet markers & numbers at the start of sentences
 * - Strips all unicode emojis and variation selectors
 * - Converts symbols into spoken words ("&" -> "and", "%" -> "percent")
 * - Cleans redundant punctuation, brackets, colons, and whitespace
 */
export function sanitizeNarrationForTTS(text: string): string {
  if (!text) return '';
  return String(text)
    // Strip technical archival headers and catalog IDs
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
    // Strip timecode prefixes at start of text or after punctuation
    .replace(/(^|[\.\?\!\n])\s*\d{1,2}:\d{2}(:\d{2})?(\s*(am|pm))?(\s*[:\-\—])?\s*/gi, '$1 ')
    // Strip bullet markers & numbers at start of lines: "• ", "- ", "* ", "1. ", "[A] "
    .replace(/(^|[\.\?\!\n])\s*([•\-\*]|\d+[\.\)])\s*/g, '$1 ')
    // Strip all unicode emojis and variation selectors
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}]/gu, '')
    // Expand awkward symbols
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s*%\s*/g, ' percent ')
    .replace(/\$(\d+)/g, '$1 dollars')
    // Strip bracketed markers
    .replace(/\[(?:A|B)\]/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\w+/g, '')
    // Clean redundant colons into natural breathing commas (never full stops)
    .replace(/\s*:\s*/g, ', ')
    // Clean duplicate dots and spaces
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts rich, spoken narrative text for any scene across all state variants:
 * 1. AI generated scene with direct voiceScript/voiceText
 * 2. Scene with headline, highlight, subline, hookText, secondaryText, text
 * 3. Re-hydrated or stripped scene where full story lives in reel.caption
 */
export function extractSceneNarration(sc: any, sceneIndex: number, totalScenes: number, reel?: any): string {
  let rawText = '';

  // 1. Direct explicit voiceover text
  const directVoice = String(sc?.voiceScript || sc?.voiceText || '').trim();
  if (directVoice.length >= 10) {
    rawText = directVoice;
  } else {
    // 2. Combined scene headline, highlight, subline, hookText, secondaryText, text
    const parts = [
      sc?.headline,
      sc?.highlight,
      sc?.subline,
      sc?.hookText,
      sc?.secondaryText,
      sc?.text
    ]
      .map(p => String(p || '').trim())
      .filter(p => p.length > 0);

    const uniqueParts = [...new Set(parts)];
    const combined = uniqueParts.join('. ').replace(/\.\.+/g, '.').trim();

    // If combined scene text is substantial, use it
    if (combined.length >= 25) {
      rawText = combined;
    } else if (reel?.caption) {
      // 3. Fallback to extracting narrative story from reel.caption if present
      let storyText = String(reel.caption)
        .split(/🗳️|Drop \[A\]|Vote below|Follow @|📌 Save|🚀 Share/i)[0]
        .replace(/#\w+/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();

      // Look for bullet lines first
      const bulletLines = storyText
        .split('\n')
        .map(line => line.replace(/^[\s•\-\*]+/, '').replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(line => line.length >= 15 && !line.endsWith(':') && !/^(here’s how|here is the breakdown|the timeline unfolded|inside the)/i.test(line));

      // Look for story paragraphs
      const paragraphs = storyText
        .split(/\n\s*\n/)
        .map(p => p.replace(/[\r\n]+/g, ' ').replace(/^[\s•\-\*]+/, '').trim())
        .filter(p => p.length >= 25 && !p.endsWith(':') && !/^(here’s how|here is the breakdown|inside the)/i.test(p));

      if (bulletLines.length >= totalScenes && bulletLines[sceneIndex]) {
        rawText = bulletLines[sceneIndex];
      } else if (paragraphs.length >= totalScenes && paragraphs[sceneIndex]) {
        rawText = paragraphs[sceneIndex];
      } else if (paragraphs.length > 0) {
        if (sceneIndex === 0) {
          rawText = paragraphs[0];
        } else if (bulletLines.length > 0 && bulletLines[sceneIndex - 1]) {
          rawText = bulletLines[sceneIndex - 1];
        } else if (paragraphs[sceneIndex]) {
          rawText = paragraphs[sceneIndex];
        } else {
          rawText = paragraphs[paragraphs.length - 1];
        }
      } else if (storyText.length >= 20) {
        rawText = storyText;
      }
    }

    if (!rawText && combined.length > 0) {
      rawText = combined;
    }

    if (!rawText) {
      rawText = String(reel?.title || 'The Untold Archive Special Report').trim();
    }
  }

  return sanitizeNarrationForTTS(rawText);
}

export async function prepareReelSceneAssets(rawReel: any): Promise<{ scenes: any[]; musicPath: string; voicePath?: string }> {
  const reel = {
    ...rawReel,
    scenes: (Array.isArray(rawReel.scenes) && rawReel.scenes.length > 0)
      ? rawReel.scenes
      : (() => {
          try {
            const parsed = typeof rawReel.scenes_json === 'string' ? JSON.parse(rawReel.scenes_json) : rawReel.scenes_json;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
    audio: rawReel.audio || (() => {
      try {
        return typeof rawReel.audio_json === 'string' ? JSON.parse(rawReel.audio_json) : rawReel.audio_json;
      } catch {
        return {};
      }
    })()
  };

  const prepared = await ensureAutonomousVisualAssets(reel);
  if (!prepared.assets.length) {
    throw new Error(`Failed to generate or select visual assets for reel "${reel.title || reel.id}".`);
  }

  const rawScenes = Array.isArray(reel.scenes) ? reel.scenes : [];
  // Extract narration text for each scene
  const narrationTexts: string[] = rawScenes.map((sc: any, i: number) => 
    extractSceneNarration(sc, i, rawScenes.length, reel)
  );

  let cohesiveResult: any = null;
  const hasNarration = narrationTexts.some(t => t && t.trim().length > 0);
  if (hasNarration) {
    try {
      cohesiveResult = await generateCohesiveReelSpeech(narrationTexts, {
        topic: reel?.title || reel?.niche,
        mood: reel?.audio?.mood
      });
      console.log(`[Reel Video Pipeline] 🎙️ Cohesive voice locked: "${cohesiveResult.voiceUsed}" across ${cohesiveResult.sceneAudioPaths.length} scene(s).`);
    } catch (bulkErr) {
      console.warn('[Reel Video Pipeline] Cohesive TTS failed, falling back to scene loop:', bulkErr);
    }
  }

  const voiceSegments: string[] = [];
  const sceneDurations: number[] = [];
  const speechDurations: number[] = [];
  const wordsList: TimedWord[][] = [];
  let realSpeechCount = 0;

  for (let i = 0; i < rawScenes.length; i++) {
    const sc = rawScenes[i];
    let segPath: string | null = cohesiveResult?.sceneAudioPaths?.[i] || null;
    let audioDur = cohesiveResult?.sceneDurations?.[i] || 0;
    let timedWords: TimedWord[] = cohesiveResult?.sceneWords?.[i] || [];

    // Fallback only if cohesive synthesis was completely absent for this specific scene
    // Strictly locks to deepDocumentaryMale so no scene can EVER change voice or gender
    if (!segPath && narrationTexts[i]) {
      try {
        const lockedMaleVoice = cohesiveResult?.voiceUsed || CREATOR_VOICES.deepDocumentaryMale;
        const fallbackTarget = path.join(process.cwd(), 'data', 'media', 'tts', `fallback-detail-${Date.now()}-${i}.mp3`);
        const detail = await generateSpeechWithNodeEdgeDetailed(narrationTexts[i], fallbackTarget, { voice: lockedMaleVoice, rate: '+15%' });
        segPath = detail.audioPath;
        audioDur = detail.duration;
        timedWords = detail.words;
      } catch (segErr) {
        console.warn(`[Reel Video Pipeline] Voiceover fallback failed for scene ${i + 1}:`, segErr);
      }
    }

    // Calibrate scene duration to speech plus breathing buffer and pad audio precisely
    if (segPath && audioDur > 0) {
      realSpeechCount++;
      const sceneDur = Math.max(audioDur + 0.35, 3.5);
      const paddedSeg = await padAudioSegment(segPath, sceneDur);
      voiceSegments.push(paddedSeg);
      sceneDurations.push(sceneDur);
      speechDurations.push(audioDur);
      wordsList.push(timedWords);
      console.log(`[Reel Video Pipeline] Scene ${i + 1} voiceover: ${audioDur.toFixed(1)}s speech padded to ${sceneDur.toFixed(1)}s scene duration.`);
    } else {
      // Synchronized silent spacer so subsequent scene voiceovers never fall out of alignment
      const fallbackDur = Math.max(Number(sc?.durationSeconds || 6.0), 4.0);
      const silentSeg = await generateSilentAudioSegment(fallbackDur);
      voiceSegments.push(silentSeg);
      sceneDurations.push(fallbackDur);
      speechDurations.push(0);
      wordsList.push([]);
      console.warn(`[Reel Video Pipeline] Scene ${i + 1} generated silent sync bed (${fallbackDur}s).`);
    }
  }

  // Guaranteed Safeguard: If primary neural TTS produced 0 speech segments, trigger guaranteed Piper Male TTS
  if (realSpeechCount === 0 && narrationTexts.some(t => Boolean(t?.trim()))) {
    console.warn(`[Reel Video Pipeline] ⚠️ Emergency vocal synthesis triggered: primary TTS engines produced 0 segments. Synthesizing voiceover via guaranteed Piper Male TTS (Ryan Baritone)...`);
    voiceSegments.length = 0;
    sceneDurations.length = 0;
    speechDurations.length = 0;
    wordsList.length = 0;
    for (let i = 0; i < rawScenes.length; i++) {
      const text = narrationTexts[i] || reel?.title || '';
      try {
        const segPath = path.join(process.cwd(), 'data', 'media', 'tts', `emergency-pipeline-piper-${Date.now()}-${i}.mp3`);
        await generateSpeechWithPiper(text, segPath);
        const audioDur = await getAudioDuration(segPath);
        if (audioDur > 0) {
          const sceneDur = Math.max(audioDur + 1.0, 6.0);
          const paddedSeg = await padAudioSegment(segPath, sceneDur);
          voiceSegments.push(paddedSeg);
          sceneDurations.push(sceneDur);
          speechDurations.push(audioDur);
          wordsList.push([]);
          realSpeechCount++;
          console.log(`[Reel Video Pipeline] Emergency scene ${i + 1} voiceover: ${audioDur.toFixed(1)}s speech padded to ${sceneDur.toFixed(1)}s.`);
          continue;
        }
      } catch (emErr) {
        console.warn(`[Reel Video Pipeline] Emergency scene ${i + 1} TTS error:`, emErr);
      }
      const fallbackDur = Math.max(Number(rawScenes[i]?.durationSeconds || 8.0), 6.0);
      const silentSeg = await generateSilentAudioSegment(fallbackDur);
      voiceSegments.push(silentSeg);
      sceneDurations.push(fallbackDur);
      speechDurations.push(0);
      wordsList.push([]);
    }
  }

  let voicePath: string | undefined;
  if (voiceSegments.length > 0 && realSpeechCount > 0) {
    const masterPath = path.join(process.cwd(), 'data', 'media', 'tts', `master-${reel.id || Date.now()}.mp3`);
    voicePath = await concatenateAudioTracks(voiceSegments, masterPath);
    console.log(`[Reel Video Pipeline] Master voiceover ready: ${voiceSegments.length} scene(s) concatenated (${realSpeechCount} active voice segments).`);
  } else {
    throw new Error(`[Reel Video Pipeline] Fatal: No voiceover could be produced for reel "${reel.title || reel.id}". Video composition aborted to prevent silent broadcast.`);
  }

  const scenes = prepared.assets.map((asset: any, index: number) => {
    const scene = rawScenes[index] || {};
    const dynamicDuration = sceneDurations[index] || Number(scene.durationSeconds || 8.0);
    const dynamicSpeechDuration = speechDurations[index] || dynamicDuration;
    const dynamicWords = wordsList[index] || [];
    const isPortrait = (asset.width === 1080 && asset.height === 1920) || asset.source === 'ffmpeg-autonomous-visual-producer';
    const narrationText = extractSceneNarration(scene, index, prepared.assets.length, reel);
    return {
      ...scene,
      assetId: asset.id,
      duration: dynamicDuration,
      speechDuration: dynamicSpeechDuration,
      words: dynamicWords,
      // Maintain 100% full safe zone: keep centered with no zoom or cropping
      crop: 'center' as const,
      zoom: isPortrait ? 1 : Number(scene.pacingEffect === 'zoom-in' ? 1.05 : 1),
      speed: 1,
      transition: 'cut' as const,
      text: scene.headline || scene.hookText || scene.secondaryText || scene.text || narrationText,
      voiceScript: scene.voiceScript || narrationText,
      voiceText: scene.voiceText || narrationText
    };
  });

  const totalReelDuration = scenes.reduce((sum: number, s: any) => sum + s.duration, 0);
  reel.duration = totalReelDuration;
  console.log(`[Reel Video Pipeline] Reel duration calibrated to ${totalReelDuration.toFixed(1)}s based on speech audio.`);

  // Always use authentic studio royalty-free music track
  const musicAsset = await ensureAutonomousAudioAsset(reel);
  if (!musicAsset?.file_path) {
    throw new Error(`Failed to provide authentic studio audio for reel "${reel.title || reel.id}".`);
  }

  return {
    scenes,
    musicPath: musicAsset.file_path,
    voicePath
  };
}

const inFlightRenders = new Map<string, Promise<string>>();

export async function renderReelVideo(rawReel: any, options: { forceReRender?: boolean } = {}): Promise<string> {
  const reelId = String(rawReel.id);
  const reel = {
    ...rawReel,
    scenes: (Array.isArray(rawReel.scenes) && rawReel.scenes.length > 0)
      ? rawReel.scenes
      : (() => {
          try {
            const parsed = typeof rawReel.scenes_json === 'string' ? JSON.parse(rawReel.scenes_json) : rawReel.scenes_json;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
    audio: rawReel.audio || (() => {
      try {
        return typeof rawReel.audio_json === 'string' ? JSON.parse(rawReel.audio_json) : rawReel.audio_json;
      } catch {
        return {};
      }
    })(),
    hashtags: Array.isArray(rawReel.hashtags)
      ? rawReel.hashtags
      : (() => {
          try {
            const parsed = typeof rawReel.hashtags_json === 'string' ? JSON.parse(rawReel.hashtags_json) : rawReel.hashtags_json;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
  };

  if (inFlightRenders.has(reelId)) {
    console.log(`[Reel Video Pipeline] Re-using in-flight render for reel "${reel.title || reelId}"`);
    return inFlightRenders.get(reelId)!;
  }

  const renderPromise = (async () => {
    dotenv.config({ override: true });
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

    // 1. If video_url already exists (in memory or database), verify physical presence on disk, UNLESS forceReRender is set
    const dbRow = db.prepare('SELECT video_url FROM reels WHERE id = ?').get(reelId) as any;
    const existingVideoUrl = reel.video_url || reel.videoUrl || dbRow?.video_url;

    if (existingVideoUrl && !options.forceReRender && !reel.forceReRender) {
      try {
        const parsed = new URL(existingVideoUrl);
        const match = parsed.pathname.match(/\/media\/reels\/(.+)$/);
        if (match) {
          const filename = decodeURIComponent(match[1]);
          const diskPath = path.join(process.cwd(), 'data', 'media', 'reels', filename);
          if (fs.existsSync(diskPath) && fs.statSync(diskPath).size > 10000) {
            const freshUrl = `${appUrl}/media/reels/${encodeURIComponent(filename)}?token=${createMediaSignature(filename)}`;
            db.prepare('UPDATE reels SET video_url = ?, updated_at = ? WHERE id = ?')
              .run(freshUrl, new Date().toISOString(), reelId);
            return freshUrl;
          }
        }
      } catch {
        // Re-render if URL or file is unparseable
      }
    }

  // 2. Render from scratch using Safe Zone typography & Studio Royalty-Free Audio
  console.log(`[Reel Video Pipeline] Rendering video for reel "${reel.title || reel.id}"...`);
  const prepared = await prepareReelSceneAssets(reel);

  const videoPrompt = `Create an original 9:16 short-form Reel for The Untold Archive (@theuntoldarch). Topic: ${reel.title || reel.niche || 'Documentary Mystery'}`;
  const videoJob = createVideoJob({ reelId: reel.id, prompt: videoPrompt });

  const composed = await composeReel({
    reelId: reel.id,
    scenes: prepared.scenes,
    voicePath: prepared.voicePath,
    musicPath: prepared.musicPath,
    width: 1080,
    height: 1920,
    fps: 30
  });

  const videoBody = fs.readFileSync(composed.outputPath);
  const savedJob = await saveVideoOutput(videoJob.id, videoBody, 'mp4');
  if (!savedJob?.output_url) {
    throw new Error('Rendered video could not be registered to media store.');
  }

  const finalUrl = savedJob.output_url;
  const totalReelDuration = prepared.scenes.reduce((sum: number, s: any) => sum + s.duration, 0);
  db.prepare(`
    UPDATE reels
    SET status = CASE WHEN status = 'published' OR ig_media_id IS NOT NULL THEN 'published' ELSE 'video_ready' END,
        video_url = ?, duration = ?, scenes_json = ?, updated_at = ?
    WHERE id = ?
  `).run(finalUrl, totalReelDuration, JSON.stringify(prepared.scenes), new Date().toISOString(), reel.id);

    console.log(`[Reel Video Pipeline] Video rendered successfully: ${finalUrl}`);
    return finalUrl;
  })();

  inFlightRenders.set(reelId, renderPromise);
  try {
    return await renderPromise;
  } finally {
    inFlightRenders.delete(reelId);
  }
}
