import { T, type LevelData, type Pos } from '../levels/LevelData';
import type { Mechanic, Noun, RuleDefinition } from '../rules/RuleDefinition';
import { MechanicRegistry, registry as sharedRegistry } from '../rules/MechanicRegistry';
import { isDeadlyTile, resolveTarget, type Action, type Contact, type MechanicSpec, type Status, type Target } from '../rules/MechanicSpec';
import { bfsPath, distanceMap, DIRS, manhattan } from './Pathfinding';

// Deterministic, turn-based simulation. No Phaser in here so the solver in
// tests/ can brute-force every level with every allowed word.
//
// A turn: player acts (move / wait) -> tile effects -> doors -> win check
//         -> guards act -> doors -> catch check.
//
// The world knows no verbs of its own: every verb in a rule is looked up in a
// `MechanicRegistry` and run as data (a `MechanicSpec`). The twelve words that
// ship with the game and a word invented mid-run take exactly the same path.

export interface GuardState { id: number; x: number; y: number; frozen: number }
export interface KeyState { x: number; y: number; taken: boolean }
export interface DoorState { x: number; y: number; open: boolean }

export interface WorldState {
  player: { x: number; y: number; hidden: boolean; frozen: number };
  guards: GuardState[];
  keys: KeyState[];
  doors: DoorState[];
  dead: boolean;
  deathCause: 'red' | 'guard' | null;
  won: boolean;
  turn: number;
}

export type WorldEvent =
  | { type: 'move' | 'bounce'; x: number; y: number }
  | { type: 'bump' | 'wait' | 'win' | 'heal' | 'hide' | 'unhide' }
  | { type: 'freeze'; turns: number }
  | { type: 'death'; cause: 'red' | 'guard'; x: number; y: number }
  | { type: 'key'; x: number; y: number }
  | { type: 'door'; open: boolean; x: number; y: number }
  | { type: 'guard'; id: number; x: number; y: number }
  | { type: 'slide' | 'teleport' | 'pushed' | 'swap'; x: number; y: number }
  | { type: 'guardDeath' | 'guardBounce' | 'guardSlide' | 'guardTeleport'; id: number; x: number; y: number }
  | { type: 'guardFreeze'; id: number; turns: number };

export interface GuardIntent {
  verb: Mechanic;
  lethal: boolean;
  path: Pos[];      // planned route (for telegraphing + debug)
  target: Pos | null;
}

export class World {
  s: WorldState;

  constructor(
    public level: LevelData,
    public rules: RuleDefinition[],
    state?: WorldState,
    public registry: MechanicRegistry = sharedRegistry,
  ) {
    this.s = state ?? World.initialState(level);
    if (!state) this.updateDoors([]);
  }

  static initialState(level: LevelData): WorldState {
    let id = 0;
    return {
      player: { ...level.playerStart, hidden: false, frozen: 0 },
      guards: level.entities.filter((e) => e.type === 'guard').map((e) => ({ id: id++, x: e.x, y: e.y, frozen: 0 })),
      keys: level.entities.filter((e) => e.type === 'key').map((e) => ({ x: e.x, y: e.y, taken: false })),
      doors: level.entities.filter((e) => e.type === 'door').map((e) => ({ x: e.x, y: e.y, open: false })),
      dead: false, deathCause: null, won: false, turn: 0,
    };
  }

  clone(): World {
    return new World(this.level, this.rules, structuredClone(this.s), this.registry);
  }

  /** Compact state hash for the solver. */
  key(): string {
    const s = this.s;
    return `${s.player.x},${s.player.y},${s.player.frozen}|${s.guards.map((g) => `${g.id}:${g.x},${g.y},${g.frozen}`).join(';')}|${s.keys.map((k) => +k.taken).join('')}`;
  }

  /** The world obeys immediately: anyone standing on a tile that is now deadly dies right away. */
  setRules(rules: RuleDefinition[]) {
    this.rules = rules;
    const ev: WorldEvent[] = [];
    if (this.s.dead || this.s.won) return ev;
    const p = this.s.player;
    if (this.deadlyFor('YOU', p.x, p.y)) return this.kill('red', ev);
    for (const g of [...this.s.guards]) {
      if (this.deadlyFor('GUARD', g.x, g.y)) this.killGuard(g, ev);
    }
    this.updateHidden(ev);
    this.updateDoors(ev);
    this.checkCaught(ev);
    return ev;
  }

  // ---------- queries ----------

  tile(x: number, y: number): T {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return T.WALL;
    return this.level.tiles[y][x];
  }
  doorAt(x: number, y: number) { return this.s.doors.find((d) => d.x === x && d.y === y); }
  guardAt(x: number, y: number) { return this.s.guards.find((g) => g.x === x && g.y === y); }
  keyAt(x: number, y: number) { return this.s.keys.find((k) => !k.taken && k.x === x && k.y === y); }

  /** What a tile does to YOU or a GUARD. A rule naming them directly beats an EVERYONE rule. */
  verbOn(who: 'YOU' | 'GUARD', t: T): Mechanic | undefined {
    const cond = t === T.RED ? 'ON_RED' : t === T.BLUE ? 'ON_BLUE' : null;
    if (!cond) return undefined;
    return (this.rules.find((r) => r.subject === who && r.condition === cond) ??
            this.rules.find((r) => r.subject === 'EVERYONE' && r.condition === cond))?.verb;
  }
  youVerbOn(t: T) { return this.verbOn('YOU', t); }

  /** The spec a tile runs for someone, or undefined when the tile is inert. */
  specOn(who: 'YOU' | 'GUARD', x: number, y: number): MechanicSpec | undefined {
    return this.registry.get(this.verbOn(who, this.tile(x, y)));
  }
  private statusOf(who: 'YOU' | 'GUARD', x: number, y: number): Status[] {
    return this.specOn(who, x, y)?.tile?.status ?? [];
  }
  private deadlyFor(who: 'YOU' | 'GUARD', x: number, y: number) {
    const tile = this.specOn(who, x, y)?.tile;
    return !!tile && isDeadlyTile({ token: '', tile }) && !tile.status.includes('safe');
  }
  /** Nothing can kill the player while they stand somewhere safe. */
  private playerSafe() {
    const p = this.s.player;
    return this.statusOf('YOU', p.x, p.y).includes('safe');
  }
  /** The guard's behaviour rule ("GUARD CHASES YOU"), not tile rules like "GUARD DIES ON RED". */
  guardRule() { return this.rules.find((r) => r.subject === 'GUARD' && !r.condition); }

  private isBlocking(x: number, y: number) {
    if (this.tile(x, y) === T.WALL) return true;
    const d = this.doorAt(x, y);
    return !!d && !d.open;
  }
  playerCanEnter(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return false;
    const p = this.s.player;
    const phasing = this.statusOf('YOU', p.x, p.y).includes('phasing');
    return (phasing || !this.isBlocking(x, y)) && !this.guardAt(x, y);
  }

  // ---------- turn ----------

  /** dir = null means "wait". Returns [] (no turn spent) if the move bumps. */
  step(dir: Pos | null): WorldEvent[] {
    const s = this.s, p = s.player;
    if (s.dead || s.won) return [];
    const ev: WorldEvent[] = [];

    const prev = { x: p.x, y: p.y };
    if (p.frozen > 0) {
      p.frozen--;
      ev.push({ type: 'wait' });
    } else if (dir) {
      const nx = p.x + dir.x, ny = p.y + dir.y;
      const g = this.guardAt(nx, ny);
      const contact = g && this.playerContact();
      if (g && contact === 'swap') {
        // "YOU SWAP GUARD": walking into a guard trades places with it.
        g.x = p.x; g.y = p.y;
        p.x = nx; p.y = ny;
        ev.push({ type: 'swap', x: nx, y: ny }, { type: 'guard', id: g.id, x: g.x, y: g.y });
        this.onGuardEnter(g, { x: -dir.x, y: -dir.y }, ev);
        this.onEnterTile(dir, ev);
        if (s.dead) return ev;
      } else if (g && contact === 'push') {
        // "YOU PUSH GUARD": walking into a guard shoves it one tile (Sokoban-style).
        const gx = g.x + dir.x, gy = g.y + dir.y;
        if (!this.guardCanOccupy(g, gx, gy)) return [{ type: 'bump' }];
        g.x = gx; g.y = gy;
        ev.push({ type: 'guard', id: g.id, x: gx, y: gy });
        this.onGuardEnter(g, dir, ev);
        p.x = nx; p.y = ny;
        ev.push({ type: 'move', x: nx, y: ny });
        this.onEnterTile(dir, ev);
        if (s.dead) return ev;
      } else {
        if (g && this.guardIntent(g).lethal && !this.playerSafe()) return this.kill('guard', ev);
        if (!this.playerCanEnter(nx, ny)) return [{ type: 'bump' }];
        p.x = nx; p.y = ny;
        ev.push({ type: 'move', x: nx, y: ny });
        this.onEnterTile(dir, ev);
        if (s.dead) return ev;
      }
    } else {
      ev.push({ type: 'wait' });
    }

    this.updateHidden(ev);
    this.pickupKeys(ev);
    this.updateDoors(ev);
    if (this.tile(p.x, p.y) === T.EXIT) { s.won = true; ev.push({ type: 'win' }); return ev; }
    if (this.checkCaught(ev)) return ev;

    this.guardsAct(ev, prev);
    if (s.dead || s.won) return ev;
    this.pickupKeys(ev);
    this.updateDoors(ev);
    this.checkCaught(ev);
    s.turn++;
    return ev;
  }

  private kill(cause: 'red' | 'guard', ev: WorldEvent[]) {
    this.s.dead = true;
    this.s.deathCause = cause;
    ev.push({ type: 'death', cause, x: this.s.player.x, y: this.s.player.y });
    return ev;
  }

  /** Run the spec of the tile the player just entered, then of wherever that left them. */
  private onEnterTile(dir: Pos, ev: WorldEvent[]) {
    const p = this.s.player;
    for (let hops = 0; hops < 60; hops++) {
      const t = this.tile(p.x, p.y);
      const spec = this.specOn('YOU', p.x, p.y);
      if (!spec?.tile) return;
      const object = this.tileRuleObject('YOU', t);
      let moved = false;
      for (const a of spec.tile.onEnter) {
        if (this.s.dead) return;
        moved = this.applyPlayerAction(a, dir, object, ev) || moved;
      }
      if (!moved || this.s.dead || p.frozen > 0) return;
    }
  }

  /** Returns true when the action moved the player, so their new tile runs too. */
  private applyPlayerAction(a: Action, dir: Pos, object: Noun | undefined, ev: WorldEvent[]): boolean {
    const p = this.s.player;
    switch (a.do) {
      case 'die':
        if (!this.playerSafe()) this.kill('red', ev);
        return false;
      case 'kill': {
        const victim = resolveTarget(a.target ?? 'GUARD', object);
        if (victim === 'YOU') {
          if (!this.playerSafe()) this.kill('red', ev);
          return false;
        }
        for (const g of [...this.s.guards]) if (manhattan(g, p) <= 1) this.killGuard(g, ev);
        return false;
      }
      case 'freeze':
        p.frozen = a.amount ?? 2;
        ev.push({ type: 'freeze', turns: p.frozen });
        return false;
      case 'push':
      case 'slide': {
        // `slide` is a push that only stops when something is in the way (ice).
        const far = a.do === 'slide' ? 60 : (a.amount ?? 1);
        let pushed = false;
        for (let i = 0; i < far; i++) {
          const nx = p.x + dir.x, ny = p.y + dir.y;
          if (!this.playerCanEnter(nx, ny)) break;
          p.x = nx; p.y = ny; pushed = true;
          ev.push({ type: a.do === 'slide' ? 'slide' : 'bounce', x: nx, y: ny });
          // Skidding onto something lethal or onto the exit ends the ride there.
          if (this.deadlyFor('YOU', p.x, p.y) || this.tile(p.x, p.y) === T.EXIT) break;
        }
        return pushed;
      }
      case 'teleport': {
        const dest = this.findSpot(resolveTarget(a.target ?? 'START', object) as Target, p);
        if (!dest || (dest.x === p.x && dest.y === p.y) || !this.playerCanEnter(dest.x, dest.y)) return false;
        p.x = dest.x; p.y = dest.y;
        ev.push({ type: 'teleport', x: p.x, y: p.y });
        // The far end does not fire again, or a pair of portals would ping-pong forever.
        return false;
      }
      case 'swap': {
        const g = this.nearestGuard(p);
        if (!g) return false;
        const from = { x: p.x, y: p.y };
        p.x = g.x; p.y = g.y; g.x = from.x; g.y = from.y;
        ev.push({ type: 'move', x: p.x, y: p.y });
        ev.push({ type: 'guard', id: g.id, x: g.x, y: g.y });
        return true;
      }
      case 'unlock':
        for (const d of this.s.doors)
          if (!d.open) { d.open = true; ev.push({ type: 'door', open: true, x: d.x, y: d.y }); }
        return false;
      case 'heal':
        ev.push({ type: 'heal' });
        return false;
      default:
        return false;
    }
  }

  /** The noun a tile rule points at (`EVERYONE DIES ON RED` names none). */
  private tileRuleObject(who: 'YOU' | 'GUARD', t: T): Noun | undefined {
    const cond = t === T.RED ? 'ON_RED' : t === T.BLUE ? 'ON_BLUE' : null;
    if (!cond) return undefined;
    return (this.rules.find((r) => r.subject === who && r.condition === cond) ??
            this.rules.find((r) => r.subject === 'EVERYONE' && r.condition === cond))?.object;
  }

  /** Nearest thing of a kind, for teleports and swaps. Ties break north-west first. */
  private findSpot(target: Target, from: Pos): Pos | null {
    if (target === 'START') return { ...this.level.playerStart };
    if (target === 'TWIN') return this.twinTile(from);
    if (target === 'YOU') return { x: this.s.player.x, y: this.s.player.y };
    if (target === 'GUARD') return this.nearestGuard(from);
    const match = (x: number, y: number): boolean => {
      switch (target) {
        case 'RED': return this.tile(x, y) === T.RED;
        case 'BLUE': return this.tile(x, y) === T.BLUE;
        case 'PLATE': return this.tile(x, y) === T.PLATE;
        case 'EXIT': return this.tile(x, y) === T.EXIT;
        case 'DOOR': return !!this.doorAt(x, y);
        case 'KEY': return !!this.keyAt(x, y);
        default: return false;
      }
    };
    let best: Pos | null = null, bestD = Infinity;
    for (let y = 0; y < this.level.height; y++)
      for (let x = 0; x < this.level.width; x++) {
        if (!match(x, y) || (x === from.x && y === from.y)) continue;
        const d = manhattan({ x, y }, from);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    return best;
  }

  private nearestGuard(from: Pos): GuardState | null {
    let best: GuardState | null = null, bestD = Infinity;
    for (const g of this.s.guards) {
      const d = manhattan(g, from);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  private updateHidden(ev: WorldEvent[]) {
    const p = this.s.player;
    const hidden = this.statusOf('YOU', p.x, p.y).includes('hidden');
    if (hidden !== p.hidden) ev.push({ type: hidden ? 'hide' : 'unhide' });
    p.hidden = hidden;
  }

  private pickupKeys(ev: WorldEvent[]) {
    for (const k of this.s.keys) {
      if (k.taken) continue;
      const p = this.s.player;
      if ((p.x === k.x && p.y === k.y) || this.guardAt(k.x, k.y)) {
        k.taken = true;
        ev.push({ type: 'key', x: k.x, y: k.y });
      }
    }
  }

  private occupied(x: number, y: number) {
    const p = this.s.player;
    return (p.x === x && p.y === y) || !!this.guardAt(x, y);
  }

  private updateDoors(ev: WorldEvent[]) {
    const s = this.s;
    const keyTaken = s.keys.some((k) => k.taken);
    let platePressed = false;
    for (let y = 0; y < this.level.height; y++)
      for (let x = 0; x < this.level.width; x++)
        if (this.level.tiles[y][x] === T.PLATE && this.occupied(x, y)) platePressed = true;
    // "DOOR OPENS ON BLUE": doors open while you stand on blue.
    const p = s.player;
    const unlocks = (verb: Mechanic) => !!this.registry.get(verb)?.tile?.onEnter.some((a) => a.do === 'unlock');
    const byRule = this.rules.some((r) => r.subject === 'DOOR' && unlocks(r.verb) &&
      ((r.condition === 'ON_BLUE' && this.tile(p.x, p.y) === T.BLUE) ||
       (r.condition === 'ON_RED' && this.tile(p.x, p.y) === T.RED)));
    for (const d of s.doors) {
      const open = keyTaken || platePressed || byRule || this.occupied(d.x, d.y);
      if (open !== d.open) { d.open = open; ev.push({ type: 'door', open, x: d.x, y: d.y }); }
    }
  }

  private killGuard(g: GuardState, ev: WorldEvent[]) {
    this.s.guards = this.s.guards.filter((o) => o !== g);
    ev.push({ type: 'guardDeath', id: g.id, x: g.x, y: g.y });
  }

  /** Where a TWIN teleport sends you: the next tile of the same colour, in reading order. */
  private twinTile(from: Pos): Pos | null {
    const t = this.tile(from.x, from.y);
    const all: Pos[] = [];
    for (let y = 0; y < this.level.height; y++)
      for (let x = 0; x < this.level.width; x++)
        if (this.level.tiles[y][x] === t) all.push({ x, y });
    if (all.length < 2) return null;
    const i = all.findIndex((q) => q.x === from.x && q.y === from.y);
    return all[(i + 1) % all.length];
  }

  /** Can a guard physically be moved onto this tile (sliding, teleporting)? Unlike pathing, ignores danger. */
  private guardCanOccupy(g: GuardState, x: number, y: number) {
    const p = this.s.player;
    return !this.isBlocking(x, y) && !(p.x === x && p.y === y) && !this.s.guards.some((o) => o !== g && o.x === x && o.y === y);
  }

  /** What walking into a guard does under a rule like "YOU PUSH GUARD", from that word's spec. */
  private playerContact(): Contact | undefined {
    for (const r of this.rules) {
      if (r.subject !== 'YOU' || r.condition) continue;
      if (r.object && r.object !== 'GUARD' && r.object !== 'EVERYONE') continue;
      const contact = this.registry.get(r.verb)?.contact;
      if (contact) return contact;
    }
    return undefined;
  }

  /** Tile effects for a guard that just stepped in direction `dir`. */
  private onGuardEnter(g: GuardState, dir: Pos, ev: WorldEvent[]) {
    for (let hops = 0; hops < 60; hops++) {
      const tile = this.specOn('GUARD', g.x, g.y)?.tile;
      if (!tile) return;
      let moved = false;
      for (const a of tile.onEnter) {
        if (a.do === 'die' || (a.do === 'kill' && (a.target ?? 'GUARD') !== 'YOU')) {
          if (!tile.status.includes('safe')) { this.killGuard(g, ev); return; }
        } else if (a.do === 'freeze') {
          g.frozen = a.amount ?? 2;
          ev.push({ type: 'guardFreeze', id: g.id, turns: g.frozen });
          return;
        } else if (a.do === 'teleport') {
          const dest = this.findSpot(a.target ?? 'START', g);
          if (dest && this.guardPassable(g)(dest.x, dest.y)) {
            g.x = dest.x; g.y = dest.y;
            ev.push({ type: 'guardTeleport', id: g.id, x: g.x, y: g.y });
          }
          return;
        } else if (a.do === 'push' || a.do === 'slide') {
          const far = a.do === 'slide' ? 60 : (a.amount ?? 1);
          for (let i = 0; i < far; i++) {
            const nx = g.x + dir.x, ny = g.y + dir.y;
            if (!this.guardCanOccupy(g, nx, ny)) break;
            g.x = nx; g.y = ny; moved = true;
            ev.push({ type: a.do === 'slide' ? 'guardSlide' : 'guardBounce', id: g.id, x: nx, y: ny });
          }
        }
      }
      if (!moved) return;
    }
  }

  private checkCaught(ev: WorldEvent[]) {
    const p = this.s.player;
    for (const g of this.s.guards) {
      if (manhattan(g, p) <= 1 && this.guardIntent(g).lethal && !this.playerSafe()) {
        this.kill('guard', ev);
        return true;
      }
    }
    return false;
  }

  // ---------- guards ----------

  /** Guards know the rules: they never walk onto a tile that would kill them. */
  private guardPassable(self: GuardState) {
    const p = this.s.player;
    return (x: number, y: number) =>
      !this.isBlocking(x, y) &&
      !this.deadlyFor('GUARD', x, y) &&
      !(p.x === x && p.y === y) &&
      !this.s.guards.some((o) => o !== self && o.x === x && o.y === y);
  }

  /** Goal predicate for a noun, or null if the guard can't perceive it. */
  private nounGoal(noun: Noun | Target | undefined, self: GuardState): ((x: number, y: number) => boolean) | null {
    if (noun === 'START') {
      const s0 = this.level.playerStart;
      return (x, y) => x === s0.x && y === s0.y;
    }
    const s = this.s;
    switch (noun) {
      case 'YOU':
        if (s.player.hidden) return null;
        return (x, y) => x === s.player.x && y === s.player.y;
      case 'KEY':
        if (!s.keys.some((k) => !k.taken)) return null;
        return (x, y) => !!this.keyAt(x, y);
      case 'EXIT': return (x, y) => this.tile(x, y) === T.EXIT;
      case 'RED': return (x, y) => this.tile(x, y) === T.RED;
      case 'BLUE': return (x, y) => this.tile(x, y) === T.BLUE;
      case 'PLATE': return (x, y) => this.tile(x, y) === T.PLATE && !this.s.guards.some((o) => o !== self && o.x === x && o.y === y);
      case 'DOOR': return (x, y) => !!this.doorAt(x, y);
      case 'GUARD': return (x, y) => this.s.guards.some((o) => o !== self && o.x === x && o.y === y);
    }
    return null;
  }

  /** `prevPlayer`: where the player stood before this turn (lets followers trail like ducklings). */
  guardIntent(g: GuardState, prevPlayer?: Pos): GuardIntent {
    const rule = this.guardRule();
    const verb: Mechanic = rule?.verb ?? 'SLEEP';
    const object = rule?.object;
    const idle: GuardIntent = { verb, lethal: false, path: [], target: null };
    const motion = this.registry.get(verb)?.motion;
    if (!motion || g.frozen > 0) return idle;
    const W = this.level.width, H = this.level.height;
    const pass = this.guardPassable(g);
    const hidden = this.s.player.hidden;
    const aim = resolveTarget(motion.target, object);
    const lethal = motion.lethal && aim === 'YOU' && !hidden;

    switch (motion.mode) {
      case 'approach':
      case 'trail': {
        const goal = this.nounGoal(aim, g);
        // Already standing on what it wants (a helper on its plate): nothing to do.
        if (goal && goal(g.x, g.y)) return { ...idle, lethal };
        if (goal) {
          // Trailing you: once attached, step into the tile you just left.
          const p = this.s.player;
          if (motion.mode === 'trail' && aim === 'YOU' && prevPlayer && (prevPlayer.x !== p.x || prevPlayer.y !== p.y) &&
              manhattan(g, prevPlayer) === 1 && pass(prevPlayer.x, prevPlayer.y)) {
            return { verb, lethal, path: [{ ...prevPlayer }], target: { ...prevPlayer } };
          }
          const free = aim === 'YOU' ? goal : (x: number, y: number) => goal(x, y) && !(p.x === x && p.y === y);
          const path = bfsPath(g, free, pass, W, H) ?? (aim === 'YOU' ? this.closestApproach(g, pass) : null);
          if (path) return { verb, lethal, path, target: path[path.length - 1] };
        }
        // Can't see it (you are hidden, the plate is taken): fall back if the word has one.
        const alt = motion.fallback && this.nounGoal(resolveTarget(motion.fallback, object), g);
        const altPath = alt && bfsPath(g, alt, pass, W, H);
        return altPath ? { verb, lethal, path: altPath, target: altPath[altPath.length - 1] } : { ...idle, lethal };
      }
      case 'avoid': {
        const goal = this.nounGoal(aim, g);
        if (!goal) return idle;
        // Multi-source BFS distance from everything we flee from.
        const dist = new Float64Array(W * H).fill(Infinity);
        const q: number[] = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (goal(x, y)) { dist[y * W + x] = 0; q.push(y * W + x); }
        for (let qi = 0; qi < q.length; qi++) {
          const c = q[qi], cx = c % W, cy = (c / W) | 0;
          for (const d of DIRS) {
            const nx = cx + d.x, ny = cy + d.y;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (dist[ni] !== Infinity || this.isBlocking(nx, ny)) continue;
            dist[ni] = dist[c] + 1; q.push(ni);
          }
        }
        let best: Pos = { x: g.x, y: g.y }, bestD = dist[g.y * W + g.x];
        for (const d of DIRS) {
          const nx = g.x + d.x, ny = g.y + d.y;
          if (!pass(nx, ny)) continue;
          const nd = dist[ny * W + nx];
          if (nd !== Infinity && nd > bestD) { bestD = nd; best = { x: nx, y: ny }; }
        }
        if (best.x === g.x && best.y === g.y) return idle;
        return { verb, lethal: false, path: [best], target: best };
      }
      default:
        // `idle` motion, and words that say nothing about moving: stay put.
        return idle;
    }
  }

  /** Can't reach the player? Walk to the reachable tile nearest to them and lie in wait. */
  private closestApproach(g: GuardState, pass: (x: number, y: number) => boolean): Pos[] | null {
    const W = this.level.width, H = this.level.height, p = this.s.player;
    const dist = distanceMap(g, pass, W, H);
    let best = -1, bestScore = manhattan(g, p) * 1000;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] === Infinity) continue;
      const score = manhattan({ x: i % W, y: (i / W) | 0 }, p) * 1000 + dist[i];
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return null;
    const bx = best % W, by = (best / W) | 0;
    return bfsPath(g, (x, y) => x === bx && y === by, pass, W, H);
  }

  private pushPlayer(g: GuardState, d: Pos, ev: WorldEvent[]) {
    const p = this.s.player;
    const tx = p.x + d.x, ty = p.y + d.y;
    if (!this.playerCanEnter(tx, ty)) return;
    g.x = p.x; g.y = p.y;
    p.x = tx; p.y = ty;
    ev.push({ type: 'pushed', x: tx, y: ty }, { type: 'guard', id: g.id, x: g.x, y: g.y });
    this.onEnterTile(d, ev);
    if (this.s.dead) return;
    this.updateHidden(ev);
    this.pickupKeys(ev);
    this.updateDoors(ev);
    if (this.tile(p.x, p.y) === T.EXIT) { this.s.won = true; ev.push({ type: 'win' }); }
  }

  private guardsAct(ev: WorldEvent[], prevPlayer: Pos) {
    for (const g of [...this.s.guards]) {
      if (g.frozen > 0) { g.frozen--; continue; }
      const intent = this.guardIntent(g, prevPlayer);
      const steps = this.registry.get(intent.verb)?.motion?.steps ?? 1;
      for (let i = 0; i < steps; i++) {
        const next = i === 0 ? intent.path[0] : this.guardIntent(g, prevPlayer).path[0];
        if (!next) break;
        if (next.x === this.s.player.x && next.y === this.s.player.y) {
          // "GUARD PUSHES YOU": shove the player one tile and step into their place.
          if (this.registry.get(intent.verb)?.contact === 'push') {
            this.pushPlayer(g, { x: next.x - g.x, y: next.y - g.y }, ev);
            if (this.s.dead || this.s.won) return;
          }
          // Otherwise never step onto the player; lethal guards catch from an adjacent tile instead.
          break;
        }
        const dir = { x: next.x - g.x, y: next.y - g.y };
        g.x = next.x; g.y = next.y;
        ev.push({ type: 'guard', id: g.id, x: g.x, y: g.y });
        this.onGuardEnter(g, dir, ev);
        if (!this.s.guards.includes(g) || g.frozen > 0) break;
      }
    }
  }
}
