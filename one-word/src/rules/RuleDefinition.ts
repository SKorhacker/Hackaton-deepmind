// Nouns are closed: they name things that actually exist in a level.
// Verbs are open — a mechanic is whatever token a `MechanicSpec` is registered
// under, so the world can learn words that were never shipped with the game.
// Typed words still never become code: they become a spec, and only a spec.

export const MECHANICS = [
  'DIE', 'HIDE', 'HEAL', 'BOUNCE', 'FREEZE', 'FOLLOW',
  'CHASE', 'FLEE', 'HELP', 'SLEEP', 'OPEN', 'ATTACK',
] as const;
export type BuiltinMechanic = (typeof MECHANICS)[number];
export type Mechanic = BuiltinMechanic | (string & {});

export const NOUNS = ['YOU', 'GUARD', 'EVERYONE', 'KEY', 'EXIT', 'RED', 'BLUE', 'PLATE', 'DOOR'] as const;
export type Noun = (typeof NOUNS)[number];

export type Condition = 'ON_RED' | 'ON_BLUE' | 'NEAR_YOU';

export type RulePart = 'subject' | 'verb' | 'object' | 'condition';

export interface RuleDefinition {
  subject: Noun;
  verb: Mechanic;
  object?: Noun;
  condition?: Condition;

  /** Omitted for fixed rules. Levels may have several editable words, but only
   *  one word may differ from the original sentence set at any moment. */
  editablePart?: RulePart;
  /** Tokens (mechanics or nouns) the editable word may become. */
  allowedReplacements?: string[];
}

export function isMechanic(s: string): s is BuiltinMechanic {
  return (MECHANICS as readonly string[]).includes(s);
}
export function isNoun(s: string): s is Noun {
  return (NOUNS as readonly string[]).includes(s);
}
