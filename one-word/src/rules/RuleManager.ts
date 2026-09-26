import type { RuleDefinition } from './RuleDefinition';
import { editableValue, ruleTokens, withReplacement } from './RuleParser';
import { lookupLocal } from './LocalWordInterpreter';
import { normalizeWord, type InterpretResult, type WordInterpreter } from './WordInterpreter';
import { LLMWordInterpreter } from './LLMWordInterpreter';

// Owns a level's rules and the one editable slot. Interpretation order:
//   1. local dictionary (instant, deterministic)
//   2. LLM, only when the dictionary can't place the word in the allowed set
//   3. otherwise reject — the rule is never changed to anything unsupported.

export class RuleManager {
  rules: RuleDefinition[];
  readonly editableIndex: number;

  constructor(private original: RuleDefinition[], private llm: WordInterpreter | null) {
    this.rules = original.map((r) => ({ ...r }));
    this.editableIndex = original.findIndex((r) => r.editablePart);
  }

  get editable() { return this.rules[this.editableIndex]; }
  get allowed() { return this.editable.allowedReplacements ?? []; }
  get currentToken() { return editableValue(this.editable) ?? ''; }

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
      const tokens = ruleTokens(this.editable);
      const sentence = tokens.map((t) => (t.editable ? '___' : t.text)).join(' ');
      const current = tokens.find((t) => t.editable)?.text ?? '';
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
    this.rules[this.editableIndex] = withReplacement(this.editable, token);
  }
}
