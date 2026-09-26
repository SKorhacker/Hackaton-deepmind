// Brute-force solver: for every level and every allowed replacement word,
// BFS over player inputs (4 moves + wait) to find whether the level is
// solvable. Fails if the result differs from the level's declared solutions.
//
//   npm test

import { LEVELS } from '../src/levels/levels';
import { withReplacement } from '../src/rules/RuleParser';
import { World } from '../src/systems/World';
import { DIRS } from '../src/systems/Pathfinding';
import type { Pos } from '../src/levels/LevelData';

const ACTIONS: (Pos | null)[] = [...DIRS, null];

export function solve(world: World, maxStates = 200_000): number | null {
  const seen = new Set([world.key()]);
  let frontier = [world];
  for (let depth = 1; depth < 200 && frontier.length; depth++) {
    const next: World[] = [];
    for (const w of frontier) {
      for (const a of ACTIONS) {
        const c = w.clone();
        const ev = c.step(a);
        if (!ev.length || c.s.dead) continue;
        if (c.s.won) return depth;
        const k = c.key();
        if (seen.has(k)) continue;
        seen.add(k);
        if (seen.size > maxStates) return null;
        next.push(c);
      }
    }
    frontier = next;
  }
  return null;
}

let failed = false;
for (const level of LEVELS) {
  const editable = level.rules.find((r) => r.editablePart)!;
  const found: string[] = [];
  const lines: string[] = [];
  for (const word of editable.allowedReplacements!) {
    const rules = level.rules.map((r) => (r === editable ? withReplacement(r, word) : r));
    const steps = solve(new World(level, rules));
    if (steps !== null) found.push(word);
    lines.push(`   ${word.padEnd(7)} ${steps === null ? 'unsolvable' : `solved in ${steps} turns`}`);
  }
  const expected = [...level.solutions].sort().join(',');
  const got = [...found].sort().join(',');
  const ok = expected === got;
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'} Level ${level.id} ${level.name}: expected [${expected}] got [${got}]`);
  console.log(lines.join('\n'));
}
process.exit(failed ? 1 : 0);
