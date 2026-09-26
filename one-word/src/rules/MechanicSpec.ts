// A mechanic as data.
//
// The world used to understand exactly twelve verbs, each one a `case` in the
// simulation. Here a mechanic is a small declarative spec instead: what a tile
// does to whoever steps on it, and how an actor that obeys the word moves.
// Everything the player types ends up as one of these — validated, clamped,
// and executed by `World`. A spec is data, never code.

import type { Noun } from './RuleDefinition';

/** Where an action or a motion points. OBJECT = whatever noun the rule names. */
export const TARGETS = ['OBJECT', 'YOU', 'GUARD', 'KEY', 'EXIT', 'RED', 'BLUE', 'PLATE', 'DOOR', 'START', 'TWIN'] as const;
export type Target = (typeof TARGETS)[number];

export const ACTIONS = ['die', 'kill', 'freeze', 'push', 'slide', 'teleport', 'swap', 'unlock', 'heal', 'nothing'] as const;
export type ActionKind = (typeof ACTIONS)[number];

/** One thing that happens to the actor standing on the tile. */
export interface Action {
  do: ActionKind;
  /** `freeze`: turns lost (1-5). `push`: tiles moved along the entry direction (1-8); `slide` keeps going. */
  amount?: number;
  /** `teleport` destination / `kill` and `swap` victim. */
  target?: Target;
}

/** What walking into a guard does, for words about touching rather than tiles or routes. */
export const CONTACTS = ['push', 'swap'] as const;
export type Contact = (typeof CONTACTS)[number];

/** Lasting states granted while the actor stands on the tile. */
export const STATUSES = ['hidden', 'phasing', 'safe'] as const;
export type Status = (typeof STATUSES)[number];

export interface TileBehavior {
  onEnter: Action[];
  /** Held for as long as the actor stays on the tile. */
  status: Status[];
}

export const MOTIONS = ['approach', 'avoid', 'trail', 'idle'] as const;
export type MotionMode = (typeof MOTIONS)[number];

export interface MotionBehavior {
  mode: MotionMode;
  target: Target;
  /** Used when `target` is nowhere to be found (how HELP falls back to tagging along). */
  fallback?: Target;
  /** Touching the player kills them. Only ever lethal towards YOU. */
  lethal: boolean;
  /** Tiles moved per turn (1-3). */
  steps: number;
}

export interface MechanicSpec {
  /** Uppercase token this spec is registered under, e.g. `DIE` or `TELEPORT`. */
  token: string;
  /** What a RED/BLUE tile governed by this word does. Absent = the tile is inert. */
  tile?: TileBehavior;
  /** How a guard governed by this word behaves. Absent = it stands still. */
  motion?: MotionBehavior;
  /** What happens when this word's actor walks into someone. Absent = they block each other. */
  contact?: Contact;
  /** One character drawn on tiles running this mechanic. */
  glyph?: string;
  /** `#rrggbb` used for guards running this mechanic. */
  color?: string;
  /** Short line shown to the player: how the world read their word. */
  note?: string;
  /** True for specs invented at runtime rather than shipped with the game. */
  dynamic?: boolean;
}

export const isDeadlyTile = (spec: MechanicSpec | undefined) =>
  !!spec?.tile?.onEnter.some((a) => a.do === 'die');

/** A spec's target resolved against the rule's own object noun. */
export function resolveTarget(target: Target, object: Noun | undefined): Noun | undefined {
  return target === 'OBJECT' ? object : (target as Noun);
}

// ---------------------------------------------------------------- validation

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : dflt;
  return Math.min(hi, Math.max(lo, v));
};
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as T)
  : typeof v === 'string' && (list as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as T)
  : null;

const MAX_ACTIONS = 3;

function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = oneOf(ACTIONS, o.do);
  if (!kind) return null;
  const action: Action = { do: kind };
  if (kind === 'freeze') action.amount = clamp(o.amount, 1, 5, 2);
  if (kind === 'push') action.amount = clamp(o.amount, 1, 8, 1);
  if (kind === 'teleport' || kind === 'swap' || kind === 'kill') {
    action.target = oneOf(TARGETS, o.target) ?? (kind === 'teleport' ? 'START' : 'GUARD');
  }
  return action;
}

/**
 * Turn anything (a model's JSON, a hand-written literal) into a spec the
 * simulation can run, or null. Unknown fields are dropped and numbers clamped,
 * so a hallucinated spec degrades into a boring one instead of breaking a level.
 */
export function parseSpec(token: string, raw: unknown): MechanicSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = token.toUpperCase();
  if (!/^[A-Z]{2,16}$/.test(name)) return null;

  const spec: MechanicSpec = { token: name };

  const t = o.tile as Record<string, unknown> | undefined;
  if (t && typeof t === 'object') {
    const onEnter = (Array.isArray(t.onEnter) ? t.onEnter : [])
      .map(parseAction)
      .filter((a): a is Action => !!a)
      .slice(0, MAX_ACTIONS);
    const status = (Array.isArray(t.status) ? t.status : [])
      .map((s) => oneOf(STATUSES, s))
      .filter((s): s is Status => !!s);
    if (onEnter.length || status.length) spec.tile = { onEnter, status };
  }

  const m = o.motion as Record<string, unknown> | undefined;
  if (m && typeof m === 'object') {
    const mode = oneOf(MOTIONS, m.mode);
    if (mode) {
      spec.motion = {
        mode,
        target: oneOf(TARGETS, m.target) ?? 'OBJECT',
        fallback: oneOf(TARGETS, m.fallback) ?? undefined,
        lethal: m.lethal === true && mode === 'approach',
        steps: clamp(m.steps, 1, 3, 1),
      };
    }
  }

  const contact = oneOf(CONTACTS, o.contact);
  if (contact) spec.contact = contact;

  if (!spec.tile && !spec.motion && !spec.contact) return null;
  if (typeof o.glyph === 'string' && o.glyph.trim()) spec.glyph = [...o.glyph.trim()][0];
  if (typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color)) spec.color = o.color;
  if (typeof o.note === 'string') spec.note = o.note.slice(0, 90);
  return spec;
}

/** JSON schema handed to the model, so its answer is already close to valid. */
export const SPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'tile', 'motion', 'contact', 'glyph', 'color', 'note'],
  properties: {
    token: { type: 'string', description: 'The word in uppercase, A-Z only, 2-16 letters.' },
    tile: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['onEnter', 'status'],
      description: 'What a coloured tile governed by this word does. null when the word is about movement only.',
      properties: {
        onEnter: {
          type: 'array',
          description: 'Applied the moment an actor steps on the tile (at most 3).',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['do', 'amount', 'target'],
            properties: {
              do: { type: 'string', enum: [...ACTIONS] },
              amount: { type: ['integer', 'null'], description: 'freeze: turns 1-5. push: tiles 1-8. Otherwise null.' },
              target: { type: ['string', 'null'], enum: [...TARGETS, null], description: 'TWIN = the next tile of the same colour, so a pair of tiles becomes a portal.' },
            },
          },
        },
        status: {
          type: 'array',
          description: 'hidden = guards cannot see you. phasing = you may walk through walls. safe = nothing here can kill you.',
          items: { type: 'string', enum: [...STATUSES] },
        },
      },
    },
    motion: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['mode', 'target', 'fallback', 'lethal', 'steps'],
      description: 'How an actor governed by this word moves. null when the word is about tiles only.',
      properties: {
        mode: { type: 'string', enum: [...MOTIONS] },
        target: { type: 'string', enum: [...TARGETS], description: 'OBJECT means the noun the sentence already names.' },
        fallback: { type: ['string', 'null'], enum: [...TARGETS, null] },
        lethal: { type: 'boolean', description: 'Only true for genuinely hostile words.' },
        steps: { type: 'integer', description: 'Tiles per turn, 1-3.' },
      },
    },
    contact: { type: ['string', 'null'], enum: [...CONTACTS, null], description: 'What walking into someone does: push shoves them, swap trades places. null for most words.' },
    glyph: { type: ['string', 'null'], description: 'One symbol drawn on the tile.' },
    color: { type: ['string', 'null'], description: '#rrggbb for actors obeying the word.' },
    note: { type: 'string', description: 'At most 8 playful words explaining the reading.' },
  },
} as const;
