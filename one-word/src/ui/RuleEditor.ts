import type { RuleDefinition, RulePart } from '../rules/RuleDefinition';
import { ruleTokens, type LevelSlot } from '../rules/RuleParser';
import { isTouch, keyboardInset } from './Device';

// DOM rule bar ("YOU [DIE] ON RED") + the replace-word popup: a floating panel on
// desktop, a sheet docked above the virtual keyboard on phones.

export type SubmitOutcome = { ok: true } | { ok: false; message: string; hint?: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Below this width the popup can no longer float next to the word without covering it. */
const SHEET_MAX_WIDTH = 720;
const MAX_CHIPS = 6;

export class RuleEditor {
  onSubmit: (raw: string) => Promise<SubmitOutcome> = async () => ({ ok: true });
  onOpen: () => void = () => {};
  isOpen = false;
  onSelect: (ruleIndex: number, part: RulePart) => void = () => {};
  private active: { ruleIndex: number; part: RulePart } | null = null;

  private rulesEl = $('rules');
  private editor = $('editor');
  private input = $<HTMLInputElement>('editor-input');
  private msg = $('editor-msg');
  private hint = $('editor-hint');
  private tip = $('tutorial-tip');
  private chips = $('editor-chips');
  private busy = false;
  private renderRevision = 0;
  private suggestions: string[] = [];
  private recent: string[] = [];

  constructor() {
    $('editor-form').addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    $('editor-cancel').addEventListener('click', () => this.close());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      e.stopPropagation();
    });
    const reposition = () => { this.position(); this.positionTip(); };
    window.addEventListener('resize', reposition);
    window.addEventListener('orientationchange', () => setTimeout(reposition, 150));
    // The virtual keyboard resizes the visual viewport, not the window.
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    document.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !this.editor.contains(e.target as Node) && !(e.target as HTMLElement).classList?.contains('editable')) this.close();
    });
  }

  /** Example words offered as one-tap chips (typing stays available). */
  setSuggestions(words: string[]) {
    this.suggestions = words;
  }

  /** Words the player already got the world to accept, offered again as chips. */
  rememberWord(raw: string) {
    const w = raw.trim().toLowerCase();
    if (!w) return;
    this.recent = [w, ...this.recent.filter((r) => r !== w)].slice(0, MAX_CHIPS);
  }

  private renderChips() {
    const words: string[] = [];
    for (const w of [...this.suggestions, ...this.recent]) {
      const l = w.toLowerCase();
      if (!words.includes(l)) words.push(l);
    }
    this.chips.innerHTML = '';
    this.chips.hidden = words.length === 0;
    for (const w of words.slice(0, MAX_CHIPS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = w.toUpperCase();
      b.addEventListener('click', () => { this.input.value = w; void this.submit(); });
      this.chips.appendChild(b);
    }
  }

  private get sheetMode() {
    return window.innerWidth <= SHEET_MAX_WIDTH;
  }

  render(rules: RuleDefinition[], slots: LevelSlot[], animate = false) {
    this.renderRevision++;
    if (!this.active || !slots.some((s) => this.isActive(s.ruleIndex, s.part))) {
      this.active = slots.length ? { ruleIndex: slots[0].ruleIndex, part: slots[0].part } : null;
      if (this.active) this.onSelect(this.active.ruleIndex, this.active.part);
    }
    this.rulesEl.innerHTML = '';
    // Editable rules first, fixed "laws" underneath.
    const editableRules = [...new Set(slots.map((s) => s.ruleIndex))];
    const order = [...editableRules, ...rules.map((_, i) => i).filter((i) => !editableRules.includes(i))];
    for (const i of order) {
      const line = document.createElement('div');
      line.className = 'rule' + (editableRules.includes(i) ? '' : ' fixed');
      for (const t of ruleTokens(rules[i])) {
        const span = document.createElement('span');
        span.className = 'word' + (t.editable ? ' editable' : '');
        span.textContent = t.text;
        if (t.editable) {
          span.dataset.rule = String(i);
          span.dataset.part = t.part;
          if (this.isActive(i, t.part)) span.id = 'editable-word';
          span.title = 'Tap to rewrite this word';
          span.tabIndex = 0;
          span.setAttribute('role', 'button');
          span.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.select(i, t.part); } });
          span.addEventListener('click', () => this.select(i, t.part));
          if (animate) span.classList.add('pop');
        }
        line.appendChild(span);
      }
      if (animate && this.active?.ruleIndex === i) line.classList.add('flash');
      this.rulesEl.appendChild(line);
    }
    requestAnimationFrame(() => this.positionTip());
  }

  /** Forget which word was being rewritten (when a new level takes over the bar). */
  resetSelection() { this.active = null; }

  private isActive(ruleIndex: number, part: RulePart) {
    return this.active?.ruleIndex === ruleIndex && this.active.part === part;
  }

  /** Make a clicked word the one the popup rewrites. */
  private select(ruleIndex: number, part: RulePart) {
    const already = this.isActive(ruleIndex, part);
    if (!already) {
      this.close();
      document.getElementById('editable-word')?.removeAttribute('id');
      this.active = { ruleIndex, part };
      this.rulesEl.querySelector<HTMLElement>(`[data-rule="${ruleIndex}"][data-part="${part}"]`)?.setAttribute('id', 'editable-word');
      this.onSelect(ruleIndex, part);
    }
    this.open();
  }

  /** Old word glitches out, then the new rule pops in. */
  async playRewrite(rules: RuleDefinition[], slots: LevelSlot[]) {
    const revision = this.renderRevision;
    const old = document.getElementById('editable-word');
    if (old) {
      old.classList.add('glitch');
      await new Promise((r) => setTimeout(r, 300));
    }
    if (revision === this.renderRevision) this.render(rules, slots, true);
  }

  setTutorial(stage: 'click' | 'type' | null) {
    this.tip.hidden = stage !== 'click';
    this.tip.textContent = isTouch() ? 'TAP THIS WORD' : 'CLICK THIS WORD';
    this.input.placeholder = stage === 'type' ? 'TYPE A NEW WORD' : 'type one word';
    this.positionTip();
  }

  open() {
    if (this.isOpen) return;
    const word = document.getElementById('editable-word');
    if (!word) return;
    this.isOpen = true;
    word.classList.add('editing');
    $('editor-old').textContent = `"${word.textContent}"`;
    this.input.value = '';
    this.msg.textContent = '';
    this.msg.className = '';
    this.hint.textContent = '';
    this.renderChips();
    this.editor.hidden = false;
    document.body.classList.add('editing-word');
    this.position();
    this.input.focus();
    this.onOpen();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.editor.hidden = true;
    document.body.classList.remove('editing-word');
    document.getElementById('editable-word')?.classList.remove('editing');
    this.input.blur();
  }

  private position() {
    const word = document.getElementById('editable-word');
    if (!word || this.editor.hidden) return;
    const s = this.editor.style;
    if (this.sheetMode) {
      // Dock to the bottom of whatever the keyboard leaves visible.
      this.editor.classList.add('sheet');
      s.left = ''; s.top = '';
      s.bottom = `${keyboardInset()}px`;
      return;
    }
    this.editor.classList.remove('sheet');
    s.bottom = '';
    const r = word.getBoundingClientRect();
    const w = this.editor.offsetWidth;
    const left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2));
    s.left = `${left}px`;
    s.top = `${r.bottom + 12}px`;
  }

  private positionTip() {
    const word = document.getElementById('editable-word');
    if (!word || this.tip.hidden) return;
    const bar = document.getElementById('rulebar')!.getBoundingClientRect();
    const r = word.getBoundingClientRect();
    this.tip.style.left = `${r.left + r.width / 2 - bar.left}px`;
    this.tip.style.top = `${r.bottom - bar.top}px`;
  }

  private async submit() {
    if (this.busy) return;
    const raw = this.input.value;
    this.busy = true;
    const thinking = setTimeout(() => {
      this.msg.className = 'thinking';
      this.msg.textContent = 'THE WORLD IS THINKING';
    }, 150);
    let out: SubmitOutcome;
    try { out = await this.onSubmit(raw); } finally { clearTimeout(thinking); this.busy = false; }
    if (out.ok) { this.close(); return; }
    this.msg.className = 'err';
    this.msg.textContent = out.message;
    this.hint.textContent = out.hint ?? '';
    this.editor.classList.remove('shake');
    void this.editor.offsetWidth;
    this.editor.classList.add('shake');
    this.input.select();
  }
}
