// Global tuning + palette.

export const DEBUG_MODE = false;

export const TILE = 56;

export const COLORS = {
  bg: 0x101d27,
  floor: 0x253740,
  floorAlt: 0x293c45,
  wall: 0x172a34,
  wallTop: 0x4b6064,
  red: 0xde6256,
  redDark: 0xa8323a,
  blue: 0x3e7bfa,
  exit: 0x8fcbb3,
  plate: 0xe0b94f,
  plateDown: 0x9c7f2e,
  door: 0x8b5cf6,
  key: 0xd6b575,
  player: 0xf0e6cd,
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
