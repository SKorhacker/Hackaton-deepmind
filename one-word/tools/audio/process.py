import os, subprocess, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
SR = 44100


def decode(path):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).reshape(-1, 2).copy()


def encode(x, path, bitrate, mono=False, loud=-18.0):
    if mono:
        x = x.mean(axis=1, keepdims=True)
    raw = x.astype(np.float32).tobytes()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(x.shape[1]), "-i", "-",
                    "-af", f"loudnorm=I={loud}:TP=-1.5:LRA=11", "-c:a", "libmp3lame", "-b:a", bitrate, path],
                   input=raw, check=True)
    return os.path.getsize(path)


def trim_silence(x, thresh=1e-3):
    amp = np.abs(x).max(axis=1)
    idx = np.nonzero(amp > thresh)[0]
    return x[idx[0]:idx[-1] + 1] if len(idx) else x


def make_loop(x, start=0.8, length=26.0, xfade=2.5):
    a, n, f = int(start * SR), int(length * SR), int(xfade * SR)
    seg = x[a:a + n]
    if len(seg) < n:
        seg = x[-n:] if len(x) >= n else x
        n = len(seg)
    body, tail = seg[:n - f].copy(), seg[n - f:]
    t = np.linspace(0, 1, f, dtype=np.float32)[:, None]
    up, down = np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)
    body[:f] = body[:f] * up + tail * down
    return body


def make_cue(x, length, fade=0.6, start=0.0):
    a, n = int(start * SR), int(length * SR)
    seg = trim_silence(x[a:])[:n].copy()
    f = min(int(fade * SR), len(seg) // 2)
    seg[-f:] *= np.cos(np.linspace(0, 1, f, dtype=np.float32)[:, None] * np.pi / 2)
    return seg


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "audio"))
os.makedirs(OUT, exist_ok=True)

LOOPS = {"menu": (0.8, 26.0, 3.0), "calm": (1.0, 26.0, 3.0), "tension": (0.5, 26.0, 2.5),
         "mystery": (0.5, 25.0, 2.5), "hope": (0.5, 26.0, 3.0)}
CUES = {"sting_win": (5.5, 1.2, 0.0), "sting_lose": (5.0, 1.5, 0.0)}

total = 0
for name, (s, l, xf) in LOOPS.items():
    y = make_loop(decode(f"{RAW}/{name}.mp3"), s, l, xf)
    sz = encode(y, f"{OUT}/music-{name}.mp3", "96k", loud=-19.0)
    total += sz
    print(f"music-{name}.mp3 {len(y)/SR:.1f}s {sz//1024} KB")
for name, (l, fade, st) in CUES.items():
    y = make_cue(decode(f"{RAW}/{name}.mp3"), l, fade, st)
    sz = encode(y, f"{OUT}/{name.replace('_','-')}.mp3", "96k", loud=-16.0)
    total += sz
    print(f"{name} {len(y)/SR:.1f}s {sz//1024} KB")
print("total", total // 1024, "KB")
