import { defineLevel } from '../defineLevel';

export default defineLevel({
  name: 'NOUN',
  map: [
    '#############',
    '#....#......#',
    '#P...D...E..#',
    '#....#......#',
    '##.######...#',
    '#...G..K#...#',
    '#############',
  ],
  rules: [{
    subject: 'GUARD', verb: 'CHASE', object: 'YOU',
    editablePart: 'object', allowedReplacements: ['YOU', 'KEY', 'EXIT', 'RED', 'DOOR', 'PLATE'],
  }],
  solutions: ['KEY'],
});
