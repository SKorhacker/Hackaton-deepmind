// Brute-force solver.
//
// "Fixed" solve: pick one rewrite before moving, never change it again.
// "Timed" solve: rewrite any word at any moment, as often as you like
//                (still only one word differing from the original at a time).
//
// Normal levels: the fixed-solve winners must equal level.solutions.
// Timed levels (level.timed): no fixed solve may exist, a timed one must.
//
//   npm test

import { LEVELS } from '../src/levels/levels';
import { editableValue, withReplacement } from '../src/rules/RuleParser';
import type { RuleDefinition } from '../src/rules/RuleDefinition';
import type { LevelData, Pos } from '../src/levels/LevelData';
import { World } from '../src/systems/World';
import { DIRS } from '../src/systems/Pathfinding';

const MOVES: [string, Pos | null][] = [['U', DIRS[0]], ['R', DIRS[1]], ['D', DIRS[2]], ['L', DIRS[3]], ['.', null]];

interface Config { label: string; token: string; rules: RuleDefinition[] }

/** Every rule set reachable with the ONE WORD rule: the original + each single-word rewrite. */
export function configs(level: LevelData): Config[] {
  const out: Config[] = [{ label: '(original)', token: '', rules: level.rules }];
  level.rules.forEach((r, i) => {
    if (!r.editablePart) return;
    for (const tok of r.allowedReplacements ?? []) {
      if (tok === editableValue(r)) continue;
      out.push({ label: `rule${i + 1}:${tok}`, token: tok, rules: level.rules.map((x, j) => (j === i ? withReplacement(x, tok) : x)) });
    }
  });
  return out;
}

export function solveFixed(world: World, maxStates = 300_000): number | null {
  const seen = new Set([world.key()]);
  let frontier = [world];
  for (let depth = 1; depth < 300 && frontier.length; depth++) {
    const next: World[] = [];
    for (const w of frontier) {
      for (const [, a] of MOVES) {
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

/** BFS over (world, rule config). Returns the shortest input script, e.g. "RRD[rule2:GUARD]RR". */
export function solveTimed(level: LevelData, maxStates = 3_000_000, only?: string[]): { script: string; final: string } | null {
  const cfgs = configs(level).filter((c, i) => i === 0 || !only || only.includes(c.label));
  const start = new World(level, cfgs[0].rules);
  type Node = { w: World; c: number; script: string };
  const seen = new Set([start.key() + '#0']);
  let frontier: Node[] = [{ w: start, c: 0, script: '' }];
  while (frontier.length) {
    const next: Node[] = [];
    for (const n of frontier) {
      const push = (w: World, c: number, script: string) => {
        if (w.s.dead) return false;
        if (w.s.won) return true;
        const k = w.key() + '#' + c;
        if (seen.has(k)) return false;
        seen.add(k);
        next.push({ w, c, script });
        return false;
      };
      for (const [name, a] of MOVES) {
        const w = n.w.clone();
        if (!w.step(a).length) continue;
        if (push(w, n.c, n.script + name)) return { script: n.script + name, final: cfgs[n.c].label };
      }
      for (let j = 0; j < cfgs.length; j++) {
        if (j === n.c) continue;
        const w = n.w.clone();
        w.setRules(cfgs[j].rules);
        if (push(w, j, `${n.script}[${cfgs[j].label}]`)) return { script: `${n.script}[${cfgs[j].label}]`, final: cfgs[j].label };
      }
      if (seen.size > maxStates) return null;
    }
    frontier = next;
  }
  return null;
}

// ---------------------------------------------------------------- run
if (process.argv[1]?.includes('solutions.test')) {
  let failed = false;
  for (const level of LEVELS) {
    const winners: string[] = [];
    const lines: string[] = [];
    for (const cfg of configs(level)) {
      const steps = solveFixed(new World(level, cfg.rules));
      if (steps !== null && cfg.token) winners.push(cfg.token);
      lines.push(`   ${cfg.label.padEnd(16)} ${steps === null ? 'unsolvable' : `solved in ${steps} turns`}`);
    }
    let ok: boolean;
    let summary: string;
    if (level.timed) {
      const t = solveTimed(level);
      ok = winners.length === 0 && t !== null;
      summary = `no fixed solution: ${winners.length === 0 ? 'yes' : `NO [${winners}]`}; timed: ${t ? `${t.script}  (ends as ${t.final})` : 'UNSOLVABLE'}`;
    } else {
      const expected = [...level.solutions].sort().join(',');
      const got = [...winners].sort().join(',');
      ok = expected === got;
      summary = `expected [${expected}] got [${got}]`;
    }
    if (!ok) failed = true;
    console.log(`${ok ? 'PASS' : 'FAIL'} Level ${level.id} ${level.name}: ${summary}`);
    if (!ok || process.env.VERBOSE) console.log(lines.join('\n'));
  }
  process.exit(failed ? 1 : 0);
}
