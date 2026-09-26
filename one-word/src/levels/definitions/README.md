# Make a level

One file = one level. The game and `npm test` pick up every file here automatically (no list to
register it in).

The easy way: `npm run dev` → **MAKE A LEVEL** on the title screen. The editor paints the map,
tests every allowed word (or combination of words) for you and writes the file in this folder.

By hand: copy an existing file, rename it to the next free number, edit, done.

```bash
cp 01-red.ts 06-my-level.ts
npm run dev     # your level is at the end of the level select
npm test        # proves which words solve it
```

File name: `NN-slug.ts`, where `NN` is the level number (it is also the id shown in-game and the
play order). Two files with the same number is an error.

```ts
import { defineLevel } from '../defineLevel';

export default defineLevel({
  name: 'MY LEVEL',            // shown as "LEVEL 6 · MY LEVEL"
  map: [
    '###########',
    '#P...RRR.E#',
    '###########',
  ],
  rules: [{
    subject: 'YOU', verb: 'DIE', condition: 'ON_RED',
    editablePart: 'verb',      // the word players may rewrite
    allowedReplacements: ['DIE', 'HIDE', 'HEAL', 'BOUNCE'],
  }],
  solutions: ['HIDE'],         // words that must solve it; npm test checks every allowed word
  hintWords: ['hide'],         // optional: suggestions when a typed word isn't understood
});
```

## Several editable words

A level may let players rewrite more than one word — in the same rule with `editableParts`, or in
several rules. Each word is clicked and rewritten on its own, and a solution is then one word per
editable word, in reading order (see `06-two-words.ts`):

```ts
rules: [
  {
    subject: 'YOU', verb: 'DIE', condition: 'ON_RED',
    editableParts: [
      { part: 'verb', allowedReplacements: ['DIE', 'HIDE', 'BOUNCE'] },
      { part: 'condition', allowedReplacements: ['ON_RED', 'ON_BLUE'] },
    ],
  },
  {
    subject: 'GUARD', verb: 'CHASE', object: 'YOU',
    editablePart: 'verb', allowedReplacements: ['CHASE', 'HELP'],
  },
],
solutions: [['HIDE', 'ON_RED', 'HELP']],
```

`npm test` brute-forces every combination, so keep the allowed lists short (at most 512
combinations).

Map legend: `#` wall · `.` floor · `R` red · `B` blue · `E` exit · `_` pressure plate ·
`P` player · `G` guard · `K` key · `D` door. Rows must all be the same length. Every door opens
while a plate is pressed, or forever once the key is taken.

Rule vocabulary lives in `../../rules/RuleDefinition.ts` (subjects, verbs, objects, conditions)
and the words players may type map to those tokens in `../../rules/LocalWordInterpreter.ts`.

`npm test` brute-forces every allowed replacement (or combination) and fails if the solvable set
differs from `solutions` — so a level whose table is wrong, unsolvable, or accidentally solvable without
changing the word cannot be merged.
