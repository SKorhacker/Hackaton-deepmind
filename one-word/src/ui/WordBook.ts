// Side panel of words that solved a level (unlocked).
// Meanings stay hidden until you hover a word. Kept in localStorage.

interface Entry { word: string; token: string; ai: boolean; level?: number }

const MEANING: Record<string, string> = {
  DIE: 'is destroyed', HIDE: 'turns invisible', HEAL: 'is restored', BOUNCE: 'gets launched onward',
  FREEZE: 'stops in place', FOLLOW: 'trails behind', CHASE: 'hunts it down', FLEE: 'runs away',
  HELP: 'holds plates for you', SLEEP: 'dozes off', OPEN: 'swings open', ATTACK: 'strikes',
  YOU: 'the player', GUARD: 'the guard', KEY: 'the key', EXIT: 'the way out', RED: 'red tiles',
  BLUE: 'blue tiles', PLATE: 'pressure plates', DOOR: 'the door',
};
const STORE = 'oneword_unlocked_words';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class WordBook {
  onPick: (word: string) => void = () => {};
  private entries: Entry[] = [];
  private fresh = '';
  private list = document.getElementById('wb-list')!;
  private count = document.getElementById('wb-count')!;
  private tip = document.createElement('div');

  constructor() {
    try { this.entries = JSON.parse(localStorage.getItem(STORE) ?? '[]'); } catch { this.entries = []; }
    if (!Array.isArray(this.entries)) this.entries = [];
    this.tip.id = 'wb-tip';
    this.tip.hidden = true;
    document.body.appendChild(this.tip);

    this.list.addEventListener('click', (e) => {
      const w = (e.target as HTMLElement).closest('.wb-word') as HTMLElement | null;
      if (w?.dataset.word) this.onPick(w.dataset.word);
    });
    this.list.addEventListener('mouseover', (e) => {
      const w = (e.target as HTMLElement).closest('.wb-word') as HTMLElement | null;
      if (w) this.showTip(w);
    });
    this.list.addEventListener('mouseout', (e) => {
      if ((e.target as HTMLElement).closest('.wb-word')) this.tip.hidden = true;
    });
  }

  /** Unlock a word that solved a level. Returns true if it's new. */
  add(word: string, token: string, ai: boolean, level?: number): boolean {
    word = word.trim().toLowerCase();
    if (!word || this.entries.some((e) => e.word === word)) return false;
    this.entries.push({ word, token, ai, level });
    try { localStorage.setItem(STORE, JSON.stringify(this.entries)); } catch { /* storage blocked */ }
    this.fresh = word;
    this.render();
    return true;
  }

  /** Unlocked words, newest first — the phone layout has no panel, so they surface as chips. */
  words(): string[] {
    return [...this.entries].reverse().map((e) => e.word);
  }

  render() {
    const n = this.entries.length;
    this.tip.hidden = true;
    this.count.textContent = n ? String(n) : '';
    this.list.innerHTML = n
      ? `<div class="wb-words">${[...this.entries].reverse().map((e, i) =>
          `<button type="button" class="wb-word ${e.ai ? 'ai' : ''} ${e.word === this.fresh ? 'new' : ''}" data-i="${n - 1 - i}" data-word="${esc(e.word)}">${esc(e.word)}</button>`).join('')}</div>`
      : '';
    this.fresh = '';
  }

  private showTip(el: HTMLElement) {
    const e = this.entries[Number(el.dataset.i)];
    if (!e) return;
    this.tip.innerHTML =
      `<div class="wb-tip-word">${esc(e.word.toUpperCase())} <span>→ ${e.token}</span></div>` +
      `<div>${MEANING[e.token] ?? ''}</div>` +
      `<div class="wb-tip-meta">${e.level ? `unlocked in level ${e.level}` : ''}${e.ai ? `${e.level ? ' · ' : ''}understood by AI ✦` : ''}</div>`;
    this.tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = this.tip.offsetWidth;
    this.tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    this.tip.style.top = `${r.bottom + 8}px`;
  }
}
