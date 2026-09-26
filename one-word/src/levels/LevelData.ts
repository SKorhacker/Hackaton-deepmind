import type { RuleDefinition } from '../rules/RuleDefinition';

export const T = {
  FLOOR: 0,
  WALL: 1,
  RED: 2,
  BLUE: 3,
  EXIT: 4,
  PLATE: 5,
} as const;
export type T = (typeof T)[keyof typeof T];

export interface Pos { x: number; y: number }

export type EntityType = 'guard' | 'key' | 'door';

export interface LevelEntity extends Pos {
  type: EntityType;
}

export interface LevelData {
  id: number;
  name: string;
  width: number;
  height: number;
  tiles: T[][];
  playerStart: Pos;
  exit: Pos;
  entities: LevelEntity[];
  /** All rules; at least one has an editable word. */
  rules: RuleDefinition[];
  /**
   * Replacements known to solve the level (checked by tests/solutions.test.ts):
   * a token per solution, or one token per editable word when there are several.
   */
  solutions: (string | string[])[];
  /** Example words shown when the player types something the world doesn't understand. */
  hintWords?: string[];
  tutorial?: boolean;
}

// Map legend:
//   # wall   . floor   R red   B blue   E exit   _ pressure plate
//   P player G guard   K key   D door
// Every door opens while any plate is pressed, or forever once the key is taken.
export function parseMap(map: string[]): Pick<LevelData, 'width' | 'height' | 'tiles' | 'playerStart' | 'exit' | 'entities'> {
  const height = map.length;
  const width = map[0].length;
  const tiles: T[][] = [];
  const entities: LevelEntity[] = [];
  let playerStart: Pos = { x: 1, y: 1 };
  let exit: Pos = { x: 1, y: 1 };
  for (let y = 0; y < height; y++) {
    if (map[y].length !== width) throw new Error(`map row ${y} has length ${map[y].length}, expected ${width}`);
    const row: T[] = [];
    for (let x = 0; x < width; x++) {
      const c = map[y][x];
      let tile: T = T.FLOOR;
      switch (c) {
        case '#': tile = T.WALL; break;
        case 'R': tile = T.RED; break;
        case 'B': tile = T.BLUE; break;
        case 'E': tile = T.EXIT; exit = { x, y }; break;
        case '_': tile = T.PLATE; break;
        case 'P': playerStart = { x, y }; break;
        case 'G': entities.push({ type: 'guard', x, y }); break;
        case 'K': entities.push({ type: 'key', x, y }); break;
        case 'D': entities.push({ type: 'door', x, y }); break;
        case '.': break;
        default: throw new Error(`unknown map char '${c}'`);
      }
      row.push(tile);
    }
    tiles.push(row);
  }
  return { width, height, tiles, playerStart, exit, entities };
}
