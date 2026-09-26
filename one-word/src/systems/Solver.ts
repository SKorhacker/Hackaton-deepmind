import type { LevelData, Pos } from '../levels/LevelData';
import type { RuleDefinition } from '../rules/RuleDefinition';
import { levelSlots, withReplacement, type LevelSlot } from '../rules/RuleParser';
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

/** Solves the level once per combination of its editable words. */
export function solveEveryWord(level: LevelData, maxStates?: number): WordResult[] {
  const slots = levelSlots(level.rules);
  if (!slots.length) throw new Error(`level ${level.id} ${level.name} has no editable word`);
  return wordCombos(slots).map((words) => {
    const rules: RuleDefinition[] = level.rules.map((r) => ({ ...r }));
    slots.forEach((slot, i) => {
      rules[slot.ruleIndex] = withReplacement(rules[slot.ruleIndex], words[i], slot.part);
    });
    return { words, steps: solve(new World(level, rules), maxStates) };
  });
}
