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
2. AI interpreter (optional): only for words the dictionary doesn't know. **Gemini** (`GeminiWordInterpreter`,
   `responseSchema`) when a Gemini key is set, otherwise **OpenAI** (`OpenAIWordInterpreter`, `json_schema`).
   Output is constrained to the level's allowed tokens (or NONE) and re-validated. It never generates code, and any
   failure falls back to "the world doesn't understand".

The game is fully playable without AI.

### AI keys

- **Dev:** `cp .env.example .env.local` and set `VITE_GEMINI_API_KEY` ([Google AI Studio](https://aistudio.google.com/apikey))
  and/or `VITE_OPENAI_API_KEY`. `.env.local` is gitignored and only read in dev mode. `npm run build` never includes
  it (`tools/check-no-keys.mjs` fails the build if a key shows up in `dist/`).
- **Deployed build:** click "AI interpreter: OFF" on the title screen and paste either key (OpenAI keys start with
  `sk-`). It stays in that browser's localStorage. (For a public demo, a small proxy server is the safer option.)
- Models: `VITE_GEMINI_MODEL` (default `gemini-3.8-flash`), `VITE_OPENAI_MODEL` (default `gpt-4.1-mini`).

## Levels

| # | Rule | Solutions |
|---|------|-----------|
| 1 | YOU **DIE** ON RED | HIDE, HEAL, BOUNCE |
| 2 | GUARD **CHASES** YOU | SLEEP, FLEE, FOLLOW |
| 3 | GUARD **CHASES** YOU (+ plate & door) | HELP, FOLLOW |
| 4 | GUARD CHASES **YOU** | KEY |
| 5 | GUARD **CHASES** YOU · YOU DIE ON RED | HELP, FLEE, FOLLOW |
| 6 | GUARD **CHASES** YOU · **YOU** DIE ON RED | timed: lure the guard onto red, then YOU → GUARD |
| 7 | GUARD **CHASES** YOU · **EVERYONE** DIES ON RED · YOU **FREEZE** ON BLUE | timed: EVERYONE → YOU, then CHASES → HELPS |
| 8 | YOU **DIE** ON RED · GUARD **CHASES** YOU (`maxChanges: 2`) | HIDE + HELP, HEAL + HELP, BOUNCE + HELP |

**The ONE WORD rule:** a level may have several editable words, but only one may differ from the original
sentences at a time. Rewriting another word restores the first. A level can raise this with `maxChanges`
(level 8 allows two).

**Timed levels** (`timed: true`): rewrites take effect instantly (a guard standing on a tile that just became
deadly dies), so *when* you change a word matters. For these levels `npm test` checks that no word typed at the
start works, and that a solution rewriting words mid-level exists.

`npm test` checks this table by exhaustive search over every allowed word (within `maxChanges`).

### Add your own

One file = one level, in `src/levels/definitions/`, named `NN-slug.ts`. Drop a new file in and it
appears in the game and in the test run — there is no list to register it in.

**With the editor (easiest):** `npm run dev`, then **MAKE A LEVEL** on the title screen (or
<http://localhost:5173/editor.html>). Paint the map, tick the words players may change (one or
several), hit **TEST LEVEL** (it brute-forces every combination and fills in `solutions`), then
**SAVE TO definitions/** — the dev server writes the file and the game reloads with your level.
On a deployed static build the same button downloads the `.ts` file to drop into the folder (and
send as a pull request).

**By hand:**

```bash
cp src/levels/definitions/01-red.ts src/levels/definitions/07-my-level.ts
npm run dev
npm test
```

See `src/levels/definitions/README.md` for the level format, the map legend and the rule vocabulary.

## Sound

Music is generated with Lyria 3 (Gemini API) and the one-shot SFX are synthesised offline; both live in
`public/audio/` (~2 MB total) and are reproducible with the scripts in `tools/audio/`.

The score follows the rule sentence rather than the level: while a guard still `CHASE`s `YOU` the tense bed
plays, and the moment you rewrite the word it crossfades to the calm or mysterious one. A win or a death
fires a short sting that ducks the bed under it.

Audio starts on the first tap or keypress (mobile autoplay rules) and the `♪` button, top right, mutes it;
the choice is remembered in localStorage.

## Structure

- `src/systems/World.ts`: deterministic turn-based simulation (no Phaser), rules → behavior
- `src/rules/`: rule types, sentence rendering, interpreters, `RuleManager`
- `src/levels/definitions/`: one file per level (auto-discovered, ordered by file number)
- `src/levels/levels.ts`: level discovery; `defineLevel.ts` / `registry.ts`: level format and loading
- `src/systems/Solver.ts`: brute-force solver, used by `npm test` and the editor's TEST LEVEL
- `src/editor/` + `editor.html`: visual level editor; `tools/levelWriterPlugin.ts` writes the file in dev
- `src/scenes/`: Phaser menu + game rendering
- `src/ui/`: DOM rule editor, level-complete card, `Audio.ts` (music beds, stings, samples) and `Sfx.ts`
- `tools/audio/`: the generation scripts for everything in `public/audio/`
