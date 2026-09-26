// Maps a single typed word to one supported token (mechanic or noun).
// Implementations must only ever return a member of `allowed` or null.

export interface InterpretContext {
  /** The rule with the editable slot blanked, e.g. "GUARD ___ YOU". */
  sentence: string;
  /** The word currently in the slot, e.g. "CHASES". */
  current: string;
}

export interface WordInterpreter {
  interpretWord(input: string, allowed: string[], context?: InterpretContext): Promise<string | null>;
}

export type InterpretResult =
  | { ok: true; token: string; source: 'local' | 'ai'; note?: string }
  | { ok: false; reason: 'multiple-words' | 'empty' | 'unknown' | 'not-here'; token?: string };

/** Lowercase, trim, strip punctuation. Returns null if it isn't exactly one word. */
export function normalizeWord(raw: string): string | null {
  const cleaned = raw.toLowerCase().trim().replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/['-]/g, '');
  if (!cleaned) return '';
  if (/\s/.test(cleaned)) return null;
  return cleaned;
}
