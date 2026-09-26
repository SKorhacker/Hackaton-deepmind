# Storybook gameplay pass

Local project: `/Users/pierres/Hackaton-deepmind-art/one-word`.

This pass applies the detailed storybook direction to the running game. The flat terminal delivery remains a separate, unused asset pack.

## Artwork and motion

- New pen-nib sentinel: brass, ink-blue armor and burgundy cloth. Four registered 512px frames cover alert, asleep, helpful and frozen behavior. Rule symbols and colored intent rings remain available to distinguish behaviors such as FOLLOW and FLEE.
- Player idle holds a stable illustration. Walking uses two contact poses at 10 fps. Tile movement uses a 170ms ease with no squash, rotation or overshoot. The turn stays locked through all bounce-path steps.
- Defeat fades into ink and parchment flecks. Victory releases gilded paper leaves before a manuscript-styled chapter card. Both begin after movement lands, support reduced motion, and cancel cleanly on restart.
- Sound cues use softer triangle/sine tones for defeat and victory.

Generated enemy source: `art/runtime/sentinel-states-source.png`. Runtime atlas: `one-word/public/art/runtime/sentinel-states.png`. The preparation script preserves transparency and aligns all four sprites at the feet.

## Git sources combined locally

- Original game base: Tsaousis `3f4f815`.
- Cognition/Devin mobile branch: `b691ddf` and `2a49eeb` (`origin/devin/1790433615-one-word-mobile`). Touch pad, tile tap/swipe, visual viewport support and the phone word sheet are adapted to the painted renderer.
- Level maker: PR #1 head `fc6f82e` (`origin/pr-1`). Imports the level directory, visual editor, solver, serialization and multiple editable rule slots. All six included definitions are playable.

The art remains a rendering concern: map symbols, world simulation and level file format are preserved. The game camera fits each map's dimensions, including larger custom maps. The level maker uses the same runtime assets for its palette and cells. Its saved-level link opens the corresponding chapter directly.

## Mobile

The original desktop menu remains. Phones use the same manuscript background and typography with readable DOM controls, outfit selection and a wrapping chapter list. The movement pad has its own space below the canvas, and tiles retain square proportions. The word sheet follows the visual viewport. Completion cards scroll when needed and honor reduced-motion preferences.

## Running

- `cd /Users/pierres/Hackaton-deepmind-art/one-word`
- `npm run dev -- --host 0.0.0.0`
- Game: `/`; level maker: `/editor.html`.
- `npm run build` outputs both game and maker in `dist/` with relative asset paths.
- `npm test` verifies every supported solution combination, including the two-word chapter.
- Browser regression script: `tools/review_compatibility.mjs` (from the repository root, with Playwright available).

The maker saves TypeScript definitions in development and offers downloads in a static build. No remote branches were changed or pushed.

## Validation — 26 September 2026

- Production build includes both HTML entry points and succeeds.
- Solver tests pass for all six shipped levels and their expected solution combinations.
- Browser gameplay passes all six chapters using the rule editor and keyboard, including BOUNCE chains and the two-word chapter.
- Four enemy states select the correct atlas frames.
- Defeat/restart check confirms an old outcome timer cannot reset a new attempt.
- Chromium phone emulation: touch-only completion; 390×844 portrait, 844×390 landscape and 320×568 layouts; square canvas scaling; no control/board overlap or horizontal page overflow.
- Maker check: paint, solve, save, launch by level ID and finish a temporary 21-column custom map. Temporary definition removed afterward.
- Maker touch painting and phone layout pass. Reduced-motion outcomes omit moving particles.

These are browser/emulation checks, not a physical iOS/Android device certification. Visual viewport handling comes from the mobile branch; actual OS keyboard behavior still benefits from a phone check.
- All three outfits pass four-direction walking/idle checks, selection persistence, menu return, modal input, six chapter buttons and reduced-motion behavior, with no browser errors.
