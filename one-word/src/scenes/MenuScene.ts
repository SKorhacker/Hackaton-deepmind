import Phaser from 'phaser';
import { COLORS, aiProvider, setAIKey } from '../config/GameConfig';
import { LEVELS } from '../levels/levels';
import { session } from '../config/Session';
import { audio } from '../ui/Audio';
import { sfx } from '../ui/Sfx';

const FONT = '"Space Mono", monospace';

export class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }

  create() {
    document.body.classList.add('in-menu');
    audio.playMusic('menu', 1.6);
    const { width: W, height: H } = this.scale;
    this.drawBackdrop(W, H);

    const title = this.add.text(W / 2, H * 0.28, 'ONE WORD', { fontFamily: FONT, fontSize: '84px', fontStyle: 'bold', color: '#ece8f5' }).setOrigin(0.5);
    // Every few seconds the world briefly misreads its own title.
    this.time.addEvent({
      delay: 2600, loop: true, callback: () => {
        title.setText('ONE WORLD').setColor('#ffd166');
        this.cameras.main.shake(80, 0.002);
        this.time.delayedCall(260, () => title.setText('ONE WORD').setColor('#ece8f5'));
      },
    });
    this.add.text(W / 2, H * 0.28 + 72, 'Change one word.\nChange the world.', { fontFamily: FONT, fontSize: '20px', color: '#8a85a0', align: 'center', lineSpacing: 6 }).setOrigin(0.5);

    this.button(W / 2, H * 0.52, 'PLAY', true, () => this.start(0));
    this.button(W / 2, H * 0.52 + 56, 'HOW TO PLAY', false, () => this.howTo());
    this.button(W / 2, H * 0.52 + 112, 'MAKE A LEVEL', false, () => { window.location.href = './editor.html'; });

    // Level select (handy for demos).
    const lx = W / 2 - ((LEVELS.length - 1) * 44) / 2;
    LEVELS.forEach((l, i) => {
      const solved = session.best.has(l.id);
      const t = this.add.text(lx + i * 44, H - 64, String(l.id), {
        fontFamily: FONT, fontSize: '16px', color: solved ? '#5ee6a0' : '#5d5873',
        backgroundColor: '#1d1a29', padding: { x: 10, y: 4 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffd166'));
      t.on('pointerout', () => t.setColor(solved ? '#5ee6a0' : '#5d5873'));
      t.on('pointerdown', () => this.start(i));
    });
    this.add.text(W / 2, H - 94, 'LEVELS', { fontFamily: FONT, fontSize: '11px', color: '#5d5873' }).setOrigin(0.5);

    const ai = this.add.text(W - 14, H - 12, '', { fontFamily: FONT, fontSize: '11px', color: '#5d5873' }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    const refreshAi = () => { const p = aiProvider(); ai.setText(p ? `AI interpreter: ON (${p.model})` : 'AI interpreter: OFF · click to add a Gemini or OpenAI key'); };
    refreshAi();
    ai.on('pointerdown', () => {
      const k = window.prompt('Gemini (Google AI Studio) or OpenAI API key, stored only in this browser. Leave empty to turn AI off.', '');
      if (k !== null) { setAIKey(k.trim()); refreshAi(); }
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.start(0));
    this.input.keyboard?.on('keydown-SPACE', () => this.start(0));
  }

  private start(levelIndex: number) {
    sfx.click();
    this.scene.start('game', { levelIndex });
  }

  private drawBackdrop(W: number, H: number) {
    // Drifting tiles: a quiet hint of the puzzle grid.
    const colors = [COLORS.red, COLORS.blue, COLORS.plate, COLORS.exit, COLORS.door];
    for (let i = 0; i < 26; i++) {
      const s = Phaser.Math.Between(14, 34);
      const r = this.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), s, s, Phaser.Utils.Array.GetRandom(colors), 0.08).setAngle(Phaser.Math.Between(0, 45));
      this.tweens.add({ targets: r, y: r.y - Phaser.Math.Between(20, 60), angle: r.angle + 20, duration: Phaser.Math.Between(4000, 9000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private button(x: number, y: number, label: string, primary: boolean, onClick: () => void) {
    const bg = this.add.rectangle(x, y, 240, 48, primary ? 0xffd166 : 0x1d1a29).setStrokeStyle(2, primary ? 0xffd166 : 0x34304a).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: primary ? '#1a1400' : '#ece8f5' }).setOrigin(0.5);
    bg.on('pointerover', () => { bg.setScale(1.04); t.setScale(1.04); });
    bg.on('pointerout', () => { bg.setScale(1); t.setScale(1); });
    bg.on('pointerdown', onClick);
    return bg;
  }

  private howTo() {
    sfx.click();
    const { width: W, height: H } = this.scale;
    const layer = this.add.container(0, 0).setDepth(10);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x0a0810, 0.85).setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, 520, 330, 0x1d1a29).setStrokeStyle(1, 0x34304a);
    const body = this.add.text(W / 2, H / 2 - 30, [
      'Each level has one rule.',
      '',
      'Change exactly one word.',
      '',
      'The world will obey the new sentence.',
      '',
      'Reach the exit.',
    ].join('\n'), { fontFamily: FONT, fontSize: '19px', color: '#ece8f5', align: 'center' }).setOrigin(0.5);
    const example = this.add.text(W / 2, H / 2 + 100, 'YOU DIE ON RED  →  YOU HIDE ON RED', { fontFamily: FONT, fontSize: '14px', color: '#ffd166' }).setOrigin(0.5);
    const close = this.add.text(W / 2, H / 2 + 140, 'click anywhere', { fontFamily: FONT, fontSize: '12px', color: '#5d5873' }).setOrigin(0.5);
    layer.add([shade, panel, body, example, close]);
    shade.on('pointerdown', () => layer.destroy());
  }
}
