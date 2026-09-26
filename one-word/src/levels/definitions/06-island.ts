import { defineLevel } from '../defineLevel';

// Timed level: no word works if typed at the start. See tests/solutions.test.ts.
export default defineLevel({
  name: 'ISLAND',
  map: [
    '#############',
    '#...........#',
    '#.P.........#',
    '#......RRRR.#',
    '#......R.ER.#',
    '#......RG.R.#',
    '#......RRRR.#',
    '#...........#',
    '#############',
  ],
  rules: [
    {
      subject: 'GUARD', verb: 'CHASE', object: 'YOU',
      editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP', 'HELP', 'FREEZE'],
    },
    {
      subject: 'YOU', verb: 'DIE', condition: 'ON_RED',
      editablePart: 'subject', allowedReplacements: ['YOU', 'GUARD', 'EVERYONE'],
    },
  ],
  solutions: [],
  timed: true,
  intro: 'Words can change at any moment.',
});
