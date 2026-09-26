// Node counterpart of src/levels/levels.ts: the game discovers level files with
// Vite's import.meta.glob, tests discover the same files from disk.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLevels, type LevelModule } from '../src/levels/registry';
import type { LevelData } from '../src/levels/LevelData';

const DEFINITIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/levels/definitions');

export async function loadLevels(): Promise<LevelData[]> {
  const modules: Record<string, LevelModule> = {};
  for (const file of readdirSync(DEFINITIONS).filter((f) => f.endsWith('.ts'))) {
    modules[`./definitions/${file}`] = (await import(pathToFileURL(path.join(DEFINITIONS, file)).href)) as LevelModule;
  }
  return buildLevels(modules);
}
