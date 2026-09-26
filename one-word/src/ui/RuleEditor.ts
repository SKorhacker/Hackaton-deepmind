import type { RuleDefinition } from '../rules/RuleDefinition';
import { ruleTokens } from '../rules/RuleParser';

// DOM rule bar ("YOU [DIE] ON RED") + the small replace-word popup.

export type SubmitOutcome = { ok: true } | { ok: false; message: string; hint?: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class RuleEditor {
  onSubmit: (raw: string) => Promise<SubmitOutcome> = async () => ({ ok: true });
  onOpen: () => void = () => {};
  isOpen = false;

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

  render(rules: RuleDefinition[], editableIndex: number, animate = false) {
    this.rulesEl.innerHTML = '';
    // Editable rule first, fixed "laws" underneath.
    const order = [editableIndex, ...rules.map((_, i) => i).filter((i) => i !== editableIndex)];
    for (const i of order) {
      const line = document.createElement('div');
      line.className = 'rule' + (i === editableIndex ? '' : ' fixed');
      for (const t of ruleTokens(rules[i])) {
        const span = document.createElement('span');
        span.className = 'word' + (t.editable ? ' editable' : '');
        span.textContent = t.text;
        if (t.editable) {
          span.id = 'editable-word';
          span.title = 'Click to rewrite this word';
          span.addEventListener('click', () => this.open());
          if (animate) span.classList.add('pop');
        }
        line.appendChild(span);
      }
      if (animate && i === editableIndex) line.classList.add('flash');
      this.rulesEl.appendChild(line);
    }
    requestAnimationFrame(() => this.positionTip());
  }

  /** Old word glitches out, then the new rule pops in. */
  async playRewrite(rules: RuleDefinition[], editableIndex: number) {
    const old = document.getElementById('editable-word');
    if (old) {
      old.classList.add('glitch');
      await new Promise((r) => setTimeout(r, 300));
    }
    this.render(rules, editableIndex, true);
  }

  setTutorial(stage: 'click' | 'type' | null) {
    this.tip.hidden = stage !== 'click';
    this.tip.textContent = 'CLICK THIS WORD';
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
    this.editor.hidden = false;
    this.position();
    this.input.focus();
    this.onOpen();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.editor.hidden = true;
    document.getElementById('editable-word')?.classList.remove('editing');
    this.input.blur();
  }

  private position() {
    const word = document.getElementById('editable-word');
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
