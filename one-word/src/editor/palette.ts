/** The map characters a level author can paint, in palette order. */
export interface Brush {
  char: string;
  label: string;
  color: string;
  /** Entities/tiles that may only exist once on a map. */
  unique?: boolean;
}

export const BRUSHES: Brush[] = [
  { char: '.', label: 'FLOOR', color: '#221f2e' },
  { char: '#', label: 'WALL', color: '#3b3552' },
  { char: 'R', label: 'RED', color: '#e5484d' },
  { char: 'B', label: 'BLUE', color: '#3e7bfa' },
  { char: 'E', label: 'EXIT', color: '#5ee6a0', unique: true },
  { char: '_', label: 'PLATE', color: '#e0b94f' },
  { char: 'P', label: 'PLAYER', color: '#f4f1ea', unique: true },
  { char: 'G', label: 'GUARD', color: '#ff8c42' },
  { char: 'K', label: 'KEY', color: '#ffd166' },
  { char: 'D', label: 'DOOR', color: '#8b5cf6' },
];

export const BRUSH_BY_CHAR = new Map(BRUSHES.map((b) => [b.char, b]));
