import type { RuleDefinition } from './RuleDefinition';
import { editableValue, levelSlots, ruleTokens, withReplacement, type LevelSlot } from './RuleParser';
import { lookupLocal } from './LocalWordInterpreter';
import { normalizeWord, type InterpretResult, type WordInterpreter } from './WordInterpreter';

// Owns a level's rules and its editable words ("slots", in reading order; a rule
// may hold several). Slots are addressed by their index in `slots`.
//
// ONE WORD rule: at most `maxChanges` words (normally 1) may differ from the
// original sentences at any moment. Rewriting one more word restores the
// oldest rewritten one.
//
// Interpretation order:
//   1. local dictionary (instant, deterministic)
//   2. LLM, only for words the dictionary doesn't know
//   3. otherwise reject — rules never change to anything unsupported.

export class RuleManager {
  rules: RuleDefinition[];
  readonly slots: LevelSlot[];
  /** Rewritten slots, oldest first. */
  private changed: number[] = [];

  constructor(private original: RuleDefinition[], private llm: WordInterpreter | null, readonly maxChanges = 1) {
    this.rules = original.map((r) => ({ ...r }));
    this.slots = levelSlots(original);
  }

  allowed(slot: number) { return this.slots[slot].allowedReplacements; }
  tokenAt(slot: number) { const s = this.slots[slot]; return editableValue(this.rules[s.ruleIndex], s.part) ?? ''; }
  originalToken(slot: number) { const s = this.slots[slot]; return editableValue(this.original[s.ruleIndex], s.part) ?? ''; }
  /** Current word of every editable slot, in reading order. */
  get currentWords() { return this.slots.map((_, i) => this.tokenAt(i)); }

  /** The most recently rewritten slot that still differs from the original, or -1. */
  get changedSlot() { return this.changed.length ? this.changed[this.changed.length - 1] : -1; }
  get changedSlots(): readonly number[] { return this.changed; }

  /** Key identifying how the level was solved: the word for single-word levels, else every slot's word. */
  solutionKey(): string {
    return this.slots.length === 1 ? this.tokenAt(0) : this.currentWords.join(' + ');
  }

  reset() {
    this.rules = this.original.map((r) => ({ ...r }));
    this.changed = [];
  }

  async interpret(raw: string, slot: number): Promise<InterpretResult> {
    const word = normalizeWord(raw);
    if (word === null) return { ok: false, reason: 'multiple-words' };
    if (word === '') return { ok: false, reason: 'empty' };

    const allowed = this.allowed(slot);
    const local = lookupLocal(word);
    if (local && allowed.includes(local)) return { ok: true, token: local, source: 'local' };
    // A word the dictionary already knows keeps its meaning — the AI only handles unknown words.
    if (local) return { ok: false, reason: 'not-here', token: local };

    if (this.llm) {
      // Only the word being rewritten is blanked; the others read as they are.
      const s = this.slots[slot];
      const tokens = ruleTokens(this.rules[s.ruleIndex]);
      const sentence = tokens.map((t) => (t.part === s.part ? '___' : t.text)).join(' ');
      const current = tokens.find((t) => t.part === s.part)?.text ?? '';
      const token = await this.llm.interpretWord(word, allowed, { sentence, current });
      if (token && allowed.includes(token)) {
        const note = this.llm.lastNote || undefined;
        return { ok: true, token, source: 'ai', note };
      }
    }
    return { ok: false, reason: 'unknown' };
  }

  /** Rewrite one slot. Returns the slots that were restored to keep within `maxChanges`. */
  apply(slot: number, token: string): number[] {
    const words = this.currentWords;
    words[slot] = token;
    this.changed = this.changed.filter((i) => i !== slot);
    if (token !== this.originalToken(slot)) this.changed.push(slot);
    const restored: number[] = [];
    while (this.changed.length > this.maxChanges) restored.push(this.changed.shift()!);
    this.rules = this.original.map((r) => ({ ...r }));
    for (const i of this.changed) {
      const s = this.slots[i];
      this.rules[s.ruleIndex] = withReplacement(this.rules[s.ruleIndex], words[i], s.part);
    }
    return restored;
  }
}
