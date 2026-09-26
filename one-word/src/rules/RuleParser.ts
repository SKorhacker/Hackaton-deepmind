import type { Mechanic, RuleDefinition, RulePart } from './RuleDefinition';

// Turns a rule into display tokens: "GUARD CHASES [YOU]".

export interface RuleToken {
  text: string;
  part: RulePart;
  editable: boolean;
}

const INTRANSITIVE: Mechanic[] = ['SLEEP', 'FREEZE', 'DIE', 'HIDE', 'HEAL', 'BOUNCE', 'OPEN'];

export function conjugate(verb: Mechanic, subject: string): string {
  if (subject === 'YOU') return verb;
  if (/(S|SH|CH|X|Z)$/.test(verb)) return verb + 'ES';
  return verb + 'S';
}

const CONDITION_TEXT: Record<string, string> = {
  ON_RED: 'ON RED',
  ON_BLUE: 'ON BLUE',
  NEAR_YOU: 'NEAR YOU',
};

export function ruleTokens(rule: RuleDefinition): RuleToken[] {
  const t: RuleToken[] = [];
  const ed = (p: RulePart) => rule.editablePart === p;
  t.push({ text: rule.subject, part: 'subject', editable: ed('subject') });
  t.push({ text: conjugate(rule.verb, rule.subject), part: 'verb', editable: ed('verb') });
  if (rule.object && (ed('object') || !INTRANSITIVE.includes(rule.verb))) {
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

/** The current value of the editable word, as a mechanic/noun token. */
export function editableValue(rule: RuleDefinition): string | undefined {
  switch (rule.editablePart) {
    case 'subject': return rule.subject;
    case 'verb': return rule.verb;
    case 'object': return rule.object;
    case 'condition': return rule.condition;
  }
  return undefined;
}

export function withReplacement(rule: RuleDefinition, token: string): RuleDefinition {
  const r = { ...rule };
  switch (rule.editablePart) {
    case 'subject': r.subject = token as RuleDefinition['subject']; break;
    case 'verb': r.verb = token as Mechanic; break;
    case 'object': r.object = token as RuleDefinition['object']; break;
    case 'condition': r.condition = token as RuleDefinition['condition']; break;
  }
  return r;
}
