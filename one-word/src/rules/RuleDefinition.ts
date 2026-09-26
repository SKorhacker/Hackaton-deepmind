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

export interface RuleDefinition {
  subject: Noun;
  verb: Mechanic;
  object?: Noun;
  condition?: Condition;

  /** Omitted for fixed rules. A level has exactly one editable word. */
  editablePart?: RulePart;
  /** Tokens (mechanics or nouns) the editable word may become. */
  allowedReplacements?: string[];
}

export function isMechanic(s: string): s is Mechanic {
  return (MECHANICS as readonly string[]).includes(s);
}
export function isNoun(s: string): s is Noun {
  return (NOUNS as readonly string[]).includes(s);
}
