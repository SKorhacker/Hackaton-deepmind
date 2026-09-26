import Phaser from 'phaser';
import { VIEW_W, VIEW_H, RENDER_SCALE } from '../config/Display';
import { LEVELS } from '../levels/levels';
import { audio } from '../ui/Audio';
import { sfx } from '../ui/Sfx';
import { progress } from '../config/Progress';
import { portraitBlocked } from '../ui/Device';
import { session } from '../config/Session';
import { aiProvider, setAIKey } from '../config/GameConfig';
import { character, createCharacterAnimations, loadCharacters, OUTFITS, outfitUnlocked, pose, reducedMotion, type Outfit } from '../config/Character';

const MONO = '"Space Mono", monospace';
const SERIF = '"Cormorant Garamond", Georgia, serif';

export class MenuScene extends Phaser.Scene {
  private turning = false;
  private modal = false;
  private outfitViews: { id: Outfit; sprite: Phaser.GameObjects.Sprite; border: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
  private outfitNote?: Phaser.GameObjects.Text;
  private travelerName!: Phaser.GameObjects.Text;
  private wardrobeOpen = false;
  constructor() { super('menu'); }

  preload() {
    this.load.image('manuscript', `${import.meta.env.BASE_URL}art/manuscript-menu.jpg`);
    loadCharacters(this);
    for (const name of ['guard', 'door', 'key', 'plate', 'exit']) {
      if (!this.textures.exists(`painted-${name}`)) this.load.image(`painted-${name}`, `${import.meta.env.BASE_URL}art/runtime/${name}.png`);
    }
  }

  create() {
    this.scale.setGameSize(VIEW_W * RENDER_SCALE, VIEW_H * RENDER_SCALE);
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(VIEW_W / 2, VIEW_H / 2);
    this.cameras.main.resetFX();
    audio.playMusic('menu', 1);
    this.turning = false; this.modal = false; this.outfitViews = [];
    document.body.classList.add('in-menu');
    // The HUD changes the parent size; refresh its bounds before mapping pointer input.
    this.scale.getParentBounds();
    this.scale.refresh();
    createCharacterAnimations(this);
    const W = VIEW_W, H = VIEW_H;
    this.wardrobeOpen = false; this.outfitNote = undefined;
    this.add.image(W / 2, H / 2, 'manuscript').setDisplaySize(W, H);
    this.add.rectangle(W / 2, H / 2, W, H, 0x07131b, 0.23);
    this.add.rectangle(W / 2, H / 2, W - 34, H - 34).setStrokeStyle(1, 0xd6b575, 0.35);
    this.label(40, 43, 'OW /', 24, SERIF, '#eadabd').setOrigin(0, 0.5);
    this.button(820, 43, 'CHOOSE TRAVELER', 190, () => this.wardrobe(), false).setName('choose-traveler');
    this.travelerName = this.label(820, 70, '', 9, MONO, '#d6b575');
    this.label(W / 2, 112, 'THE LIVING MANUSCRIPT', 10, MONO, '#d6b575').setLetterSpacing(4);
    const title = this.label(W / 2, 171, 'ONE WORD', 90, SERIF, '#f7edd8').setName('menu-title');
    if (title.width > 535) title.setScale(535 / title.width);
    title.setShadow(0, 4, '#07131b', 12, true, true);
    this.label(W / 2, 239, 'Change one word. Change the world.', 23, SERIF, '#e1d6bd').setFontStyle('italic');
    this.label(W / 2, 278, `${LEVELS.length} chapters. One extraordinary power.`, 10, MONO, '#b4bebd');
    this.button(W / 2, 334, 'BEGIN THE STORY  →', 252, () => this.start(0), true).setName('begin-story');
    this.button(W / 2, 384, 'HOW TO PLAY', 252, () => this.howTo(), false).setName('how-to-play');
    this.label(W / 2, 433, 'CHAPTERS', 9, MONO, '#c5baa4').setLetterSpacing(3);
    LEVELS.forEach((level, i) => {
      const x = W / 2 + (i - (LEVELS.length - 1) / 2) * Math.min(42, 750 / LEVELS.length);
      const solved = progress.has(level.id) || session.best.has(level.id);
      const row = this.add.rectangle(x, 465, 32, 30, 0x10232c, 0.85).setStrokeStyle(1, solved ? 0x8fcbb3 : 0x72674f, 0.8).setInteractive({ useHandCursor: true }).setName(`chapter-${i + 1}`);
      this.label(x, 465, ['I', 'II', 'III', 'IV', 'V', 'VI'][i] ?? String(level.id), 18, SERIF, solved ? '#8fcbb3' : '#eadabd');
      row.on('pointerover', () => row.setFillStyle(0x68583a));
      row.on('pointerout', () => row.setFillStyle(0x10232c, 0.85));
      row.on('pointerdown', () => this.start(i));
    });
    this.label(40, H - 33, 'MAKE A LEVEL ↗', 10, MONO, '#d6b575').setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => { window.location.href = `${import.meta.env.BASE_URL}editor.html`; });
    this.label(W - 40, H - 33, 'PRESS ENTER TO BEGIN', 8, MONO, '#d6b575').setOrigin(1, 0.5);
    this.refreshOutfit();
    document.getElementById('game')!.style.backgroundImage = `linear-gradient(#07131b55, #07131bc9), url("${import.meta.env.BASE_URL}art/manuscript-menu.jpg")`;
    this.createMobileMenu();
    this.ambient();
    const requested = Number(new URLSearchParams(window.location.search).get('level'));
    const levelIndex = LEVELS.findIndex(level => level.id === requested);
    if (levelIndex >= 0) {
      const url = new URL(window.location.href); url.searchParams.delete('level'); history.replaceState(null, '', url);
      this.time.delayedCall(0, () => this.start(levelIndex));
    }
    this.input.keyboard?.on('keydown-ENTER', () => this.start(0));
    this.input.keyboard?.on('keydown-SPACE', () => this.start(0));
    this.input.keyboard?.on('keydown-LEFT', () => this.cycle(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.cycle(1));
    for (let i = 1; i <= Math.min(LEVELS.length, 9); i++) this.input.keyboard?.on(`keydown-${i}`, () => this.start(i - 1));
  }

  private createMobileMenu() {
    const root = document.getElementById('mobile-menu')!;
    root.replaceChildren();
    const text = (tag: string, value: string, className = '') => {
      const node = document.createElement(tag); node.textContent = value; node.className = className; root.append(node); return node;
    };
    text('p', 'THE LIVING MANUSCRIPT', 'mobile-eyebrow');
    text('h1', 'ONE WORD');
    text('p', 'Change one word. Change the world.', 'mobile-subtitle');
    const begin = text('button', 'BEGIN THE STORY →') as HTMLButtonElement;
    begin.id = 'mobile-begin'; begin.onclick = () => this.start(0);
    const chapters = text('div', '', 'mobile-chapters');
    LEVELS.forEach((level, i) => {
      const button = document.createElement('button'); button.className = 'ghost';
      button.textContent = String(level.id); button.setAttribute('aria-label', `Chapter ${level.id}: ${level.name}`);
      button.onclick = () => this.start(i); chapters.append(button);
    });
    text('p', 'YOUR TRAVELER', 'mobile-eyebrow');
    const outfits = text('div', '', 'mobile-outfits');
    OUTFITS.forEach(outfit => {
      const button = document.createElement('button'); button.className = 'ghost';
      const portrait = document.createElement('span'); portrait.className = 'mobile-portrait';
      portrait.style.backgroundImage = `url("${import.meta.env.BASE_URL}art/runtime/${outfit.id}-walk.png")`;
      const label = document.createElement('span'); label.textContent = outfit.name;
      button.append(portrait, label);
      button.disabled = !outfitUnlocked(outfit.id);
      if (button.disabled) { const lock = document.createElement('small'); lock.textContent = `Complete chapter ${outfit.unlockAfter}`; button.append(lock); }
      button.setAttribute('aria-pressed', String(character.outfit === outfit.id));
      button.onclick = () => {
        this.select(outfit.id);
        outfits.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      };
      outfits.append(button);
    });
    const how = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'How to play';
    const help = document.createElement('p'); help.textContent = 'Tap a golden word to rewrite a rule. Swipe, tap a tile, or use the arrow pad to move. Reach the jade exit. Tap the center dot to wait.';
    how.append(summary, help); root.append(how);
    const maker = document.createElement('a'); maker.href = `${import.meta.env.BASE_URL}editor.html`; maker.textContent = 'Open the level maker'; root.append(maker);
  }

  private label(x: number, y: number, text: string, size: number, font: string, color: string) {
    return this.add.text(x, y, text, { resolution: RENDER_SCALE, fontFamily: font, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
  }

  private select(outfit: Outfit) {
    if (!outfitUnlocked(outfit)) return;
    if (this.turning || (this.modal && !this.wardrobeOpen)) return;
    character.select(outfit); this.refreshOutfit();
  }

  private cycle(step: number) {
    const available = OUTFITS.filter(outfit => outfitUnlocked(outfit.id));
    const index = available.findIndex(outfit => outfit.id === character.outfit);
    this.select(available[(index + step + available.length) % available.length].id);
  }

  private refreshOutfit() {
    this.travelerName?.setText(OUTFITS.find(outfit => outfit.id === character.outfit)!.name.toUpperCase());
    for (const view of this.outfitViews) {
      const selected = view.id === character.outfit;
      view.border.setStrokeStyle(selected ? 2 : 1, selected ? 0xa36d35 : 0x987747, selected ? 0.9 : 0.25).setFillStyle(0xccaa69, selected ? 0.2 : 0.04);
      view.label.setColor(selected ? '#713f24' : '#765c3d');
      const unlocked = outfitUnlocked(view.id);
      view.sprite.setAlpha(unlocked ? (selected ? 1 : 0.7) : 0.25);
      if (!unlocked) view.label.setText(`CHAPTER ${OUTFITS.find(o => o.id === view.id)!.unlockAfter}`);
      if (selected) pose(view.sprite, view.id, 'down', 'idle');
      else view.sprite.stop().setFrame(0);
    }
    this.outfitNote?.setText(OUTFITS.find(outfit => outfit.id === character.outfit)!.detail);
  }

  private wardrobe() {
    if (this.modal || this.turning) return;
    this.modal = true; this.wardrobeOpen = true;
    const layer = this.add.container(0, 0).setDepth(15).setName('wardrobe');
    const shade = this.add.rectangle(480, 270, 960, 540, 0x07131b, 0.88).setInteractive();
    const panel = this.add.rectangle(480, 270, 550, 370, 0xefdfbd).setStrokeStyle(2, 0xb69358);
    layer.add([shade, panel, this.label(480, 124, 'Choose your traveler', 36, SERIF, '#3b3028'),
      this.label(480, 157, 'THREE STORIES. THE SAME EXTRAORDINARY POWER.', 9, MONO, '#795c37')]);
    OUTFITS.forEach((outfit, i) => {
      const x = 328 + i * 152;
      const border = this.add.rectangle(x, 260, 128, 155, 0xccaa69, 0.1).setStrokeStyle(1, 0x987747, 0.3).setInteractive({ useHandCursor: true }).setName(`outfit-${outfit.id}`);
      const sprite = this.add.sprite(x, 248, `hero-${outfit.id}`, 0).setDisplaySize(136, 136);
      const label = this.label(x, 322, outfit.name, 11, MONO, '#765c3d');
      this.outfitViews.push({ id: outfit.id, border, sprite, label });
      layer.add([border, sprite, label]);
      border.on('pointerdown', () => this.select(outfit.id));
    });
    this.outfitNote = this.label(480, 363, '', 17, SERIF, '#745a40').setFontStyle('italic');
    const done = this.add.rectangle(480, 409, 204, 34, 0x344c49).setInteractive({ useHandCursor: true }).setName('wardrobe-done');
    layer.add([this.outfitNote, done, this.label(480, 409, 'KEEP THIS TRAVELER', 10, MONO, '#f0e6cd')]);
    const close = () => {
      this.input.keyboard?.off('keydown-ESC', close);
      this.modal = false; this.wardrobeOpen = false; this.outfitViews = []; this.outfitNote = undefined;
      layer.destroy();
    };
    done.on('pointerdown', close); shade.on('pointerdown', close);
    this.input.keyboard?.once('keydown-ESC', close);
    this.refreshOutfit();
  }

  private ambient() {
    if (reducedMotion()) return;
    // Candlelight and loose-paper details stay outside the interactive page content.
    const glow = this.add.ellipse(69, 79, 190, 225, 0xffd389, 0.09);
    this.tweens.add({ targets: glow, alpha: 0.18, duration: 1750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 12; i++) {
      const mote = this.add.circle(70 + i * 73, 40 + (i * 47) % 460, i % 3 === 0 ? 1.4 : 0.8, 0xffe2a2, 0.35);
      this.tweens.add({ targets: mote, y: mote.y - 18, alpha: 0.05, duration: 2800 + i * 170, yoyo: true, repeat: -1 });
    }
  }

  private start(levelIndex: number) {
    if (portraitBlocked() || this.turning || this.modal) return;
    sfx.click();
    this.turning = true;
    if (reducedMotion()) { this.scene.start('game', { levelIndex }); return; }
    this.cameras.main.fadeOut(260, 13, 26, 32);
    this.time.delayedCall(270, () => this.scene.start('game', { levelIndex }));
  }

  private button(x: number, y: number, text: string, width: number, onClick: () => void, primary: boolean) {
    const bg = this.add.rectangle(x, y, width, 39, primary ? 0xd6b575 : 0x0d2029, primary ? 1 : 0.8).setStrokeStyle(1, 0xd6b575, 0.7).setInteractive({ useHandCursor: true });
    this.label(x, y, text, 9, MONO, primary ? '#14212a' : '#eadabd').setLetterSpacing(1);
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));
    bg.on('pointerdown', () => { sfx.click(); onClick(); });
    return bg;
  }

  private howTo() {
    if (this.modal || this.turning) return;
    this.modal = true;
    const W = VIEW_W, H = VIEW_H;
    const layer = this.add.container(0, 0).setDepth(10);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x07131b, 0.93).setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, 570, 370, 0x142630).setStrokeStyle(1, 0xd6b575, 0.6);
    const title = this.add.text(W / 2, 133, 'The world obeys your words.', { resolution: RENDER_SCALE, fontFamily: SERIF, fontSize: '34px', color: '#f0e6cd' }).setOrigin(0.5);
    const body = this.add.text(W / 2, 252, 'Each chapter has rules.\nChoose a golden word and write a replacement.\nReach the jade exit.\n\nARROWS / WASD · move     SPACE · wait\nENTER / E · rewrite     R · restart', { resolution: RENDER_SCALE, fontFamily: MONO, fontSize: '13px', color: '#c2c8c1', align: 'center', lineSpacing: 12 }).setOrigin(0.5);
    const example = this.add.text(W / 2, 354, 'YOU DIE ON RED  →  YOU HIDE ON RED', { resolution: RENDER_SCALE, fontFamily: MONO, fontSize: '14px', color: '#d6b575' }).setOrigin(0.5);
    const close = this.add.text(W / 2, 412, 'CLICK ANYWHERE TO CLOSE', { resolution: RENDER_SCALE, fontFamily: MONO, fontSize: '10px', color: '#9da99f' }).setOrigin(0.5);
    const ai = this.add.text(W / 2, 385, '', { resolution: RENDER_SCALE, fontFamily: MONO, fontSize: '9px', color: '#b4bebd' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const refresh = () => ai.setText(`WORD INTERPRETER: ${aiProvider()?.name.toUpperCase() ?? 'LOCAL'} · CONFIGURE`);
    refresh();
    ai.on('pointerdown', () => {
      const key = window.prompt('Optional Gemini or OpenAI key for unfamiliar words. Stored only in this browser. Leave empty to use the local dictionary.', '');
      if (key !== null) { setAIKey(key.trim()); refresh(); }
    });
    layer.add([shade, panel, title, body, example, ai, close]);
    shade.on('pointerdown', () => { this.modal = false; layer.destroy(); });
    this.input.keyboard?.once('keydown-ESC', () => { this.modal = false; layer.destroy(); });
  }
}
