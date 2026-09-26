import Phaser from 'phaser';
import './styles/main.css';
import { COLORS } from './config/GameConfig';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { isTouch, trackViewport } from './ui/Device';

/** Fallback size before the parent has been laid out; the canvas then follows its parent. */
const GAME_W = 960;
const GAME_H = 540;

async function boot() {
  trackViewport();
  document.body.classList.toggle('touch', isTouch());

  // Make sure Phaser text uses the web font from the first frame.
  try { await Promise.race([document.fonts.load('700 20px "Space Mono"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* offline */ }

  const parent = document.getElementById('game')!;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: COLORS.bg,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || GAME_W,
      height: parent.clientHeight || GAME_H,
    },
    scene: [MenuScene, GameScene],
    render: { antialias: true },
    input: { activePointers: 2 },
  });
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}
boot();
