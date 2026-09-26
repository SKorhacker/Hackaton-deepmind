import Phaser from 'phaser';
import { COLORS, OPENAI_MODEL, openAIKey, setOpenAIKey } from '../config/GameConfig';
import { LEVELS } from '../levels/levels';
import { session } from '../config/Session';
import { isTouch } from '../ui/Device';

const FONT = '"Space Mono", monospace';

/** Design size the menu was laid out for; everything scales from it. */
const REF_W = 960;
const REF_H = 540;
/** Touch targets stay finger-sized however small the screen gets. */
const MIN_TAP = 44;

export class MenuScene extends Phaser.Scene {
  private lastSize = { w: 0, h: 0 };
  // The menu is laid out once per size, so rebuild it when the viewport really changes.
  private onResize = (size: Phaser.Structs.Size) => {
    if (Math.abs(size.width - this.lastSize.w) < 8 && Math.abs(size.height - this.lastSize.h) < 8) return;
    this.scene.restart();
  };

  constructor() { super('menu'); }

  create() {
    document.body.classList.add('in-menu');
    const { width: W, height: H } = this.scale;
    this.lastSize = { w: W, h: H };
    const s = Phaser.Math.Clamp(Math.min(W / REF_W, H / REF_H), 0.42, 1.2);
    const fs = (px: number) => `${Math.round(px * s)}px`;
    this.drawBackdrop(W, H);

    const title = this.add.text(W / 2, H * 0.26, 'ONE WORD', { fontFamily: FONT, fontSize: fs(84), fontStyle: 'bold', color: '#ece8f5' }).setOrigin(0.5);
    // Every few seconds the world briefly misreads its own title.
    this.time.addEvent({
      delay: 2600, loop: true, callback: () => {
        title.setText('ONE WORLD').setColor('#ffd166');
        this.cameras.main.shake(80, 0.002);
        this.time.delayedCall(260, () => title.setText('ONE WORD').setColor('#ece8f5'));
      },
    });
    this.add.text(W / 2, H * 0.26 + 72 * s, 'Change one word.\nChange the world.', { fontFamily: FONT, fontSize: fs(20), color: '#8a85a0', align: 'center', lineSpacing: 6 * s }).setOrigin(0.5);

    const btnH = Math.max(MIN_TAP, 48 * s);
    this.button(W / 2, H * 0.6, Math.min(W - 48, 240 * Math.max(s, 0.8)), btnH, 'PLAY', true, fs(18), () => this.start(0));
    this.button(W / 2, H * 0.6 + btnH + 14, Math.min(W - 48, 240 * Math.max(s, 0.8)), btnH, 'HOW TO PLAY', false, fs(16), () => this.howTo());

    // Level select (handy for demos).
    const gap = Math.max(MIN_TAP, 44 * s);
    const lx = W / 2 - ((LEVELS.length - 1) * gap) / 2;
    const ly = H - Math.max(40, 64 * s);
    LEVELS.forEach((l, i) => {
      const solved = session.best.has(l.id);
      const t = this.add.text(lx + i * gap, ly, String(l.id), {
        fontFamily: FONT, fontSize: fs(16), color: solved ? '#5ee6a0' : '#5d5873',
        backgroundColor: '#1d1a29', padding: { x: 10, y: 6 },
      }).setOrigin(0.5);
      const hw = Math.max(MIN_TAP, t.width), hh = Math.max(MIN_TAP, t.height);
      t.setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle((t.width - hw) / 2, (t.height - hh) / 2, hw, hh),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
      t.on('pointerover', () => t.setColor('#ffd166'));
      t.on('pointerout', () => t.setColor(solved ? '#5ee6a0' : '#5d5873'));
      t.on('pointerdown', () => this.start(i));
    });
    this.add.text(W / 2, ly - Math.max(26, 30 * s), 'LEVELS', { fontFamily: FONT, fontSize: fs(11), color: '#5d5873' }).setOrigin(0.5);

    const ai = this.add.text(W - 10, H - 8, '', { fontFamily: FONT, fontSize: fs(11), color: '#5d5873' }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    const refreshAi = () => ai.setText(openAIKey() ? `AI: ON (${OPENAI_MODEL})` : 'AI: OFF · tap to add an OpenAI key');
    refreshAi();
    ai.on('pointerdown', () => {
      const k = window.prompt('OpenAI API key (stored only in this browser). Leave empty to turn AI off.', '');
      if (k !== null) { setOpenAIKey(k.trim()); refreshAi(); }
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.start(0));
    this.input.keyboard?.on('keydown-SPACE', () => this.start(0));

    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));
  }

  private start(levelIndex: number) {
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

  private button(x: number, y: number, w: number, h: number, label: string, primary: boolean, fontSize: string, onClick: () => void) {
    const bg = this.add.rectangle(x, y, w, h, primary ? 0xffd166 : 0x1d1a29).setStrokeStyle(2, primary ? 0xffd166 : 0x34304a).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: FONT, fontSize, fontStyle: 'bold', color: primary ? '#1a1400' : '#ece8f5' }).setOrigin(0.5);
    if (!isTouch()) {
      bg.on('pointerover', () => { bg.setScale(1.04); t.setScale(1.04); });
      bg.on('pointerout', () => { bg.setScale(1); t.setScale(1); });
    }
    bg.on('pointerdown', onClick);
    return bg;
  }

  private howTo() {
    const { width: W, height: H } = this.scale;
    const s = Phaser.Math.Clamp(Math.min(W / REF_W, H / REF_H), 0.42, 1.2);
    const layer = this.add.container(0, 0).setDepth(10);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x0a0810, 0.85).setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, Math.min(W - 32, 520), Math.min(H - 60, 330), 0x1d1a29).setStrokeStyle(1, 0x34304a);
    const body = this.add.text(W / 2, H / 2 - 30 * s, [
      'Each level has one rule.',
      '',
      'Change exactly one word.',
      '',
      'The world will obey the new sentence.',
      '',
      'Reach the exit.',
    ].join('\n'), { fontFamily: FONT, fontSize: `${Math.round(19 * s)}px`, color: '#ece8f5', align: 'center', wordWrap: { width: Math.min(W - 60, 480) } }).setOrigin(0.5);
    const example = this.add.text(W / 2, H / 2 + 100 * s, 'YOU DIE ON RED  →  YOU HIDE ON RED', { fontFamily: FONT, fontSize: `${Math.round(14 * s)}px`, color: '#ffd166' }).setOrigin(0.5);
    const close = this.add.text(W / 2, H / 2 + 140 * s, isTouch() ? 'tap anywhere' : 'click anywhere', { fontFamily: FONT, fontSize: `${Math.round(12 * s)}px`, color: '#5d5873' }).setOrigin(0.5);
    layer.add([shade, panel, body, example, close]);
    shade.on('pointerdown', () => layer.destroy());
  }
}
