import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { registerAsset, selectAssets, type MediaAsset } from './assetLibrary.js';

const GENERATED_DIR = path.join(process.cwd(), 'data', 'media', 'generated-audio');

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
}

function pickAudioPrompt(reel: any): string {
  const audio = reel?.audio || {};
  const bpm = Number(audio.bpm || 128);
  const mood = String(audio.mood || 'high energy and futuristic');
  const topic = String(reel?.title || reel?.niche || 'AI technology');
  return [
    'Create a 30-second instrumental-only music clip for an Instagram Reel.',
    `Topic: ${topic}.`,
    `Mood: ${mood}.`,
    `Tempo: approximately ${bpm} BPM.`,
    'Modern electronic production, punchy drums, clean sub bass, memorable synth motif, strong opening hit, and a noticeable beat drop around the first quarter.',
    'Instrumental only, no vocals, no spoken words, no lyrics, no copyrighted melody, original composition.'
  ].join(' ');
}

export async function ensureAutonomousAudioAsset(reel: any): Promise<MediaAsset | null> {
  const existing = selectAssets({
    type: 'audio',
    tags: ['autonomous', 'generated', 'ai-music'],
    limit: 5,
    avoidRecentlyUsedDays: 3
  });
  if (existing[0]) return existing[0];

  if (!hasGeminiKey()) {
    throw new Error('Gemini audio generation unavailable: GEMINI_API_KEY is not configured.');
  }

  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'lyria-3-clip-preview',
    contents: pickAudioPrompt(reel),
  });

  const parts = response?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((part: any) => part?.inlineData?.data);
  if (!audioPart?.inlineData?.data) {
    throw new Error('Lyria returned no audio data.');
  }

  const filename = `autonomous-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.mp3`;
  const sourcePath = path.join(GENERATED_DIR, filename);
  await fs.writeFile(sourcePath, Buffer.from(audioPart.inlineData.data, 'base64'));

  try {
    return await registerAsset({
      type: 'audio',
      sourcePath,
      category: 'autonomous-generated',
      tags: ['autonomous', 'generated', 'ai-music', 'lyria'],
      duration: 30,
      source: 'gemini-lyria-3-clip',
      prompt: pickAudioPrompt(reel),
      mood: String(reel?.audio?.mood || 'high energy'),
      metadata: {
        reelId: String(reel?.id || ''),
        model: 'lyria-3-clip-preview',
        bpm: Number(reel?.audio?.bpm || 128)
      }
    });
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
}
