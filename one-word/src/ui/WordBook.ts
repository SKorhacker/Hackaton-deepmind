import { sfx } from './Sfx';
export interface WordEntry { word: string; token: string; ai: boolean; level?: number; levels: number[] }
const MEANING: Record<string, string> = {
  DIE: 'is destroyed', HIDE: 'turns invisible', HEAL: 'is restored', BOUNCE: 'gets launched onward',
  FREEZE: 'stops in place', FOLLOW: 'trails behind', CHASE: 'hunts it down', FLEE: 'runs away',
  HELP: 'holds plates for you', SLEEP: 'dozes off', OPEN: 'swings open', ATTACK: 'strikes',
  EVERYONE: 'the player and guards', YOU: 'the player', GUARD: 'the guard', KEY: 'the key', EXIT: 'the way out', RED: 'red tiles',
  SLIDE: 'slides until something stops it', TELEPORT: 'jumps to the next tile of the same colour',
  PUSH: 'shoves one tile', SWAP: 'trades places',
  BLUE: 'blue tiles', PLATE: 'pressure plates', DOOR: 'the door',
};

const STORE = 'oneword_unlocked_words';
export class WordBook {
  onPick: (word: string, token: string) => void = () => {};
  private entries: WordEntry[] = [];
  private allowed = new Set<string>();
  private level = 0;
  private list = document.getElementById('wb-list')!;
  private count = document.getElementById('wb-count')!;

  constructor() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORE) ?? '[]');
      if (Array.isArray(saved)) for (const item of saved) {
        if (!item || typeof item.word !== 'string' || typeof item.token !== 'string') continue;
        const levels = Array.isArray(item.levels) ? item.levels.filter((n: unknown) => typeof n === 'number' && Number.isInteger(n)) : Number.isInteger(item.level) ? [item.level] : [];
        this.entries.push({ word: item.word, token: item.token, ai: !!item.ai, level: item.level, levels });
      }
    } catch { /* Storage is optional. */ }
  }

  setLevel(level: number, allowed: string[]) {
    this.level = level; this.allowed = new Set(allowed); this.render();
  }

  /** Called only when a chapter is completed. Preserve every chapter association. */
  add(word: string, token: string, ai: boolean, level: number): boolean {
    word = word.trim().toLowerCase();
    if (!word) return false;
    let entry = this.entries.find(e => e.word === word && e.token === token);
    const fresh = !entry;
    if (!entry) { entry = { word, token, ai, level, levels: [] }; this.entries.push(entry); }
    if (!entry.levels.includes(level)) entry.levels.push(level);
    try { localStorage.setItem(STORE, JSON.stringify(this.entries)); } catch { /* Session fallback. */ }
    this.render();
    return fresh;
  }

  words(allowed: string[]): string[] {
    return [...new Set([...this.entries].reverse().filter(e => allowed.includes(e.token)).map(e => e.word))];
  }

  render() {
    const visible = [...this.entries].reverse().filter(e => this.allowed.has(e.token));
    this.count.textContent = String(visible.length);
    document.getElementById('wb-chapter')!.textContent = `For chapter ${this.level}`;
    this.list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('p'); empty.className = 'wb-empty';
      empty.textContent = 'Complete chapters to collect words you can use here.'; this.list.append(empty); return;
    }
    for (const entry of visible) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'wb-word';
      button.dataset.word = entry.word; button.dataset.token = entry.token;
      const name = document.createElement('strong'); name.textContent = entry.word.toUpperCase();
      const meaning = document.createElement('small'); meaning.textContent = MEANING[entry.token] ?? entry.token;
      const chapters = document.createElement('small'); chapters.className = 'wb-origin';
      chapters.textContent = entry.levels.length ? `Completed in ${entry.levels.join(', ')}` : 'Previously discovered';
      button.append(name, meaning, chapters);
      button.addEventListener('click', () => { sfx.click(); this.onPick(entry.word, entry.token); });
      this.list.append(button);
    }
  }
}
