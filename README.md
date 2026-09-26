# ONE WORD

> **Change one word. Change the world.**

ONE WORD is a puzzle game where the rules of the world are written as sentences — and you are allowed
to rewrite exactly one word.

```
YOU [DIE] ON RED      →      YOU [HIDE] ON RED
```

Type `hide` and the red floor stops killing you: it hides you from the guard instead. Type `bounce` and
it launches you across. Type `hibernate`, `levitate` or `dormir` and **Gemini** works out what you mean —
or, in Creative mode, invents a brand-new law of physics for the word you typed.

> **📸 Screenshot to add — `docs/screenshots/hero.png`**
> The moment of a rewrite: Level 3 with the rule bar reading **GUARD [HELPS] YOU** (the rewritten word
> highlighted in yellow), the green guard walking towards the yellow pressure plate along its dotted path,
> and the "RULE REWRITTEN" flash in the middle of the grid.

---

## Play

```bash
cd one-word
npm install
npm run dev          # open the address it prints
```

- **Move:** arrow keys / WASD (or click a tile) · **Wait:** Space · **Restart:** R
- **Rewrite:** click the highlighted word in the rule, type **one** word, press Enter
- Reach the green **EXIT**

To use Gemini, put a [Google AI Studio](https://aistudio.google.com/apikey) key in `one-word/.env.local`
(`VITE_GEMINI_API_KEY=...`), or paste it on the title screen. The game is fully playable without a key.

![Uploading image.png…]()


---

## How it works

### 1. Every level is a sentence

Levels are small grids — red and blue tiles, guards, keys, doors and pressure plates — governed by one to
three rule sentences such as `GUARD CHASES YOU` or `EVERYONE DIES ON RED`. One word is boxed: that is the
word you may change. The world obeys the new sentence **immediately**: guards change their plan, tiles
change what they do, and the icons on the map update to show the new law.

Some levels allow several editable words but still only **one change at a time** — and in the hardest ones,
*when* you rewrite matters as much as *what* you write (lure the guard onto the red, *then* make red deadly
for guards).

> **📸 Screenshot to add — `docs/screenshots/multi-rule.png`**
> Level 7 "TRAP" with its three rules stacked in the rule bar (GUARD [CHASES] YOU · [EVERYONE] DIES ON RED ·
> YOU [FREEZE] ON BLUE), the red island with the pressure plate inside it, the blue strip and the guard.

### 2. Gemini understands your word

The game ships with sixteen mechanics — `DIE HIDE HEAL BOUNCE FREEZE SLEEP FOLLOW CHASE FLEE HELP OPEN ATTACK
SLIDE TELEPORT PUSH SWAP` — and a dictionary of ~190 everyday words that map onto them instantly.

For anything else, **Gemini** reads the sentence with the blank, the word you typed and the words allowed in
this level, and answers with structured output (a JSON schema restricted to those words):

| You type | In the sentence | Gemini decides |
|---|---|---|
| `hibernate` | GUARD ___ YOU | **SLEEP** — "sleeps through winter" |
| `cooperate` | GUARD ___ YOU | **HELP** |
| `banana` | YOU ___ ON RED | **BOUNCE** — slipping on a peel |
| `xqzv` | anything | nothing — "the world doesn't understand that word" |

The short explanation Gemini gives is shown under the grid, so the player sees *how* the world read them.

> **📸 Screenshot to add — `docs/screenshots/gemini-note.png`**
> Level 2 right after typing `hibernate`: the rule bar reads **GUARD [SLEEPS]**, the guard is grey with a
> floating "z", and the line under the grid reads *AI understood "hibernate" as SLEEP — …*.

### 3. Creative mode: Gemini invents new physics

Switch the title screen to **CREATIVE** and verbs stop being a menu. Type `levitate` and there is no
dictionary entry to fall back on — Gemini writes a **mechanic spec** for it, for example:

```ts
{ token: 'LEVITATE',
  tile: { onEnter: [], status: ['safe'] },     // what the tile does to whoever steps on it
  note: 'You float above red tiles unharmed' }
```

The spec is **data, never code**: a small vocabulary of actions (`die`, `freeze`, `push`, `slide`, `teleport`,
`swap`, `unlock`, `heal`), statuses (`hidden`, `phasing`, `safe`) and ways to move (`approach`, `avoid`,
`trail`, `idle`). Every spec is validated and clamped before it runs — unknown fields are dropped, numbers are
capped, a fleeing guard can never be lethal, and an invented word can never overwrite a built-in one. A
hallucination becomes a dull tile, not a crash. The sixteen shipped mechanics are written in exactly the same
format, with no special privileges.

> **📸 Screenshot to add — `docs/screenshots/creative.png`**
> Creative mode, Level 1: the rule bar reads **YOU [LEVITATE] ON RED**, the player floating across the red
> band, and Gemini's note *"You float above red tiles unharmed"* under the grid.

---

## The Studio: make your own levels

Click **MAKE A LEVEL** on the title screen to open the Studio, a visual level editor:

1. **Paint** the map with brushes: floor, wall, red, blue, exit, plate, player, guard, key, door.
2. **Write the rules**: pick subject, verb, object and condition, and tick which words players may change
   and what they may become.
3. **TEST LEVEL** runs the same brute-force solver as the test suite and reports every word that solves it —
   an unsolvable level can't be saved.
4. **SAVE** writes the level as one small file into `one-word/src/levels/definitions/`, and it appears in the
   game immediately. There is no list to register it in.

> **📸 Screenshot to add — `docs/screenshots/studio.png`**
> The Studio with a half-painted map on the left (red tiles, a guard, a plate and a door), the rule editor
> on the right with a ticked "WORDS PLAYERS MAY CHANGE" box and its chips, and the TEST LEVEL result
> "Solvable with: HIDE, HEAL, BOUNCE".

### Built for a community

Everything a player can make is a small, readable, reviewable file — so ONE WORD can grow the way word
games and puzzle communities do:

- **Community levels (works today).** A level is one `.ts` file the Studio writes for you. On a deployed
  build the Studio downloads the file instead, ready to share or send as a pull request. Every submitted
  level is proven solvable by `npm test` before it can be merged, so a community pack can't contain a broken
  puzzle.
- **Community words (works today).** The dictionary is a plain list of word → mechanic entries; adding
  `yeet → PUSH` or `nap → SLEEP` is a one-line contribution.
- **Community mechanics (the next step, built on Creative mode).** Because mechanics are data, a new law of
  physics is just a spec like the one Gemini writes in Creative mode. The idea: players discover words in
  Creative mode, the best inventions (`LEVITATE`, `VANISH`, `MELT`…) are shared and voted on, and the
  favourites are promoted into the official vocabulary — with the same validator and solver checks as every
  built-in. The game's language would be written by its players.

---

## What makes it solid

- **Every level is proven solvable.** A brute-force solver tries every allowed word (and, for timed levels,
  every word at every moment) and checks the result against the level's declared solutions.
- **Safety tests for invented mechanics** — junk is rejected, absurd numbers are clamped, invented words
  behave deterministically.
- **The AI can't break the game.** Gemini only ever returns data that is validated before use; with no key,
  or on any error, the game falls back to its dictionary.
- **Keys stay private.** API keys are read only in development; the production build fails if a key ever
  ends up in it.

## Built with

TypeScript · Phaser 3 · Vite · Google Gemini (structured output) · a custom deterministic turn-based
simulation and solver.

## Repository

- [`one-word/`](one-word/) — the game ([developer guide](one-word/README.md): levels, mechanics, code layout)
- `other-games/` — earlier prototypes from the hackathon, not part of ONE WORD

## Team

<!-- Add team members here -->
