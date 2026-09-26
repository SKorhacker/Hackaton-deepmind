// Every word the world can understand maps to one of these fixed tokens.
// Words typed by the player never become code — only one of these values.

export const MECHANICS = [
  'DIE', 'HIDE', 'HEAL', 'BOUNCE', 'FREEZE', 'FOLLOW',
  'CHASE', 'FLEE', 'HELP', 'SLEEP', 'OPEN', 'ATTACK',
] as const;
export type Mechanic = (typeof MECHANICS)[number];

export const NOUNS = ['YOU', 'GUARD', 'KEY', 'EXIT', 'RED', 'BLUE', 'PLATE', 'DOOR'] as const;
export type Noun = (typeof NOUNS)[number];

export type Condition = 'ON_RED' | 'ON_BLUE' | 'NEAR_YOU';

export type RulePart = 'subject' | 'verb' | 'object' | 'condition';

/** One word players may rewrite, and the tokens it may become. */
export interface EditableSlot {
  part: RulePart;
  allowedReplacements: string[];
}

export interface RuleDefinition {
  subject: Noun;
  verb: Mechanic;
  object?: Noun;
  condition?: Condition;

  /** Shorthand for a rule with a single editable word. */
  editablePart?: RulePart;
  /** Tokens (mechanics or nouns) `editablePart` may become. */
  allowedReplacements?: string[];
  /** Several editable words in the same rule. */
  editableParts?: EditableSlot[];
}

/** Editable words of a rule, whether written as the shorthand or as a list. */
export function editableSlots(rule: RuleDefinition): EditableSlot[] {
  const slots = rule.editablePart
    ? [{ part: rule.editablePart, allowedReplacements: rule.allowedReplacements ?? [] }]
    : [];
  return [...slots, ...(rule.editableParts ?? [])];
}

export function isMechanic(s: string): s is Mechanic {
  return (MECHANICS as readonly string[]).includes(s);
}
export function isNoun(s: string): s is Noun {
  return (NOUNS as readonly string[]).includes(s);
}
