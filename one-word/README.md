# ONE WORD

> Change one word. Change the world.

Each level has one rule sentence, e.g. `YOU [DIE] ON RED`. Click the highlighted word, type a
replacement (`hide`), and the world obeys the new sentence. Reach the exit.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/ (works on any static host / Hugging Face Spaces)
npm test         # brute-force solver: proves which words solve each level
```

Controls: **WASD / arrows** move · **Space** wait · **Enter / E** edit the word · **R** restart · **Esc** menu · **`** debug overlay.

## How words become mechanics

1. `LocalWordInterpreter`: dictionary + stemming (`protect` → HELP, `sleeping` → SLEEP).
2. `LLMWordInterpreter` (optional): only for words the dictionary doesn't know. OpenAI structured output is
   constrained to the level's allowed tokens (or NONE) and re-validated. It never generates code, and any failure
   falls back to "the world doesn't understand".

The game is fully playable without AI.

### OpenAI key

- **Dev:** put `VITE_OPENAI_API_KEY=...` in `.env.local` (gitignored). It is only read in dev mode and is **not**
  included in `npm run build` output.
- **Deployed build:** click "AI interpreter: OFF" on the title screen to paste a key. It stays in that browser's
  localStorage. (For a public demo, a small proxy server is the safer option.)
- Model: `VITE_OPENAI_MODEL` (default `gpt-4.1-mini`).

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
- `src/ui/`: DOM rule editor, level-complete card, sound
