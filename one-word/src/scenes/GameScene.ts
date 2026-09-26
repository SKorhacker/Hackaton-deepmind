import Phaser from 'phaser';
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
import { sfx } from '../ui/Sfx';
import { fmtTime, foundFor, session } from '../config/Session';

const FONT = '"Space Mono", monospace';

// DOM widgets live for the whole page; scenes just rebind their callbacks.
let editor: RuleEditor;
let complete: LevelCompleteUI;

// What a tile looks like under the current rule.
const TILE_GLYPH: Partial<Record<Mechanic, string>> = {
  DIE: '✕', ATTACK: '✕', HIDE: '◌', HEAL: '✚', BOUNCE: '⇡', FREEZE: '❄', SLEEP: 'z',
};

const GUARD_STYLE: Record<string, { color: number; icon: string }> = {
  CHASE: { color: 0xff6a3d, icon: '!' },
  ATTACK: { color: 0xff3d3d, icon: '!!' },
  FOLLOW: { color: 0xff8fc8, icon: '♥' },
  HELP: { color: 0x5ee6a0, icon: '✚' },
  FLEE: { color: 0xffd166, icon: '?!' },
  SLEEP: { color: 0x7c7896, icon: 'z' },
  FREEZE: { color: 0x9fdcff, icon: '❄' },
};
const guardStyle = (v: string) => GUARD_STYLE[v] ?? { color: COLORS.guard, icon: '·' };

const KEYMAP: Record<string, Pos> = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
};

interface GuardView { box: Phaser.GameObjects.Container; body: Phaser.GameObjects.Arc; icon: Phaser.GameObjects.Text; lastVerb: string }

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: LevelData;
  private world!: World;
  private rules!: RuleManager;

  private ox = 0;
  private oy = 0;
  private glyphs: { t: Phaser.GameObjects.Text; tile: T }[] = [];
  private plates: { r: Phaser.GameObjects.Rectangle; x: number; y: number }[] = [];
  private doors: Phaser.GameObjects.Container[] = [];
  private keys: Phaser.GameObjects.Container[] = [];
  private player!: Phaser.GameObjects.Container;
  private playerEyes!: Phaser.GameObjects.Container;
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
  private onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor() { super('game'); }

  init(data: { levelIndex?: number }) {
    this.levelIndex = data.levelIndex ?? 0;
    this.level = LEVELS[this.levelIndex];
    this.glyphs = []; this.plates = []; this.doors = []; this.keys = []; this.guards.clear(); this.debugText = [];
    this.locked = false; this.finished = false;
    this.wordsTried = 0; this.deaths = 0;
  }

  create() {
    document.body.classList.remove('in-menu');
    editor ??= new RuleEditor();
    complete ??= new LevelCompleteUI();
    complete.hide();
    editor.close();

    const key = openAIKey();
    this.rules = new RuleManager(this.level.rules, key ? new LLMWordInterpreter(key, OPENAI_MODEL) : null);
    this.world = new World(this.level, this.rules.rules);

    const { width: W, height: H } = this.scale;
    this.ox = Math.round((W - this.level.width * TILE) / 2);
    this.oy = Math.round((H - this.level.height * TILE) / 2);

    this.drawTiles();
    this.overlay = this.add.graphics().setDepth(2);
    this.createEntities();
    this.debugGfx = this.add.graphics().setDepth(50);
    this.aiNote = this.add.text(W / 2, H - 8, '', { fontFamily: FONT, fontSize: '13px', color: '#8a85a0' }).setOrigin(0.5, 1).setDepth(40);

    // Bind DOM UI to this level.
    editor.onSubmit = (raw) => this.submitWord(raw);
    editor.onOpen = () => { if (this.level.tutorial && !session.tutorialDone) editor.setTutorial('type'); };
    editor.render(this.rules.rules, this.rules.editableIndex);
    editor.setTutorial(this.level.tutorial && !session.tutorialDone ? 'click' : null);
    document.getElementById('level-name')!.textContent = `LEVEL ${this.level.id} · ${this.level.name}`;
    (document.getElementById('btn-restart') as HTMLButtonElement).onclick = () => this.restart();
    (document.getElementById('btn-menu') as HTMLButtonElement).onclick = () => this.toMenu();

    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', this.onKey));

    this.startTime = this.time.now;
    this.updateStats();
    this.sync(false);
    this.cameras.main.fadeIn(250, 20, 18, 28);
  }

  update() {
    if (!this.finished) this.updateStats();
  }

  // ---------------- drawing ----------------

  private px(x: number) { return this.ox + x * TILE + TILE / 2; }
  private py(y: number) { return this.oy + y * TILE + TILE / 2; }

  private drawTiles() {
    const g = this.add.graphics().setDepth(0);
    const L = this.level;
    for (let y = 0; y < L.height; y++) {
      for (let x = 0; x < L.width; x++) {
        const t = L.tiles[y][x];
        const X = this.ox + x * TILE, Y = this.oy + y * TILE;
        if (t === T.WALL) {
          g.fillStyle(COLORS.wall).fillRect(X, Y, TILE, TILE);
          g.fillStyle(COLORS.wallTop).fillRect(X, Y, TILE, 6);
          continue;
        }
        g.fillStyle((x + y) % 2 ? COLORS.floor : COLORS.floorAlt).fillRoundedRect(X + 2, Y + 2, TILE - 4, TILE - 4, 6);
        if (t === T.RED || t === T.BLUE) {
          const c = t === T.RED ? COLORS.red : COLORS.blue;
          g.fillStyle(c).fillRoundedRect(X + 3, Y + 3, TILE - 6, TILE - 6, 7);
          g.fillStyle(0x000000, 0.14).fillRoundedRect(X + 11, Y + 11, TILE - 22, TILE - 22, 5);
          const txt = this.add.text(X + TILE / 2, Y + TILE / 2, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' })
            .setOrigin(0.5).setAlpha(0.55).setDepth(1);
          this.glyphs.push({ t: txt, tile: t });
        } else if (t === T.EXIT) {
          g.fillStyle(COLORS.exit, 0.22).fillRoundedRect(X + 3, Y + 3, TILE - 6, TILE - 6, 7);
          const glow = this.add.rectangle(X + TILE / 2, Y + TILE / 2, TILE - 16, TILE - 16, COLORS.exit).setDepth(1);
          this.tweens.add({ targets: glow, scale: 0.7, alpha: 0.55, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.add.text(X + TILE / 2, Y + TILE / 2, 'EXIT', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#0b2a1c' }).setOrigin(0.5).setDepth(1);
        } else if (t === T.PLATE) {
          g.fillStyle(0x000000, 0.3).fillRoundedRect(X + 8, Y + 8, TILE - 16, TILE - 16, 5);
          const r = this.add.rectangle(X + TILE / 2, Y + TILE / 2 - 2, TILE - 18, TILE - 18, COLORS.plate).setDepth(1);
          this.plates.push({ r, x, y });
        }
      }
    }
  }

  private createEntities() {
    for (const d of this.world.s.doors) {
      const c = this.add.container(this.px(d.x), this.py(d.y)).setDepth(3);
      const body = this.add.rectangle(0, 0, TILE - 6, TILE - 6, COLORS.door).setStrokeStyle(3, 0xb79cff);
      const bars = this.add.graphics();
      bars.lineStyle(3, 0x5b36c9);
      for (const bx of [-12, 0, 12]) bars.lineBetween(bx, -18, bx, 18);
      c.add([body, bars]);
      this.doors.push(c);
    }
    for (const k of this.world.s.keys) {
      const c = this.add.container(this.px(k.x), this.py(k.y)).setDepth(3);
      const ring = this.add.circle(-7, 0, 9).setStrokeStyle(5, COLORS.key);
      const stem = this.add.rectangle(8, 0, 18, 5, COLORS.key);
      const tooth = this.add.rectangle(14, 5, 4, 7, COLORS.key);
      c.add([ring, stem, tooth]);
      this.tweens.add({ targets: c, y: c.y - 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.keys.push(c);
    }
    for (const g of this.world.s.guards) {
      const box = this.add.container(this.px(g.x), this.py(g.y)).setDepth(5);
      const shadow = this.add.ellipse(0, 17, 34, 10, 0x000000, 0.3);
      const body = this.add.circle(0, 0, 19, COLORS.guard).setStrokeStyle(3, 0x000000, 0.25);
      const eyes = this.add.graphics();
      eyes.fillStyle(0x1b1020).fillRect(-8, -5, 5, 7).fillRect(4, -5, 5, 7);
      const icon = this.add.text(0, -34, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
      box.add([shadow, body, eyes, icon]);
      this.guards.set(g.id, { box, body, icon, lastVerb: '' });
    }
    const p = this.world.s.player;
    this.player = this.add.container(this.px(p.x), this.py(p.y)).setDepth(6);
    const shadow = this.add.ellipse(0, 18, 34, 10, 0x000000, 0.3);
    const body = this.add.graphics();
    body.fillStyle(COLORS.player).fillRoundedRect(-18, -18, 36, 36, 9);
    this.playerEyes = this.add.container(0, 0);
    const eg = this.add.graphics();
    eg.fillStyle(0x14121c).fillRect(-9, -6, 6, 9).fillRect(3, -6, 6, 9);
    this.playerEyes.add(eg);
    this.playerLabel = this.add.text(0, -34, '', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#ece8f5', backgroundColor: '#14121ccc', padding: { x: 4, y: 1 } }).setOrigin(0.5);
    this.player.add([shadow, body, this.playerEyes, this.playerLabel]);
  }

  /** Bring every view in line with the world state. */
  private sync(animate: boolean, playerPath?: Pos[]) {
    const s = this.world.s;
    const dur = animate ? 110 : 0;

    // Player (chain through bounce hops).
    const path = playerPath?.length ? playerPath : [{ x: s.player.x, y: s.player.y }];
    if (animate) {
      this.tweens.chain({
        targets: this.player,
        tweens: path.map((p, i) => ({
          x: this.px(p.x), y: this.py(p.y), duration: i === 0 ? dur : 120,
          ease: i === 0 ? 'Quad.easeOut' : 'Back.easeOut',
          ...(i > 0 ? { scaleY: { from: 0.7, to: 1 } } : {}),
        })),
      });
    } else {
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
      pl.r.setFillStyle(down ? COLORS.plateDown : COLORS.plate).setScale(down ? 0.82 : 1);
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
      v.body.setFillStyle(st.color);
      v.icon.setText(intent.lethal || intent.verb !== 'CHASE' ? st.icon : '·');
      v.box.setAlpha(intent.verb === 'SLEEP' ? 0.75 : 1);
      if (animate) this.tweens.add({ targets: v.box, x: this.px(g.x), y: this.py(g.y), duration: 130, ease: 'Quad.easeOut' });
      else v.box.setPosition(this.px(g.x), this.py(g.y));
      if (intent.verb === 'SLEEP' && v.lastVerb !== 'SLEEP') {
        this.tweens.add({ targets: v.icon, y: -40, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
      } else if (intent.verb !== 'SLEEP' && v.lastVerb === 'SLEEP') {
        this.tweens.killTweensOf(v.icon); v.icon.setY(-34).setAlpha(1);
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
      this.debugText.push(this.add.text(this.ox + x * TILE + 3, this.oy + y * TILE + 2, `${x},${y}`, { fontFamily: FONT, fontSize: '9px', color: '#ffffff' }).setAlpha(0.45).setDepth(50));
    }
    for (const g of this.world.s.guards) {
      const intent = this.world.guardIntent(g);
      this.debugGfx.lineStyle(2, 0x00ffff, 0.8);
      let last = { x: g.x, y: g.y };
      for (const p of intent.path) { this.debugGfx.lineBetween(this.px(last.x), this.py(last.y), this.px(p.x), this.py(p.y)); last = p; }
      this.debugText.push(this.add.text(this.px(g.x), this.py(g.y) + 24, `${intent.verb}${intent.lethal ? ' lethal' : ''}\n→ ${intent.target ? `${intent.target.x},${intent.target.y}` : 'none'}`, { fontFamily: FONT, fontSize: '10px', color: '#00ffff', align: 'center' }).setOrigin(0.5, 0).setDepth(50));
    }
    const p = this.world.s.player;
    this.debugText.push(this.add.text(8, 8, [
      `rules: ${this.rules.rules.map((r) => ruleTokens(r).map((t) => t.text).join(' ')).join(' | ')}`,
      `player ${p.x},${p.y} hidden=${p.hidden} frozen=${p.frozen} turn=${this.world.s.turn}`,
      `doors: ${this.world.s.doors.map((d) => (d.open ? 'open' : 'closed')).join(',')}  keys: ${this.world.s.keys.map((k) => (k.taken ? 'taken' : 'here')).join(',')}`,
    ].join('\n'), { fontFamily: FONT, fontSize: '11px', color: '#00ffff' }).setDepth(50));
  }

  // ---------------- input & turns ----------------

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

  private turn(dir: Pos | null) {
    if (this.locked || this.finished || this.world.s.dead) return;
    if (dir) this.playerEyes.setPosition(dir.x * 3, dir.y * 3);
    const ev = this.world.step(dir);
    if (!ev.length) {
      sfx.bump();
      if (dir) this.tweens.add({ targets: this.player, x: this.player.x + dir.x * 5, y: this.player.y + dir.y * 5, duration: 50, yoyo: true });
      return;
    }
    this.locked = true;
    this.time.delayedCall(125, () => { this.locked = false; });
    const hops: Pos[] = [];
    for (const e of ev) if (e.type === 'move' || e.type === 'bounce') hops.push({ x: e.x, y: e.y });
    this.effects(ev);
    this.sync(true, hops);
    if (this.world.s.dead) this.onDeath();
    else if (this.world.s.won) this.onWin();
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
    for (let i = 0; i < n; i++) {
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
    const t = this.add.text(this.px(at.x), this.py(at.y) - 30, text, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(35);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private toast(text: string) {
    const el = document.getElementById('toast')!;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  private onDeath() {
    const s = this.world.s;
    this.deaths++;
    sfx.death();
    this.cameras.main.shake(260, 0.012);
    this.cameras.main.flash(160, 229, 72, 77);
    this.burst(s.player.x, s.player.y, COLORS.red, 26);
    this.tweens.add({ targets: this.player, scale: 1.4, alpha: 0, angle: 30, duration: 320 });
    this.toast(s.deathCause === 'red' ? `YOU ${ruleTokens(this.rules.rules.find((r) => r.subject === 'YOU')!)[1].text} ON RED` : 'CAUGHT!');
    this.time.delayedCall(850, () => this.resetWorld(false));
  }

  private onWin() {
    this.finished = true;
    sfx.win();
    this.cameras.main.flash(200, 94, 230, 160);
    this.burst(this.world.s.player.x, this.world.s.player.y, COLORS.exit, 30, true);
    this.time.delayedCall(550, () => this.showComplete());
  }

  /** Put entities back. `fullReset` also restores the original rule (R key). */
  private resetWorld(fullReset: boolean) {
    if (fullReset) {
      this.rules.reset();
      editor.render(this.rules.rules, this.rules.editableIndex);
    }
    this.world = new World(this.level, this.rules.rules);
    this.tweens.killTweensOf(this.player);
    this.player.setScale(1).setAngle(0).setAlpha(1);
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
    this.cameras.main.flash(120, 20, 18, 28);
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
    if (!raw.trim()) return { ok: false as const, message: 'TYPE A WORD.' };
    this.wordsTried++;
    this.updateStats();
    const res = await this.rules.interpret(raw);
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
    this.rules.apply(res.token);
    this.world.setRules(this.rules.rules);
    void editor.playRewrite(this.rules.rules, this.rules.editableIndex);
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
    this.cameras.main.flash(220, 255, 209, 102);
    this.cameras.main.shake(140, 0.004);
    // Ripple the things the rule talks about.
    for (const gl of this.glyphs) {
      this.tweens.add({ targets: gl.t, scale: { from: 2.2, to: 1 }, alpha: { from: 1, to: 0.55 }, duration: 450, delay: Math.random() * 150, ease: 'Back.easeOut' });
    }
    for (const g of this.world.s.guards) {
      const v = this.guards.get(g.id)!;
      this.tweens.add({ targets: v.box, scale: { from: 1.35, to: 1 }, duration: 380, ease: 'Back.easeOut' });
      this.burst(g.x, g.y, guardStyle(this.world.guardIntent(g).verb).color, 14);
    }
    this.sync(true);
    // Show off the new plan for a moment.
    this.tweens.add({ targets: this.overlay, alpha: { from: 0, to: 1 }, duration: 500 });
  }

  // ---------------- level complete ----------------

  private showComplete() {
    const token = this.rules.currentToken;
    const found = foundFor(this.level.id);
    const isNew = !found.has(token);
    found.add(token);
    const time = this.time.now - this.startTime;
    const prev = session.best.get(this.level.id);
    if (!prev || time < prev.time) session.best.set(this.level.id, { time, words: this.wordsTried, deaths: this.deaths, solution: token });

    const ruleHtml = this.rules.rules.map((r) => ruleTokens(r).map((t) => (t.editable ? `<span class="hl">${t.text}</span>` : t.text)).join(' ')).join('<br>');
    const expected = this.level.solutions.includes(token);
    const unfound = this.level.solutions.filter((s) => !found.has(s));
    const last = this.levelIndex === LEVELS.length - 1;
    complete.show({
      title: expected ? 'LEVEL COMPLETE' : 'LEVEL COMPLETE?!',
      ruleHtml,
      isNewSolution: isNew,
      stats: [
        ['Time', fmtTime(time)],
        ['Words tried', String(this.wordsTried)],
        ['Deaths', String(this.deaths)],
        ['Solution', expected ? token : `${token} (unexpected!)`],
      ],
      solutions: this.level.solutions.length > 1 ? { list: this.level.solutions, found } : null,
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
      got += l.solutions.filter((s) => f.has(s)).length;
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
