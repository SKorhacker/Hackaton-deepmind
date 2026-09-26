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

// ---------- AI word interpreter ----------
// Keys are read from .env.local ONLY in dev, so they are never baked into a
// production build. In production a key can be pasted on the title screen
// (kept in this browser's localStorage). Gemini is used when a Gemini key is
// set, otherwise OpenAI.

// Each env read sits behind its own `import.meta.env.DEV ?` so the production
// build drops the key entirely (tools/check-no-keys.mjs verifies dist/).
function readKey(devKey: string | undefined, storageKey: string): string {
  let stored = '';
  try { stored = localStorage.getItem(storageKey) ?? ''; } catch { /* storage blocked */ }
  return stored || devKey || '';
}
export function geminiKey(): string {
  return readKey(import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) : undefined, 'oneword_gemini_key');
}
export function openAIKey(): string {
  return readKey(import.meta.env.DEV ? (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) : undefined, 'oneword_openai_key');
}
export const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'gemini-3.8-flash';
export const OPENAI_MODEL = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4.1-mini';

/** Creative mode: verb slots accept any word the model can turn into a mechanic. */
export function creativeMode(): boolean {
  try { return localStorage.getItem('oneword_creative') === '1'; } catch { return false; }
}
export function setCreativeMode(on: boolean) {
  try { localStorage.setItem('oneword_creative', on ? '1' : '0'); } catch { /* storage blocked */ }
}

export type AIProvider = { name: 'Gemini' | 'OpenAI'; key: string; model: string };
export function aiProvider(): AIProvider | null {
  const g = geminiKey();
  if (g) return { name: 'Gemini', key: g, model: GEMINI_MODEL };
  const o = openAIKey();
  if (o) return { name: 'OpenAI', key: o, model: OPENAI_MODEL };
  return null;
}
/** Store a pasted key under the right provider (OpenAI keys start with "sk-"). Empty clears both. */
export function setAIKey(key: string) {
  try {
    if (!key) { localStorage.removeItem('oneword_gemini_key'); localStorage.removeItem('oneword_openai_key'); return; }
    localStorage.setItem(key.startsWith('sk-') ? 'oneword_openai_key' : 'oneword_gemini_key', key);
  } catch { /* storage blocked */ }
}
