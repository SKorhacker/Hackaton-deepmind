"""Generate local concept art through Google's API; never persist credentials."""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
parser.add_argument('--prompt', type=Path)
parser.add_argument('--out', type=Path)
parser.add_argument('--model', default='gemini-3-pro-image')
parser.add_argument('--aspect', default='16:9')
parser.add_argument('--reference', type=Path, action='append', default=[])
args = parser.parse_args()
if not args.check and (not args.prompt or not args.out):
    parser.error('--prompt and --out required for generation')
if not re.fullmatch(r'[a-zA-Z0-9._-]+', args.model):
    parser.error('Invalid model identifier')
if args.out and (args.out.exists() or args.out.with_suffix('.json').exists()):
    parser.error('Output already exists; choose a versioned filename')
key = os.environ.get('GEMINI_API_KEY') or getpass.getpass('Google API key (hidden): ')
headers = {'x-goog-api-key': key, 'Content-Type': 'application/json'}
base = 'https://generativelanguage.googleapis.com/v1beta/'
prompt = args.prompt.read_text() if args.prompt else ''
input_parts = [{'text': prompt}]
for reference in args.reference:
    mime = 'image/png' if reference.suffix.lower() == '.png' else 'image/jpeg'
    input_parts.append({'inlineData': {'mimeType': mime, 'data': base64.b64encode(reference.read_bytes()).decode()}})
payload = None if args.check else json.dumps({
    'contents': [{'parts': input_parts}],
    'generationConfig': {'responseModalities': ['TEXT', 'IMAGE'],
                         'imageConfig': {'aspectRatio': args.aspect, 'imageSize': '2K'}}
}).encode()
url = base + ('models' if args.check else f'models/{args.model}:generateContent')
try:
    with urllib.request.urlopen(urllib.request.Request(url, data=payload, headers=headers), timeout=240) as response:
        data = json.load(response)
except urllib.error.HTTPError as exc:
    try:
        error = json.load(exc).get('error', {})
    except (ValueError, OSError):
        error = {}
    print(f"Google HTTP {exc.code}: {error.get('status', 'request rejected')}", file=sys.stderr)
    # Google messages can echo request information. Do not log raw responses.
    sys.exit(1)
except urllib.error.URLError:
    print('Network connection failed.', file=sys.stderr)
    sys.exit(2)
if args.check:
    print('\n'.join(m['name'] for m in data.get('models', []) if 'image' in m['name']))
    sys.exit(0)
parts = [p for c in data.get('candidates', []) for p in c.get('content', {}).get('parts', [])]
images = [p['inlineData'] for p in parts if p.get('inlineData', {}).get('mimeType', '').startswith('image/')]
if not images:
    print('No image returned; no asset saved.', file=sys.stderr)
    sys.exit(1)
image = images[0]
ext = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp'}.get(image['mimeType'])
if ext is None:
    print('Unsupported image format.', file=sys.stderr)
    sys.exit(1)
args.out = args.out.with_suffix(ext)
if args.out.exists() or args.out.with_suffix('.json').exists():
    print('Output already exists; choose a versioned filename.', file=sys.stderr)
    sys.exit(1)
args.out.parent.mkdir(parents=True, exist_ok=True)
with args.out.open('xb') as output:
    output.write(base64.b64decode(image['data'], validate=True))
with args.out.with_suffix('.json').open('x') as output:
    json.dump({'model': args.model, 'prompt': prompt, 'aspect': args.aspect, 'references': [str(p) for p in args.reference],
               'resolution': '2K', 'provider': 'Google Gemini',
               'baseCommit': '3f4f8159a08d0bf352b8538118f5ed376d1af9d3'}, output, indent=2)
print(f'Saved {args.out}')
