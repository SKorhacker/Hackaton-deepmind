import type { AIProvider } from '../config/GameConfig';
import { parseSpec, SPEC_JSON_SCHEMA, type MechanicSpec } from './MechanicSpec';
import { registry as sharedRegistry, type MechanicRegistry } from './MechanicRegistry';
import type { InterpretContext } from './WordInterpreter';

// The creative half of the game: instead of picking one of twelve verbs, the
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

export class CreativeWordInterpreter {
  lastNote = '';

  constructor(
    private provider: AIProvider,
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
    const prompt = `Sentence: ${context?.sentence ?? '___'}\nOld word: ${context?.current ?? '?'}\nNew word: "${word}"`;
    try {
      const res = this.provider.name === 'Gemini'
        ? await this.askGemini(prompt, ctrl.signal)
        : await this.askOpenAI(prompt, ctrl.signal);
      if (!res.ok) {
        console.warn('creative interpreter HTTP', res.status, await res.text().catch(() => ''));
        return null;
      }
      const raw = JSON.parse(await this.textOf(res));
      // The word the player typed names the mechanic, whatever the model calls it.
      const token = /^[a-zA-Z]{2,16}$/.test(word) ? word.toUpperCase() : String(raw.token ?? '');
      // A word must not quietly redefine a mechanic the game already ships with.
      if (this.registry.has(token) && !this.registry.get(token)?.dynamic) return null;
      const spec = parseSpec(token, raw);
      return spec ? { ...spec, dynamic: true } : null;
    } catch (e) {
      console.warn('creative interpreter failed', e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private askOpenAI(prompt: string, signal: AbortSignal) {
    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.provider.key}` },
      body: JSON.stringify({
        model: this.provider.model,
        temperature: 0,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'mechanic', strict: true, schema: SPEC_JSON_SCHEMA },
        },
      }),
    });
  }

  // Gemini's schema dialect differs, so the shape travels in the prompt instead;
  // `parseSpec` is the real gatekeeper either way.
  private askGemini(prompt: string, signal: AbortSignal) {
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.provider.model}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.provider.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM}\n\nAnswer with JSON of this shape:\n${JSON.stringify(SPEC_JSON_SCHEMA)}` }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
  }

  private async textOf(res: Response): Promise<string> {
    const data = await res.json();
    if (this.provider.name === 'Gemini') {
      return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') || '{}';
    }
    return data.choices?.[0]?.message?.content ?? '{}';
  }
}
