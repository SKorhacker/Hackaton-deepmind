# ONE WORD

> Change one word. Change the world.

Each level has one rule sentence, e.g. `YOU [DIE] ON RED`. Click the highlighted word, type a
replacement (`hide`), and the world obeys the new sentence. Reach the exit.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/ (works on any static host / Hugging Face Spaces)
npm run itch     # build + one-word-itch.zip, ready to upload to itch.io
npm test         # brute-force solver: proves which words solve each level
```

Desktop: **WASD / arrows** move · **Space** wait · **Enter / E** edit the word · **R** restart · **Esc** menu · **`** debug overlay.

Touch: **swipe** or **tap a tile** to move · **tap yourself** to wait · **tap the highlighted word** to rewrite it ·
the **✛** button in the status bar toggles an on-screen D-pad (on by default on touch devices).

One build serves both: the canvas resizes to the window and the camera fits the grid, so portrait phones,
landscape phones and desktop all work without a separate mobile version.

## How words become mechanics

1. `LocalWordInterpreter`: dictionary + stemming (`protect` → HELP, `sleeping` → SLEEP).
2. `LLMWordInterpreter` (optional): only for words the dictionary doesn't know. OpenAI structured output is
   constrained to the level's allowed tokens (or NONE) and re-validated. It never generates code, and any failure
   falls back to "the world doesn't understand".

The game is fully playable without AI.

### OpenAI key

- **Dev:** put `VITE_OPENAI_API_KEY=...` in `.env.local` (gitignored). It is only read in dev mode and is **not**
  included in `npm run build` output.
- **Deployed build:** tap "AI: OFF" in the corner of the title screen to paste a key. It stays in that browser's
  localStorage. (For a public demo, a small proxy server is the safer option.)
- Model: `VITE_OPENAI_MODEL` (default `gpt-4.1-mini`).

## Publishing to itch.io

```bash
npm run itch     # -> one-word-itch.zip (index.html at the zip root, relative asset paths)
```

On the itch.io project page:

- Kind of project: **HTML**, upload the zip, tick **This file will be played in the browser**.
- Embed size: **960 × 640** (any size works; the game fills whatever it is given).
- Tick **Mobile friendly** (and *Automatically start on page load* if you want it to boot without a click).
- Tick **Fullscreen button** — on iOS Safari the in-game ⛶ button is a no-op (Apple only allows fullscreen video),
  so itch's own button plus "Add to Home Screen" is the way to get a full screen there.

No art files are needed: everything on screen is drawn procedurally by Phaser. The only images itch asks for
are store-page assets (cover image 630 × 500, screenshots).

## Mobile notes

- The layout uses the *visual* viewport height, so the collapsing browser chrome and the virtual keyboard
  never push the grid off screen (`src/ui/Device.ts`).
- The rewrite popup becomes a bottom sheet under 720px wide and rides above the keyboard; it also offers
  one-tap word chips (the level's example words, plus words you already used) so playing without typing works.
- The input font is 16px on phones on purpose: anything smaller makes iOS Safari zoom the page on focus.

## Levels

| # | Rule | Solutions |
|---|------|-----------|
| 1 | YOU **DIE** ON RED | HIDE, HEAL, BOUNCE |
| 2 | GUARD **CHASES** YOU | SLEEP, FLEE, FOLLOW |
| 3 | GUARD **CHASES** YOU (+ plate & door) | HELP, FOLLOW |
| 4 | GUARD CHASES **YOU** | KEY |
| 5 | GUARD **CHASES** YOU · YOU DIE ON RED | HELP, FLEE, FOLLOW |

`npm test` checks this table against every allowed word by exhaustive search.

## Structure

- `src/systems/World.ts`: deterministic turn-based simulation (no Phaser), rules → behavior
- `src/rules/`: rule types, sentence rendering, interpreters, `RuleManager`
- `src/levels/levels.ts`: ASCII level maps
- `src/scenes/`: Phaser menu + game rendering
- `src/ui/`: DOM rule editor, level-complete card, sound, touch pad, viewport/device helpers
