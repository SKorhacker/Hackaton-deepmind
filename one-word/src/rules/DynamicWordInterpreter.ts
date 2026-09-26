import { parseSpec, SPEC_JSON_SCHEMA, type MechanicSpec } from './MechanicSpec';
import { registry as sharedRegistry, type MechanicRegistry } from './MechanicRegistry';
import type { InterpretContext } from './WordInterpreter';

// The dynamic half of the game: instead of picking one of twelve verbs, the
// model *invents* the verb. It answers with a `MechanicSpec` — pure data,
// clamped and validated here before the simulation ever sees it. Nothing is
// compiled, nothing is evaluated: an implausible answer becomes a boring tile
// or is thrown away, never a crash and never code.
//
// Every accepted word is cached and registered, so "gravity" means the same
// thing for the rest of the session, and the sim stays deterministic.

const SYSTEM = [
  'You are the physics of a tiny grid puzzle world. Its laws are sentences like "YOU DIE ON RED" or',
  '"GUARD CHASES YOU", and the player has just replaced one word with a word of their own.',
  'Invent what that word means as a machine-readable spec.',
  '',
  'The world: a grid of floor, walls, red tiles, blue tiles, pressure plates, doors, keys and an exit.',
  'One player, some guards, one action per turn. A tile spec runs when someone steps on the tile;',
  'a motion spec decides how a guard moves each turn.',
  '',
  'Be literal and physical, and keep the word\'s everyday meaning: "melt" makes a tile deadly,',
  '"teleport" moves you elsewhere, "shy" makes a guard avoid you, "shadow" makes one trail you,',
  '"ghost" lets you walk through walls. If the word has no physical reading at all, return both',
  'tile and motion as null.',
].join(' ');

export class DynamicWordInterpreter {
  lastNote = '';

  constructor(
    private apiKey: string,
    private model = 'gpt-4.1-mini',
    private timeoutMs = 8000,
    private registry: MechanicRegistry = sharedRegistry,
  ) {}

  /** Words already given a meaning this session, keyed by the typed word. */
  private cache = new Map<string, MechanicSpec | null>();

  /**
   * Invent (or recall) the mechanic a typed word means and register it.
   * Returns the token now in the registry, or null if the world can't read the word.
   */
  async invent(word: string, context?: InterpretContext): Promise<string | null> {
    this.lastNote = '';
    const key = word.toLowerCase();
    if (this.cache.has(key)) {
      const hit = this.cache.get(key)!;
      this.lastNote = hit?.note ?? '';
      return hit?.token ?? null;
    }
    const spec = await this.request(word, context);
    this.cache.set(key, spec);
    if (!spec) return null;
    this.registry.register(spec);
    this.lastNote = spec.note ?? '';
    return spec.token;
  }

  private async request(word: string, context?: InterpretContext): Promise<MechanicSpec | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: `Sentence: ${context?.sentence ?? '___'}\nOld word: ${context?.current ?? '?'}\nNew word: "${word}"`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'mechanic', strict: true, schema: SPEC_JSON_SCHEMA },
          },
        }),
      });
      if (!res.ok) {
        console.warn('dynamic interpreter HTTP', res.status, await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json();
      const raw = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
      // The word the player typed names the mechanic, whatever the model calls it.
      const token = /^[a-zA-Z]{2,16}$/.test(word) ? word.toUpperCase() : String(raw.token ?? '');
      // A word must not quietly redefine a mechanic the game already ships with.
      if (this.registry.has(token) && !this.registry.get(token)?.dynamic) return null;
      const spec = parseSpec(token, raw);
      return spec ? { ...spec, dynamic: true } : null;
    } catch (e) {
      console.warn('dynamic interpreter failed', e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
