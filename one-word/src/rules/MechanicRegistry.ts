import { BUILTIN_SPECS } from './builtinSpecs';
import type { MechanicSpec } from './MechanicSpec';

// Every mechanic the world currently knows. The twelve shipped ones are in here
// from the start; words invented during play are registered next to them.

export class MechanicRegistry {
  private specs = new Map<string, MechanicSpec>();

  constructor(seed: MechanicSpec[] = BUILTIN_SPECS) {
    for (const s of seed) this.specs.set(s.token, s);
  }

  get(token: string | undefined): MechanicSpec | undefined {
    return token ? this.specs.get(token.toUpperCase()) : undefined;
  }
  has(token: string) { return this.specs.has(token.toUpperCase()); }
  register(spec: MechanicSpec) { this.specs.set(spec.token, spec); return spec; }
  tokens() { return [...this.specs.keys()]; }
  /** Only the words this session invented. */
  invented() { return [...this.specs.values()].filter((s) => s.dynamic); }
}

/** Shared registry: the simulation, the UI and the interpreters all read this one. */
export const registry = new MechanicRegistry();
