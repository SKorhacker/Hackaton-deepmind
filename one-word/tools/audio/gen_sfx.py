"""Renders the one-shot SFX (wooden/parchment/metal 'tavern' palette) to 32 kHz mono WAV."""
import os
import numpy as np
from scipy.signal import butter, lfilter

SR = 32000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "audio"))
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def t(dur):
    return np.arange(int(dur * SR)) / SR


def env(x, a=0.002, d=None, curve=4.0):
    n = len(x)
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na)
    dec = np.exp(-curve * np.linspace(0, 1, n - na)) if d is None else np.exp(-np.linspace(0, 1, n - na) / max(d, 1e-3))
    e[na:] = dec
    return x * e


def noise(dur):
    return rng.normal(0, 1, int(dur * SR))


def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], btype="band")
    return lfilter(b, a, x)


def lp(x, hi, order=2):
    b, a = butter(order, min(hi, SR / 2 - 100) / (SR / 2), btype="low")
    return lfilter(b, a, x)


def modal(dur, freqs, decays, amps):
    """Struck-object resonances: what makes a hit read as wood/metal."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for f, dcy, a in zip(freqs, decays, amps):
        out += a * np.sin(2 * np.pi * f * tt + rng.uniform(0, 6.28)) * np.exp(-tt / dcy)
    return out


def sine(dur, f0, f1=None, decay=0.2):
    tt = t(dur)
    f = np.linspace(f0, f1 if f1 else f0, len(tt))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / decay)


def fm_bell(dur, carrier, ratio=2.76, index=4.0, decay=0.5):
    tt = t(dur)
    mod = np.sin(2 * np.pi * carrier * ratio * tt) * index * np.exp(-tt / (decay * 0.5))
    return np.sin(2 * np.pi * carrier * tt + mod) * np.exp(-tt / decay)


def pad(x, dur):
    n = int(dur * SR)
    return np.pad(x, (0, max(0, n - len(x))))[:n]


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def delay(x, seconds):
    return np.concatenate([np.zeros(int(seconds * SR)), x])


def reverb(x, amount=0.25, decay=0.35, n_taps=14):
    out = x.copy()
    for i in range(1, n_taps):
        d = int(SR * (0.013 * i + rng.uniform(0, 0.004)))
        g = amount * np.exp(-i * (0.35 / decay) * 0.3)
        out = mix(out, np.concatenate([np.zeros(d), lp(x, 5000) * g]))
    return out


def warm(x):
    """Tilt away from glassy highs and add a little tape-ish body."""
    b, a = butter(1, 7000 / (SR / 2), btype="low")
    tilted = lfilter(b, a, x) * 0.85 + x * 0.15
    b2, a2 = butter(1, 200 / (SR / 2), btype="low")
    return np.tanh((tilted + 0.35 * lfilter(b2, a2, tilted)) * 1.4) / 1.4


def save(name, x, peak=0.85):
    x = warm(x)
    x = x / (np.abs(x).max() + 1e-9) * peak
    f = min(int(0.01 * SR), len(x) // 4)
    x[-f:] *= np.linspace(1, 0, f)
    import wave
    with wave.open(f"{OUT}/{name}.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    print(f"{name}.wav {len(x)/SR:.2f}s {os.path.getsize(f'{OUT}/{name}.wav')//1024} KB")


# --- wood: chunky low modes + a short knock transient ---------------------
def wood_hit(dur=0.28, base=180.0, bright=1.0, level=1.0):
    body = modal(dur, [base, base * 2.4, base * 4.1, base * 6.3],
                 [0.09, 0.05, 0.03, 0.02], [1.0, 0.5, 0.25 * bright, 0.12 * bright])
    knock = env(bp(noise(0.03), 600, 4500 * bright), a=0.0005, d=0.06) * 0.8
    return mix(body, pad(knock, dur)) * level


def parchment(dur=0.3, level=0.6):
    n = bp(noise(dur), 1800, 9000)
    e = np.exp(-np.linspace(0, 1, len(n)) * 3) * (0.6 + 0.4 * np.abs(np.sin(np.linspace(0, 9, len(n)))))
    return n * e * level


# --- the cues -------------------------------------------------------------
def sfx_rewrite():
    """Word replaced: parchment + wooden stamp, then a rising celesta shimmer."""
    stamp = wood_hit(0.35, 150, 0.9, 1.0)
    paper = parchment(0.35, 0.5)
    shimmer = np.zeros(1)
    for i, f in enumerate([784, 1047, 1319, 1568, 1760]):
        shimmer = mix(shimmer, delay(fm_bell(0.9 - i * 0.08, f, 3.0, 2.2, 0.35) * (0.5 - i * 0.05), 0.09 + i * 0.045))
    bloom = delay(env(bp(noise(0.7), 900, 6000), a=0.12, d=0.25) * 0.14, 0.1)
    return reverb(mix(stamp, paper, delay(shimmer, 0.04), bloom), 0.3, 0.5)


def sfx_win():
    """Level complete: warm wooden chime cluster resolving upward."""
    out = np.zeros(1)
    for i, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        out = mix(out, delay(fm_bell(1.4 - i * 0.1, f, 2.0, 3.0, 0.5) * (0.6 - i * 0.06), i * 0.085))
    out = mix(out, wood_hit(0.4, 220, 0.7, 0.45), delay(parchment(0.4, 0.3), 0.02))
    return reverb(out, 0.35, 0.6)


def sfx_death():
    """Low wooden collapse + dark string-like swell down."""
    thud = wood_hit(0.6, 70, 0.4, 1.0)
    body = sine(0.9, 160, 45, 0.3) * 0.5
    grit = env(lp(noise(0.5), 700), a=0.004, d=0.18) * 0.35
    tail = delay(sine(1.0, 98, 92, 0.45) * 0.18, 0.12)
    return reverb(mix(thud, body, grit, tail), 0.3, 0.7)


def sfx_door():
    """Heavy latch, then stone/wood slide."""
    latch = mix(wood_hit(0.2, 320, 1.2, 0.7), delay(modal(0.25, [1400, 2100], [0.04, 0.02], [0.4, 0.2]), 0.01))
    slide = env(bp(noise(0.75), 120, 1400), a=0.08, d=0.3) * 0.7
    grind = np.sin(2 * np.pi * 62 * t(0.75)) * np.exp(-t(0.75) / 0.35) * 0.25
    return reverb(mix(latch, delay(mix(slide, grind), 0.07)), 0.25, 0.5)


def sfx_key():
    """Metal key / coin pickup — bright, two-note lift."""
    a = fm_bell(0.55, 1318.5, 4.1, 5.0, 0.22) * 0.7
    b = delay(fm_bell(0.8, 1975.5, 4.1, 4.0, 0.3) * 0.6, 0.075)
    ring = delay(modal(0.9, [2637, 3136, 4200], [0.35, 0.25, 0.15], [0.25, 0.18, 0.1]), 0.07)
    return reverb(mix(a, b, ring), 0.3, 0.6)


def sfx_heal():
    warm = np.zeros(1)
    for i, f in enumerate([392, 523.25, 659.25]):
        warm = mix(warm, delay(fm_bell(1.0, f, 1.0, 1.4, 0.45) * 0.5, i * 0.06))
    air = env(bp(noise(0.8), 500, 3000), a=0.2, d=0.3) * 0.12
    return reverb(mix(warm, air), 0.3, 0.6)


def sfx_freeze():
    glass = np.zeros(1)
    for i, f in enumerate([2093, 2637, 3136, 4186]):
        glass = mix(glass, delay(fm_bell(0.7, f, 5.4, 3.0, 0.18) * (0.4 - i * 0.05), i * 0.03))
    crackle = env(bp(noise(0.6), 3000, 11000), a=0.01, d=0.18) * 0.2
    sweep = sine(0.7, 1400, 400, 0.25) * 0.15
    return reverb(mix(glass, crackle, sweep), 0.3, 0.5)


def sfx_invalid():
    """The world doesn't understand: dull double wooden knock."""
    a = wood_hit(0.22, 120, 0.5, 0.9)
    b = delay(wood_hit(0.3, 96, 0.4, 0.8), 0.11)
    return reverb(mix(a, b), 0.18, 0.35)


def sfx_click():
    """UI / card select: crisp wooden tap with a paper edge."""
    return reverb(mix(wood_hit(0.16, 420, 1.3, 0.8), parchment(0.14, 0.35)), 0.15, 0.3)


CUES = {
    "sfx-rewrite": sfx_rewrite, "sfx-win": sfx_win, "sfx-death": sfx_death, "sfx-door": sfx_door,
    "sfx-key": sfx_key, "sfx-heal": sfx_heal, "sfx-freeze": sfx_freeze, "sfx-invalid": sfx_invalid,
    "sfx-click": sfx_click,
}

if __name__ == "__main__":
    for name, fn in CUES.items():
        save(name, fn())
