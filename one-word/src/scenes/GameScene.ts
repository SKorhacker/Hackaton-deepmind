import Phaser from 'phaser';
import { VIEW_W, VIEW_H, RENDER_SCALE } from '../config/Display';
import { COLORS, DEBUG_MODE, TILE } from '../config/GameConfig';
import { LEVELS } from '../levels/levels';
import { T, type LevelData, type Pos } from '../levels/LevelData';
import type { Mechanic } from '../rules/RuleDefinition';
import { ruleTokens } from '../rules/RuleParser';
import { RuleManager } from '../rules/RuleManager';
import { createInterpreter } from '../rules/createInterpreter';
import { normalizeWord } from '../rules/WordInterpreter';
import { WordBook } from '../ui/WordBook';
import { audio } from '../ui/Audio';
import { progress } from '../config/Progress';
import { OUTFITS } from '../config/Character';
import { portraitBlocked } from '../ui/Device';
import { World, type WorldEvent } from '../systems/World';
import { RuleEditor } from '../ui/RuleEditor';
import { LevelCompleteUI } from '../ui/LevelCompleteUI';
import { comboKey } from '../systems/Solver';
import { TouchPad } from '../ui/TouchPad';
import { fullscreenSupported, isTouch, toggleFullscreen } from '../ui/Device';
import { sfx } from '../ui/Sfx';
import { fmtTime, foundFor, session } from '../config/Session';
import { character, createCharacterAnimations, loadCharacters, pose, reducedMotion, type Facing } from '../config/Character';

const FONT = '"Space Mono", monospace';

// DOM widgets live for the whole page; scenes just rebind their callbacks.
let editor: RuleEditor;
let complete: LevelCompleteUI;
let pad: TouchPad;
let wordbook: WordBook;

// What a tile looks like under the current rule.
const TILE_GLYPH: Partial<Record<Mechanic, string>> = {
  DIE: '✕', ATTACK: '✕', HIDE: '◌', HEAL: '✚', BOUNCE: '⇡', FREEZE: '❄', SLEEP: '☾',
};

const GUARD_STYLE: Record<string, { color: number; icon: string }> = {
  CHASE: { color: 0xff6a3d, icon: '!' },
  ATTACK: { color: 0xff3d3d, icon: '!!' },
  FOLLOW: { color: 0xff8fc8, icon: '♥' },
  HELP: { color: 0x5ee6a0, icon: '✚' },
  FLEE: { color: 0xffd166, icon: '?!' },
  SLEEP: { color: 0x7c7896, icon: '☾' },
  FREEZE: { color: 0x9fdcff, icon: '❄' },
};
const guardStyle = (v: string) => GUARD_STYLE[v] ?? { color: COLORS.guard, icon: '·' };

const KEYMAP: Record<string, Pos> = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
};

interface GuardView { box: Phaser.GameObjects.Container; body: Phaser.GameObjects.Arc; icon: Phaser.GameObjects.Text; sprite: Phaser.GameObjects.Image; lastVerb: string; dying?: boolean }

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: LevelData;
  private world!: World;
  private rules!: RuleManager;

  private ox = 0;
  private oy = 0;
  private glyphs: { t: Phaser.GameObjects.Text; g: Phaser.GameObjects.Text; tile: T }[] = [];
  private plates: { r: Phaser.GameObjects.Image; x: number; y: number; scale: number }[] = [];
  private doors: Phaser.GameObjects.Container[] = [];
  private keys: Phaser.GameObjects.Container[] = [];
  private player!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private facing: Facing = 'down';
  private walkUntil = 0;
  private turnTimer?: Phaser.Time.TimerEvent;
  private outcomeTimer?: Phaser.Time.TimerEvent;
  private outcomeFx?: Phaser.GameObjects.Container;
  private playerLabel!: Phaser.GameObjects.Text;
  private guards = new Map<number, GuardView>();
  private overlay!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private debugText: Phaser.GameObjects.Text[] = [];
  private aiNote!: Phaser.GameObjects.Text;

  private locked = false;
  private debug = DEBUG_MODE;
  private startTime = 0;
  private wordsTried = 0;
  private deaths = 0;
  private finished = false;
  private lastSlot = 0;
  private runWords = new Map<string, { word: string; token: string; ai: boolean }>();
  private slotWords = new Map<number, { word: string; token: string; ai: boolean }>();
  private unlockedSkins: string[] = [];
  private unlockedWords: string[] = [];
  private down: { x: number; y: number; wx: number; wy: number } | null = null;
  private layoutObserver?: ResizeObserver;
  private onPadResize = () => this.layout();
  private onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor() { super('game'); }

  preload() {
    loadCharacters(this);
    for (const kind of ['sentinel', 'owl', 'wraith']) this.load.spritesheet(`${kind}-states`, `${import.meta.env.BASE_URL}art/runtime/${kind}-states.png`, { frameWidth: 512, frameHeight: 512 });
    for (const name of ['player', 'guard', 'exit', 'door', 'key', 'plate']) {
      this.load.image(`painted-${name}`, `${import.meta.env.BASE_URL}art/runtime/${name}.png`);
    }
    for (const name of ['floor', 'wall', 'red', 'blue', 'desk']) {
      this.load.image(`painted-${name}`, `${import.meta.env.BASE_URL}art/runtime/${name}.webp`);
    }
  }

  init(data: { levelIndex?: number }) {
    this.levelIndex = data.levelIndex ?? 0;
    this.level = LEVELS[this.levelIndex];
    this.glyphs = []; this.plates = []; this.doors = []; this.keys = []; this.guards.clear(); this.debugText = [];
    this.locked = false; this.finished = false;
    this.turnTimer = undefined; this.outcomeTimer = undefined; this.outcomeFx = undefined; this.down = null;
    this.wordsTried = 0; this.deaths = 0;
    this.facing = 'down'; this.walkUntil = 0;
    this.lastSlot = 0; this.runWords.clear(); this.slotWords.clear(); this.unlockedSkins = []; this.unlockedWords = [];
  }

  create() {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(VIEW_W / 2, VIEW_H / 2);
    this.cameras.main.resetFX();
    createCharacterAnimations(this);
    document.body.classList.remove('in-menu');
    // The HUD changes the parent size; refresh its bounds before mapping pointer input.
    this.scale.getParentBounds();
    this.scale.refresh();
    editor ??= new RuleEditor();
    complete ??= new LevelCompleteUI();
    wordbook ??= new WordBook();
    pad ??= new TouchPad();
    pad.onDir = dir => this.turn(dir);
    complete.hide();
    editor.close();

    this.rules = new RuleManager(this.level.rules, createInterpreter(), this.level.maxChanges ?? 1);
    this.world = new World(this.level, this.rules.rules);

    const W = VIEW_W, H = VIEW_H;
    this.ox = Math.round((W - this.level.width * TILE) / 2);
    this.oy = Math.round((H - this.level.height * TILE) / 2);

    this.add.image(W / 2, H / 2, 'painted-desk').setDisplaySize(W, H).setDepth(-4);
    const bw = this.level.width * TILE, bh = this.level.height * TILE;
    this.add.rectangle(W / 2 + 3, H / 2 + 7, bw + 14, bh + 14, 0x1d160c, 0.6).setDepth(-3);
    this.add.rectangle(W / 2, H / 2, bw + 10, bh + 10, 0x4b3021).setStrokeStyle(2, 0xcfac69).setDepth(-2);
    this.add.rectangle(W / 2, H / 2, bw + 16, bh + 16).setStrokeStyle(1, 0x6e4c2e).setDepth(-1);
    this.drawTiles();
    this.overlay = this.add.graphics().setDepth(2);
    this.createEntities();
    this.debugGfx = this.add.graphics().setDepth(50);
    this.aiNote = this.add.text(W / 2, H - 8, '', { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '13px', color: '#8a85a0' }).setOrigin(0.5, 1).setDepth(40);

    // Bind DOM UI to this level.
    editor.setSuggestions(this.level.hintWords ?? []);
    editor.onSubmit = (raw, slot) => this.submitWord(raw, slot);
    editor.onOpen = () => {
      this.lastSlot = editor.slot;
      editor.setUnlockedWords(wordbook.words(this.rules.allowed(editor.slot)));
      if (this.level.tutorial && !session.tutorialDone) editor.setTutorial('type');
    };
    editor.render(this.rules.rules, this.rules.slots, this.rules.changedSlots);
    wordbook.setLevel(this.level.id, this.rules.slots.flatMap(slot => slot.allowedReplacements));
    wordbook.onPick = (word, token) => {
      const slot = this.rules.allowed(this.lastSlot)?.includes(token) ? this.lastSlot : this.rules.slots.findIndex(s => s.allowedReplacements.includes(token));
      if (slot >= 0 && !this.locked && !this.finished) editor.open(slot, word);
    };
    editor.setTutorial(this.level.tutorial && !session.tutorialDone ? 'click' : null);
    document.getElementById('level-name')!.textContent = `LEVEL ${this.level.id} · ${this.level.name}`;
    (document.getElementById('btn-restart') as HTMLButtonElement).onclick = () => this.restart();
    (document.getElementById('btn-menu') as HTMLButtonElement).onclick = () => this.toMenu();

    window.addEventListener('oneword-pad-resize', this.onPadResize);
    this.layoutObserver = new ResizeObserver(() => this.layout());
    this.layoutObserver.observe(document.getElementById('game')!);
    this.layout();
    this.bindPointer();
    const fs = document.getElementById('btn-fullscreen') as HTMLButtonElement;
    fs.hidden = !fullscreenSupported();
    fs.onclick = () => void toggleFullscreen();
    document.querySelector('.keys')!.textContent = isTouch() ? 'SWIPE or TAP a tile · TAP the golden word' : 'WASD / ARROWS move · SPACE wait';
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', this.onKey); this.layoutObserver?.disconnect(); window.removeEventListener('oneword-pad-resize', this.onPadResize); pad.onDir = () => {}; });

    this.startTime = this.time.now;
    this.updateMusic(0.8);
    document.getElementById('chapter-note')!.textContent = this.level.intro ?? (this.rules.slots.length > 1 ? `Up to ${this.rules.maxChanges} changed ${this.rules.maxChanges === 1 ? 'word' : 'words'} at a time.` : '');
    this.updateStats();
    this.sync(false);
    this.cameras.main.fadeIn(250, 20, 18, 28);
  }

  update() {
    if (!this.finished) this.updateStats();
    if (this.playerSprite && !this.world.s.dead && !this.world.s.won) {
      pose(this.playerSprite, character.outfit, this.facing, this.time.now < this.walkUntil ? 'walk' : 'idle');
    }
  }

  private layout() {
    const parent = document.getElementById('game')!;
    const padSpace = document.body.classList.contains('pad-on') ? document.getElementById('pad')!.offsetHeight + 20 : 0;
    const width = Math.max(1, parent.clientWidth), height = Math.max(1, parent.clientHeight - padSpace);
    // The backing canvas remains dense; camera coordinates remain the same 56px grid.
    const aspect = width / height;
    const logicalWidth = Math.max(this.level.width * TILE + 36, (this.level.height * TILE + 52) * aspect);
    const logicalHeight = logicalWidth / aspect;
    this.scale.setGameSize(Math.round(width * RENDER_SCALE), Math.round(height * RENDER_SCALE));
    this.cameras.main.setZoom(width * RENDER_SCALE / logicalWidth).centerOn(VIEW_W / 2, VIEW_H / 2);
    this.aiNote?.setPosition(VIEW_W / 2, VIEW_H / 2 + logicalHeight / 2 - 8);
  }

  // ---------------- drawing ----------------

  private px(x: number) { return this.ox + x * TILE + TILE / 2; }
  private py(y: number) { return this.oy + y * TILE + TILE / 2; }

  private drawTiles() {
    const L = this.level;
    for (let y = 0; y < L.height; y++) {
      for (let x = 0; x < L.width; x++) {
        const tile = L.tiles[y][x];
        const texture = tile === T.WALL ? 'wall' : tile === T.RED ? 'red' : tile === T.BLUE ? 'blue' : 'floor';
        const slab = this.add.image(this.px(x), this.py(y), `painted-${texture}`).setDisplaySize(TILE, TILE).setDepth(0);
        if (tile === T.FLOOR && (x + y) % 3 === 0) slab.setTint(0xe4ebef);
        if (tile === T.WALL) continue;
        if (tile === T.RED || tile === T.BLUE) {
          const glyph = this.add.text(this.px(x), this.py(y), '', {
            resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#fff1d4',
          }).setOrigin(0.5).setAlpha(0.8).setDepth(1);
          glyph.setShadow(0, 1, '#331b18', 3, true, true);
          const guardGlyph = this.add.text(this.px(x) + 15, this.py(y) - 16, '', { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '11px', color: '#ffd9a7', backgroundColor: '#182b34', padding: { x: 2, y: 1 } }).setOrigin(0.5).setDepth(1);
          this.glyphs.push({ t: glyph, g: guardGlyph, tile });
        } else if (tile === T.EXIT) {
          const glow = this.add.ellipse(this.px(x), this.py(y) + 15, 45, 16, COLORS.exit, 0.3).setDepth(1);
          this.art('exit', this.px(x), this.py(y) - 2, 51).setDepth(1);
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.tweens.add({ targets: glow, alpha: 0.12, scaleX: 0.8, duration: 1400, yoyo: true, repeat: -1 });
          }
          this.add.text(this.px(x), this.py(y) + 21, 'EXIT', { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '8px', color: '#d8ffec', backgroundColor: '#193d37', padding: { x: 3, y: 1 } }).setOrigin(0.5).setDepth(1);
        } else if (tile === T.PLATE) {
          const r = this.art('plate', this.px(x), this.py(y), 43).setDepth(1);
          this.plates.push({ r, x, y, scale: r.scaleX });
        }
      }
    }
  }

  private art(name: string, x: number, y: number, height: number) {
    const image = this.add.image(x, y, `painted-${name}`);
    return image.setScale(height / image.height);
  }

  private createEntities() {
    for (const d of this.world.s.doors) {
      const c = this.add.container(this.px(d.x), this.py(d.y)).setDepth(3);
      c.add(this.art('door', 0, -1, 53));
      this.doors.push(c);
    }
    for (const k of this.world.s.keys) {
      const c = this.add.container(this.px(k.x), this.py(k.y)).setDepth(3);
      c.add([this.add.ellipse(0, 14, 25, 8, 0x000000, 0.3), this.art('key', 0, 0, 35)]);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.tweens.add({ targets: c, y: c.y - 4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      this.keys.push(c);
    }
    for (const g of this.world.s.guards) {
      const box = this.add.container(this.px(g.x), this.py(g.y)).setDepth(5);
      const shadow = this.add.ellipse(0, 19, 39, 11, 0x000000, 0.4);
      // A colored intent ring supplements the symbol, leaving painted materials intact.
      const body = this.add.circle(0, 5, 23, COLORS.guard, 0.14).setStrokeStyle(1, COLORS.guard, 0.8);
      const kind = ['sentinel', 'owl', 'wraith'][(Math.max(0, this.level.id - 2) + g.id) % 3];
      const sprite = this.add.image(0, 22, `${kind}-states`, 0).setOrigin(0.5, 0.95).setDisplaySize(60, 60);
      const icon = this.add.text(18, -22, '', {
        resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ffffff',
        backgroundColor: '#152631', padding: { x: 3, y: 2 },
      }).setOrigin(0.5);
      box.add([shadow, body, sprite, icon]);
      this.guards.set(g.id, { box, body, icon, sprite, lastVerb: '' });
    }
    const p = this.world.s.player;
    this.player = this.add.container(this.px(p.x), this.py(p.y)).setDepth(6);
    const shadow = this.add.ellipse(0, 20, 28, 9, 0x000000, 0.4);
    this.playerSprite = this.add.sprite(0, 21, `hero-${character.outfit}`, 0).setOrigin(0.5, 121 / 128).setDisplaySize(60, 60);
    pose(this.playerSprite, character.outfit, this.facing, 'idle');
    this.playerLabel = this.add.text(0, -34, '', { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#f0e6cd', backgroundColor: '#14242d', padding: { x: 4, y: 1 } }).setOrigin(0.5);
    this.player.add([shadow, this.playerSprite, this.playerLabel]);
  }

  /** Bring every view in line with the world state. */
  private sync(animate: boolean, playerPath?: Pos[]) {
    const s = this.world.s;
    const moving = animate && !!playerPath?.length;
    const path = playerPath?.length ? playerPath : [{ x: s.player.x, y: s.player.y }];
    if (moving) {
      this.tweens.killTweensOf(this.player);
      this.walkUntil = this.time.now + this.moveDuration(path.length);
      pose(this.playerSprite, character.outfit, this.facing, 'walk');
      // Every step lands on the tile center. Never stretch or overshoot the artwork.
      this.tweens.chain({
        targets: this.player,
        tweens: path.map(p => ({
          x: this.px(p.x), y: this.py(p.y), duration: this.stepDuration(),
          ease: reducedMotion() ? 'Linear' : 'Sine.easeInOut',
        })),
      });
    } else if (!animate) {
      this.player.setPosition(this.px(s.player.x), this.py(s.player.y));
    }
    this.player.setAlpha(s.player.hidden ? 0.35 : 1);
    const label = s.player.hidden ? 'HIDDEN' : s.player.frozen > 0 ? `❄ ${s.player.frozen}` : '';
    this.playerLabel.setText(label).setVisible(label !== '');

    // Tiles reflect what the rules currently say they do.
    for (const gl of this.glyphs) {
      const verb = this.world.verbOn('YOU', gl.tile);
      gl.t.setText(verb ? TILE_GLYPH[verb] ?? '' : '');
      const guardVerb = this.world.verbOn('GUARD', gl.tile);
      gl.g.setText(guardVerb && guardVerb !== verb ? TILE_GLYPH[guardVerb] ?? '' : '').setVisible(!!guardVerb && guardVerb !== verb);
    }
    for (const pl of this.plates) {
      const down = (s.player.x === pl.x && s.player.y === pl.y) || !!this.world.guardAt(pl.x, pl.y);
      pl.r.setTint(down ? 0x90e5bd : 0xffffff).setScale(pl.scale * (down ? 0.88 : 1));
    }
    s.doors.forEach((d, i) => {
      const c = this.doors[i];
      this.tweens.add({ targets: c, alpha: d.open ? 0.15 : 1, scaleY: d.open ? 0.25 : 1, duration: animate ? 180 : 0 });
    });
    s.keys.forEach((k, i) => { if (k.taken) this.keys[i].setVisible(false); });

    // Guards.
    for (const [id, view] of this.guards) if (!s.guards.some(g => g.id === id) && view.box.visible && !view.dying) this.poofGuard(id);
    for (const g of s.guards) {
      const v = this.guards.get(g.id)!;
      const intent = this.world.guardIntent(g);
      const st = guardStyle(intent.verb);
      v.body.setFillStyle(st.color, 0.14).setStrokeStyle(1, st.color, 0.85);
      v.icon.setText(st.icon).setColor(Phaser.Display.Color.IntegerToColor(st.color).rgba);
      v.sprite.setFrame(g.frozen > 0 ? 3 : intent.verb === 'SLEEP' ? 1 : intent.verb === 'FREEZE' ? 3 : ['HELP', 'FOLLOW', 'FLEE'].includes(intent.verb) ? 2 : 0);
      if (g.frozen > 0) v.icon.setText(`❄${g.frozen}`).setColor('#9fdcff');
      v.box.setAlpha(1);
      this.tweens.killTweensOf(v.box);
      if (animate) this.tweens.add({ targets: v.box, x: this.px(g.x), y: this.py(g.y), duration: this.stepDuration(), ease: 'Sine.easeInOut' });
      else v.box.setPosition(this.px(g.x), this.py(g.y));
      if (!reducedMotion() && intent.verb === 'SLEEP' && v.lastVerb !== 'SLEEP') {
        this.tweens.add({ targets: v.icon, y: -27, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
      } else if (intent.verb !== 'SLEEP' && v.lastVerb === 'SLEEP') {
        this.tweens.killTweensOf(v.icon); v.icon.setY(-22).setAlpha(1);
      }
      v.lastVerb = intent.verb;
    }
    this.drawOverlay();
    this.drawDebug();
  }

  /** Danger zones around lethal guards + a dotted line of what each guard plans to do. */
  private drawOverlay() {
    const o = this.overlay.clear();
    for (const g of this.world.s.guards) {
      const intent = this.world.guardIntent(g);
      if (intent.lethal) {
        for (const d of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
          const x = g.x + d.x, y = g.y + d.y;
          if (this.world.tile(x, y) === T.WALL) continue;
          o.fillStyle(0xff3d3d, 0.13).fillRoundedRect(this.ox + x * TILE + 3, this.oy + y * TILE + 3, TILE - 6, TILE - 6, 7);
        }
      }
      const st = guardStyle(intent.verb);
      intent.path.slice(0, 8).forEach((p, i) => {
        o.fillStyle(st.color, 0.55 - i * 0.05).fillCircle(this.px(p.x), this.py(p.y), 4);
      });
      if (intent.target && intent.path.length) {
        o.lineStyle(2, st.color, 0.5).strokeRoundedRect(this.ox + intent.target.x * TILE + 6, this.oy + intent.target.y * TILE + 6, TILE - 12, TILE - 12, 6);
      }
    }
  }

  private drawDebug() {
    this.debugGfx.clear();
    this.debugText.forEach((t) => t.destroy());
    this.debugText = [];
    if (!this.debug) return;
    const L = this.level;
    for (let y = 0; y < L.height; y++) for (let x = 0; x < L.width; x++) {
      this.debugText.push(this.add.text(this.ox + x * TILE + 3, this.oy + y * TILE + 2, `${x},${y}`, { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '9px', color: '#ffffff' }).setAlpha(0.45).setDepth(50));
    }
    for (const g of this.world.s.guards) {
      const intent = this.world.guardIntent(g);
      this.debugGfx.lineStyle(2, 0x00ffff, 0.8);
      let last = { x: g.x, y: g.y };
      for (const p of intent.path) { this.debugGfx.lineBetween(this.px(last.x), this.py(last.y), this.px(p.x), this.py(p.y)); last = p; }
      this.debugText.push(this.add.text(this.px(g.x), this.py(g.y) + 24, `${intent.verb}${intent.lethal ? ' lethal' : ''}\n→ ${intent.target ? `${intent.target.x},${intent.target.y}` : 'none'}`, { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '10px', color: '#00ffff', align: 'center' }).setOrigin(0.5, 0).setDepth(50));
    }
    const p = this.world.s.player;
    this.debugText.push(this.add.text(8, 8, [
      `rules: ${this.rules.rules.map((r) => ruleTokens(r).map((t) => t.text).join(' ')).join(' | ')}`,
      `player ${p.x},${p.y} hidden=${p.hidden} frozen=${p.frozen} turn=${this.world.s.turn}`,
      `doors: ${this.world.s.doors.map((d) => (d.open ? 'open' : 'closed')).join(',')}  keys: ${this.world.s.keys.map((k) => (k.taken ? 'taken' : 'here')).join(',')}`,
    ].join('\n'), { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '11px', color: '#00ffff' }).setDepth(50));
  }

  // ---------------- input & turns ----------------

  /** Touch/mouse play: swipe in a direction, tap a neighbouring tile, tap yourself to wait. */
  private bindPointer() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.down = { x: p.x, y: p.y, wx: p.worldX, wy: p.worldY };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.down;
      this.down = null;
      if (!d || editor.isOpen || complete.isOpen) return;
      const dx = p.x - d.x, dy = p.y - d.y;
      if (Math.hypot(dx, dy) >= 26 * RENDER_SCALE) {
        this.turn(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
        return;
      }
      this.tapTile(d.wx, d.wy);
    });
  }

  /** A tap moves one step towards the tile under the finger (tapping yourself waits). */
  private tapTile(worldX: number, worldY: number) {
    const tx = Math.floor((worldX - this.ox) / TILE);
    const ty = Math.floor((worldY - this.oy) / TILE);
    if (tx < 0 || ty < 0 || tx >= this.level.width || ty >= this.level.height) return;
    const p = this.world.s.player;
    const dx = tx - p.x, dy = ty - p.y;
    if (!dx && !dy) { this.turn(null); return; }
    const horizontal: Pos = { x: Math.sign(dx), y: 0 };
    const vertical: Pos = { x: 0, y: Math.sign(dy) };
    const order = Math.abs(dx) > Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
    for (const dir of order) {
      if (!dir.x && !dir.y) continue;
      if (this.world.tile(p.x + dir.x, p.y + dir.y) !== T.WALL) { this.turn(dir); return; }
    }
    sfx.bump();
  }

  private handleKey(e: KeyboardEvent) {
    if (portraitBlocked()) return;
    if (editor.isOpen || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (complete.isOpen) return;
    if (e.key === '`') { this.debug = !this.debug; this.drawDebug(); return; }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); this.restart(); return; }
    if (e.key === 'Escape') { this.toMenu(); return; }
    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') { e.preventDefault(); editor.open(this.lastSlot); return; }
    const dir = KEYMAP[e.key];
    if (dir || e.key === ' ') {
      e.preventDefault();
      this.turn(dir ?? null);
    }
  }

  private stepDuration() { return reducedMotion() ? 70 : 170; }
  private moveDuration(steps: number) { return Math.max(1, steps) * this.stepDuration(); }

  private turn(dir: Pos | null) {
    if (portraitBlocked() || editor.isOpen || complete.isOpen || this.locked || this.finished || this.world.s.dead) return;
    if (dir) this.facing = dir.x > 0 ? 'right' : dir.x < 0 ? 'left' : dir.y < 0 ? 'up' : 'down';
    const ev = this.world.step(dir);
    if (!ev.length) {
      sfx.bump();
      // A blocked move keeps the character's feet planted.
      pose(this.playerSprite, character.outfit, this.facing, 'idle');
      return;
    }
    this.locked = true;
    const hops: Pos[] = [];
    for (const e of ev) if (e.type === 'move' || e.type === 'bounce') hops.push({ x: e.x, y: e.y });
    this.effects(ev);
    this.sync(true, hops);
    this.turnTimer?.remove(false);
    this.turnTimer = this.time.delayedCall(this.moveDuration(hops.length) + 35, () => {
      this.walkUntil = 0;
      pose(this.playerSprite, character.outfit, this.facing, 'idle');
      if (this.world.s.dead) this.onDeath();
      else if (this.world.s.won) this.onWin();
      else { this.locked = false; this.updateMusic(); }
    });
  }

  private effects(ev: WorldEvent[]) {
    for (const e of ev) {
      switch (e.type) {
        case 'move': sfx.move(); break;
        case 'bounce': sfx.bounce(); this.burst(e.x, e.y, COLORS.red, 8); break;
        case 'hide': sfx.hide(); this.floatText(this.world.s.player, 'HIDDEN', '#b9b4cc'); break;
        case 'heal': sfx.heal(); this.burst(this.world.s.player.x, this.world.s.player.y, COLORS.heal, 12, true); break;
        case 'freeze': sfx.freeze(); this.burst(this.world.s.player.x, this.world.s.player.y, COLORS.ice, 10); break;
        case 'key': sfx.key(); this.burst(e.x, e.y, COLORS.key, 16); this.floatText(e, 'UNLOCKED!', '#ffd166'); break;
        case 'door': sfx.door(); this.burst(e.x, e.y, COLORS.door, e.open ? 10 : 4); break;
        case 'guardDeath': this.poofGuard(e.id); break;
        case 'guardBounce': sfx.bounce(); this.burst(e.x, e.y, COLORS.guard, 8); break;
        case 'guardFreeze': sfx.freeze(); break;
        case 'wait': sfx.wait(); break;
      }
    }
  }

  private poofGuard(id: number) {
    const view = this.guards.get(id);
    if (!view || view.dying || !view.box.visible) return;
    view.dying = true;
    sfx.freeze();
    this.tweens.killTweensOf(view.box);
    this.burst((view.box.x - this.ox - TILE / 2) / TILE, (view.box.y - this.oy - TILE / 2) / TILE, 0xd6b575, 12);
    this.tweens.add({ targets: view.box, alpha: 0, duration: reducedMotion() ? 100 : 420, onComplete: () => view.box.setVisible(false) });
  }

  private updateMusic(fade = 1.2) {
    if (this.finished) return;
    const hunted = this.world.s.guards.some(g => this.world.guardIntent(g).lethal && !g.frozen);
    const puzzle = this.world.s.doors.some(d => !d.open) || this.level.timed;
    audio.playMusic(hunted ? 'tension' : puzzle ? 'mystery' : 'calm', fade);
  }

  private burst(tx: number, ty: number, color: number, n: number, up = false) {
    if (reducedMotion()) return;
    for (let i = 0; i < Math.min(n, 16); i++) {
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 26;
      const dot = this.add.rectangle(this.px(tx), this.py(ty), 6, 6, color).setDepth(30);
      this.tweens.add({
        targets: dot, duration: 450 + Math.random() * 250, ease: 'Quad.easeOut', alpha: 0, scale: 0.3, angle: 180,
        x: dot.x + Math.cos(a) * r, y: dot.y + (up ? -20 - Math.random() * 30 : Math.sin(a) * r),
        onComplete: () => dot.destroy(),
      });
    }
  }

  private floatText(at: Pos, text: string, color: string) {
    const t = this.add.text(this.px(at.x), this.py(at.y) - 30, text, { resolution: RENDER_SCALE, fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(35);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private toast(text: string) {
    const el = document.getElementById('toast')!;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Ink, parchment and gilding echo the manuscript rather than arcade flashes. */
  private outcomeIllustration(won: boolean) {
    const x = this.player.x, y = this.player.y;
    const layer = this.add.container(0, 0).setDepth(25);
    this.outcomeFx = layer;
    layer.add(this.add.rectangle(VIEW_W / 2, VIEW_H / 2, this.cameras.main.width / this.cameras.main.zoom, this.cameras.main.height / this.cameras.main.zoom, 0x0b1820, 0.22));
    const halo = this.add.ellipse(x, y + 12, 58, 22, won ? 0xcaae6f : 0x1c1723, 0.45);
    const ring = this.add.ellipse(x, y + 12, 64, 28).setStrokeStyle(1.5, won ? 0xe4cb8a : 0xb8887c, 0.8);
    layer.add([halo, ring]);
    // The player remains above the local illustration until it fades into the page.
    this.player.setDepth(26);
    const caption = this.add.text(VIEW_W / 2, VIEW_H / 2 + this.cameras.main.height / this.cameras.main.zoom / 2 - 22, won ? 'A new passage opens' : 'The ink settles. Your story continues.', {
      resolution: RENDER_SCALE, fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '24px',
      fontStyle: 'italic', color: won ? '#efdbab' : '#e1c8b2', backgroundColor: '#10212be8', padding: { x: 14, y: 5 },
    }).setOrigin(0.5).setAlpha(0);
    layer.add(caption);
    this.tweens.add({ targets: caption, alpha: 1, duration: reducedMotion() ? 100 : 350 });
    if (!reducedMotion()) {
      this.tweens.add({ targets: [halo, ring], scaleX: won ? 2.3 : 1.65, scaleY: won ? 1.8 : 1.3, alpha: 0, duration: 1000, ease: 'Sine.easeOut' });
      // Small paper leaves and ink flecks; bounded counts also keep phone rendering light.
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI * 2 / 16;
        const leaf = this.add.triangle(x, y, -3, 0, 0, -7, 3, 2, won ? (i % 2 ? 0xd6b575 : 0xf0e6cd) : (i % 2 ? 0x574653 : 0xa67c68), 0.9);
        layer.add(leaf);
        this.tweens.add({ targets: leaf, x: x + Math.cos(a) * (36 + i % 4 * 9),
          y: y + (won ? -35 - i % 5 * 14 : Math.sin(a) * 30 + 14),
          angle: i % 2 ? 75 : -75, alpha: 0, duration: 650 + i * 28, delay: i * 12, ease: 'Sine.easeOut' });
      }
    }
  }

  private onDeath() {
    this.deaths++;
    sfx.death();
    this.outcomeIllustration(false);
    this.playerSprite.stop().setTint(0xb2a398);
    this.tweens.add({ targets: this.player, alpha: 0, duration: reducedMotion() ? 180 : 580, delay: 100, ease: 'Sine.easeIn' });
    this.outcomeTimer = this.time.delayedCall(reducedMotion() ? 700 : 1250, () => this.resetWorld(false));
  }

  private onWin() {
    this.finished = true;
    const newlyCompleted = progress.complete(this.level.id);
    this.unlockedSkins = newlyCompleted ? OUTFITS.filter(o => o.unlockAfter === this.level.id).map(o => o.name) : [];
    this.unlockedWords = [];
    for (const word of this.runWords.values()) {
      if (wordbook.add(word.word, word.token, word.ai, this.level.id)) this.unlockedWords.push(word.word.toUpperCase());
    }
    audio.playMusic('hope', 1);
    sfx.win();
    this.outcomeIllustration(true);
    this.playerSprite.stop();
    this.tweens.add({ targets: this.player, alpha: 0, duration: reducedMotion() ? 200 : 650, delay: 250, ease: 'Sine.easeIn' });
    this.outcomeTimer = this.time.delayedCall(reducedMotion() ? 650 : 1250, () => this.showComplete());
  }

  private clearOutcome() {
    this.turnTimer?.remove(false);
    this.outcomeTimer?.remove(false);
    if (this.outcomeFx) {
      this.tweens.killTweensOf(this.outcomeFx.list);
      this.outcomeFx.destroy();
      this.outcomeFx = undefined;
    }
    this.player.setDepth(6);
    this.playerSprite.clearTint();
  }

  /** Put entities back. `fullReset` also restores the original rule (R key). */
  private resetWorld(fullReset: boolean) {
    this.clearOutcome();
    if (fullReset) {
      this.slotWords.clear();
      this.rules.reset();
      editor.render(this.rules.rules, this.rules.slots);
    }
    this.runWords.clear();
    for (const [slot, word] of this.slotWords) {
      if (this.rules.changedSlots.includes(slot) && this.rules.tokenAt(slot) === word.token) this.runWords.set(`${word.word}:${word.token}`, word);
    }
    this.world = new World(this.level, this.rules.rules);
    for (const [id, view] of this.guards) {
      const guard = this.world.s.guards.find(g => g.id === id)!;
      this.tweens.killTweensOf(view.box); view.dying = false;
      view.box.setVisible(true).setAlpha(1).setScale(1).setPosition(this.px(guard.x), this.py(guard.y));
    }
    this.tweens.killTweensOf(this.player);
    this.player.setScale(1).setAngle(0).setAlpha(1);
    this.facing = 'down'; this.walkUntil = 0;
    pose(this.playerSprite, character.outfit, this.facing, 'idle');
    this.keys.forEach((k) => k.setVisible(true));
    this.locked = false;
    this.finished = false;
    this.updateMusic(0.5);
    this.sync(false);
    this.updateStats();
  }

  private restart() {
    complete.hide();
    editor.close();
    this.aiNote.setText('');
    if (!reducedMotion()) this.cameras.main.flash(120, 20, 18, 28);
    this.resetWorld(true);
  }

  private toMenu() {
    complete.hide();
    editor.close();
    editor.setTutorial(null);
    this.scene.start('menu');
  }

  private updateStats() {
    document.getElementById('stat-time')!.textContent = fmtTime(this.time.now - this.startTime);
    document.getElementById('stat-words')!.textContent = String(this.wordsTried);
    document.getElementById('stat-deaths')!.textContent = String(this.deaths);
  }

  // ---------------- the rewrite ----------------

  private async submitWord(raw: string, slot: number) {
    if (portraitBlocked() || this.locked || this.finished || this.world.s.dead) return { ok: false as const, message: 'LET THIS MOMENT FINISH FIRST.' };
    if (!raw.trim()) return { ok: false as const, message: 'TYPE A WORD.' };
    if (!this.rules.slots[slot]) return { ok: false as const, message: 'CHOOSE A WORD FIRST.' };
    const originalWorld = this.world;
    this.wordsTried++;
    this.updateStats();
    const res = await this.rules.interpret(raw, slot);
    if (this.world !== originalWorld || !this.scene.isActive()) return { ok: false as const, message: 'THIS PAGE HAS ALREADY TURNED.' };
    const early = this.levelIndex < 2 && this.level.hintWords;
    const hint = early ? `Try words like: ${this.level.hintWords!.join(', ')}` : undefined;
    if (!res.ok) {
      sfx.invalid();
      switch (res.reason) {
        case 'multiple-words': return { ok: false as const, message: 'ONE WORD ONLY.', hint };
        case 'not-here': return { ok: false as const, message: "THAT WORD HAS NO POWER HERE.", hint: hint ?? `(${res.token} doesn't fit this rule)` };
        default: return { ok: false as const, message: "THE WORLD DOESN'T UNDERSTAND THAT WORD.", hint };
      }
    }
    if (res.token === this.rules.tokenAt(slot)) {
      return { ok: false as const, message: "THAT'S ALREADY THE RULE." };
    }
    if (!this.scene.isActive() || this.finished || this.world.s.dead) return { ok: false as const, message: 'THIS PAGE HAS ALREADY TURNED.' };
    const written = { word: normalizeWord(raw) ?? raw.trim(), token: res.token, ai: res.source === 'ai' };
    this.runWords.set(`${written.word}:${written.token}`, written);
    this.slotWords.set(slot, written);
    this.lastSlot = slot;
    const restored = this.rules.apply(slot, res.token);
    for (const reverted of restored) this.slotWords.delete(reverted);
    void editor.playRewrite(this.rules.rules, this.rules.slots, this.rules.changedSlots, [slot, ...restored]);
    const events = this.world.setRules(this.rules.rules);
    this.playRewriteFx();
    this.effects(events);
    this.sync(true);
    this.updateMusic();
    if (this.world.s.dead) {
      this.locked = true;
      this.turnTimer = this.time.delayedCall(250, () => this.onDeath());
    }
    if (res.source === 'ai') {
      this.aiNote.setText(`AI understood "${raw.trim().toLowerCase()}" as ${res.token}${res.note ? ` — ${res.note}` : ''}`).setAlpha(1);
      this.tweens.add({ targets: this.aiNote, alpha: 0.6, delay: 3000, duration: 800 });
    } else {
      this.aiNote.setText('');
    }
    if (this.level.tutorial && !session.tutorialDone) {
      session.tutorialDone = true;
      editor.setTutorial(null);
    }
    return { ok: true as const };
  }

  private playRewriteFx() {
    sfx.rewrite();
    this.toast('RULE REWRITTEN');
    if (reducedMotion()) { this.sync(false); return; }
    // Ripple the things the rule talks about.
    for (const gl of this.glyphs) {
      this.tweens.add({ targets: gl.t, scale: { from: 1.1, to: 1 }, alpha: { from: 1, to: 0.55 }, duration: 450, delay: Math.random() * 150, ease: 'Sine.easeOut' });
    }
    for (const g of this.world.s.guards) {
      const v = this.guards.get(g.id)!;
      if (v.dying) continue;
      this.tweens.add({ targets: v.box, alpha: { from: 0.55, to: 1 }, duration: 380, ease: 'Sine.easeOut' });
      this.burst(g.x, g.y, guardStyle(this.world.guardIntent(g).verb).color, 14);
    }
    this.sync(true);
    // Show off the new plan for a moment.
    this.tweens.add({ targets: this.overlay, alpha: { from: 0, to: 1 }, duration: 500 });
  }

  // ---------------- level complete ----------------

  private showComplete() {
    const token = this.rules.solutionKey();
    const found = foundFor(this.level.id);
    const isNew = !found.has(token);
    found.add(token);
    const time = this.time.now - this.startTime;
    const prev = session.best.get(this.level.id);
    if (!prev || time < prev.time) session.best.set(this.level.id, { time, words: this.wordsTried, deaths: this.deaths, solution: token });

    const ruleHtml = this.rules.rules.map((r) => ruleTokens(r).map((t) => (t.editable ? `<span class="hl">${t.text}</span>` : t.text)).join(' ')).join('<br>');
    const solutions = this.level.solutions.map(comboKey);
    const expected = !!this.level.timed || solutions.includes(token);
    const unfound = solutions.filter((s) => !found.has(s));
    const last = this.levelIndex === LEVELS.length - 1;
    complete.show({
      title: expected ? 'Chapter complete' : 'An unexpected ending',
      ruleHtml,
      isNewSolution: isNew,
      stats: [
        ['Time', fmtTime(time)],
        ['Words tried', String(this.wordsTried)],
        ['Deaths', String(this.deaths)],
        ['Solution', expected ? token : `${token} (unexpected!)`],
        ...(this.unlockedWords.length ? [['Words unlocked', this.unlockedWords.join(', ')] as [string, string]] : []),
        ...(this.unlockedSkins.length ? [['Skin unlocked', this.unlockedSkins.join(', ')] as [string, string]] : []),
      ],
      solutions: solutions.length > 1 ? { list: solutions, found } : null,
      nextLabel: last ? 'FINISH →' : 'NEXT LEVEL →',
      replayLabel: unfound.length ? 'TRY ANOTHER WORD' : undefined,
    }, () => {
      complete.hide();
      if (last) this.showFinal();
      else this.scene.restart({ levelIndex: this.levelIndex + 1 });
    }, () => {
      this.restart();
      this.startTime = this.time.now;
      this.wordsTried = 0;
      this.deaths = 0;
    });
  }

  private showFinal() {
    let total = 0, got = 0;
    const rows: [string, string][] = LEVELS.map((l) => {
      const f = foundFor(l.id);
      total += l.solutions.length;
      got += l.solutions.filter((s) => f.has(comboKey(s))).length;
      const b = session.best.get(l.id);
      return [`${l.id} ${l.name}`, b ? `${b.solution} · ${fmtTime(b.time)}` : '—'];
    });
    complete.show({
      title: 'YOU REWROTE THE WORLD',
      ruleHtml: `Solutions discovered: <span class="hl">${got} / ${total}</span>`,
      isNewSolution: false,
      stats: rows,
      solutions: null,
      nextLabel: 'MAIN MENU',
    }, () => this.toMenu(), () => {});
  }
}
