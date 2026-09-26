import Phaser from 'phaser';
import { COLORS, aiProvider, creativeMode, setAIKey, setCreativeMode } from '../config/GameConfig';
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
    // Layout shrinks with the viewport, text only down to a legible floor.
    const fs = (px: number, min = 13) => `${Math.max(min, Math.round(px * s))}px`;
    this.drawBackdrop(W, H);

    // Bottom-up layout: the level row is anchored to the bottom edge, the mode picker and
    // buttons stack upward from it, and the title takes whatever height is left (landscape
    // phones otherwise push the last button onto the level row).
    const btnH = Math.max(MIN_TAP, 48 * s);
    const modeH = Math.max(36, 34 * s);
    const capH = Math.max(26, 30 * s);
    const btnGap = Math.max(8, 14 * s);
    const levelY = H - Math.max(40, 64 * s);
    const labelY = levelY - Math.max(26, 30 * s);
    const blockH = modeH + capH + btnGap + btnH * 3 + btnGap * 2;
    const stackTop = Math.min(H * 0.34, labelY - Math.max(10, 16 * s) - blockH);
    const headH = Math.max(60, stackTop - Math.max(8, 12 * s));
    const titlePx = Math.round(Math.min(84 * s, headH * 0.34));

    const title = this.add.text(W / 2, headH * 0.42, 'ONE WORD', { fontFamily: FONT, fontSize: `${titlePx}px`, fontStyle: 'bold', color: '#ece8f5' }).setOrigin(0.5);
    // Every few seconds the world briefly misreads its own title.
    this.time.addEvent({
      delay: 2600, loop: true, callback: () => {
        title.setText('ONE WORLD').setColor('#ffd166');
        this.cameras.main.shake(80, 0.002);
        this.time.delayedCall(260, () => title.setText('ONE WORD').setColor('#ece8f5'));
      },
    });
    this.add.text(W / 2, title.getBounds().bottom + Math.max(8, 10 * s), 'Change one word.\nChange the world.', { fontFamily: FONT, fontSize: `${Math.max(11, Math.round(Math.min(20 * s, titlePx * 0.3)))}px`, color: '#8a85a0', align: 'center', lineSpacing: 4 * s }).setOrigin(0.5, 0);

    // Mode picker: the game is playable either as the shipped twelve mechanics
    // or with every typed word invented on the spot.
    const modeW = Math.min((W - 56) / 2, 118 * Math.max(s, 0.8));
    const modeY = stackTop + modeH / 2;
    const normal = this.modeButton(W / 2 - (modeW / 2 + 5), modeY, modeW, modeH, 'NORMAL', fs(13, 12), () => this.setMode(false));
    const creativeBtn = this.modeButton(W / 2 + (modeW / 2 + 5), modeY, modeW, modeH, 'CREATIVE', fs(13, 12), () => this.setMode(true));
    const caption = this.add.text(W / 2, modeY + modeH / 2 + 6, '', { fontFamily: FONT, fontSize: fs(12, 11), color: '#5d5873', align: 'center', wordWrap: { width: Math.min(W - 32, 420) } }).setOrigin(0.5, 0);
    const refreshMode = () => {
      const on = creativeMode() && !!aiProvider();
      normal.select(!on);
      creativeBtn.select(on);
      caption.setText(
        on ? 'any word you type becomes a new law of the world'
        : !aiProvider() ? 'the twelve built-in mechanics · CREATIVE needs an AI key'
        : 'the twelve built-in mechanics',
      );
    };
    this.refreshMode = refreshMode;
    refreshMode();

    const btnW = Math.min(W - 48, 240 * Math.max(s, 0.8));
    const btnY = stackTop + modeH + capH + btnGap + btnH / 2;
    const step = btnH + btnGap;
    this.button(W / 2, btnY, btnW, btnH, 'PLAY', true, fs(18, 15), () => this.start(0));
    this.button(W / 2, btnY + step, btnW, btnH, 'HOW TO PLAY', false, fs(16, 13), () => this.howTo());
    this.button(W / 2, btnY + step * 2, btnW, btnH, 'MAKE A LEVEL', false, fs(16, 13), () => { window.location.href = './editor.html'; });

    // Level select (handy for demos).
    const gap = Math.min(Math.max(MIN_TAP, 44 * s), (W - 24) / LEVELS.length);
    const lx = W / 2 - ((LEVELS.length - 1) * gap) / 2;
    const ly = levelY;
    LEVELS.forEach((l, i) => {
      const solved = session.best.has(l.id);
      const t = this.add.text(lx + i * gap, ly, String(l.id), {
        fontFamily: FONT, fontSize: fs(16, 15), color: solved ? '#5ee6a0' : '#5d5873',
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
    this.add.text(W / 2, labelY, 'LEVELS', { fontFamily: FONT, fontSize: fs(11, 10), color: '#5d5873' }).setOrigin(0.5);

    const ai = this.add.text(W - 10, H - 8, '', { fontFamily: FONT, fontSize: fs(11, 10), color: '#5d5873' }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    const refreshAi = () => {
      const p = aiProvider();
      const tap = isTouch() ? 'tap' : 'click';
      ai.setText(p ? `AI: ON (${p.model})` : `AI: OFF · ${tap} to add a Gemini or OpenAI key`);
    };
    refreshAi();
    ai.on('pointerdown', () => {
      const k = window.prompt('Gemini (Google AI Studio) or OpenAI API key, stored only in this browser. Leave empty to turn AI off.', '');
      if (k !== null) { setAIKey(k.trim()); refreshAi(); refreshMode(); }
    });
    this.askForKey = () => ai.emit('pointerdown');

    this.input.keyboard?.on('keydown-ENTER', () => this.start(0));
    this.input.keyboard?.on('keydown-SPACE', () => this.start(0));

    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));
  }

  private refreshMode: () => void = () => {};
  private askForKey: () => void = () => {};

  /** Creative mode needs a key, so choosing it without one asks for the key first. */
  private setMode(creative: boolean) {
    if (creative && !aiProvider()) { this.askForKey(); if (!aiProvider()) return; }
    setCreativeMode(creative);
    this.refreshMode();
  }

  private modeButton(x: number, y: number, w: number, h: number, label: string, fontSize: string, onClick: () => void) {
    const bg = this.add.rectangle(x, y, w, h, 0x1d1a29).setStrokeStyle(1, 0x34304a).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: FONT, fontSize, color: '#5d5873' }).setOrigin(0.5);
    bg.on('pointerdown', onClick);
    return {
      select(on: boolean) {
        bg.setFillStyle(on ? 0x2a2440 : 0x1d1a29).setStrokeStyle(1, on ? 0xffd166 : 0x34304a);
        t.setColor(on ? '#ffd166' : '#5d5873');
      },
    };
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
    const panel = this.add.rectangle(W / 2, H / 2, Math.min(W - 32, 520), Math.min(H - 60, 360), 0x1d1a29).setStrokeStyle(1, 0x34304a);
    const fs = (px: number, min: number) => `${Math.max(min, Math.round(px * s))}px`;
    const body = this.add.text(W / 2, H / 2 - Math.max(24, 30 * s), [
      'Each level has one rule.',
      '',
      'Change exactly one word.',
      '',
      'The world will obey the new sentence.',
      '',
      'Reach the exit.',
    ].join('\n'), { fontFamily: FONT, fontSize: fs(19, 15), color: '#ece8f5', align: 'center', wordWrap: { width: Math.min(W - 60, 480) } }).setOrigin(0.5);
    // Anchored to the text block so the bigger phone type can't collide with it.
    const example = this.add.text(W / 2, body.getBounds().bottom + 22, 'YOU DIE ON RED  →  YOU HIDE ON RED', { fontFamily: FONT, fontSize: fs(14, 12), color: '#ffd166', align: 'center', wordWrap: { width: Math.min(W - 60, 480) } }).setOrigin(0.5, 0);
    const close = this.add.text(W / 2, example.getBounds().bottom + 16, isTouch() ? 'tap anywhere' : 'click anywhere', { fontFamily: FONT, fontSize: fs(12, 11), color: '#5d5873' }).setOrigin(0.5, 0);
    layer.add([shade, panel, body, example, close]);
    shade.on('pointerdown', () => layer.destroy());
  }
}
