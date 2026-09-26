// Global tuning + palette.

export const DEBUG_MODE = false;

export const TILE = 56;

export const COLORS = {
  bg: 0x14121c,
  floor: 0x221f2e,
  floorAlt: 0x262335,
  wall: 0x3b3552,
  wallTop: 0x4d4669,
  red: 0xe5484d,
  redDark: 0xa8323a,
  blue: 0x3e7bfa,
  exit: 0x5ee6a0,
  plate: 0xe0b94f,
  plateDown: 0x9c7f2e,
  door: 0x8b5cf6,
  key: 0xffd166,
  player: 0xf4f1ea,
  guard: 0xff8c42,
  hidden: 0x8f8aa3,
  heal: 0x7dffb3,
  ice: 0x9fdcff,
};

/** OpenAI config. The key is read ONLY in dev (from .env.local), so it is never baked
 *  into a production build. In production a key can be pasted at runtime (kept in localStorage). */
export function openAIKey(): string {
  const devKey = import.meta.env.DEV ? (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) : undefined;
  let stored = '';
  try { stored = localStorage.getItem('oneword_openai_key') ?? ''; } catch { /* storage blocked */ }
  return stored || devKey || '';
}
export function setOpenAIKey(key: string) {
  try { localStorage.setItem('oneword_openai_key', key); } catch { /* storage blocked */ }
}
export const OPENAI_MODEL = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4.1-mini';
