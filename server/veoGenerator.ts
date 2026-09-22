import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media', 'reels');
const DEFAULT_MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview';
const POLL_INTERVAL_MS = 10000;
const MAX_WAIT_MS = 7 * 60 * 1000;

export interface VeoReelInput {
  id: string;
  topic: string;
  niche?: string;
  caption?: string;
  scenes?: Array<{ hookText?: string; secondaryText?: string; visualTheme?: string; pacingEffect?: string }>;
  audioMood?: string;
}

function buildPrompt(input: VeoReelInput): string {
  const sceneDirection = (input.scenes || []).map((scene, index) => {
    const hook = scene.hookText || '';
    const secondary = scene.secondaryText || '';
    const visual = scene.visualTheme || 'cinematic';
    const pacing = scene.pacingEffect || 'dynamic';
    return `Beat ${index + 1}: ${hook}. Supporting idea: ${secondary}. Visual direction: ${visual}. Editing energy: ${pacing}.`;
  }).join('\n');

  return `Create a premium social-media vertical Reel for the niche "${input.niche || 'general'}".
Core topic: "${input.topic}".

Make it feel like professionally produced short-form content, NOT a slideshow, template, presentation, or generic AI demo.
Use photorealistic or highly polished cinematic visuals that directly illustrate the topic.
9:16 portrait composition, strong subject framing, deliberate camera movement, realistic lighting, detailed environment, rapid but coherent visual progression, immediate visual hook in the first second, and a satisfying final beat.
Do not place captions, hashtags, logos, UI, watermarks, or large text on screen; TEXVIC will add text overlays separately.
Generate native synchronized audio: appropriate ambience, sound effects, and subtle modern background music matching the topic and mood "${input.audioMood || 'energetic cinematic'}". Avoid copyrighted songs or recognizable artist styles.
The video should communicate one specific useful idea rather than generic motivational filler.

Planned content direction:
${sceneDirection || 'Open with a striking visual metaphor for the topic, reveal the key insight, then end with a visually memorable conclusion.'}

This is an 8-second Instagram Reel. Prioritize visual storytelling, retention, realism, and audio synchronization over excessive text or exposition.`;
}

export async function generateVeoReelVideo(input: VeoReelInput): Promise<{ videoUrl: string; filePath: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length < 6) throw new Error('GEMINI_API_KEY is required for Veo video generation.');

  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'texvic-veo-engine' } } });
  let operation = await ai.models.generateVideos({
    model: DEFAULT_MODEL,
    prompt: buildPrompt(input),
    config: {
      aspectRatio: '9:16',
      durationSeconds: 8,
      resolution: process.env.VEO_RESOLUTION || '720p',
    },
  });

  const startedAt = Date.now();
  while (!operation.done) {
    if (Date.now() - startedAt > MAX_WAIT_MS) throw new Error('Veo video generation timed out after 7 minutes.');
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
  if (!generatedVideo) throw new Error('Veo completed without returning a video.');

  const outputPath = path.join(MEDIA_DIR, `${input.id}.mp4`);
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await ai.files.download({ file: generatedVideo, downloadPath: outputPath });

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (!appUrl) throw new Error('APP_URL is required so Meta can fetch the generated video.');
  return { videoUrl: `${appUrl}/media/reels/${encodeURIComponent(input.id)}.mp4`, filePath: outputPath, model: DEFAULT_MODEL };
}