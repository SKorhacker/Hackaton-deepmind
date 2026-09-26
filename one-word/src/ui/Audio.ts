import { portraitBlocked } from './Device';
// Sample playback: music beds, stings and one-shot SFX on one WebAudio graph.
//
//   master ── musicBus ── looping bed (crossfaded) + stings
//          └─ sfxBus   ── one-shots
//
// Browsers only allow audio after a gesture, so nothing is created until unlock();
// a bed requested before that is remembered and starts on the first touch or key.

const BASE = import.meta.env.BASE_URL;

export const MUSIC = ['menu', 'calm', 'tension', 'mystery', 'hope'] as const;
export type MusicName = (typeof MUSIC)[number];

const STINGS = { win: 'sting-win', lose: 'sting-lose' } as const;
export type StingName = keyof typeof STINGS;

const SAMPLES = ['rewrite', 'win', 'death', 'door', 'key', 'heal', 'freeze', 'invalid', 'click'] as const;
export type SampleName = (typeof SAMPLES)[number];

/** Per-cue trim, by ear: peak-normalised files are not equally loud. */
const SFX_GAIN: Record<SampleName, number> = {
  rewrite: 0.85, win: 0.8, death: 0.9, door: 0.7, key: 0.6, heal: 0.55, freeze: 0.5, invalid: 0.6, click: 0.35,
};

const url = (file: string) => `${BASE}audio/${file}`;
const MUSIC_VOL = 0.55;
const STING_VOL = 0.8;
const STORE_KEY = 'oneword_audio';

interface Prefs { muted: boolean; music: number; sfx: number }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { muted: false, music: 1, sfx: 1, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch { /* storage blocked */ }
  return { muted: false, music: 1, sfx: 1 };
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private bed: { name: MusicName; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wanted: MusicName | null = null;
  private prefs = loadPrefs();

  get muted() { return this.prefs.muted; }
  get currentMusic() { return this.bed?.name ?? this.wanted; }
  get ready() { return this.ctx !== null; }
  /** For the synth voices in Sfx.ts, so they share this graph (and the mute). */
  get context() { return this.ctx; }
  get sfxDestination() { return this.sfxBus; }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (portraitBlocked() || document.hidden) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.prefs.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.prefs.music;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.prefs.sfx;
      this.sfxBus.connect(this.master);
      for (const s of SAMPLES) void this.buffer(`sfx-${s}.wav`);
      for (const name of MUSIC) void this.buffer(`music-${name}.mp3`);
      for (const file of Object.values(STINGS)) void this.buffer(`${file}.mp3`);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wanted && !this.bed) { const next = this.wanted; this.wanted = null; this.playMusic(next); }
  }

  setMuted(muted: boolean) {
    this.prefs.muted = muted;
    this.save();
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.05);
    }
    if (!muted) this.unlock();
  }

  toggleMuted() {
    this.setMuted(!this.prefs.muted);
    return this.prefs.muted;
  }

  private save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.prefs)); } catch { /* storage blocked */ }
  }

  private buffer(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p) {
      p = fetch(url(file))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => this.ctx!.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(file, p);
    }
    return p;
  }

  playSfx(name: SampleName, { volume = 1, rate = 1 }: { volume?: number; rate?: number } = {}) {
    if (!this.ctx || !this.sfxBus) return;
    void this.buffer(`sfx-${name}.wav`).then((buf) => {
      if (!buf || !this.ctx || !this.sfxBus) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = SFX_GAIN[name] * volume;
      src.connect(g).connect(this.sfxBus);
      src.start();
    });
  }

  /** Short musical cue on the music bus; ducks the bed while it rings out. */
  playSting(name: StingName, { duck = 0.35 }: { duck?: number } = {}) {
    if (!this.ctx || !this.musicBus) return;
    void this.buffer(`${STINGS[name]}.mp3`).then((buf) => {
      if (!buf || !this.ctx || !this.musicBus) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = STING_VOL;
      src.connect(g).connect(this.musicBus);
      src.start();
      const bed = this.bed;
      if (bed) {
        const t = this.ctx.currentTime;
        bed.gain.gain.cancelScheduledValues(t);
        bed.gain.gain.setTargetAtTime(MUSIC_VOL * duck, t, 0.15);
        bed.gain.gain.setTargetAtTime(MUSIC_VOL, t + buf.duration * 0.7, 0.4);
      }
    });
  }

  /** Crossfade to a looping bed. No-op if it is already the current one. */
  playMusic(name: MusicName, fade = 1.2) {
    if (this.wanted === name) return;
    this.stopMusic(fade);
    this.wanted = name;
    if (!this.ctx || !this.musicBus) return;
    const pending = name;
    void this.buffer(`music-${name}.mp3`).then((buf) => {
      if (!buf || !this.ctx || !this.musicBus || this.wanted !== pending || this.bed) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(MUSIC_VOL, t + fade);
      src.connect(g).connect(this.musicBus);
      src.start();
      this.bed = { name: pending, src, gain: g };
    });
  }

  /** Silence everything while the tab is in the background (without touching the mute pref). */
  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  stopMusic(fade = 1.0) {
    this.wanted = null;
    const bed = this.bed;
    if (!bed || !this.ctx) return;
    this.bed = null;
    const t = this.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setValueAtTime(Math.max(bed.gain.gain.value, 0.0001), t);
    bed.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    bed.src.stop(t + fade + 0.05);
  }
}

export const audio = new AudioManager();

/** Wire the first gesture (and the sound toggle button) to the audio graph. */
export function initAudio() {
  const unlock = () => audio.unlock();
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(ev, unlock, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend(); else audio.unlock();
  });

  const btn = document.getElementById('btn-sound');
  if (!btn) return;
  const paint = () => {
    btn.textContent = audio.muted ? '♪̸' : '♪';
    btn.classList.toggle('off', audio.muted);
    btn.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
  };
  btn.addEventListener('click', () => { audio.toggleMuted(); paint(); });
  paint();
}
