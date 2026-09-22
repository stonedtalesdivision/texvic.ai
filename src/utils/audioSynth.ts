/**
 * High-performance Web Audio Synthesizer for Instagram Reel Trending Audios.
 * Generates rhythmic, beat-synced musical loops with zero external audio assets.
 */

let audioCtx: AudioContext | null = null;
let currentOscillators: { stop: () => void }[] = [];
let loopInterval: number | null = null;
let isPlaying = false;
let onBeatCallback: ((beatIndex: number) => void) | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setBeatListener(callback: ((beatIndex: number) => void) | null) {
  onBeatCallback = callback;
}

export function playTrendingAudioTrack(preset: string, bpm: number, duration: number = 15) {
  stopAudioTrack();
  try {
    const ctx = getAudioContext();
    isPlaying = true;
    const secondsPerBeat = 60 / bpm;
    let currentBeat = 0;
    const totalBeats = Math.floor(duration / secondsPerBeat);

    const stepDurationMs = secondsPerBeat * 1000;

    const playBeatStep = () => {
      if (!isPlaying) return;
      const now = ctx.currentTime;
      const beatMod4 = currentBeat % 4;
      const beatMod8 = currentBeat % 8;

      if (onBeatCallback) {
        onBeatCallback(currentBeat);
      }

      // KICK DRUM
      if (preset === 'cyber-synth' || preset === 'deep-house' || preset === 'trap-bass') {
        if (preset === 'deep-house' || beatMod4 === 0 || (preset === 'trap-bass' && (beatMod8 === 0 || beatMod8 === 3))) {
          playKick(ctx, now);
        }
      } else if (preset === 'chill-lofi') {
        if (beatMod8 === 0 || beatMod8 === 4) {
          playSoftKick(ctx, now);
        }
      }

      // SNARE / CLAP
      if (beatMod4 === 2 || (preset === 'trap-bass' && beatMod8 === 4)) {
        playSnare(ctx, now, preset === 'chill-lofi');
      }

      // HI-HATS & TEXTURES
      if (preset === 'trap-bass') {
        // Fast trap hi-hats
        playHiHat(ctx, now, 0.04);
        playHiHat(ctx, now + secondsPerBeat * 0.5, 0.04);
      } else if (preset === 'cyber-synth' || preset === 'deep-house') {
        playHiHat(ctx, now + secondsPerBeat * 0.5, 0.06);
      }

      // MELODIC SYNTH BASS / CHORDS
      playMelodyNote(ctx, now, preset, currentBeat);

      currentBeat = (currentBeat + 1) % totalBeats;
    };

    playBeatStep();
    loopInterval = window.setInterval(playBeatStep, stepDurationMs);
  } catch (err) {
    console.warn('Web Audio could not start automatically:', err);
  }
}

export function stopAudioTrack() {
  isPlaying = false;
  if (loopInterval !== null) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
  currentOscillators.forEach(osc => {
    try {
      osc.stop();
    } catch {
      // ignore
    }
  });
  currentOscillators = [];
}

export function isAudioTrackPlaying(): boolean {
  return isPlaying;
}

function playKick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

  gain.gain.setValueAtTime(0.7, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.25);
  currentOscillators.push(osc);
}

function playSoftKick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.18);

  gain.gain.setValueAtTime(0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.25);
}

function playSnare(ctx: AudioContext, time: number, isSoft = false) {
  // Noise buffer for snap
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = isSoft ? 'lowpass' : 'highpass';
  filter.frequency.value = isSoft ? 1200 : 900;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(isSoft ? 0.15 : 0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + (isSoft ? 0.12 : 0.2));

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.2);
}

function playHiHat(ctx: AudioContext, time: number, decay: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(8000, time);

  gain.gain.setValueAtTime(0.12, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + decay);
}

function playMelodyNote(ctx: AudioContext, time: number, preset: string, beatIndex: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  let freq = 220; // A3

  if (preset === 'cyber-synth') {
    // Cyberpunk arpeggio
    const notes = [110, 130.81, 146.83, 164.81, 110, 146.83, 174.61, 220];
    freq = notes[beatIndex % notes.length];
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  } else if (preset === 'chill-lofi') {
    // Warm Rhodes chords
    const chordFrequencies = [261.63, 329.63, 392.00, 493.88]; // Cmaj7
    freq = chordFrequencies[beatIndex % chordFrequencies.length];
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.45);
  } else if (preset === 'trap-bass') {
    // Heavy 808 sub note
    const subFrequencies = [55, 55, 65.41, 48.99]; // A1, C2, G1
    freq = subFrequencies[Math.floor(beatIndex / 2) % subFrequencies.length];
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
  } else if (preset === 'deep-house') {
    // Pluck synth
    const houseBass = [65.41, 65.41, 77.78, 87.31];
    freq = houseBass[beatIndex % houseBass.length];
    osc.type = 'square';
    gain.gain.setValueAtTime(0.14, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  } else {
    // Ambient glow
    const padNotes = [174.61, 220, 261.63, 329.63];
    freq = padNotes[beatIndex % padNotes.length];
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.6);
  }

  osc.frequency.setValueAtTime(freq, time);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.6);
  currentOscillators.push(osc);
}
