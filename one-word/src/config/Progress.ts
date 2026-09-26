const STORE = 'oneword_progress_v1';
let completed = new Set<number>();
try {
  const saved: unknown = JSON.parse(localStorage.getItem(STORE) ?? '[]');
  if (Array.isArray(saved)) completed = new Set(saved.filter((id): id is number => Number.isInteger(id) && id > 0));
} catch { /* Progress remains available for this session. */ }

export const progress = {
  has(level: number) { return completed.has(level); },
  complete(level: number) {
    const fresh = !completed.has(level);
    completed.add(level);
    try { localStorage.setItem(STORE, JSON.stringify([...completed])); } catch { /* Session fallback. */ }
    return fresh;
  },
};
