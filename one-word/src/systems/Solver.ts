import type { LevelData, Pos } from '../levels/LevelData';
import type { RuleDefinition } from '../rules/RuleDefinition';
import { editableValue, levelSlots, withReplacement, type LevelSlot } from '../rules/RuleParser';
import { DIRS } from './Pathfinding';
import { World } from './World';

// Brute-force solver shared by `npm test` and the level editor: BFS over player
// inputs (4 moves + wait) to find whether a level is solvable under a rule set.

const ACTIONS: (Pos | null)[] = [...DIRS, null];

/** Turns to reach the exit, or null if unsolvable within the search budget. */
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

export interface WordResult {
  /** One word per editable slot of the level, in reading order. */
  words: string[];
  steps: number | null;
}

/** How a combination of words is written in level files and test output. */
export function comboKey(words: string | string[]): string {
  return (Array.isArray(words) ? words : [words]).join(' + ');
}

/** Every combination of allowed words, one word per editable slot. */
export function wordCombos(slots: LevelSlot[], maxCombos = 512): string[][] {
  const total = slots.reduce((n, s) => n * s.allowedReplacements.length, 1);
  if (total > maxCombos) {
    throw new Error(`${total} word combinations is too many to brute-force (max ${maxCombos}) — shorten the allowed word lists`);
  }
  return slots.reduce<string[][]>(
    (combos, slot) => combos.flatMap((combo) => slot.allowedReplacements.map((word) => [...combo, word])),
    [[]],
  );
}

/** Solves the level once per combination of its editable words (at most `maxChanges` rewritten). */
export function solveEveryWord(level: LevelData, maxStates?: number): WordResult[] {
  const slots = levelSlots(level.rules);
  if (!slots.length) throw new Error(`level ${level.id} ${level.name} has no editable word`);
  const original = slots.map((s) => editableValue(level.rules[s.ruleIndex], s.part));
  const maxChanges = level.maxChanges ?? 1;
  const combos = wordCombos(slots).filter((words) => words.filter((w, i) => w !== original[i]).length <= maxChanges);
  return combos.map((words) => {
    const rules: RuleDefinition[] = level.rules.map((r) => ({ ...r }));
    slots.forEach((slot, i) => {
      rules[slot.ruleIndex] = withReplacement(rules[slot.ruleIndex], words[i], slot.part);
    });
    return { words, steps: solve(new World(level, rules), maxStates) };
  });
}

// ------------------------------------------------------------ timed solving
// Rewrite any word at any moment, as often as you like, but only one word may
// differ from the original at a time (the ONE WORD rule). Used for levels
// marked `timed`, where no word typed at the start works.

export interface RuleConfig { label: string; rules: RuleDefinition[] }

/** The original rules plus every single-word rewrite. */
export function singleWordConfigs(level: LevelData): RuleConfig[] {
  const out: RuleConfig[] = [{ label: '(original)', rules: level.rules }];
  levelSlots(level.rules).forEach((slot, i) => {
    const current = editableValue(level.rules[slot.ruleIndex], slot.part);
    for (const tok of slot.allowedReplacements) {
      if (tok === current) continue;
      out.push({
        label: `word${i + 1}:${tok}`,
        rules: level.rules.map((r, j) => (j === slot.ruleIndex ? withReplacement(r, tok, slot.part) : r)),
      });
    }
  });
  return out;
}

const MOVES: [string, Pos | null][] = [['U', DIRS[0]], ['R', DIRS[1]], ['D', DIRS[2]], ['L', DIRS[3]], ['.', null]];

/** BFS over (world, rule config). Returns the shortest input script, e.g. "RRD[word2:GUARD]RR". */
export function solveTimed(level: LevelData, maxStates = 3_000_000, only?: string[]): { script: string; final: string } | null {
  const cfgs = singleWordConfigs(level).filter((c, i) => i === 0 || !only || only.includes(c.label));
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
