// Dynamic mechanics: words nobody hardcoded.
//
// Two things have to hold for the prototype to be honest:
//   1. a model's answer is data, and bad data degrades instead of breaking;
//   2. a spec the game has never seen produces real, deterministic behaviour,
//      so the solver can still prove what is and isn't winnable.
//
//   npm test

import { loadLevels } from './loadLevels';
import { conjugate, withReplacement } from '../src/rules/RuleParser';
import { parseSpec, type MechanicSpec } from '../src/rules/MechanicSpec';
import { MechanicRegistry } from '../src/rules/MechanicRegistry';
import { BUILTIN_SPECS, mechanicsWithoutSpec } from '../src/rules/builtinSpecs';
import { World } from '../src/systems/World';
import { DIRS } from '../src/systems/Pathfinding';
import { solve } from '../src/systems/Solver';

let failed = false;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- validation

check('every shipped mechanic has a spec', mechanicsWithoutSpec().length === 0, mechanicsWithoutSpec().join(','));
check('junk is not a mechanic', parseSpec('NOPE', { tile: { onEnter: [{ do: 'explode' }], status: ['immortal'] } }) === null);
check('a spec that says nothing is rejected', parseSpec('NOPE', {}) === null);
check('tokens with digits are rejected', parseSpec('R2D2', { tile: { onEnter: [{ do: 'die' }], status: [] } }) === null);

const clamped = parseSpec('DEEPFREEZE', { tile: { onEnter: [{ do: 'freeze', amount: 9999 }], status: [] } });
check('absurd numbers are clamped', clamped?.tile?.onEnter[0].amount === 5, JSON.stringify(clamped?.tile));

const overreach = parseSpec('SWARM', {
  motion: { mode: 'avoid', target: 'YOU', lethal: true, steps: 40 },
  tile: { onEnter: [{ do: 'die' }, { do: 'die' }, { do: 'die' }, { do: 'die' }, { do: 'die' }], status: [] },
});
check('a fleeing guard cannot be lethal', overreach?.motion?.lethal === false);
check('speed is capped', overreach?.motion?.steps === 3);
check('action lists are capped', overreach?.tile?.onEnter.length === 3);

// ---------------------------------------------------------------- simulation

const LEVELS = await loadLevels();
const RED = LEVELS[0];       // YOU DIE ON RED — a lava band between you and the exit
const GUARD = LEVELS[1];     // GUARD CHASES YOU

/** A world running the level with its verb replaced by an invented one. */
function worldWith(level: typeof RED, spec: MechanicSpec, ruleIndex = 0) {
  const reg = new MechanicRegistry([...BUILTIN_SPECS, spec]);
  const rules = level.rules.map((r, i) => (i === ruleIndex ? withReplacement(r, spec.token, 'verb') : r));
  return new World(level, rules, undefined, reg);
}

const MELT = parseSpec('MELT', { tile: { onEnter: [{ do: 'die' }], status: [] } })!;
check('an invented deadly word is as fatal as DIE', solve(worldWith(RED, MELT)) === null);

const WARP = parseSpec('WARP', { tile: { onEnter: [{ do: 'teleport', target: 'EXIT' }], status: [] } })!;
check('an invented teleport wins a level DIE cannot', solve(worldWith(RED, WARP)) !== null);

// GHOST: the red band stops killing and starts letting you through walls.
const GHOST = parseSpec('GHOST', { tile: { onEnter: [], status: ['phasing'] } })!;
const ghost = worldWith(RED, GHOST);
ghost.step(DIRS[1]); ghost.step(DIRS[1]); ghost.step(DIRS[1]);  // onto the red band
const onRed = { ...ghost.s.player };
ghost.step(DIRS[0]); ghost.step(DIRS[0]); ghost.step(DIRS[0]);  // up, into (and through) the wall
check('phasing walks through walls', ghost.s.player.y < onRed.y && !ghost.s.dead,
  `${onRed.x},${onRed.y} -> ${ghost.s.player.x},${ghost.s.player.y}`);

// SHADOW: a guard that trails you two tiles a turn instead of chasing.
const SHADOW = parseSpec('SHADOW', { motion: { mode: 'trail', target: 'OBJECT', lethal: false, steps: 2 } })!;
const shadow = worldWith(GUARD, SHADOW);
const g0 = { ...shadow.s.guards[0] };
shadow.step(DIRS[1]);
const moved = Math.abs(shadow.s.guards[0].x - g0.x) + Math.abs(shadow.s.guards[0].y - g0.y);
check('a two-step word really moves twice', moved === 2, `moved ${moved}`);
check('a harmless invented guard lets you out', solve(shadow.clone()) !== null);

// A word invented in one world must not leak into another.
check('inventing a word leaves the shipped ones alone',
  new MechanicRegistry().tokens().length === BUILTIN_SPECS.length);

// Same spec, same world, twice: the sim stays deterministic.
const a = worldWith(RED, WARP), b = worldWith(RED, WARP);
const script = [DIRS[1], DIRS[1], DIRS[1], DIRS[0], null];
for (const d of script) { a.step(d); b.step(d); }
check('invented mechanics are deterministic', a.key() === b.key(), `${a.key()} vs ${b.key()}`);

// Invented words land in a sentence, so a word typed in the third person
// already must not be conjugated twice.
check('a word already in the third person reads as typed',
  conjugate('HELPS', 'GUARD') === 'HELPS' && conjugate('DIES', 'GUARD') === 'DIES',
  `${conjugate('HELPS', 'GUARD')} / ${conjugate('DIES', 'GUARD')}`);
check('sibilant stems still take -ES',
  conjugate('PASS', 'GUARD') === 'PASSES' && conjugate('CHASE', 'GUARD') === 'CHASES',
  `${conjugate('PASS', 'GUARD')} / ${conjugate('CHASE', 'GUARD')}`);
check('YOU takes the bare verb',
  conjugate('HELPS', 'YOU') === 'HELP' && conjugate('FLY', 'YOU') === 'FLY');

process.exit(failed ? 1 : 0);
