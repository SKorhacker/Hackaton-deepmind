import { readFile, writeFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dest = 'one-word/public/art/runtime';
await mkdir(dest, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const profiles = (await readFile('art/runtime/profiles-v1.jpg')).toString('base64');
  const correction = (await readFile('art/runtime/archivist-correction-v1.jpg')).toString('base64');
  for (const name of ['wanderer', 'cartographer', 'archivist', 'storybook']) {
    const data = (await readFile(`art/runtime/${name}-v1.jpg`)).toString('base64');
    const result = await page.evaluate(async ({ data, name, profiles, correction }) => {
      const image = new Image(); image.src = `data:image/jpeg;base64,${data}`; await image.decode();
      const output = document.createElement('canvas');
      if (name === 'storybook') {
        output.width = 1920; output.height = Math.round(1920 * image.height / image.width);
        output.getContext('2d').drawImage(image, 0, 0, output.width, output.height);
        return { data: output.toDataURL('image/webp', 0.93).split(',')[1], ext: 'webp' };
      }
      output.width = output.height = 1024;
      const sideImage = new Image(); sideImage.src = `data:image/jpeg;base64,${profiles}`; await sideImage.decode();
      const fixedImage = new Image(); fixedImage.src = `data:image/jpeg;base64,${correction}`; await fixedImage.decode();
      const target = output.getContext('2d'); target.imageSmoothingQuality = 'high';
      const measures = [];
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const canvas = document.createElement('canvas');
        let source = image, cols = 4, rows = 4, sourceRow = row, sourceCol = col, flip = false;
        if (row === 1 || row === 3) {
          flip = row === 1;
          if (name === 'archivist') {
            source = fixedImage; cols = 3; rows = 2; sourceRow = 0; sourceCol = col < 2 ? 0 : col - 1;
            // The generated idle profile faces left; the contact poses face right.
            if (col < 2) flip = !flip;
          } else {
            source = sideImage; sourceRow = name === 'wanderer' ? 0 : 1; sourceCol = col < 2 ? 1 : col;
          }
        } else if (row === 2 && name === 'archivist') {
          source = fixedImage; cols = 3; rows = 2; sourceRow = 1; sourceCol = col < 2 ? 0 : col - 1;
        }
        const w = source.width / cols, h = source.height / rows;
        canvas.width = Math.floor(w - 16); canvas.height = Math.floor(h - 16);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(source, sourceCol * w + 8, sourceRow * h + 8, w - 16, h - 16, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
        for (let i = 0; i < pixels.data.length; i += 4) {
          const [r, g, b] = pixels.data.subarray(i, i + 3);
          const excess = Math.min(r, b) - g;
          if (excess > 60 && r > 130 && b > 130) { pixels.data[i + 3] = 0; continue; }
          if (excess > 25 && r > 100 && b > 100) { pixels.data[i] = Math.min(r, g + 25); pixels.data[i + 2] = Math.min(b, g + 25); }
          const x = i / 4 % canvas.width, y = Math.floor(i / 4 / canvas.width);
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        ctx.putImageData(pixels, 0, 0);
        const width = right - left + 1, height = bottom - top + 1;
        if (width < 40 || height < 70) throw new Error(`Missing frame ${name} ${row},${col}`);
        const scale = Math.min(216 / width, 224 / height);
        const dw = Math.round(width * scale), dh = Math.round(height * scale);
        // Every frame has a shared foot anchor. No crop-dependent origin changes at runtime.
        target.save();
        target.translate(col * 256 + 128, row * 256);
        if (flip) target.scale(-1, 1);
        target.drawImage(canvas, left, top, width, height, -dw / 2, 242 - dh, dw, dh);
        target.restore();
        measures.push({ row, col, width, height });
      }
      return { data: output.toDataURL('image/png').split(',')[1], ext: 'png', measures };
    }, { data, name, profiles, correction });
    const path = `${dest}/${name}${name === 'storybook' ? '' : '-walk'}.${result.ext}`;
    await writeFile(path, Buffer.from(result.data, 'base64'));
    if (result.measures) await writeFile(`art/runtime/${name}-frames.json`, JSON.stringify(result.measures, null, 2));
    console.log(path);
  }
} finally { await browser.close(); }
