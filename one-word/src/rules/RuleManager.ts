import type { RuleDefinition, RulePart } from './RuleDefinition';
import { editableValue, levelSlots, ruleTokens, withReplacement, type LevelSlot } from './RuleParser';
import { lookupLocal } from './LocalWordInterpreter';
import { normalizeWord, type InterpretResult, type WordInterpreter } from './WordInterpreter';
import { LLMWordInterpreter } from './LLMWordInterpreter';

// Owns a level's rules and its editable words (a level may have several, in one
// rule or spread over rules); `select` points at the one being rewritten.
// Interpretation order:
//   1. local dictionary (instant, deterministic)
//   2. LLM, only when the dictionary can't place the word in the allowed set
//   3. otherwise reject — the rule is never changed to anything unsupported.

export class RuleManager {
  rules: RuleDefinition[];
  readonly slots: LevelSlot[];
  private active = 0;

  constructor(private original: RuleDefinition[], private llm: WordInterpreter | null) {
    this.rules = original.map((r) => ({ ...r }));
    this.slots = levelSlots(original);
  }

  get slot() { return this.slots[this.active]; }
  get editable() { return this.rules[this.slot.ruleIndex]; }
  get allowed() { return this.slot.allowedReplacements; }
  get currentToken() { return editableValue(this.editable, this.slot.part) ?? ''; }
  /** Current word of every editable slot, in reading order. */
  get currentWords() {
    return this.slots.map((s) => editableValue(this.rules[s.ruleIndex], s.part) ?? '');
  }

  /** Point the word editor at one of the level's editable words. */
  select(ruleIndex: number, part: RulePart) {
    const i = this.slots.findIndex((s) => s.ruleIndex === ruleIndex && s.part === part);
    if (i >= 0) this.active = i;
  }

  reset() { this.rules = this.original.map((r) => ({ ...r })); }

  async interpret(raw: string): Promise<InterpretResult> {
    const word = normalizeWord(raw);
    if (word === null) return { ok: false, reason: 'multiple-words' };
    if (word === '') return { ok: false, reason: 'empty' };

    const local = lookupLocal(word);
    if (local && this.allowed.includes(local)) return { ok: true, token: local, source: 'local' };

    // A word the dictionary already knows keeps its meaning — the AI only handles unknown words.
    if (local) return { ok: false, reason: 'not-here', token: local };

    if (this.llm) {
      // Only the word being rewritten is blanked; the others read as they are.
      const tokens = ruleTokens(this.editable);
      const sentence = tokens.map((t) => (t.part === this.slot.part ? '___' : t.text)).join(' ');
      const current = tokens.find((t) => t.part === this.slot.part)?.text ?? '';
      const token = await this.llm.interpretWord(word, this.allowed, { sentence, current });
      if (token && this.allowed.includes(token)) {
        const note = this.llm instanceof LLMWordInterpreter ? this.llm.lastNote : undefined;
        return { ok: true, token, source: 'ai', note };
      }
    }
    if (local) return { ok: false, reason: 'not-here', token: local };
    return { ok: false, reason: 'unknown' };
  }

  apply(token: string) {
    this.rules[this.slot.ruleIndex] = withReplacement(this.editable, token, this.slot.part);
  }
}
