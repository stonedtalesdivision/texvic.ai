import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

const execFileAsync = promisify(execFile);
const SFX_DIR = path.join(process.cwd(), 'data', 'media', 'sfx');

/**
 * Ensures built-in procedural cinematic SFX files exist (Impact Hit & Whoosh)
 */
export async function ensureCinematicSfx(): Promise<{ impactPath: string; whooshPath: string }> {
  await fs.mkdir(SFX_DIR, { recursive: true });
  const impactPath = path.join(SFX_DIR, 'cinematic_subbass_impact.wav');
  const whooshPath = path.join(SFX_DIR, 'cinematic_air_whoosh.wav');

  if (!fsSync.existsSync(impactPath)) {
    // 55Hz deep sub-bass cinematic impact hit with exponential decay
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=55:duration=1.2',
      '-af', 'afade=t=out:st=0.3:d=0.9,volume=1.6,lowpass=f=120',
      '-c:a', 'pcm_s16le', impactPath
    ]);
  }

  if (!fsSync.existsSync(whooshPath)) {
    // Filtered air whoosh transition for dynamic B-roll and scene cuts
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'anoisesrc=d=0.65:c=white:r=44100:a=0.8',
      '-af', 'bandpass=f=800:width_type=h:w=550,afade=t=in:st=0:d=0.30,afade=t=out:st=0.30:d=0.35,volume=1.3',
      '-c:a', 'pcm_s16le', whooshPath
    ]);
  }

  return { impactPath, whooshPath };
}

export interface MasterAudioOptions {
  voicePath?: string;
  musicPath?: string;
  sceneCutTimestamps: number[]; // e.g. [0, 4.2, 8.5]
  totalDuration: number;
  workDir: string;
}

/**
 * Builds the broadcast-grade audio mix:
 * 1. Narration voiceover (elevated & crystal-clear)
 * 2. Opening sub-bass impact hit at t=0.0s
 * 3. Subtle whoosh transitions on each scene cut
 * 4. Background music dynamically ducked via sidechain compression (smooth ducking when speaking)
 */
export async function composeCinematicAudio(options: MasterAudioOptions): Promise<string> {
  const { voicePath, musicPath, sceneCutTimestamps, totalDuration, workDir } = options;
  const { impactPath, whooshPath } = await ensureCinematicSfx();
  const masterAudioPath = path.join(workDir, `master-audio-${Date.now()}.wav`);

  // Case 1: Only voice, no background music
  if (voicePath && !musicPath) {
    // Mix voice + opening impact
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', voicePath,
      '-i', impactPath,
      '-filter_complex',
      '[0:a]volume=1.30[v];[1:a]volume=0.85[imp];[v][imp]amix=inputs=2:duration=first:dropout_transition=0[out]',
      '-map', '[out]',
      '-c:a', 'pcm_s16le',
      masterAudioPath
    ]);
    return masterAudioPath;
  }

  // Case 2: Only music, no voice
  if (!voicePath && musicPath) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-stream_loop', '-1', '-i', musicPath,
      '-t', String(totalDuration),
      '-af', 'volume=0.85',
      '-c:a', 'pcm_s16le',
      masterAudioPath
    ]);
    return masterAudioPath;
  }

  // Case 3: Neither voice nor music
  if (!voicePath && !musicPath) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', String(totalDuration),
      '-c:a', 'pcm_s16le',
      masterAudioPath
    ]);
    return masterAudioPath;
  }

  // Case 4: Full Broadcast Mix (Voice + Music + SFX + Sidechain Compression Ducking)
  // Build transition whoosh overlay filter string
  const inputs: string[] = [
    '-y',
    '-i', voicePath!,
    '-stream_loop', '-1', '-i', musicPath!,
    '-i', impactPath
  ];

  // Add whoosh inputs for each subsequent scene cut (starting from index 1)
  const cutsAfterHook = sceneCutTimestamps.filter(t => t > 0.5 && t < totalDuration - 0.5);
  for (let i = 0; i < cutsAfterHook.length; i++) {
    inputs.push('-i', whooshPath);
  }

  // Build filtergraph:
  // [0:a] is Voiceover -> split via asplit=2 into [voice_mix] (for output) and [voice_sc] (sidechain trigger)
  // [1:a] is Background Music
  // [2:a] is Sub-bass Impact at t=0.0s
  // [3:a ... N:a] are Whooshes delayed to each cut timestamp
  const filterParts: string[] = [];

  // 1. Voice boost & dual-stream splitting (one for main mix, one for sidechain trigger)
  filterParts.push('[0:a]volume=1.20,aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[voice_mix][voice_sc]');

  // 2. Dynamic sidechain ducking: music is clearly audible at ~0.38, ducking smoothly to ~0.22 when narrator speaks
  filterParts.push(
    `[1:a]atrim=0:${totalDuration},volume=0.38,aformat=sample_rates=44100:channel_layouts=stereo[raw_bgm]`
  );
  filterParts.push(
    `[raw_bgm][voice_sc]sidechaincompress=threshold=0.14:ratio=2.2:attack=60:release=450[ducked_bgm]`
  );

  // 3. Opening impact
  filterParts.push('[2:a]volume=0.70,aformat=sample_rates=44100:channel_layouts=stereo[impact]');

  // 4. Whoosh sounds with adelay
  const whooshLabels: string[] = [];
  for (let i = 0; i < cutsAfterHook.length; i++) {
    const delayMs = Math.round(cutsAfterHook[i] * 1000);
    const inputIdx = 3 + i;
    const label = `w${i}`;
    filterParts.push(
      `[${inputIdx}:a]volume=0.35,adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=stereo[${label}]`
    );
    whooshLabels.push(`[${label}]`);
  }

  // 5. Final Master Mix with normalize=0 and broadcast limiter
  const allTracks = ['[voice_mix]', '[ducked_bgm]', '[impact]', ...whooshLabels].join('');
  const totalInputs = 3 + whooshLabels.length;
  filterParts.push(
    `${allTracks}amix=inputs=${totalInputs}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[out]`
  );

  await execFileAsync('ffmpeg', [
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-t', String(totalDuration),
    '-c:a', 'pcm_s16le',
    masterAudioPath
  ]);

  return masterAudioPath;
}
