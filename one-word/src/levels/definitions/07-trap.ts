import { defineLevel } from '../defineLevel';

// Timed level: no word works if typed at the start. See tests/solutions.test.ts.
export default defineLevel({
  name: 'TRAP',
  map: [
    '###############',
    '#P.......#....#',
    '#........#.E..#',
    '#..RRR...#....#',
    '#..R_R...##D###',
    '#..R.R..BBB...#',
    '#..RRR..#####.#',
    '#.............#',
    '#......G......#',
    '###############',
  ],
  rules: [
    {
      subject: 'GUARD', verb: 'CHASE', object: 'YOU',
      editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP', 'HELP', 'FREEZE'],
    },
    {
      subject: 'EVERYONE', verb: 'DIE', condition: 'ON_RED',
      editablePart: 'subject', allowedReplacements: ['EVERYONE', 'YOU', 'GUARD'],
    },
    {
      subject: 'YOU', verb: 'FREEZE', condition: 'ON_BLUE',
      editablePart: 'verb', allowedReplacements: ['FREEZE', 'BOUNCE', 'HIDE', 'HEAL', 'SLEEP', 'DIE'],
    },
  ],
  solutions: [],
  timed: true,
  intro: 'One word at a time. Not one word only.',
});
