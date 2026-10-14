import fs from 'node:fs';
import path from 'node:path';
import { db } from './database.js';
import { ensureAutonomousVisualAssets } from './autonomousVisualAssets.js';
import { ensureAutonomousAudioAsset } from './autonomousAudio.js';
import { composeReel } from './reelComposer.js';
import dotenv from 'dotenv';
import { createVideoJob, saveVideoOutput, createMediaSignature } from './videoEngine.js';
import { generateSpeech, generateSilentAudioSegment, padAudioSegment, CREATOR_VOICES, resolveBestVoiceForTopic, concatenateAudioTracks, getAudioDuration } from './ttsEngine.js';

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
 * Extracts rich, spoken narrative text for any scene across all state variants:
 * 1. AI generated scene with direct voiceScript/voiceText
 * 2. Scene with headline, highlight, subline, hookText, secondaryText, text
 * 3. Re-hydrated or stripped scene where full story lives in reel.caption
 */
export function extractSceneNarration(sc: any, sceneIndex: number, totalScenes: number, reel?: any): string {
  // 1. Direct explicit voiceover text
  const directVoice = String(sc?.voiceScript || sc?.voiceText || '').trim();
  if (directVoice.length >= 10) return directVoice;

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
    return combined;
  }

  // 3. Fallback to extracting narrative story from reel.caption if present
  if (reel?.caption) {
    let storyText = String(reel.caption)
      .split(/🗳️|Drop \[A\]|Vote below|Follow @|📌 Save|🚀 Share/i)[0]
      .replace(/#\w+/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '')
      .trim();

    // Look for bullet lines first (e.g. "• 20+ rare artifacts...", "- The Plateau's...", "• Project Greek Island...")
    const bulletLines = storyText
      .split('\n')
      .map(line => line.replace(/^[\s•\-\*]+/, '').replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(line => line.length >= 15 && !line.endsWith(':') && !/^(here’s how|here is the breakdown|the timeline unfolded|inside the)/i.test(line));

    // Look for story paragraphs
    const paragraphs = storyText
      .split(/\n\s*\n/)
      .map(p => p.replace(/[\r\n]+/g, ' ').replace(/^[\s•\-\*]+/, '').trim())
      .filter(p => p.length >= 25 && !p.endsWith(':') && !/^(here’s how|here is the breakdown|inside the)/i.test(p));

    // If bullet lines match scene count, use bullet line for this scene
    if (bulletLines.length >= totalScenes && bulletLines[sceneIndex]) {
      return bulletLines[sceneIndex];
    }

    // If paragraphs match or exceed scene count
    if (paragraphs.length >= totalScenes && paragraphs[sceneIndex]) {
      return paragraphs[sceneIndex];
    }

    // If paragraphs exist, distribute across scenes
    if (paragraphs.length > 0) {
      if (sceneIndex === 0) {
        return paragraphs[0];
      } else if (bulletLines.length > 0 && bulletLines[sceneIndex - 1]) {
        return bulletLines[sceneIndex - 1];
      } else if (paragraphs[sceneIndex]) {
        return paragraphs[sceneIndex];
      } else {
        return paragraphs[paragraphs.length - 1];
      }
    }

    if (storyText.length >= 20) {
      return storyText;
    }
  }

  // 4. Combined parts even if short
  if (combined.length > 0) {
    return combined;
  }

  // 5. Ultimate fallback: Title
  return String(reel?.title || 'SARLX AI Special Report').trim();
}

export async function prepareReelSceneAssets(reel: any): Promise<{ scenes: any[]; musicPath: string; voicePath?: string }> {
  const prepared = await ensureAutonomousVisualAssets(reel);
  if (!prepared.assets.length) {
    throw new Error(`Failed to generate or select visual assets for reel "${reel.title || reel.id}".`);
  }

  const rawScenes = Array.isArray(reel.scenes) ? reel.scenes : [];
  const voiceSegments: string[] = [];
  const sceneDurations: number[] = [];

  let realSpeechCount = 0;
  for (let i = 0; i < rawScenes.length; i++) {
    const sc = rawScenes[i];
    const narrationText = extractSceneNarration(sc, i, rawScenes.length, reel);
    let segPath: string | null = null;
    let audioDur = 0;

    if (narrationText) {
      try {
        const selectedVoice = resolveBestVoiceForTopic(reel?.title || reel?.niche, reel?.audio?.mood);
        segPath = await generateSpeech(narrationText, undefined, { voice: selectedVoice, rate: '+20%' });
        audioDur = await getAudioDuration(segPath);
      } catch (segErr) {
        console.warn(`[Reel Video Pipeline] Primary voiceover failed for scene ${i + 1}, trying headline fallback:`, segErr);
        const headline = String(sc?.headline || sc?.hookText || sc?.text || reel?.title || '').trim();
        if (headline) {
          try {
            segPath = await generateSpeech(headline, undefined, { voice: CREATOR_VOICES.deepDocumentaryMale, rate: '+20%' });
            audioDur = await getAudioDuration(segPath);
          } catch (headErr) {
            console.error(`[Reel Video Pipeline] Headline fallback also failed for scene ${i + 1}:`, headErr);
          }
        }
      }
    }

    // If speech was produced, calibrate scene duration to speech plus breathing buffer and pad audio precisely
    if (segPath && audioDur > 0) {
      realSpeechCount++;
      const sceneDur = Math.max(audioDur + 0.8, 6.0);
      const paddedSeg = await padAudioSegment(segPath, sceneDur);
      voiceSegments.push(paddedSeg);
      sceneDurations.push(sceneDur);
      console.log(`[Reel Video Pipeline] Scene ${i + 1} voiceover: ${audioDur.toFixed(1)}s speech padded to ${sceneDur.toFixed(1)}s scene duration.`);
    } else {
      // Create a synchronized silent spacer so subsequent scene voiceovers never fall out of alignment
      const fallbackDur = Math.max(Number(sc?.durationSeconds || 8.0), 6.0);
      const silentSeg = await generateSilentAudioSegment(fallbackDur);
      voiceSegments.push(silentSeg);
      sceneDurations.push(fallbackDur);
      console.warn(`[Reel Video Pipeline] Scene ${i + 1} generated silent sync bed (${fallbackDur}s).`);
    }
  }

  let voicePath: string | undefined;
  if (voiceSegments.length > 0 && realSpeechCount > 0) {
    const masterPath = path.join(process.cwd(), 'data', 'media', 'tts', `master-${reel.id || Date.now()}.mp3`);
    voicePath = await concatenateAudioTracks(voiceSegments, masterPath);
    console.log(`[Reel Video Pipeline] Master voiceover ready: ${voiceSegments.length} scene(s) concatenated (${realSpeechCount} active voice segments).`);
  } else {
    console.warn(`[Reel Video Pipeline] No spoken voiceover produced across scenes. Composing with background music solo at full ambient volume.`);
  }

  const scenes = prepared.assets.map((asset: any, index: number) => {
    const scene = rawScenes[index] || {};
    const dynamicDuration = sceneDurations[index] || Number(scene.durationSeconds || 8.0);
    const isPortrait = (asset.width === 1080 && asset.height === 1920) || asset.source === 'ffmpeg-autonomous-visual-producer';
    const narrationText = extractSceneNarration(scene, index, prepared.assets.length, reel);
    return {
      ...scene,
      assetId: asset.id,
      duration: dynamicDuration,
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

export async function renderReelVideo(reel: any, options: { forceReRender?: boolean } = {}): Promise<string> {
  const reelId = String(reel.id);
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

  const videoPrompt = `Create an original 9:16 short-form Reel for SARLX.Ai. Topic: ${reel.title || reel.niche || 'AI Tech'}`;
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
    SET status = 'video_ready', video_url = ?, duration = ?, scenes_json = ?, updated_at = ?
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
