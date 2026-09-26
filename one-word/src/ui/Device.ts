// Touch/viewport helpers. The same build runs on desktop and on phones, so the
// layout decisions are made at runtime instead of at build time.

export const isTouch = () =>
  window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export const isPortrait = () => window.innerHeight >= window.innerWidth;

/** Height actually visible to the user: shrinks when the virtual keyboard opens. */
export const viewportHeight = () => window.visualViewport?.height ?? window.innerHeight;

/** Distance between the bottom of the layout viewport and the bottom of the visible area. */
export function keyboardInset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/** Keeps `--vh` (visual viewport height) in sync; mobile browser chrome makes 100vh lie. */
export function trackViewport() {
  const apply = () => document.documentElement.style.setProperty('--vh', `${viewportHeight()}px`);
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 150));
  window.visualViewport?.addEventListener('resize', apply);
}

export const fullscreenActive = () => !!document.fullscreenElement;

export async function toggleFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch { /* iOS Safari refuses fullscreen outside of video; itch.io's own button still works */ }
}

/** True where the fullscreen button can do anything at all (iOS Safari: it cannot). */
export const fullscreenSupported = () =>
  !!(document.fullscreenEnabled || (document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen);
