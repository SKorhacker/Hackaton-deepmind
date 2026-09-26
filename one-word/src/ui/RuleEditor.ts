import type { RuleDefinition } from '../rules/RuleDefinition';
import { ruleTokens } from '../rules/RuleParser';
import { sfx } from './Sfx';

// DOM rule bar ("YOU [DIE] ON RED") + the small replace-word popup.
// A level may have several editable words ("slots"); each is clickable.

export type SubmitOutcome = { ok: true } | { ok: false; message: string; hint?: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class RuleEditor {
  onSubmit: (raw: string, slot: number) => Promise<SubmitOutcome> = async () => ({ ok: true });
  onOpen: () => void = () => {};
  isOpen = false;
  /** Slot (rule index) the popup is editing. */
  slot = -1;

  private rulesEl = $('rules');
  private editor = $('editor');
  private input = $<HTMLInputElement>('editor-input');
  private msg = $('editor-msg');
  private hint = $('editor-hint');
  private tip = $('tutorial-tip');
  private busy = false;

  constructor() {
    $('editor-form').addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    $('editor-cancel').addEventListener('click', () => this.close());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      e.stopPropagation();
    });
    window.addEventListener('resize', () => { this.position(); this.positionTip(); });
    document.addEventListener('mousedown', (e) => {
      if (this.isOpen && !this.editor.contains(e.target as Node) && !(e.target as HTMLElement).classList?.contains('editable')) this.close();
    });
  }

  private wordEl(slot: number) {
    return this.rulesEl.querySelector<HTMLElement>(`.word.editable[data-slot="${slot}"]`);
  }

  /**
   * @param changed slot currently rewritten (-1 if none)
   * @param popSlots slots whose word should pop in (new word / reverted word)
   */
  render(rules: RuleDefinition[], slots: number[], changed = -1, popSlots: number[] = []) {
    this.rulesEl.innerHTML = '';
    const multi = slots.length > 1;
    // Editable rules first (in order), fixed "laws" underneath.
    const order = [...slots, ...rules.map((_, i) => i).filter((i) => !slots.includes(i))];
    let first = true;
    for (const i of order) {
      const editable = slots.includes(i);
      const line = document.createElement('div');
      line.className = 'rule' + (editable ? (multi ? ' multi' : '') : ' fixed');
      for (const t of ruleTokens(rules[i])) {
        const span = document.createElement('span');
        span.className = 'word' + (t.editable ? ' editable' : '');
        span.textContent = t.text;
        if (t.editable) {
          span.dataset.slot = String(i);
          if (first) { span.id = 'editable-word'; first = false; }
          if (i === changed) span.classList.add('changed');
          span.title = 'Click to rewrite this word';
          span.addEventListener('click', () => { sfx.click(); this.open(i); });
          if (popSlots.includes(i)) span.classList.add('pop');
        }
        line.appendChild(span);
      }
      if (popSlots.includes(i)) line.classList.add('flash');
      this.rulesEl.appendChild(line);
    }
    requestAnimationFrame(() => this.positionTip());
  }

  /** Old word(s) glitch out, then the new rules pop in. */
  async playRewrite(rules: RuleDefinition[], slots: number[], changed: number, affected: number[]) {
    const olds = affected.map((s) => this.wordEl(s)).filter((e): e is HTMLElement => !!e);
    if (olds.length) {
      olds.forEach((o) => o.classList.add('glitch'));
      await new Promise((r) => setTimeout(r, 300));
    }
    this.render(rules, slots, changed, affected);
  }

  setTutorial(stage: 'click' | 'type' | null) {
    this.tip.hidden = stage !== 'click';
    this.tip.textContent = 'CLICK THIS WORD';
    this.input.placeholder = stage === 'type' ? 'TYPE A NEW WORD' : 'type one word';
    this.positionTip();
  }

  open(slot: number, prefill = '') {
    if (this.isOpen && slot === this.slot) { if (prefill) { this.input.value = prefill; this.input.focus(); } return; }
    if (this.isOpen) this.close();
    const word = this.wordEl(slot);
    if (!word) return;
    this.slot = slot;
    this.isOpen = true;
    word.classList.add('editing');
    $('editor-old').textContent = `"${word.textContent}"`;
    this.input.value = prefill;
    this.msg.textContent = '';
    this.msg.className = '';
    this.hint.textContent = '';
    this.editor.hidden = false;
    this.position();
    this.input.focus();
    this.onOpen();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.editor.hidden = true;
    const tip = document.getElementById('wb-tip');
    if (tip) tip.hidden = true;
    this.rulesEl.querySelectorAll('.editing').forEach((e) => e.classList.remove('editing'));
    this.input.blur();
  }

  private position() {
    const word = this.wordEl(this.slot);
    if (!word || this.editor.hidden) return;
    const r = word.getBoundingClientRect();
    const w = this.editor.offsetWidth;
    const left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2));
    this.editor.style.left = `${left}px`;
    this.editor.style.top = `${r.bottom + 12}px`;
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
    try { out = await this.onSubmit(raw, this.slot); } finally { clearTimeout(thinking); this.busy = false; }
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
