import { buildLevel, type LevelDefinition } from '../levels/defineLevel';
import { LEVELS } from '../levels/levels';
import { levelFileName, levelFileSource, SAVE_ENDPOINT } from '../levels/serialize';
import {
  editableSlots, MECHANICS, NOUNS,
  type Condition, type EditableSlot, type Mechanic, type Noun, type RuleDefinition, type RulePart,
} from '../rules/RuleDefinition';
import { levelSlots, ruleText } from '../rules/RuleParser';
import { comboKey, solveEveryWord, type WordResult } from '../systems/Solver';
import { el, field, select } from './dom';
import { BRUSHES, BRUSH_BY_CHAR } from './palette';

const CONDITIONS: Condition[] = ['ON_RED', 'ON_BLUE', 'NEAR_YOU'];
const PARTS: RulePart[] = ['subject', 'verb', 'object', 'condition'];

const STARTER_MAP = [
  '#############',
  '#P..........#',
  '#.....RRR...#',
  '#.....RRR..E#',
  '#.....RRR...#',
  '#...........#',
  '#############',
];

function nextFreeRank(): number {
  return LEVELS.reduce((max, level) => Math.max(max, level.id), 0) + 1;
}

// Writing a level file makes Vite reload this page (the new file changes the
// level glob), so the work in progress is parked here and picked back up.
const DRAFT_KEY = 'oneword_editor_draft';

interface Draft {
  name: string;
  rank: number;
  cells: string[][];
  rules: RuleDefinition[];
  solutions: string[][] | null;
  saved?: { path: string; rank: number };
}

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/** Words a given rule part may be replaced with. */
function vocabulary(part: RulePart): readonly string[] {
  return part === 'verb' ? MECHANICS : part === 'condition' ? CONDITIONS : NOUNS;
}

export class LevelEditor {
  private name = 'MY LEVEL';
  private rank = nextFreeRank();
  private cells: string[][] = STARTER_MAP.map((row) => [...row]);
  private rules: RuleDefinition[] = [{
    subject: 'YOU', verb: 'DIE', condition: 'ON_RED',
    editableParts: [{ part: 'verb', allowedReplacements: ['DIE', 'HIDE', 'HEAL', 'BOUNCE'] }],
  }];
  private solutions: string[][] | null = null;
  private brush = '#';
  private painting = false;

  private readonly gridPane = el('div', { className: 'grid-pane' });
  private readonly palettePane = el('div', { className: 'palette' });
  private readonly rulePane = el('div', { className: 'rules-pane' });
  private readonly resultPane = el('div', { className: 'result-pane' });
  private readonly sourcePane = el('pre', { className: 'source' });
  private readonly statusLine = el('div', { className: 'status' });

  constructor(private readonly root: HTMLElement) {
    const draft = readDraft();
    if (draft) {
      this.name = draft.name;
      this.rank = draft.rank;
      this.cells = draft.cells;
      this.rules = draft.rules;
      this.solutions = draft.solutions;
    }
    this.build();
    this.renderPalette();
    this.renderGrid();
    this.renderRules();
    this.renderSource();
    if (draft?.saved) this.announceSaved(draft.saved.path, draft.saved.rank);
    document.addEventListener('mouseup', () => { this.painting = false; });
  }

  // ---------- layout ----------

  private build() {
    const nameInput = el('input', { type: 'text', value: this.name, maxLength: 24, spellcheck: false });
    nameInput.addEventListener('input', () => {
      this.name = nameInput.value.toUpperCase();
      nameInput.value = this.name;
      this.renderSource();
    });

    const rankInput = el('input', { type: 'number', value: String(this.rank), min: '1', max: '999' });
    rankInput.addEventListener('input', () => {
      this.rank = Math.max(1, Number(rankInput.value) || 1);
      this.renderSource();
    });

    const size = el('div', { className: 'size-controls' }, [
      this.sizeButton('− wide', () => this.resize(-1, 0)),
      this.sizeButton('+ wide', () => this.resize(1, 0)),
      this.sizeButton('− tall', () => this.resize(0, -1)),
      this.sizeButton('+ tall', () => this.resize(0, 1)),
    ]);

    const verify = el('button', { className: 'primary', textContent: 'TEST LEVEL' });
    verify.addEventListener('click', () => this.verify());

    const save = el('button', {
      className: 'primary',
      textContent: import.meta.env.DEV ? 'SAVE TO definitions/' : 'DOWNLOAD FILE',
    });
    save.addEventListener('click', () => { void this.save(); });

    this.root.append(
      el('header', { className: 'editor-header' }, [
        el('h1', { textContent: 'LEVEL EDITOR' }),
        el('p', { textContent: 'Paint a map, pick the words players may change, test it, and write the level file.' }),
        el('a', { className: 'ghost-link', href: './index.html', textContent: '← BACK TO GAME' }),
      ]),
      el('div', { className: 'editor-body' }, [
        el('section', { className: 'pane' }, [
          el('h2', { textContent: 'MAP' }),
          this.palettePane,
          this.gridPane,
          size,
        ]),
        el('section', { className: 'pane' }, [
          el('h2', { textContent: 'LEVEL' }),
          el('div', { className: 'fields' }, [field('NAME', nameInput), field('NUMBER', rankInput)]),
          this.rulePane,
          el('div', { className: 'actions' }, [verify, save]),
          this.statusLine,
          this.resultPane,
          el('h2', { textContent: 'FILE' }),
          this.sourcePane,
        ]),
      ]),
    );
  }

  private sizeButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', { className: 'ghost', textContent: label });
    button.addEventListener('click', onClick);
    return button;
  }

  // ---------- map ----------

  private renderPalette() {
    this.palettePane.replaceChildren(...BRUSHES.map((b) => {
      const swatch = el('button', { className: `brush${b.char === this.brush ? ' selected' : ''}` }, [
        el('span', { className: 'swatch' }),
        el('span', { textContent: b.label }),
      ]);
      (swatch.firstElementChild as HTMLElement).style.background = b.color;
      swatch.addEventListener('click', () => { this.brush = b.char; this.renderPalette(); });
      return swatch;
    }));
  }

  private renderGrid() {
    const grid = el('div', { className: 'grid' });
    grid.style.gridTemplateColumns = `repeat(${this.cells[0].length}, 1fr)`;
    this.cells.forEach((row, y) => row.forEach((char, x) => {
      const cell = el('button', { className: 'cell', title: `${x},${y}` });
      const brush = BRUSH_BY_CHAR.get(char);
      cell.style.background = brush?.color ?? '#221f2e';
      if ('PGKD'.includes(char)) {
        cell.style.background = '#221f2e';
        const token = el('span', { className: 'token', textContent: char });
        token.style.background = brush?.color ?? '#fff';
        cell.append(token);
      }
      cell.addEventListener('mousedown', () => { this.painting = true; this.paint(x, y); });
      cell.addEventListener('mouseenter', () => { if (this.painting) this.paint(x, y); });
      grid.append(cell);
    }));
    this.gridPane.replaceChildren(grid);
  }

  private paint(x: number, y: number) {
    const brush = BRUSH_BY_CHAR.get(this.brush);
    if (brush?.unique) {
      this.cells = this.cells.map((row) => row.map((c) => (c === this.brush ? '.' : c)));
    }
    this.cells[y][x] = this.brush;
    this.invalidate();
    this.renderGrid();
  }

  private resize(dx: number, dy: number) {
    const width = Math.min(30, Math.max(5, this.cells[0].length + dx));
    const height = Math.min(20, Math.max(5, this.cells.length + dy));
    const next: string[][] = [];
    for (let y = 0; y < height; y++) {
      const row: string[] = [];
      for (let x = 0; x < width; x++) {
        const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        row.push(this.cells[y]?.[x] ?? (edge ? '#' : '.'));
      }
      next.push(row);
    }
    // Keep the border solid so the player can never walk off the map.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) next[y][x] = '#';
    }
    this.cells = next;
    this.invalidate();
    this.renderGrid();
  }

  // ---------- rules ----------

  private renderRules() {
    const rows = this.rules.map((rule, index) => this.ruleRow(rule, index));
    const add = el('button', { className: 'ghost', textContent: '+ ADD A FIXED RULE' });
    add.addEventListener('click', () => {
      this.rules.push({ subject: 'GUARD', verb: 'CHASE', object: 'YOU' });
      this.invalidate();
      this.renderRules();
    });
    this.rulePane.replaceChildren(el('h2', { textContent: 'RULES' }), ...rows, add);
  }

  private ruleRow(rule: RuleDefinition, index: number): HTMLElement {
    const update = () => { this.invalidate(); this.renderRules(); };

    const subject = select(NOUNS, rule.subject, (v) => { rule.subject = v as Noun; update(); });
    const verb = select(MECHANICS, rule.verb, (v) => { rule.verb = v as Mechanic; update(); });
    const object = select(['', ...NOUNS], rule.object ?? '', (v) => {
      rule.object = v ? (v as Noun) : undefined;
      if (!v) this.setEditable(rule, 'object', false);
      update();
    });
    const condition = select(['', ...CONDITIONS], rule.condition ?? '', (v) => {
      rule.condition = v ? (v as Condition) : undefined;
      if (!v) this.setEditable(rule, 'condition', false);
      update();
    });

    const slots = editableSlots(rule);
    const available = PARTS.filter((p) => p === 'subject' || p === 'verb' || (p === 'object' && rule.object) || (p === 'condition' && rule.condition));
    const toggles = available.map((part) => {
      const box = el('input', { type: 'checkbox', checked: slots.some((s) => s.part === part) });
      box.addEventListener('change', () => { this.setEditable(rule, part, box.checked); update(); });
      return el('label', { className: 'editable-toggle' }, [box, el('span', { textContent: part.toUpperCase() })]);
    });

    const children: (Node | string)[] = [
      el('div', { className: 'rule-sentence', textContent: ruleText(rule) }),
      el('div', { className: 'fields' }, [
        field('SUBJECT', subject), field('VERB', verb), field('OBJECT', object), field('CONDITION', condition),
      ]),
      el('div', { className: 'hint', textContent: 'WORDS PLAYERS MAY CHANGE' }),
      el('div', { className: 'editable-toggles' }, toggles),
      ...slots.map((slot) => this.replacementChips(rule, slot)),
    ];

    if (!slots.length && this.rules.length > 1) {
      const remove = el('button', { className: 'ghost small', textContent: 'REMOVE RULE' });
      remove.addEventListener('click', () => { this.rules.splice(index, 1); update(); });
      children.push(remove);
    }

    return el('div', { className: `rule${slots.length ? ' editable' : ''}` }, children);
  }

  private replacementChips(rule: RuleDefinition, slot: EditableSlot): HTMLElement {
    const current = this.currentWord(rule, slot.part);
    const chosen = new Set(slot.allowedReplacements);
    const chips = vocabulary(slot.part).map((word) => {
      const on = chosen.has(word);
      const chip = el('button', { className: `chip${on ? ' on' : ''}${word === current ? ' current' : ''}`, textContent: word });
      chip.addEventListener('click', () => {
        if (word === current) return; // the starting word always stays choosable
        if (on) chosen.delete(word); else chosen.add(word);
        slot.allowedReplacements = [...chosen];
        this.invalidate();
        this.renderRules();
      });
      return chip;
    });
    return el('div', { className: 'chips-block' }, [
      el('div', { className: 'hint', textContent: `WORDS FOR "${current}"` }),
      el('div', { className: 'chips' }, chips),
    ]);
  }

  private currentWord(rule: RuleDefinition, part: RulePart): string {
    switch (part) {
      case 'subject': return rule.subject;
      case 'object': return rule.object ?? '';
      case 'condition': return rule.condition ?? '';
      default: return rule.verb;
    }
  }

  /** Adds or removes one editable word of a rule. */
  private setEditable(rule: RuleDefinition, part: RulePart, editable: boolean) {
    const slots = editableSlots(rule).filter((s) => s.part !== part);
    if (editable) {
      slots.push({ part, allowedReplacements: [this.currentWord(rule, part)] });
    }
    delete rule.editablePart;
    delete rule.allowedReplacements;
    rule.editableParts = slots.sort((a, b) => PARTS.indexOf(a.part) - PARTS.indexOf(b.part));
  }

  // ---------- level file ----------

  private definition(): LevelDefinition {
    return {
      name: this.name.trim() || 'MY LEVEL',
      map: this.cells.map((row) => row.join('')),
      rules: this.rules,
      solutions: this.solutions ?? [],
    };
  }

  private problems(): string[] {
    const map = this.cells.map((row) => row.join(''));
    const count = (char: string) => map.join('').split(char).length - 1;
    const problems: string[] = [];
    if (count('P') !== 1) problems.push('the map needs exactly one player (P)');
    if (count('E') !== 1) problems.push('the map needs exactly one exit (E)');
    const slots = levelSlots(this.rules);
    if (!slots.length) problems.push('at least one word must be editable');
    for (const slot of slots) {
      if (slot.allowedReplacements.length < 2) {
        problems.push(`"${this.currentWord(this.rules[slot.ruleIndex], slot.part)}" needs at least one replacement word besides itself`);
      }
    }
    return problems;
  }

  private invalidate() {
    this.solutions = null;
    this.resultPane.replaceChildren();
    this.renderSource();
  }

  private renderSource() {
    this.sourcePane.textContent = levelFileSource(this.definition());
    const name = levelFileName(this.rank, this.name);
    this.sourcePane.setAttribute('data-file', `src/levels/definitions/${name}`);
    this.storeDraft();
  }

  private storeDraft(saved?: { path: string; rank: number }) {
    const draft: Draft = {
      name: this.name, rank: this.rank, cells: this.cells, rules: this.rules, solutions: this.solutions, saved,
    };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* storage blocked */ }
  }

  private announceSaved(path: string, rank: number) {
    this.setStatus(`Wrote ${path} — it is now level ${rank}.`, 'ok');
    const play = el('a', { href: './index.html', textContent: `PLAY LEVEL ${rank} →` });
    this.statusLine.append(' ', play);
  }

  private setStatus(text: string, kind: 'ok' | 'bad' | 'busy' = 'busy') {
    this.statusLine.className = `status ${kind}`;
    this.statusLine.textContent = text;
  }

  private verify(): boolean {
    const problems = this.problems();
    if (problems.length) {
      this.setStatus(problems.join(' · '), 'bad');
      return false;
    }
    this.setStatus('Solving every combination of allowed words…');
    let results: WordResult[];
    try {
      results = solveEveryWord(buildLevel({ ...this.definition(), solutions: [] }, this.rank));
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err), 'bad');
      return false;
    }
    const solvable = results.filter((r) => r.steps !== null).map((r) => r.words);
    const start = comboKey(levelSlots(this.rules).map((s) => this.currentWord(this.rules[s.ruleIndex], s.part)));
    this.solutions = solvable;
    this.renderSource();
    this.renderResults(results, start);
    if (!solvable.length) this.setStatus('No combination solves this level yet — nobody could finish it.', 'bad');
    else if (solvable.some((words) => comboKey(words) === start)) {
      this.setStatus(`"${start}" already solves the level, so players never need to change a word.`, 'bad');
    } else this.setStatus(`Solvable with: ${solvable.map(comboKey).join(', ')}`, 'ok');
    return true;
  }

  private renderResults(results: WordResult[], start: string) {
    this.resultPane.replaceChildren(...results.map((r) => el('div', {
      className: `result ${r.steps === null ? 'unsolved' : 'solved'}`,
      textContent: `${comboKey(r.words)}${comboKey(r.words) === start ? ' (start)' : ''} — ${r.steps === null ? 'unsolvable' : `solved in ${r.steps} turns`}`,
    })));
  }

  private async save() {
    if (!this.solutions && !this.verify()) return;
    if (!this.solutions?.length) {
      this.setStatus('Test the level first: it must be solvable by at least one combination of words.', 'bad');
      return;
    }
    const fileName = levelFileName(this.rank, this.name);
    const source = levelFileSource(this.definition());

    if (!import.meta.env.DEV) {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }));
      const link = el('a', { href: url, download: fileName });
      link.click();
      URL.revokeObjectURL(url);
      this.setStatus(`Downloaded ${fileName} — drop it into src/levels/definitions/ and it becomes level ${this.rank}.`, 'ok');
      return;
    }

    const write = async (overwrite: boolean) => {
      // Writing the file makes Vite reload this page, often before the response
      // lands here, so the success message is parked first and undone on failure.
      this.storeDraft({ path: `src/levels/definitions/${fileName}`, rank: this.rank });
      const res = await fetch(SAVE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, source, overwrite }),
      });
      return { ok: res.ok, status: res.status, body: (await res.json()) as { path?: string; error?: string } };
    };

    try {
      let result = await write(false);
      if (result.status === 409 && window.confirm(`${fileName} already exists. Overwrite it?`)) result = await write(true);
      if (!result.ok) {
        this.storeDraft();
        this.setStatus(result.body.error ?? 'could not write the file', 'bad');
        return;
      }
      this.announceSaved(result.body.path ?? `src/levels/definitions/${fileName}`, this.rank);
    } catch (err) {
      this.storeDraft();
      this.setStatus(err instanceof Error ? err.message : String(err), 'bad');
    }
  }
}
