// Pack generated Google artwork into small, transparent, runtime assets.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const destination = 'one-word/public/art/runtime';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [source, columns, rows, names, keyed] of [
    ['sprites-v1.jpg', 3, 2, ['player', 'guard', 'exit', 'door', 'key', 'plate'], true],
    ['tiles-v1.jpg', 2, 2, ['floor', 'wall', 'red', 'blue'], false],
    ['desk-v1.jpg', 1, 1, ['desk'], false],
  ]) {
    const data = (await readFile(`art/runtime/${source}`)).toString('base64');
    const results = await page.evaluate(async ({ data, columns, rows, names, keyed }) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${data}`;
      await image.decode();
      return names.map((name, index) => {
        const cw = image.width / columns, ch = image.height / rows;
        const inset = keyed ? 10 : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(cw - inset * 2); canvas.height = Math.floor(ch - inset * 2);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, (index % columns) * cw + inset, Math.floor(index / columns) * ch + inset, cw - inset * 2, ch - inset * 2, 0, 0, canvas.width, canvas.height);
        let left = 0, top = 0, right = canvas.width - 1, bottom = canvas.height - 1;
        if (keyed) {
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          left = canvas.width; top = canvas.height; right = 0; bottom = 0;
          for (let i = 0; i < pixels.data.length; i += 4) {
            const [r, g, b] = pixels.data.subarray(i, i + 3);
            const excess = Math.min(r, b) - g;
            if (excess > 60 && r > 130 && b > 130) { pixels.data[i + 3] = 0; continue; }
            if (excess > 25 && r > 100 && b > 100) {
              pixels.data[i] = Math.min(r, g + 25);
              pixels.data[i + 2] = Math.min(b, g + 25);
            }
            const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width);
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
          ctx.putImageData(pixels, 0, 0);
        }
        const width = right - left + 1, height = bottom - top + 1;
        if (width <= 0 || height <= 0) throw new Error(`Empty asset: ${name}`);
        const out = document.createElement('canvas');
        const edge = name === 'desk' ? 1920 : 256;
        const scale = (edge - (keyed ? 8 : 0)) / Math.max(width, height);
        out.width = Math.round(width * scale) + (keyed ? 8 : 0);
        out.height = Math.round(height * scale) + (keyed ? 8 : 0);
        const target = out.getContext('2d');
        target.imageSmoothingQuality = 'high';
        target.drawImage(canvas, left, top, width, height, keyed ? 4 : 0, keyed ? 4 : 0, Math.round(width * scale), Math.round(height * scale));
        const mime = keyed ? 'image/png' : 'image/webp';
        return { name, extension: keyed ? 'png' : 'webp', data: out.toDataURL(mime, 0.92).split(',')[1], width: out.width, height: out.height };
      });
    }, { data, columns, rows, names, keyed });
    for (const asset of results) {
      await writeFile(`${destination}/${asset.name}.${asset.extension}`, Buffer.from(asset.data, 'base64'));
      console.log(`${asset.name}: ${asset.width} × ${asset.height}`);
    }
  }
} finally { await browser.close(); }
