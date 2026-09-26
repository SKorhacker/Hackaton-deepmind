import base64, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["K"]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "raw")
os.makedirs(OUT, exist_ok=True)

PROMPTS = {
    "menu": "Instrumental. Melancholic Belle Epoque solo grand piano waltz in 3/4, distant warm string section, soft reverb, wistful and nostalgic, French impressionist, slow tempo, no drums, no vocals.",
    "calm": "Instrumental. Sparse contemplative piano, sustained cello pad underneath, quiet and spacious, thoughtful puzzle ambience, gentle, slow, no drums, no vocals.",
    "tension": "Instrumental. Tense low string ostinato, muted staccato piano, rising unease of a slow pursuit, dark cello, restrained, no drums, no vocals.",
    "mystery": "Instrumental. Delicate music box melody with pizzicato strings and light harp, curious and mysterious, sparse, slow, no drums, no vocals.",
    "hope": "Instrumental. Warm hopeful piano theme with soft strings swelling, tender resolution, cinematic and intimate, slow, no drums, no vocals.",
    "sting_win": "Instrumental. Begins immediately with a short triumphant warm orchestral resolution: harp flourish, soft brass and strings landing on a bright major chord, three seconds, then silence. No drums, no vocals.",
    "sting_lose": "Instrumental. Begins immediately with a short somber descending solo piano phrase and a low string swell, four seconds, then silence. Funereal, quiet. No drums, no vocals.",
    "sting_rewrite": "Instrumental. Begins immediately with a short magical shimmer: harp glissando upward with celesta and a soft string bloom, two seconds, then silence. No drums, no vocals.",
}


def gen(item):
    name, prompt = item
    path = f"{OUT}/{name}.mp3"
    if os.path.exists(path):
        return name, "cached"
    body = json.dumps({"model": "lyria-3-clip-preview", "input": prompt}).encode()
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": KEY},
    )
    try:
        d = json.load(urllib.request.urlopen(req, timeout=600))
    except Exception as e:
        return name, f"ERROR {e}"
    audio = None
    for step in d.get("steps", []):
        for c in step.get("content", []):
            if c.get("type") == "audio":
                audio = c["data"]
    if not audio:
        return name, "no audio: " + json.dumps(d)[:300]
    open(path, "wb").write(base64.b64decode(audio))
    return name, f"{os.path.getsize(path)//1024} KB"


names = sys.argv[1:] or list(PROMPTS)
with ThreadPoolExecutor(8) as ex:
    for n, r in ex.map(gen, [(n, PROMPTS[n]) for n in names]):
        print(n, r)
