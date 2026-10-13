import fs from 'node:fs';
import path from 'node:path';
import { db } from './database.js';
import { ensureAutonomousVisualAssets } from './autonomousVisualAssets.js';
import { ensureAutonomousAudioAsset } from './autonomousAudio.js';
import { composeReel } from './reelComposer.js';
import dotenv from 'dotenv';
import { createVideoJob, saveVideoOutput, createMediaSignature } from './videoEngine.js';
import { generateSpeech, CREATOR_VOICES, concatenateAudioTracks, getAudioDuration } from './ttsEngine.js';

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

export async function prepareReelSceneAssets(reel: any): Promise<{ scenes: any[]; musicPath: string; voicePath?: string }> {
  const prepared = await ensureAutonomousVisualAssets(reel);
  if (!prepared.assets.length) {
    throw new Error(`Failed to generate or select visual assets for reel "${reel.title || reel.id}".`);
  }

  const rawScenes = Array.isArray(reel.scenes) ? reel.scenes : [];
  const voiceSegments: string[] = [];
  const sceneDurations: number[] = [];

  for (let i = 0; i < rawScenes.length; i++) {
    const sc = rawScenes[i];
    const narrationText = String(sc?.voiceScript || sc?.voiceText || sc?.subline || sc?.headline || '').trim();
    if (narrationText) {
      try {
        const segPath = await generateSpeech(narrationText, undefined, { voice: CREATOR_VOICES.naturalCreatorMale });
        const audioDur = await getAudioDuration(segPath);
        const sceneDur = Math.max(audioDur + 0.5, 6.0);
        voiceSegments.push(segPath);
        sceneDurations.push(sceneDur);
        console.log(`[Reel Video Pipeline] Scene ${i + 1} voiceover: ${audioDur.toFixed(1)}s audio -> Scene duration calibrated to ${sceneDur.toFixed(1)}s.`);
      } catch (segErr) {
        console.warn(`[Reel Video Pipeline] Voice synthesis failed for scene ${i + 1}:`, segErr);
        sceneDurations.push(Number(sc?.durationSeconds || 8.0));
      }
    } else {
      sceneDurations.push(Number(sc?.durationSeconds || 8.0));
    }
  }

  let voicePath: string | undefined;
  if (voiceSegments.length > 0) {
    const masterPath = path.join(process.cwd(), 'data', 'media', 'tts', `master-${reel.id || Date.now()}.mp3`);
    voicePath = await concatenateAudioTracks(voiceSegments, masterPath);
    console.log(`[Reel Video Pipeline] Master voiceover ready: ${voiceSegments.length} scene(s) concatenated.`);
  }

  const scenes = prepared.assets.map((asset: any, index: number) => {
    const scene = rawScenes[index] || {};
    const dynamicDuration = sceneDurations[index] || Number(scene.durationSeconds || 8.0);
    const isPortrait = (asset.width === 1080 && asset.height === 1920) || asset.source === 'ffmpeg-autonomous-visual-producer';
    return {
      assetId: asset.id,
      duration: dynamicDuration,
      // Maintain 100% full safe zone: keep centered with no zoom or cropping
      crop: 'center' as const,
      zoom: isPortrait ? 1 : Number(scene.pacingEffect === 'zoom-in' ? 1.05 : 1),
      speed: 1,
      transition: 'cut' as const,
      text: scene.headline || scene.hookText || scene.secondaryText || ''
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

export async function renderReelVideo(reel: any): Promise<string> {
  const reelId = String(reel.id);
  if (inFlightRenders.has(reelId)) {
    console.log(`[Reel Video Pipeline] Re-using in-flight render for reel "${reel.title || reelId}"`);
    return inFlightRenders.get(reelId)!;
  }

  const renderPromise = (async () => {
    dotenv.config({ override: true });
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

    // 1. If video_url already exists (in memory or database), verify physical presence on disk
    const dbRow = db.prepare('SELECT video_url FROM reels WHERE id = ?').get(reelId) as any;
    const existingVideoUrl = reel.video_url || reel.videoUrl || dbRow?.video_url;

    if (existingVideoUrl) {
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
