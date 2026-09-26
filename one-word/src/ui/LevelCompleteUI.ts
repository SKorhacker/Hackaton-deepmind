// "LEVEL COMPLETE" card and the final end-of-game summary.

const $ = (id: string) => document.getElementById(id)!;

export interface CompleteInfo {
  title: string;
  ruleHtml: string;
  isNewSolution: boolean;
  stats: [string, string][];
  solutions: { list: string[]; found: Set<string> } | null;
  nextLabel: string;
  replayLabel?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class LevelCompleteUI {
  private onNext = () => {};
  private onReplay = () => {};
  isOpen = false;

  constructor() {
    $('btn-next').addEventListener('click', () => this.onNext());
    $('btn-replay').addEventListener('click', () => this.onReplay());
  }

  show(info: CompleteInfo, onNext: () => void, onReplay: () => void) {
    this.onNext = onNext;
    this.onReplay = onReplay;
    $('complete-title').textContent = info.title;
    $('complete-rule').innerHTML = info.ruleHtml;
    $('complete-new').hidden = !info.isNewSolution;
    $('complete-stats').innerHTML = info.stats.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
    const sol = $('complete-solutions');
    if (info.solutions) {
      const { list, found } = info.solutions;
      const count = list.filter((s) => found.has(s)).length;
      sol.innerHTML = `SOLUTIONS FOUND <b style="color:var(--text)">${count} / ${list.length}</b>` +
        `<div class="pips">${list.map((s) => `<span class="pip ${found.has(s) ? 'found' : ''}">${found.has(s) ? esc(s) : '?'}</span>`).join('')}</div>`;
      sol.hidden = false;
    } else {
      sol.innerHTML = '';
      sol.hidden = true;
    }
    $('btn-next').textContent = info.nextLabel;
    const replay = $('btn-replay');
    replay.hidden = !info.replayLabel;
    replay.textContent = info.replayLabel ?? '';
    $('complete').hidden = false;
    this.isOpen = true;
    setTimeout(() => ($('btn-next') as HTMLButtonElement).focus(), 50);
  }

  hide() {
    $('complete').hidden = true;
    this.isOpen = false;
  }
}
