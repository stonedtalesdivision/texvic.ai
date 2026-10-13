import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerAsset, selectAssets, type MediaAsset } from './assetLibrary.js';

const execFileAsync = promisify(execFile);
const GENERATED_DIR = path.join(process.cwd(), 'data', 'media', 'generated-audio');
const AUDIO_LIBRARY_DIR = path.join(process.cwd(), 'data', 'media', 'audio-library');

export interface StudioTrack {
  id: string;
  name: string;
  artist: string;
  genre: string;
  moods: string[];
  bpm: number;
  startOffsetSec: number;
  url: string;
}

export const STUDIO_TRACKS: StudioTrack[] = [
  {
    id: 'tech-live',
    name: 'Tech Live',
    artist: 'Kevin MacLeod',
    genre: 'tech-house',
    moods: ['tech', 'energetic', 'futuristic', 'modern', 'electronic', 'ai', 'breakthrough'],
    bpm: 128,
    startOffsetSec: 8,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Tech%20Live.mp3'
  },
  {
    id: 'future-gladiator',
    name: 'Future Gladiator',
    artist: 'Kevin MacLeod',
    genre: 'action-electronic',
    moods: ['high-energy', 'cyber', 'action', 'punchy', 'future', 'breakthrough', 'powerful'],
    bpm: 135,
    startOffsetSec: 15,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Future%20Gladiator.mp3'
  },
  {
    id: 'volatile-reaction',
    name: 'Volatile Reaction',
    artist: 'Kevin MacLeod',
    genre: 'dark-electronic',
    moods: ['dark', 'synthwave', 'fast', 'intense', 'cyberpunk', 'heavy', 'momentum'],
    bpm: 140,
    startOffsetSec: 10,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Volatile%20Reaction.mp3'
  },
  {
    id: 'rocket',
    name: 'Rocket',
    artist: 'Kevin MacLeod',
    genre: 'driving-electronic',
    moods: ['momentum', 'driving', 'uplifting', 'rhythmic', 'groove', 'tech'],
    bpm: 125,
    startOffsetSec: 12,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rocket.mp3'
  },
  {
    id: 'neon-laser-horizon',
    name: 'Neon Laser Horizon',
    artist: 'Kevin MacLeod',
    genre: 'retrowave',
    moods: ['retrowave', 'synthwave', 'neon', 'chill', 'cinematic', 'sleek', 'deep'],
    bpm: 120,
    startOffsetSec: 6,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Neon%20Laser%20Horizon.mp3'
  }
];

async function ensureLibraryTrackCached(track: StudioTrack): Promise<string> {
  await fs.mkdir(AUDIO_LIBRARY_DIR, { recursive: true });
  const trackPath = path.join(AUDIO_LIBRARY_DIR, `${track.id}.mp3`);
  
  if (fsSync.existsSync(trackPath)) {
    const stats = await fs.stat(trackPath);
    if (stats.size > 100000) {
      return trackPath;
    }
  }

  console.info(`[Autonomous Studio Audio] Downloading studio master track "${track.name}"...`);
  const response = await fetch(track.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    throw new Error(`Failed to download audio track ${track.name}: HTTP ${response.status}`);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(trackPath, buf);
  console.info(`[Autonomous Studio Audio] Track "${track.name}" cached successfully (${buf.length} bytes).`);
  return trackPath;
}

function selectBestStudioTrack(reel: any): StudioTrack {
  const reelMood = String(reel?.audio?.mood || reel?.niche || 'tech').toLowerCase();
  
  // Score tracks based on mood keyword matches
  let bestTrack = STUDIO_TRACKS[0];
  let bestScore = -1;

  for (const track of STUDIO_TRACKS) {
    let score = 0;
    for (const mood of track.moods) {
      if (reelMood.includes(mood)) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTrack = track;
    }
  }

  // If no specific mood match, pick based on pseudo-random hash of reel ID to vary audio
  if (bestScore <= 0) {
    const hash = String(reel?.id || '')
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    bestTrack = STUDIO_TRACKS[hash % STUDIO_TRACKS.length];
  }

  return bestTrack;
}

export async function ensureAutonomousAudioAsset(reel: any): Promise<MediaAsset | null> {
  // First, check if a freshly registered studio track is already available and under-used
  const existing = selectAssets({
    type: 'audio',
    tags: ['studio-audio'],
    limit: 5,
    avoidRecentlyUsedDays: 2
  });
  if (existing[0] && existing[0].source === 'studio-royalty-free-library') {
    return existing[0];
  }

  await fs.mkdir(GENERATED_DIR, { recursive: true });

  const track = selectBestStudioTrack(reel);
  console.info(`[Autonomous Studio Audio] Selected authentic studio track: "${track.name}" (${track.genre}, ${track.bpm} BPM)`);

  let masterPath: string;
  try {
    masterPath = await ensureLibraryTrackCached(track);
  } catch (err: any) {
    console.error(`[Autonomous Studio Audio] Failed to cache studio track ${track.name}:`, err);
    // Try fallback to the first track that is already cached locally
    const fallback = STUDIO_TRACKS.find(t => fsSync.existsSync(path.join(AUDIO_LIBRARY_DIR, `${t.id}.mp3`)));
    if (!fallback) throw err;
    masterPath = path.join(AUDIO_LIBRARY_DIR, `${fallback.id}.mp3`);
  }

  const duration = Math.min(30, Math.max(8, Number(reel?.duration || 12)));
  const offset = track.startOffsetSec;
  const filename = `studio-${track.id}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}.mp3`;
  const outputPath = path.join(GENERATED_DIR, filename);

  // Extract beat-synced high-energy section with smooth in/out fades and broadcast loudness
  const audioFilter = `volume=1.22,afade=t=in:ss=0:d=0.35,afade=t=out:st=${Math.max(1, duration - 1.5)}:d=1.5`;

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(offset),
      '-t', String(duration),
      '-i', masterPath,
      '-af', audioFilter,
      '-c:a', 'libmp3lame',
      '-b:a', '256k',
      outputPath
    ]);

    return await registerAsset({
      type: 'audio',
      sourcePath: outputPath,
      category: 'studio-music',
      tags: ['autonomous', 'music', 'studio-audio', 'electronic', 'high-energy', track.genre],
      duration,
      source: 'studio-royalty-free-library',
      prompt: `${track.name} by ${track.artist}`,
      mood: track.moods.join(', '),
      metadata: {
        reelId: String(reel?.id || ''),
        trackId: track.id,
        trackName: track.name,
        artist: track.artist,
        bpm: track.bpm,
        genre: track.genre,
        isRealStudioProduction: true
      }
    });
  } finally {
    try {
      await fs.rm(outputPath, { force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Non-blocking cleanup
    }
  }
}
