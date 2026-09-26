import type { RuleDefinition } from './RuleDefinition';
import { editableValue, ruleTokens, withReplacement } from './RuleParser';
import { lookupLocal } from './LocalWordInterpreter';
import { normalizeWord, type InterpretResult, type WordInterpreter } from './WordInterpreter';
import { LLMWordInterpreter } from './LLMWordInterpreter';

// Owns a level's rules and its editable words ("slots").
//
// ONE WORD rule: at most one word may differ from the original sentences at
// any moment. Rewriting a slot restores every other slot.
//
// Interpretation order:
//   1. local dictionary (instant, deterministic)
//   2. LLM, only for words the dictionary doesn't know
//   3. otherwise reject — rules never change to anything unsupported.

export class RuleManager {
  rules: RuleDefinition[];
  /** Indices of rules that contain an editable word. */
  readonly slots: number[];

  constructor(private original: RuleDefinition[], private llm: WordInterpreter | null) {
    this.rules = original.map((r) => ({ ...r }));
    this.slots = original.map((r, i) => (r.editablePart ? i : -1)).filter((i) => i >= 0);
  }

  allowed(slot: number) { return this.rules[slot].allowedReplacements ?? []; }
  tokenAt(slot: number) { return editableValue(this.rules[slot]) ?? ''; }
  originalToken(slot: number) { return editableValue(this.original[slot]) ?? ''; }

  /** The slot whose word currently differs from the original, or -1. */
  get changedSlot() {
    return this.slots.find((i) => this.tokenAt(i) !== this.originalToken(i)) ?? -1;
  }

  /** The word that "solved" the level: the rewritten one, or the first slot if untouched. */
  solutionToken() {
    const c = this.changedSlot;
    return this.tokenAt(c >= 0 ? c : this.slots[0]);
  }

  reset() { this.rules = this.original.map((r) => ({ ...r })); }

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
      const tokens = ruleTokens(this.rules[slot]);
      const sentence = tokens.map((t) => (t.editable ? '___' : t.text)).join(' ');
      const current = tokens.find((t) => t.editable)?.text ?? '';
      const token = await this.llm.interpretWord(word, allowed, { sentence, current });
      if (token && allowed.includes(token)) {
        const note = this.llm instanceof LLMWordInterpreter ? this.llm.lastNote : undefined;
        return { ok: true, token, source: 'ai', note };
      }
    }
    return { ok: false, reason: 'unknown' };
  }

  /** Rewrite one slot; every other slot goes back to its original word. */
  apply(slot: number, token: string) {
    this.rules = this.original.map((r, i) => (i === slot ? withReplacement(r, token) : { ...r }));
  }
}
