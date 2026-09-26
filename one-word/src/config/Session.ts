// In-memory progress for this browser session (no save system by design).

export interface LevelResult { time: number; words: number; deaths: number; solution: string }

export const session = {
  tutorialDone: false,
  found: new Map<number, Set<string>>(),
  best: new Map<number, LevelResult>(),
};

export function foundFor(levelId: number): Set<string> {
  let s = session.found.get(levelId);
  if (!s) session.found.set(levelId, (s = new Set()));
  return s;
}

export const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
