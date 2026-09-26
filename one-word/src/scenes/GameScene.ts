import Phaser from 'phaser';
import { VIEW_W, VIEW_H, RENDER_SCALE } from '../config/Display';
import { COLORS, DEBUG_MODE, OPENAI_MODEL, TILE, openAIKey } from '../config/GameConfig';
import { LEVELS } from '../levels/levels';
import { T, type LevelData, type Pos } from '../levels/LevelData';
import type { Mechanic } from '../rules/RuleDefinition';
import { ruleTokens } from '../rules/RuleParser';
import { RuleManager } from '../rules/RuleManager';
import { LLMWordInterpreter } from '../rules/LLMWordInterpreter';
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

interface GuardView { box: Phaser.GameObjects.Container; body: Phaser.GameObjects.Arc; icon: Phaser.GameObjects.Text; sprite: Phaser.GameObjects.Image; lastVerb: string }

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: LevelData;
  private world!: World;
  private rules!: RuleManager;

  private ox = 0;
  private oy = 0;
  private glyphs: { t: Phaser.GameObjects.Text; tile: T }[] = [];
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
  private down: { x: number; y: number; wx: number; wy: number } | null = null;
  private layoutObserver?: ResizeObserver;
  private onPadResize = () => this.layout();
  private onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor() { super('game'); }

  preload() {
    loadCharacters(this);
    this.load.spritesheet('sentinel-states', `${import.meta.env.BASE_URL}art/runtime/sentinel-states.png`, { frameWidth: 512, frameHeight: 512 });
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
    pad ??= new TouchPad();
    pad.onDir = dir => this.turn(dir);
    complete.hide();
    editor.close();

    const key = openAIKey();
    this.rules = new RuleManager(this.level.rules, key ? new LLMWordInterpreter(key, OPENAI_MODEL) : null);
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
    editor.onSelect = (ruleIndex, part) => this.rules.select(ruleIndex, part);
    editor.resetSelection();
    editor.setSuggestions(this.level.hintWords ?? []);
    editor.onSubmit = (raw) => this.submitWord(raw);
    editor.onOpen = () => { if (this.level.tutorial && !session.tutorialDone) editor.setTutorial('type'); };
    editor.render(this.rules.rules, this.rules.slots);
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
          this.glyphs.push({ t: glyph, tile });
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
      const sprite = this.add.image(0, 22, 'sentinel-states', 0).setOrigin(0.5, 0.95).setDisplaySize(60, 60);
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
      const verb = this.world.youVerbOn(gl.tile);
      gl.t.setText(verb ? TILE_GLYPH[verb] ?? '' : '');
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
    for (const g of s.guards) {
      const v = this.guards.get(g.id)!;
      const intent = this.world.guardIntent(g);
      const st = guardStyle(intent.verb);
      v.body.setFillStyle(st.color, 0.14).setStrokeStyle(1, st.color, 0.85);
      v.icon.setText(st.icon).setColor(Phaser.Display.Color.IntegerToColor(st.color).rgba);
      v.sprite.setFrame(intent.verb === 'SLEEP' ? 1 : intent.verb === 'FREEZE' ? 3 : ['HELP', 'FOLLOW', 'FLEE'].includes(intent.verb) ? 2 : 0);
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
    if (editor.isOpen || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (complete.isOpen) return;
    if (e.key === '`') { this.debug = !this.debug; this.drawDebug(); return; }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); this.restart(); return; }
    if (e.key === 'Escape') { this.toMenu(); return; }
    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') { e.preventDefault(); editor.open(); return; }
    const dir = KEYMAP[e.key];
    if (dir || e.key === ' ') {
      e.preventDefault();
      this.turn(dir ?? null);
    }
  }

  private stepDuration() { return reducedMotion() ? 70 : 170; }
  private moveDuration(steps: number) { return Math.max(1, steps) * this.stepDuration(); }

  private turn(dir: Pos | null) {
    if (editor.isOpen || complete.isOpen || this.locked || this.finished || this.world.s.dead) return;
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
      else this.locked = false;
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
        case 'wait': break;
      }
    }
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
      this.rules.reset();
      editor.render(this.rules.rules, this.rules.slots);
    }
    this.world = new World(this.level, this.rules.rules);
    this.tweens.killTweensOf(this.player);
    this.player.setScale(1).setAngle(0).setAlpha(1);
    this.facing = 'down'; this.walkUntil = 0;
    pose(this.playerSprite, character.outfit, this.facing, 'idle');
    this.keys.forEach((k) => k.setVisible(true));
    this.locked = false;
    this.finished = false;
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

  private async submitWord(raw: string) {
    if (this.locked || this.finished || this.world.s.dead) return { ok: false as const, message: 'LET THIS MOMENT FINISH FIRST.' };
    if (!raw.trim()) return { ok: false as const, message: 'TYPE A WORD.' };
    const originalWorld = this.world, originalSlot = this.rules.slot;
    this.wordsTried++;
    this.updateStats();
    const res = await this.rules.interpret(raw);
    if (this.world !== originalWorld || this.rules.slot !== originalSlot || !this.scene.isActive()) return { ok: false as const, message: 'THIS PAGE HAS ALREADY TURNED.' };
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
    if (res.token === this.rules.currentToken) {
      return { ok: false as const, message: "THAT'S ALREADY THE RULE." };
    }
    if (!this.scene.isActive() || this.finished || this.world.s.dead) return { ok: false as const, message: 'THIS PAGE HAS ALREADY TURNED.' };
    editor.rememberWord(raw);
    this.rules.apply(res.token);
    this.world.setRules(this.rules.rules);
    void editor.playRewrite(this.rules.rules, this.rules.slots);
    this.playRewriteFx();
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
      this.tweens.add({ targets: v.box, alpha: { from: 0.55, to: 1 }, duration: 380, ease: 'Sine.easeOut' });
      this.burst(g.x, g.y, guardStyle(this.world.guardIntent(g).verb).color, 14);
    }
    this.sync(true);
    // Show off the new plan for a moment.
    this.tweens.add({ targets: this.overlay, alpha: { from: 0, to: 1 }, duration: 500 });
  }

  // ---------------- level complete ----------------

  private showComplete() {
    const token = comboKey(this.rules.currentWords);
    const found = foundFor(this.level.id);
    const isNew = !found.has(token);
    found.add(token);
    const time = this.time.now - this.startTime;
    const prev = session.best.get(this.level.id);
    if (!prev || time < prev.time) session.best.set(this.level.id, { time, words: this.wordsTried, deaths: this.deaths, solution: token });

    const ruleHtml = this.rules.rules.map((r) => ruleTokens(r).map((t) => (t.editable ? `<span class="hl">${t.text}</span>` : t.text)).join(' ')).join('<br>');
    const solutions = this.level.solutions.map(comboKey);
    const expected = solutions.includes(token);
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
