import { T, type LevelData, type Pos } from '../levels/LevelData';
import type { Mechanic, Noun, RuleDefinition } from '../rules/RuleDefinition';
import { bfsPath, DIRS, manhattan } from './Pathfinding';

// Deterministic, turn-based simulation. No Phaser in here so the solver in
// tests/ can brute-force every level with every allowed word.
//
// A turn: player acts (move / wait) -> tile effects -> doors -> win check
//         -> guards act -> doors -> catch check.

export interface GuardState { id: number; x: number; y: number }
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
  | { type: 'guard'; id: number; x: number; y: number };

export interface GuardIntent {
  verb: Mechanic;
  lethal: boolean;
  path: Pos[];      // planned route (for telegraphing + debug)
  target: Pos | null;
}

export class World {
  s: WorldState;

  constructor(public level: LevelData, public rules: RuleDefinition[], state?: WorldState) {
    this.s = state ?? World.initialState(level);
    if (!state) this.updateDoors([]);
  }

  static initialState(level: LevelData): WorldState {
    let id = 0;
    return {
      player: { ...level.playerStart, hidden: false, frozen: 0 },
      guards: level.entities.filter((e) => e.type === 'guard').map((e) => ({ id: id++, x: e.x, y: e.y })),
      keys: level.entities.filter((e) => e.type === 'key').map((e) => ({ x: e.x, y: e.y, taken: false })),
      doors: level.entities.filter((e) => e.type === 'door').map((e) => ({ x: e.x, y: e.y, open: false })),
      dead: false, deathCause: null, won: false, turn: 0,
    };
  }

  clone(): World {
    return new World(this.level, this.rules, structuredClone(this.s));
  }

  /** Compact state hash for the solver. */
  key(): string {
    const s = this.s;
    return `${s.player.x},${s.player.y},${s.player.frozen}|${s.guards.map((g) => g.x + ',' + g.y).join(';')}|${s.keys.map((k) => +k.taken).join('')}`;
  }

  setRules(rules: RuleDefinition[]) {
    this.rules = rules;
    const ev: WorldEvent[] = [];
    this.updateHidden(ev);
    this.updateDoors(ev);
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

  /** The verb that applies to YOU on the given tile (from "YOU <VERB> ON RED" style rules). */
  youVerbOn(t: T): Mechanic | undefined {
    const cond = t === T.RED ? 'ON_RED' : t === T.BLUE ? 'ON_BLUE' : null;
    if (!cond) return undefined;
    return this.rules.find((r) => r.subject === 'YOU' && r.condition === cond)?.verb;
  }
  guardRule() { return this.rules.find((r) => r.subject === 'GUARD'); }

  private isBlocking(x: number, y: number) {
    if (this.tile(x, y) === T.WALL) return true;
    const d = this.doorAt(x, y);
    return !!d && !d.open;
  }
  playerCanEnter(x: number, y: number) {
    return !this.isBlocking(x, y) && !this.guardAt(x, y);
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
      if (g && this.guardIntent(g).lethal) return this.kill('guard', ev);
      if (!this.playerCanEnter(nx, ny)) return [{ type: 'bump' }];
      p.x = nx; p.y = ny;
      ev.push({ type: 'move', x: nx, y: ny });
      this.onEnterTile(dir, ev);
      if (s.dead) return ev;
    } else {
      ev.push({ type: 'wait' });
    }

    this.updateHidden(ev);
    this.pickupKeys(ev);
    this.updateDoors(ev);
    if (this.tile(p.x, p.y) === T.EXIT) { s.won = true; ev.push({ type: 'win' }); return ev; }
    if (this.checkCaught(ev)) return ev;

    this.guardsAct(ev, prev);
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

  private onEnterTile(dir: Pos, ev: WorldEvent[]) {
    const p = this.s.player;
    for (let hops = 0; hops < 8; hops++) {
      const verb = this.youVerbOn(this.tile(p.x, p.y));
      switch (verb) {
        case 'DIE':
        case 'ATTACK':
          this.kill('red', ev);
          return;
        case 'BOUNCE': {
          const nx = p.x + dir.x, ny = p.y + dir.y;
          if (!this.playerCanEnter(nx, ny)) return;
          p.x = nx; p.y = ny;
          ev.push({ type: 'bounce', x: nx, y: ny });
          continue; // landing tile may bounce again
        }
        case 'FREEZE':
        case 'SLEEP':
          p.frozen = verb === 'SLEEP' ? 3 : 2;
          ev.push({ type: 'freeze', turns: p.frozen });
          return;
        case 'HEAL':
          ev.push({ type: 'heal' });
          return;
        default:
          return;
      }
    }
  }

  private updateHidden(ev: WorldEvent[]) {
    const p = this.s.player;
    const hidden = this.youVerbOn(this.tile(p.x, p.y)) === 'HIDE';
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
    const byRule = this.rules.some((r) => r.subject === 'DOOR' && r.verb === 'OPEN' &&
      ((r.condition === 'ON_BLUE' && this.tile(p.x, p.y) === T.BLUE) ||
       (r.condition === 'ON_RED' && this.tile(p.x, p.y) === T.RED)));
    for (const d of s.doors) {
      const open = keyTaken || platePressed || byRule || this.occupied(d.x, d.y);
      if (open !== d.open) { d.open = open; ev.push({ type: 'door', open, x: d.x, y: d.y }); }
    }
  }

  private checkCaught(ev: WorldEvent[]) {
    const p = this.s.player;
    for (const g of this.s.guards) {
      if (manhattan(g, p) <= 1 && this.guardIntent(g).lethal) {
        this.kill('guard', ev);
        return true;
      }
    }
    return false;
  }

  // ---------- guards ----------

  private guardPassable(self: GuardState) {
    const p = this.s.player;
    return (x: number, y: number) =>
      !this.isBlocking(x, y) &&
      !(p.x === x && p.y === y) &&
      !this.s.guards.some((o) => o !== self && o.x === x && o.y === y);
  }

  /** Goal predicate for a noun, or null if the guard can't perceive it. */
  private nounGoal(noun: Noun | undefined, self: GuardState): ((x: number, y: number) => boolean) | null {
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
    const W = this.level.width, H = this.level.height;
    const pass = this.guardPassable(g);
    const hidden = this.s.player.hidden;

    switch (verb) {
      case 'CHASE':
      case 'ATTACK':
      case 'FOLLOW': {
        const goal = this.nounGoal(object, g);
        const lethal = verb !== 'FOLLOW' && object === 'YOU' && !hidden;
        if (!goal || goal(g.x, g.y)) return { ...idle, lethal };
        // Following you: once attached, step into the tile you just left.
        const p = this.s.player;
        if (verb === 'FOLLOW' && object === 'YOU' && prevPlayer && (prevPlayer.x !== p.x || prevPlayer.y !== p.y) &&
            manhattan(g, prevPlayer) === 1 && pass(prevPlayer.x, prevPlayer.y)) {
          return { verb, lethal, path: [{ ...prevPlayer }], target: { ...prevPlayer } };
        }
        const path = bfsPath(g, goal, pass, W, H);
        if (!path) return { ...idle, lethal };
        const target = path[path.length - 1];
        return { verb, lethal, path, target };
      }
      case 'HELP': {
        // Helpers hold down the nearest free pressure plate; with none, they tag along.
        const onPlate = this.tile(g.x, g.y) === T.PLATE;
        if (onPlate) return idle;
        const plateGoal = this.nounGoal('PLATE', g)!;
        const path = bfsPath(g, (x, y) => plateGoal(x, y) && !(this.s.player.x === x && this.s.player.y === y), pass, W, H);
        if (path) return { verb, lethal: false, path, target: path[path.length - 1] };
        const you = this.nounGoal('YOU', g);
        const toYou = you && bfsPath(g, you, pass, W, H);
        return toYou ? { verb, lethal: false, path: toYou, target: toYou[toYou.length - 1] } : idle;
      }
      case 'FLEE': {
        const goal = this.nounGoal(object, g);
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
        // SLEEP, FREEZE and verbs that mean nothing for a guard: stay put.
        return idle;
    }
  }

  private guardsAct(ev: WorldEvent[], prevPlayer: Pos) {
    for (const g of this.s.guards) {
      const intent = this.guardIntent(g, prevPlayer);
      if (!intent.path.length) continue;
      const next = intent.path[0];
      // Never step onto the player; lethal guards catch from an adjacent tile instead.
      if (next.x === this.s.player.x && next.y === this.s.player.y) continue;
      g.x = next.x; g.y = next.y;
      ev.push({ type: 'guard', id: g.id, x: g.x, y: g.y });
    }
  }
}
