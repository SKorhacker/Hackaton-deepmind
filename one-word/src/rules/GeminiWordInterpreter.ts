import type { InterpretContext, WordInterpreter } from './WordInterpreter';

// Asks a Google Gemini model which allowed token a free-form word means.
// The response schema is constrained to the allowed list (+ NONE), and the
// result is re-validated here. It never produces code; on any error it
// returns null and the game carries on with the local dictionary.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT =
  'You are the physics of a tiny puzzle world. Its rules are sentences, and the player replaced one word. ' +
  'Decide which of the allowed tokens the new word most plausibly means in that sentence (synonyms, slang, ' +
  'other languages, metaphors and typos all count). If nothing is a reasonable fit, answer NONE. ' +
  'Also give a note of at most 8 words, playful, explaining the interpretation.';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export class GeminiWordInterpreter implements WordInterpreter {
  lastNote = '';

  constructor(private apiKey: string, private model = 'gemini-3.8-flash', private timeoutMs = 8000) {}

  async interpretWord(input: string, allowed: string[], context?: InterpretContext): Promise<string | null> {
    this.lastNote = '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${ENDPOINT}/${this.model}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [{ text: `Sentence: ${context?.sentence ?? '___'}\nOld word: ${context?.current ?? '?'}\nNew word: "${input}"\nAllowed: ${allowed.join(', ')}` }],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                token: { type: 'STRING', enum: [...allowed, 'NONE'] },
                note: { type: 'STRING' },
              },
              required: ['token', 'note'],
              propertyOrdering: ['token', 'note'],
            },
          },
        }),
      });
      if (!res.ok) {
        console.warn('Gemini interpreter HTTP', res.status, await res.text().catch(() => ''));
        return null;
      }
      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}';
      const parsed = JSON.parse(text) as { token?: string; note?: string };
      const token = String(parsed.token ?? '').toUpperCase();
      if (!allowed.includes(token)) return null;
      this.lastNote = String(parsed.note ?? '').slice(0, 60);
      return token;
    } catch (e) {
      console.warn('Gemini interpreter failed', e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
