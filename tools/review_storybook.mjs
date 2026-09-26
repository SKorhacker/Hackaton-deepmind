const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__game?.scene.isActive('menu'));
  const click = async name => {
    await page.waitForTimeout(300);
    const point = await page.evaluate(name => {
      const game = window.__game, scene = game.scene.getScene('menu');
      const item = scene.children.getByName(name) || scene.children.getByName('wardrobe')?.getByName(name);
      const bounds = game.canvas.getBoundingClientRect();
      return { x: bounds.x + item.x * bounds.width / 960, y: bounds.y + item.y * bounds.height / 540 };
    }, name);
    if (name.startsWith('chapter-')) console.log(name, point);
    await page.mouse.click(point.x, point.y);
  };
  await click('how-to-play');
  await page.keyboard.press('Enter');
  if (!await page.evaluate(() => window.__game.scene.isActive('menu'))) throw new Error('Modal allowed accidental start');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.scene.getScene('menu').modal);
  for (const outfit of ['wanderer', 'cartographer', 'archivist']) {
    await click('choose-traveler');
    await click(`outfit-${outfit}`);
    await page.waitForFunction(outfit => localStorage.getItem('oneword_outfit') === outfit, outfit);
    await click('wardrobe-done');
    await page.waitForTimeout(80);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.scene.isActive('game'));
    await page.waitForTimeout(350);
    if (await page.evaluate(() => window.__game.scene.getScene('game').playerSprite.texture.key) !== `hero-${outfit}`) throw new Error(`Wrong outfit ${outfit}`);
    const animations = [];
    await page.evaluate(() => {
      window.__played = [];
      window.__game.scene.getScene('game').playerSprite.on('animationstart', animation => window.__played.push(animation.key));
    });
    for (const [key, facing] of [['ArrowRight', 'right'], ['ArrowLeft', 'left'], ['ArrowUp', 'up'], ['ArrowDown', 'down']]) {
      await page.waitForFunction(() => !window.__game.scene.getScene('game').locked);
      await page.evaluate(() => { window.__played = []; });
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      const playing = `${outfit}-${facing}-walk`;
      const started = await page.evaluate(() => window.__played);
      if (!started.includes(playing)) throw new Error(`Missing walk ${playing}: ${started.join(', ')}`);
      await page.waitForFunction(() => {
        const scene = window.__game.scene.getScene('game');
        return scene.playerSprite.anims.currentAnim.key.endsWith('-idle');
      });
      const idle = await page.evaluate(() => window.__game.scene.getScene('game').playerSprite.anims.currentAnim.key);
      if (idle !== `${outfit}-${facing}-idle`) throw new Error(`Wrong idle ${idle}`);
      animations.push(playing);
    }
    await page.screenshot({ path: `art/review/${outfit}-game.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.scene.isActive('menu'));
    await page.waitForTimeout(150);
  }
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.isActive('menu'));
  if (await page.evaluate(() => localStorage.getItem('oneword_outfit')) !== 'archivist') throw new Error('Outfit not persisted');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.isActive('menu'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.isActive('game'));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(60);
  if (await page.evaluate(() => window.__game.scene.getScene('game').playerSprite.anims.isPlaying)) throw new Error('Reduced motion animates player');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.scene.isActive('menu'));
  await page.screenshot({ path: 'art/review/menu-restored.png' });
  for (let i = 1; i <= 6; i++) {
    console.log(`Checking chapter ${i}`);
    await click(`chapter-${i}`);
    await page.waitForFunction(index => window.__game.scene.isActive('game') && window.__game.scene.getScene('game').levelIndex === index, i - 1, { timeout: 5000 }).catch(async error => {
      console.log(await page.evaluate(() => {
        const game = window.__game, menu = game.scene.getScene('menu');
        return { menu: game.scene.isActive('menu'), game: game.scene.isActive('game'), level: game.scene.getScene('game').levelIndex, modal: menu.modal, turning: menu.turning, canvas: game.canvas.getBoundingClientRect().toJSON(), pointer: { x: game.input.activePointer.worldX, y: game.input.activePointer.worldY } };
      }));
      throw error;
    });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.scene.isActive('menu'));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: all outfits, four walking/idle directions each, persistence, modal, chapter buttons, menu return, reduced motion; no browser errors.');
} finally { await browser.close(); }
