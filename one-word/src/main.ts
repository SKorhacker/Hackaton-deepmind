import Phaser from 'phaser';
import './styles/main.css';
import { COLORS } from './config/GameConfig';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

export const GAME_W = 960;
export const GAME_H = 540;

async function boot() {
  // Make sure Phaser text uses the web font from the first frame.
  try { await Promise.race([document.fonts.load('700 20px "Space Mono"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* offline */ }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    width: GAME_W,
    height: GAME_H,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [MenuScene, GameScene],
    render: { antialias: true },
  });
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}
boot();
