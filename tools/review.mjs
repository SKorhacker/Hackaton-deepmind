const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__game?.scene.isActive('menu'));
await page.waitForTimeout(800);
await page.screenshot({ path: 'art/review/menu.png' });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('game'));
await page.waitForTimeout(450);
await page.screenshot({ path: 'art/review/game.png' });
await page.locator('#editable-word').click();
await page.locator('#editor-input').fill('hide');
await page.locator('#editor-apply').click();
await page.waitForFunction(() => document.querySelector('#editable-word')?.textContent === 'HIDE');
for (let i = 0; i < 7; i++) {
  await page.waitForFunction(() => !window.__game.scene.getScene('game').locked);
  const before = await page.evaluate(() => window.__game.scene.getScene('game').world.s.turn);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(before => window.__game.scene.getScene('game').world.s.turn > before || window.__game.scene.getScene('game').world.s.won, before);
}
await page.locator('#complete').waitFor({ state: 'visible' });
if (!await page.locator('#complete').isVisible()) throw new Error('Level 1 completion not shown');
await page.screenshot({ path: 'art/review/victory.png' });
await page.locator('#btn-next').click();
await page.waitForFunction(() => window.__game.scene.getScene('game').levelIndex === 1);
for (let i = 1; i < 5; i++) {
  await page.evaluate(index => window.__game.scene.getScene('game').scene.restart({ levelIndex: index }), i);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `art/review/level-${i + 1}.png` });
  await page.locator('#editable-word').click();
  await page.locator('#editor-input').fill(['hide', 'sleep', 'help', 'key', 'help'][i]);
  await page.locator('#editor-apply').click();
  await page.waitForTimeout(500);
  const path = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('game');
    const actions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, null];
    const initial = scene.world.clone();
    const seen = new Set([initial.key()]);
    const queue = [{ world: initial, path: [] }];
    for (let head = 0; head < queue.length && head < 200000; head++) {
      const current = queue[head];
      for (let a = 0; a < actions.length; a++) {
        const world = current.world.clone();
        if (!world.step(actions[a]).length || world.s.dead) continue;
        const path = [...current.path, a];
        if (world.s.won) return path;
        if (seen.has(world.key())) continue;
        seen.add(world.key()); queue.push({ world, path });
      }
    }
    throw new Error('No route to exit');
  });
  for (const action of path) {
    await page.waitForFunction(() => !window.__game.scene.getScene('game').locked);
    const before = await page.evaluate(() => window.__game.scene.getScene('game').world.s.turn);
    await page.keyboard.press(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Space'][action]);
    await page.waitForFunction(before => window.__game.scene.getScene('game').world.s.turn > before || window.__game.scene.getScene('game').world.s.won, before);
  }
  await page.locator('#complete').waitFor({ state: 'visible' });
  if (!await page.locator('#complete').isVisible()) throw new Error(`Level ${i + 1} completion not shown`);
  const validArt = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('game');
    return scene.plates.every(({ r }) => r.displayWidth < 56 && r.displayHeight < 56)
      && scene.keys.every((view, index) => !scene.world.s.keys[index].taken || !view.visible);
  });
  if (!validArt) throw new Error('Plate scale or collected-key visibility failed');
  await page.locator('#btn-next').click();
  await page.waitForTimeout(150);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.screenshot({ path: 'art/review/mobile.png' });
await page.goto('http://127.0.0.1:5173/artbook.html');
await page.locator('img').first().waitFor();
const brokenImages = await page.locator('img').evaluateAll(images => images.filter(img => img.complete && !img.naturalWidth).length);
await browser.close();
console.log(JSON.stringify({ errors, brokenImages, completed: 'menu, all five levels won via keyboard and word editor, plate scale, key visibility, mobile, artbook' }));
if (errors.length || brokenImages) process.exitCode = 1;
