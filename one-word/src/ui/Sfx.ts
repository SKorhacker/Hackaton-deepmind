// Tiny WebAudio synth. Silently does nothing if audio is unavailable.

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slideTo?: number, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  move: () => tone(220, 0.05, 'triangle', 0.05),
  bump: () => tone(90, 0.08, 'square', 0.04),
  bounce: () => tone(300, 0.14, 'sine', 0.08, 900),
  rewrite: () => { tone(400, 0.09, 'square', 0.05); tone(600, 0.09, 'square', 0.05, undefined, 0.08); tone(900, 0.2, 'triangle', 0.06, 1400, 0.16); },
  invalid: () => { tone(160, 0.12, 'sawtooth', 0.04); tone(120, 0.16, 'sawtooth', 0.04, undefined, 0.1); },
  door: () => tone(140, 0.25, 'triangle', 0.08, 70),
  key: () => { tone(880, 0.08, 'square', 0.05); tone(1320, 0.16, 'square', 0.05, undefined, 0.07); },
  hide: () => tone(500, 0.2, 'sine', 0.05, 250),
  heal: () => { tone(520, 0.1, 'sine', 0.06); tone(780, 0.18, 'sine', 0.06, undefined, 0.08); },
  freeze: () => tone(1200, 0.25, 'sine', 0.04, 600),
  death: () => tone(300, 0.5, 'sawtooth', 0.07, 40),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.05, undefined, i * 0.09)),
};
