const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/');
    await page.waitForFunction(() => window.__game?.scene.getScene('menu').children.getByName('menu-title'));
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => {
      const game = window.__game, scene = game.scene.getScene('menu'), title = scene.children.getByName('menu-title');
      return { pixels: game.canvas.width, css: game.canvas.getBoundingClientRect().width,
        left: title.x - title.displayWidth / 2, right: title.x + title.displayWidth / 2,
        textResolution: title.style.resolution, zoom: scene.cameras.main.zoom };
    });
    if (result.left < 200 || result.right > 760) throw new Error('Title exceeds safe central area');
    if (result.pixels / result.css < dpr || result.textResolution < result.zoom) throw new Error('Insufficient render resolution');
    await page.screenshot({ path: `art/review/menu-dpr${dpr}.png` });
    console.log(JSON.stringify({ dpr, ...result }));
    await context.close();
  }
} finally { await browser.close(); }
