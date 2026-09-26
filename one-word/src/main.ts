import Phaser from 'phaser';
import './styles/main.css';
import { COLORS } from './config/GameConfig';
import { VIEW_W, VIEW_H, RENDER_SCALE } from './config/Display';
import { isTouch, trackViewport } from './ui/Device';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

export const GAME_W = VIEW_W;
export const GAME_H = VIEW_H;

async function boot() {
  trackViewport();
  document.body.classList.toggle('touch', isTouch());
  // Make sure Phaser text uses the web font from the first frame.
  try { await Promise.race([Promise.all([document.fonts.load('700 20px "Space Mono"'), document.fonts.load('400 94px "Cormorant Garamond"')]), new Promise((r) => setTimeout(r, 1500))]); } catch { /* offline */ }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    width: GAME_W * RENDER_SCALE,
    height: GAME_H * RENDER_SCALE,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: [MenuScene, GameScene],
    render: { antialias: true },
    input: { activePointers: 2 },
  });
  // Flex layout moves the canvas when the HUD appears. Refresh the input origin
  // at the native event boundary, before Phaser consumes mouse/touch coordinates.
  const syncInputBounds = () => game.scale.updateBounds();
  for (const event of ['pointerdown', 'pointermove', 'touchstart']) {
    game.canvas.addEventListener(event, syncInputBounds, { capture: true, passive: true });
  }
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    for (const event of ['pointerdown', 'pointermove', 'touchstart']) {
      game.canvas.removeEventListener(event, syncInputBounds, true);
    }
  });
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}
boot();
