import { buildLevel, type LevelDefinition } from './defineLevel';
import type { LevelData } from './LevelData';

export interface LevelModule {
  default: LevelDefinition;
}

/** `src/levels/definitions/03-pressure.ts` → 3. The number is the level's rank and its in-game id. */
export function rankFromPath(path: string): number {
  const file = path.split('/').pop() ?? path;
  const match = /^(\d+)/.exec(file);
  if (!match) throw new Error(`level file "${file}" must start with its number, e.g. 06-my-level.ts`);
  return Number(match[1]);
}

/** Turns the level files found on disk into the ordered level list the game plays. */
export function buildLevels(modules: Record<string, LevelModule>): LevelData[] {
  const entries = Object.entries(modules)
    .map(([path, module]) => ({ path, rank: rankFromPath(path), definition: module.default }))
    .sort((a, b) => a.rank - b.rank);

  const byRank = new Map<number, string>();
  for (const entry of entries) {
    const clash = byRank.get(entry.rank);
    if (clash) throw new Error(`level files ${clash} and ${entry.path} both use number ${entry.rank}`);
    byRank.set(entry.rank, entry.path);
    if (!entry.definition) throw new Error(`${entry.path} must \`export default defineLevel({ ... })\``);
  }

  return entries.map((entry) => buildLevel(entry.definition, entry.rank));
}
