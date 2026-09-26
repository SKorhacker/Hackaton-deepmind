import type { InterpretContext, WordInterpreter } from './WordInterpreter';

// Asks an OpenAI model which allowed token a free-form word means.
// Structured output is constrained to the allowed list (+ NONE), and the
// result is re-validated here. It never produces code; on any error it
// returns null and the game carries on with the local dictionary.

export class LLMWordInterpreter implements WordInterpreter {
  lastNote = '';

  constructor(private apiKey: string, private model = 'gpt-4.1-mini', private timeoutMs = 5000) {}

  async interpretWord(input: string, allowed: string[], context?: InterpretContext): Promise<string | null> {
    this.lastNote = '';
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
            {
              role: 'system',
              content:
                'You are the physics of a tiny puzzle world. Its rules are sentences, and the player replaced one word. ' +
                'Decide which of the allowed tokens the new word most plausibly means in that sentence (synonyms, slang, ' +
                'other languages, metaphors and typos all count). If nothing is a reasonable fit, answer NONE. ' +
                'Also give a note of at most 8 words, playful, explaining the interpretation.',
            },
            {
              role: 'user',
              content: `Sentence: ${context?.sentence ?? '___'}\nOld word: ${context?.current ?? '?'}\nNew word: "${input}"\nAllowed: ${allowed.join(', ')}`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'interpretation',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  token: { type: 'string', enum: [...allowed, 'NONE'] },
                  note: { type: 'string' },
                },
                required: ['token', 'note'],
              },
            },
          },
        }),
      });
      if (!res.ok) {
        console.warn('LLM interpreter HTTP', res.status, await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
      const token = String(parsed.token ?? '').toUpperCase();
      if (!allowed.includes(token)) return null;
      this.lastNote = String(parsed.note ?? '').slice(0, 60);
      return token;
    } catch (e) {
      console.warn('LLM interpreter failed', e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
