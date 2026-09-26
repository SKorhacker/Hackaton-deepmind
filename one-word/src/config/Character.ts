import Phaser from 'phaser';

export const OUTFITS = [
  { id: 'wanderer', name: 'Wanderer', detail: 'A brave heart. A crimson cape.', color: 0xa44a31 },
  { id: 'cartographer', name: 'Cartographer', detail: 'For those who take the unknown path.', color: 0x477766 },
  { id: 'archivist', name: 'Archivist', detail: 'Every forgotten word has a keeper.', color: 0x334565 },
] as const;
export type Outfit = typeof OUTFITS[number]['id'];
export type Facing = 'down' | 'left' | 'up' | 'right';
export const FACINGS: Facing[] = ['down', 'left', 'up', 'right'];
let selected: Outfit = 'wanderer';
try {
  const saved = localStorage.getItem('oneword_outfit');
  if (OUTFITS.some(outfit => outfit.id === saved)) selected = saved as Outfit;
} catch { /* Browser storage is optional. */ }
export const character = {
  get outfit() { return selected; },
  select(outfit: Outfit) {
    selected = outfit;
    try { localStorage.setItem('oneword_outfit', outfit); } catch { /* Session selection still works. */ }
  },
};
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function loadCharacters(scene: Phaser.Scene) {
  for (const outfit of OUTFITS) {
    const key = `hero-${outfit.id}`;
    if (!scene.textures.exists(key)) scene.load.spritesheet(key, `${import.meta.env.BASE_URL}art/runtime/${outfit.id}-walk.png`, { frameWidth: 256, frameHeight: 256 });
  }
}

export function createCharacterAnimations(scene: Phaser.Scene) {
  for (const outfit of OUTFITS) {
    FACINGS.forEach((direction, row) => {
      for (const mode of ['idle', 'walk'] as const) {
        const key = `${outfit.id}-${direction}-${mode}`;
        if (scene.anims.exists(key)) continue;
        // Hold a registered neutral pose; alternating independently painted idle poses caused jitter.
        const frames = mode === 'idle' ? [row * 4] : [row * 4 + 2, row * 4 + 3];
        scene.anims.create({ key, frames: frames.map(frame => ({ key: `hero-${outfit.id}`, frame })), frameRate: mode === 'idle' ? 1 : 10, repeat: -1 });
      }
    });
  }
}

export function pose(sprite: Phaser.GameObjects.Sprite, outfit: Outfit, facing: Facing, mode: 'idle' | 'walk') {
  if (reducedMotion()) sprite.stop().setTexture(`hero-${outfit}`, FACINGS.indexOf(facing) * 4);
  else sprite.play(`${outfit}-${facing}-${mode}`, true);
}
