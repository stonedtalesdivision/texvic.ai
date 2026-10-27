import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

const execFileAsync = promisify(execFile);
const SFX_DIR = path.join(process.cwd(), 'data', 'media', 'sfx');

export interface CinematicSfxPaths {
  impactPath: string;
  whooshPath: string;
  thudPath: string;
  clickPath: string;
}

/**
 * Ensures built-in procedural cinematic SFX files exist:
 * 1. Deep Sub-bass Impact (Opening hook impact)
 * 2. Filtered Air Whoosh (Camera motion transition)
 * 3. Dossier Thud (Heavy mechanical archival stamp/thud for chapter cards)
 * 4. Tape Click (Vintage analog relay switch / recorder click)
 */
export async function ensureCinematicSfx(): Promise<CinematicSfxPaths> {
  await fs.mkdir(SFX_DIR, { recursive: true });
  const impactPath = path.join(SFX_DIR, 'cinematic_subbass_impact.wav');
  const whooshPath = path.join(SFX_DIR, 'cinematic_air_whoosh.wav');
  const thudPath = path.join(SFX_DIR, 'cinematic_dossier_thud.wav');
  const clickPath = path.join(SFX_DIR, 'cinematic_tape_click.wav');

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

  if (!fsSync.existsSync(thudPath)) {
    // Heavy mechanical archival dossier stamp/thud (105Hz transient down to 45Hz sub with quick decay)
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=95:duration=0.55',
      '-af', 'afade=t=out:st=0.08:d=0.47,volume=1.75,lowpass=f=200',
      '-c:a', 'pcm_s16le', thudPath
    ]);
  }

  if (!fsSync.existsSync(clickPath)) {
    // Vintage analog tape recorder relay click
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'anoisesrc=d=0.08:c=white:r=44100:a=0.85',
      '-af', 'bandpass=f=2400:width_type=h:w=700,afade=t=out:st=0.01:d=0.07,volume=1.4',
      '-c:a', 'pcm_s16le', clickPath
    ]);
  }

  return { impactPath, whooshPath, thudPath, clickPath };
}

/**
 * Applies an authentic vintage radio / dispatch frequency filter to audio segments
 * (e.g. For historical quotes, classified intercepts, or wiretap audio).
 */
export async function applyArchivalRadioFilter(inputAudioPath: string, outputAudioPath: string): Promise<string> {
  await fs.mkdir(path.dirname(outputAudioPath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputAudioPath,
    '-af', 'highpass=f=400,lowpass=f=3400,volume=1.20,compand=attacks=0.02:decays=0.15:points=-60/-60|-30/-15|-10/-6|0/0,alimiter=limit=0.95',
    '-c:a', 'pcm_s16le', outputAudioPath
  ]);
  return outputAudioPath;
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
 * 1. Narration voiceover (elevated & crystal-clear with broadcast compand)
 * 2. Opening sub-bass impact hit at t=0.0s
 * 3. Synchronized chapter transition SFX on each cut (Air Whoosh + Dossier Thud / Tape Click)
 * 4. Background music dynamically ducked via sidechain compression (smooth ducking when speaking)
 */
export async function composeCinematicAudio(options: MasterAudioOptions): Promise<string> {
  const { voicePath, musicPath, sceneCutTimestamps, totalDuration, workDir } = options;
  const { impactPath, whooshPath, thudPath, clickPath } = await ensureCinematicSfx();
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

  // Case 4: Full Broadcast Mix (Voice + Music + Synchronized Chapter SFX + Dynamic Ducking)
  const inputs: string[] = [
    '-y',
    '-i', voicePath!,
    '-stream_loop', '-1', '-i', musicPath!,
    '-i', impactPath
  ];

  // Add synchronized chapter transition inputs for each scene boundary
  const cutsAfterHook = sceneCutTimestamps.filter(t => t > 0.5 && t < totalDuration - 0.5);
  for (let i = 0; i < cutsAfterHook.length; i++) {
    inputs.push('-i', whooshPath);
    // Alternate between dossier thud and tape click for sonic variety
    inputs.push('-i', i % 2 === 0 ? thudPath : clickPath);
  }

  const filterParts: string[] = [];

  // 1. Voice boost & dual-stream splitting: broadcast dynamic vocal compression keeps speech clear at -6 to -10 dBFS
  filterParts.push(
    '[0:a]volume=1.35,aformat=sample_rates=44100:channel_layouts=stereo,compand=attacks=0.04:decays=0.30:points=-70/-70|-40/-18|-20/-6|0/0:soft-knee=6,asplit=2[voice_mix][voice_sc]'
  );

  // 2. Dynamic sidechain ducking: background music plays at atmospheric 0.22, smoothly ducking down to ~0.08 when narrator speaks
  filterParts.push(
    `[1:a]atrim=0:${totalDuration},volume=0.22,aformat=sample_rates=44100:channel_layouts=stereo[raw_bgm]`
  );
  filterParts.push(
    `[raw_bgm][voice_sc]sidechaincompress=threshold=0.05:ratio=4.0:attack=25:release=350[ducked_bgm]`
  );

  // 3. Opening sub-bass impact (subtle at 0.40 so it doesn't mask the first spoken word)
  filterParts.push('[2:a]volume=0.40,aformat=sample_rates=44100:channel_layouts=stereo[impact]');

  // 4. Synchronized Chapter Cut SFX (Air Whoosh + Dossier Thud / Tape Click)
  const transitionLabels: string[] = [];
  for (let i = 0; i < cutsAfterHook.length; i++) {
    const delayMs = Math.round(cutsAfterHook[i] * 1000);
    const whooshInputIdx = 3 + (i * 2);
    const thudInputIdx = 4 + (i * 2);

    const whooshLabel = `w${i}`;
    const thudLabel = `t${i}`;

    filterParts.push(
      `[${whooshInputIdx}:a]volume=0.20,adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=stereo[${whooshLabel}]`
    );
    filterParts.push(
      `[${thudInputIdx}:a]volume=0.26,adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=stereo[${thudLabel}]`
    );

    transitionLabels.push(`[${whooshLabel}]`, `[${thudLabel}]`);
  }

  // 5. Final Master Mix with normalize=0 and broadcast limiter
  const allTracks = ['[voice_mix]', '[ducked_bgm]', '[impact]', ...transitionLabels].join('');
  const totalInputs = 3 + transitionLabels.length;
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
