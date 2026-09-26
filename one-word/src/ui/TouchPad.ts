import type { Pos } from '../levels/LevelData';
import { isTouch } from './Device';

// On-screen D-pad. Hidden by default on desktop, shown by default on touch devices;
// the statusbar button toggles it either way.

const DIRS: Record<string, Pos | null> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  wait: null,
};

export class TouchPad {
  /** Receives a direction, or null for "wait a turn". */
  onDir: (dir: Pos | null) => void = () => {};

  private el = document.getElementById('pad')!;
  private toggle = document.getElementById('btn-pad') as HTMLButtonElement;
  private visible = false;

  constructor() {
    for (const btn of this.el.querySelectorAll<HTMLButtonElement>('.pad-btn')) {
      // pointerdown, not click: a turn should fire the moment the thumb lands.
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onDir(DIRS[btn.dataset.dir!] ?? null);
      });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.toggle.addEventListener('click', () => this.setVisible(!this.visible));
    this.setVisible(isTouch());
  }

  setVisible(on: boolean) {
    this.visible = on;
    this.el.hidden = !on;
    this.toggle.classList.toggle('on', on);
    document.body.classList.toggle('pad-on', on);
    window.dispatchEvent(new Event('oneword-pad-resize'));
  }
}
