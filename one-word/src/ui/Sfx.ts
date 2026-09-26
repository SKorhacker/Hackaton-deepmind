// Game cues. Small, frequent events are synthesised here (no load, no latency);
// the big ones play generated samples through the same bus — see Audio.ts.
import { audio } from './Audio';

let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: AudioContext) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  slideTo?: number;
  delay?: number;
  /** Low-pass corner: keeps the square/saw voices woody instead of buzzy. */
  cutoff?: number;
  attack?: number;
}

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const ctx = audio.context;
  const dest = audio.sfxDestination;
  if (!ctx || !dest) return;
  const { type = 'triangle', vol = 0.06, slideTo, delay = 0, cutoff = 3000, attack = 0.004 } = o;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(cutoff, t);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(lp).connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Filtered noise burst: footsteps, cloth, air. */
function air(dur: number, from: number, to: number, vol = 0.05, delay = 0, q = 1) {
  const ctx = audio.context;
  const dest = audio.sfxDestination;
  if (!ctx || !dest) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// Slight detune per step so walking never sounds like a metronome.
const wobble = () => 1 + (Math.random() - 0.5) * 0.08;

export const sfx = {
  /** Step on wood: a soft tick with a little body. */
  move: () => {
    tone(150 * wobble(), 0.06, { type: 'triangle', vol: 0.05, cutoff: 1200 });
    air(0.05, 2200, 900, 0.018);
  },
  /** Walking into a wall. */
  bump: () => {
    tone(84, 0.1, { type: 'sine', vol: 0.07, cutoff: 500, slideTo: 62 });
    air(0.06, 800, 300, 0.02);
  },
  bounce: () => {
    tone(260, 0.16, { type: 'triangle', vol: 0.07, slideTo: 760, cutoff: 2600 });
    tone(520, 0.1, { type: 'sine', vol: 0.03, slideTo: 1400, delay: 0.02 });
  },
  /** Slipping out of sight. */
  hide: () => {
    air(0.35, 3200, 420, 0.05, 0, 0.7);
    tone(330, 0.3, { type: 'sine', vol: 0.035, slideTo: 165, cutoff: 1500 });
  },
  /** A turn passes with no move. */
  wait: () => tone(120, 0.07, { type: 'sine', vol: 0.025, cutoff: 700 }),

  rewrite: () => audio.playSfx('rewrite'),
  invalid: () => audio.playSfx('invalid'),
  door: () => audio.playSfx('door'),
  key: () => audio.playSfx('key'),
  heal: () => audio.playSfx('heal'),
  freeze: () => audio.playSfx('freeze'),
  click: () => audio.playSfx('click'),
  death: () => { audio.playSfx('death'); audio.playSting('lose'); },
  win: () => { audio.playSfx('win'); audio.playSting('win'); },
};
