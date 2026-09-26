import { aiProvider } from '../config/GameConfig';
import { GeminiWordInterpreter } from './GeminiWordInterpreter';
import { OpenAIWordInterpreter } from './OpenAIWordInterpreter';
import type { WordInterpreter } from './WordInterpreter';

/** The AI interpreter for whichever provider has a key, or null (dictionary only). */
export function createInterpreter(): WordInterpreter | null {
  const p = aiProvider();
  if (!p) return null;
  return p.name === 'Gemini' ? new GeminiWordInterpreter(p.key, p.model) : new OpenAIWordInterpreter(p.key, p.model);
}
