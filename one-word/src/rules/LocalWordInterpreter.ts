import type { WordInterpreter } from './WordInterpreter';

// Deterministic dictionary + light stemming. Knows every token, not just the
// ones a level allows, so the UI can say "that word has no power here".

const WORDS: Record<string, string> = {
  // --- verbs ---
  die: 'DIE', kill: 'DIE', perish: 'DIE', explode: 'DIE', burn: 'DIE', melt: 'DIE', dead: 'DIE', death: 'DIE',
  hide: 'HIDE', vanish: 'HIDE', disappear: 'HIDE', sneak: 'HIDE', camouflage: 'HIDE', invisible: 'HIDE', cloak: 'HIDE', stealth: 'HIDE', blend: 'HIDE',
  heal: 'HEAL', cure: 'HEAL', mend: 'HEAL', restore: 'HEAL', rest: 'HEAL', recover: 'HEAL', live: 'HEAL', survive: 'HEAL', regenerate: 'HEAL',
  bounce: 'BOUNCE', jump: 'BOUNCE', hop: 'BOUNCE', leap: 'BOUNCE', spring: 'BOUNCE', fly: 'BOUNCE', skip: 'BOUNCE', launch: 'BOUNCE', boing: 'BOUNCE',
  freeze: 'FREEZE', stop: 'FREEZE', halt: 'FREEZE', stay: 'FREEZE', pause: 'FREEZE', wait: 'FREEZE', stand: 'FREEZE', statue: 'FREEZE', frozen: 'FREEZE',
  follow: 'FOLLOW', trail: 'FOLLOW', accompany: 'FOLLOW', escort: 'FOLLOW', shadow: 'FOLLOW', tail: 'FOLLOW', copy: 'FOLLOW', mimic: 'FOLLOW',
  chase: 'CHASE', hunt: 'CHASE', pursue: 'CHASE', seek: 'CHASE', stalk: 'CHASE', catch: 'CHASE', find: 'CHASE', fetch: 'CHASE', get: 'CHASE', want: 'CHASE', grab: 'CHASE', love: 'CHASE', like: 'CHASE',
  flee: 'FLEE', run: 'FLEE', escape: 'FLEE', avoid: 'FLEE', fear: 'FLEE', dodge: 'FLEE', retreat: 'FLEE', evade: 'FLEE', hate: 'FLEE', scatter: 'FLEE', fled: 'FLEE',
  help: 'HELP', protect: 'HELP', assist: 'HELP', aid: 'HELP', serve: 'HELP', support: 'HELP', defend: 'HELP', save: 'HELP', obey: 'HELP', befriend: 'HELP',
  sleep: 'SLEEP', nap: 'SLEEP', snooze: 'SLEEP', doze: 'SLEEP', slumber: 'SLEEP', dream: 'SLEEP', snore: 'SLEEP', faint: 'SLEEP', slept: 'SLEEP', relax: 'SLEEP',
  open: 'OPEN', unlock: 'OPEN', unseal: 'OPEN',
  attack: 'ATTACK', fight: 'ATTACK', hit: 'ATTACK', punch: 'ATTACK', strike: 'ATTACK', bite: 'ATTACK', eat: 'ATTACK', destroy: 'ATTACK', ate: 'ATTACK',
  // --- nouns ---
  you: 'YOU', me: 'YOU', player: 'YOU', i: 'YOU', myself: 'YOU', hero: 'YOU',
  guard: 'GUARD', guards: 'GUARD', enemy: 'GUARD', monster: 'GUARD',
  key: 'KEY', keys: 'KEY', treasure: 'KEY', gold: 'KEY', coin: 'KEY', loot: 'KEY', prize: 'KEY',
  exit: 'EXIT', goal: 'EXIT', finish: 'EXIT', end: 'EXIT', portal: 'EXIT', flag: 'EXIT',
  red: 'RED', lava: 'RED', fire: 'RED', crimson: 'RED', scarlet: 'RED',
  blue: 'BLUE', water: 'BLUE', ice: 'BLUE',
  plate: 'PLATE', button: 'PLATE', switch: 'PLATE', lever: 'PLATE', pad: 'PLATE', plates: 'PLATE',
  door: 'DOOR', gate: 'DOOR', doors: 'DOOR',
};

// Try the word as-is, then with common English suffixes stripped.
function candidates(w: string): string[] {
  const out = [w];
  const add = (x: string) => { if (x.length > 1) out.push(x); };
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s')) add(w.slice(0, -1));
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); add(w.slice(0, -4)); }
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); add(w.slice(0, -3)); }
  return out;
}

export function lookupLocal(word: string): string | null {
  for (const c of candidates(word)) if (WORDS[c]) return WORDS[c];
  return null;
}

export class LocalWordInterpreter implements WordInterpreter {
  async interpretWord(input: string, allowed: string[]): Promise<string | null> {
    const token = lookupLocal(input);
    return token && allowed.includes(token) ? token : null;
  }
}
