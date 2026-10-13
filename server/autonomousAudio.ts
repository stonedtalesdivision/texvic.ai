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
  // --- EERIE, MYSTERIOUS & SPOOKY TRACKS (For Scary / Unsolved / Dark Posts) ---
  {
    id: 'the-dread',
    name: 'The Dread',
    artist: 'Kevin MacLeod',
    genre: 'dark-ambient-horror',
    moods: ['spooky', 'scary', 'horror', 'creepy', 'chilling', 'dark', 'paranormal', 'unsolved', 'unexplained', 'ghost', 'anomaly', 'forbidden'],
    bpm: 60,
    startOffsetSec: 4,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/The%20Dread.mp3'
  },
  {
    id: 'echoes-of-time',
    name: 'Echoes of Time',
    artist: 'Kevin MacLeod',
    genre: 'mysterious-ambient',
    moods: ['mysterious', 'ancient', 'history', 'suspense', 'enigmatic', 'curious', 'ruins', 'deep', 'secret', 'documentary'],
    bpm: 72,
    startOffsetSec: 8,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Echoes%20of%20Time.mp3'
  },
  {
    id: 'classic-horror-1',
    name: 'Classic Horror 1',
    artist: 'Kevin MacLeod',
    genre: 'suspense-horror',
    moods: ['horror', 'scary', 'spooky', 'creepy', 'ominous', 'tense', 'danger', 'haunted', 'dark'],
    bpm: 65,
    startOffsetSec: 6,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Classic%20Horror%201.mp3'
  },
  {
    id: 'dark-walk',
    name: 'Dark Walk',
    artist: 'Kevin MacLeod',
    genre: 'investigative-noir',
    moods: ['investigation', 'noir', 'crime', 'heist', 'dossier', 'classified', 'conspiracy', 'stealth', 'cia', 'fbi'],
    bpm: 85,
    startOffsetSec: 6,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dark%20Walk.mp3'
  },
  {
    id: 'giant-wyrm',
    name: 'Giant Wyrm',
    artist: 'Kevin MacLeod',
    genre: 'dark-cinematic',
    moods: ['abyss', 'deep-ocean', 'cavern', 'underground', 'borehole', 'ancient-power', 'monumental', 'dark'],
    bpm: 70,
    startOffsetSec: 10,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Giant%20Wyrm.mp3'
  },
  // --- TECH & SUBTLE AMBIENT TRACKS ---
  {
    id: 'neon-laser-horizon',
    name: 'Neon Laser Horizon',
    artist: 'Kevin MacLeod',
    genre: 'retrowave-ambient',
    moods: ['retrowave', 'synthwave', 'neon', 'chill', 'cinematic', 'sleek', 'deep'],
    bpm: 120,
    startOffsetSec: 6,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Neon%20Laser%20Horizon.mp3'
  },
  {
    id: 'tech-live',
    name: 'Tech Live',
    artist: 'Kevin MacLeod',
    genre: 'tech-ambient',
    moods: ['tech', 'futuristic', 'modern', 'electronic', 'ai', 'breakthrough', 'quantum', 'code'],
    bpm: 128,
    startOffsetSec: 8,
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Tech%20Live.mp3'
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

export function selectBestStudioTrack(reel: any): StudioTrack {
  const sceneTexts = Array.isArray(reel?.scenes)
    ? reel.scenes.map((s: any) => `${s.headline || ''} ${s.subline || ''} ${s.voiceScript || ''}`).join(' ')
    : '';
  const context = `${reel?.title || ''} ${reel?.niche || ''} ${reel?.audio?.mood || ''} ${reel?.caption || ''} ${sceneTexts}`.toLowerCase();
  
  // 1. Spooky / Scary / Chilling / Horror / Creepy / Paranormal
  const isSpooky = /spooky|scary|horror|creepy|chilling|haunted|monster|paranormal|ghost|demon|grave|curse|blood|slasher|nightmare|terrif|fear|death|corpse|cryptid|macabre|evil|abyss|alien|ufo|abduction/i.test(context);
  if (isSpooky) {
    const spookyTracks = STUDIO_TRACKS.filter(t => t.id === 'the-dread' || t.id === 'classic-horror-1');
    return spookyTracks[Math.floor(Math.random() * spookyTracks.length)] || STUDIO_TRACKS[0];
  }

  // 2. Investigative / Dossier / Noir / Heist / Conspiracy / FBI / CIA / Whistleblower
  const isInvestigative = /heist|crime|wire|cia|fbi|conspiracy|investigation|gold|bank|leaked|document|whistleblower|dossier|classified/i.test(context);
  if (isInvestigative) {
    const inv = STUDIO_TRACKS.find(t => t.id === 'dark-walk');
    if (inv) return inv;
  }

  // 3. Mystery / Ancient / History / Deep Ocean / Ruins / Unsolved / Secrets / Archive
  const isMysterious = /mystery|unsolved|secret|classified|anomaly|forbidden|ancient|ruins|lost|voynich|pyramid|atlantis|monolith|deep|untold|civilization|history|archive/i.test(context);
  if (isMysterious) {
    const mysteryTracks = STUDIO_TRACKS.filter(t => t.id === 'echoes-of-time' || t.id === 'giant-wyrm' || t.id === 'the-dread');
    return mysteryTracks[Math.floor(Math.random() * mysteryTracks.length)] || STUDIO_TRACKS[1];
  }

  // 4. Tech / AI / Modern Breakthroughs
  const isTech = /tech|ai|software|future|breakthrough|productivity|quantum|cyber|code|machine/i.test(context);
  if (isTech) {
    const techTracks = STUDIO_TRACKS.filter(t => t.id === 'tech-live' || t.id === 'neon-laser-horizon');
    return techTracks[Math.floor(Math.random() * techTracks.length)] || STUDIO_TRACKS[5];
  }

  // Default to cinematic documentary mystery atmosphere (Echoes of Time)
  const defaultTrack = STUDIO_TRACKS.find(t => t.id === 'echoes-of-time') || STUDIO_TRACKS[0];
  return defaultTrack;
}

export async function ensureAutonomousAudioAsset(reel: any): Promise<MediaAsset | null> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(AUDIO_LIBRARY_DIR, { recursive: true });

  const track = selectBestStudioTrack(reel);
  console.info(`[Autonomous Studio Audio] Selected authentic studio track: "${track.name}" (${track.genre}, ${track.bpm} BPM)`);

  // ONLY reuse an asset if it matches the EXACT selected track and is physically present on disk
  const existing = selectAssets({
    type: 'audio',
    tags: [track.id, 'studio-audio'],
    limit: 5,
    avoidRecentlyUsedDays: 1
  });
  const matchedExisting = existing.find(a => 
    a.source === 'studio-royalty-free-library' && 
    (a.metadata?.trackId === track.id || a.tags.includes(track.id)) &&
    fsSync.existsSync(a.file_path)
  );
  if (matchedExisting) {
    console.info(`[Autonomous Studio Audio] Re-using cached clip for "${track.name}".`);
    return matchedExisting;
  }

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

  // Background music volume reduced by 50% (from 0.35 down to 0.17) with smooth breathing fades
  const audioFilter = `volume=0.17,afade=t=in:ss=0:d=0.5,afade=t=out:st=${Math.max(1, duration - 1.5)}:d=1.5`;

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
      tags: ['autonomous', 'music', 'studio-audio', track.id, track.genre],
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
