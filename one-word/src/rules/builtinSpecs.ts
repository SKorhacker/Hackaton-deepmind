import { MECHANICS } from './RuleDefinition';
import type { MechanicSpec } from './MechanicSpec';

// The twelve shipped mechanics, written in the same DSL a typed word produces.
// They are ordinary specs with no privileges: the simulation cannot tell them
// apart from a word invented at runtime.

export const BUILTIN_SPECS: MechanicSpec[] = [
  { token: 'DIE', glyph: '✕', tile: { onEnter: [{ do: 'die' }], status: [] } },
  { token: 'HIDE', glyph: '◌', tile: { onEnter: [], status: ['hidden'] } },
  { token: 'HEAL', glyph: '✚', tile: { onEnter: [{ do: 'heal' }], status: [] } },
  { token: 'BOUNCE', glyph: '⇡', tile: { onEnter: [{ do: 'push', amount: 1 }], status: [] } },
  { token: 'FREEZE', glyph: '❄', color: '#9fdcff', tile: { onEnter: [{ do: 'freeze', amount: 2 }], status: [] } },
  { token: 'SLEEP', glyph: 'z', color: '#7c7896', tile: { onEnter: [{ do: 'freeze', amount: 3 }], status: [] } },
  { token: 'OPEN', tile: { onEnter: [{ do: 'unlock' }], status: [] } },

  { token: 'CHASE', color: '#ff6a3d', motion: { mode: 'approach', target: 'OBJECT', lethal: true, steps: 1 } },
  {
    token: 'ATTACK', glyph: '✕', color: '#ff3d3d',
    tile: { onEnter: [{ do: 'die' }], status: [] },
    motion: { mode: 'approach', target: 'OBJECT', lethal: true, steps: 1 },
  },
  { token: 'FOLLOW', color: '#ff8fc8', motion: { mode: 'trail', target: 'OBJECT', lethal: false, steps: 1 } },
  { token: 'FLEE', color: '#ffd166', motion: { mode: 'avoid', target: 'OBJECT', lethal: false, steps: 1 } },
  // HELP ignores the noun in the sentence: helpers look for a plate to stand on,
  // and only tag along when there is none.
  { token: 'HELP', color: '#5ee6a0', motion: { mode: 'approach', target: 'PLATE', fallback: 'OBJECT', lethal: false, steps: 1 } },
];

// A word with no tile behaviour is an inert tile, and one with no motion stands
// still — so SLEEP as a guard verb means "does nothing", as it always did.
export const mechanicsWithoutSpec = () => MECHANICS.filter((m) => !BUILTIN_SPECS.some((s) => s.token === m));
