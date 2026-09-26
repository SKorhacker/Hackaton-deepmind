import type { Pos } from '../levels/LevelData';

export const DIRS: Pos[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
];

export type Passable = (x: number, y: number) => boolean;

/** Shortest path from `from` to the nearest tile matching `isGoal`, excluding `from`. */
export function bfsPath(from: Pos, isGoal: (x: number, y: number) => boolean, passable: Passable, w: number, h: number): Pos[] | null {
  const prev = new Int32Array(w * h).fill(-1);
  const start = from.y * w + from.x;
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % w, cy = (cur / w) | 0;
    if (cur !== start && isGoal(cx, cy)) {
      const path: Pos[] = [];
      for (let n = cur; n !== start; n = prev[n]) path.push({ x: n % w, y: (n / w) | 0 });
      return path.reverse();
    }
    for (const d of DIRS) {
      const nx = cx + d.x, ny = cy + d.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -1) continue;
      if (!passable(nx, ny) && !isGoal(nx, ny)) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return null;
}

/** BFS distance from `from` to every reachable tile (Infinity if unreachable). */
export function distanceMap(from: Pos, passable: Passable, w: number, h: number): Float64Array {
  const dist = new Float64Array(w * h).fill(Infinity);
  dist[from.y * w + from.x] = 0;
  const queue = [from.y * w + from.x];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % w, cy = (cur / w) | 0;
    for (const d of DIRS) {
      const nx = cx + d.x, ny = cy + d.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== Infinity || !passable(nx, ny)) continue;
      dist[ni] = dist[cur] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
