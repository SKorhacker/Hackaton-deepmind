import { editableSlots, type Mechanic, type RuleDefinition, type RulePart } from './RuleDefinition';
import { registry } from './MechanicRegistry';

// Turns a rule into display tokens: "GUARD CHASES [YOU]".

export interface RuleToken {
  text: string;
  part: RulePart;
  editable: boolean;
}

/** A word takes an object only if it says something about moving towards or away from one. */
const takesObject = (verb: Mechanic) => !!registry.get(verb)?.motion;

// A player may type a verb that is already third person ("HELPS", "DIES").
// A single S after another letter reads as that ending; doubled or sibilant
// endings (PASS, RUSH, FIX) are part of the stem and still take -ES.
const inflected = (verb: string) => /[^SHCXZ]S$/.test(verb) && verb.length > 3;

export function conjugate(verb: Mechanic, subject: string): string {
  if (subject === 'YOU') return inflected(verb) ? verb.slice(0, -1) : verb;
  if (inflected(verb)) return verb;
  if (/(S|SH|CH|X|Z)$/.test(verb)) return verb + 'ES';
  return verb + 'S';
}

const CONDITION_TEXT: Record<string, string> = {
  ON_RED: 'ON RED',
  ON_BLUE: 'ON BLUE',
  NEAR_YOU: 'NEAR YOU',
};

/** Every editable word of a level, in reading order. */
export interface LevelSlot {
  ruleIndex: number;
  part: RulePart;
  allowedReplacements: string[];
}

export function levelSlots(rules: RuleDefinition[]): LevelSlot[] {
  return rules.flatMap((rule, ruleIndex) => editableSlots(rule).map((slot) => ({ ruleIndex, ...slot })));
}

export function ruleTokens(rule: RuleDefinition): RuleToken[] {
  const t: RuleToken[] = [];
  const parts = new Set(editableSlots(rule).map((s) => s.part));
  const ed = (p: RulePart) => parts.has(p);
  t.push({ text: rule.subject, part: 'subject', editable: ed('subject') });
  t.push({ text: conjugate(rule.verb, rule.subject), part: 'verb', editable: ed('verb') });
  if (rule.object && (ed('object') || takesObject(rule.verb))) {
    t.push({ text: rule.object, part: 'object', editable: ed('object') });
  }
  if (rule.condition) {
    t.push({ text: CONDITION_TEXT[rule.condition], part: 'condition', editable: ed('condition') });
  }
  return t;
}

export function ruleText(rule: RuleDefinition): string {
  return ruleTokens(rule).map((t) => t.text).join(' ');
}

/** The current value of an editable word, as a mechanic/noun token. */
export function editableValue(rule: RuleDefinition, part: RulePart): string | undefined {
  switch (part) {
    case 'subject': return rule.subject;
    case 'verb': return rule.verb;
    case 'object': return rule.object;
    case 'condition': return rule.condition;
  }
  return undefined;
}

export function withReplacement(rule: RuleDefinition, token: string, part: RulePart): RuleDefinition {
  const r = { ...rule };
  switch (part) {
    case 'subject': r.subject = token as RuleDefinition['subject']; break;
    case 'verb': r.verb = token as Mechanic; break;
    case 'object': r.object = token as RuleDefinition['object']; break;
    case 'condition': r.condition = token as RuleDefinition['condition']; break;
  }
  return r;
}
