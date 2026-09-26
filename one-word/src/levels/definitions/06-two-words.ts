import { defineLevel } from '../defineLevel';

export default defineLevel({
  name: 'TWO WORDS',
  map: [
    '#############',
    '#P..#.....#E#',
    '#...#.....#.#',
    '#RRR#.....#.#',
    '#...R.....D.#',
    '#...#..G..#.#',
    '#...#.._..#.#',
    '#...#.....#.#',
    '#############',
  ],
  rules: [
    {
      subject: 'YOU', verb: 'DIE', condition: 'ON_RED',
      editablePart: 'verb', allowedReplacements: ['DIE', 'HIDE', 'HEAL', 'BOUNCE'],
    },
    {
      subject: 'GUARD', verb: 'CHASE', object: 'YOU',
      editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'SLEEP', 'HELP'],
    },
  ],
  // Two words to rewrite: surviving the red bridge, and getting the guard to
  // hold the pressure plate that keeps the door open.
  solutions: [['HIDE', 'HELP'], ['HEAL', 'HELP'], ['BOUNCE', 'HELP']],
  hintWords: ['BOUNCE', 'HELP'],
});
