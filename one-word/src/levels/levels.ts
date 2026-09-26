import { buildLevels, type LevelModule } from './registry';

// Every `definitions/NN-name.ts` file is a level: drop a new file in and it shows
// up in the menu, ordered by its number. Nothing else to register.
export const LEVELS = buildLevels(import.meta.glob<LevelModule>('./definitions/*.ts', { eager: true }));
