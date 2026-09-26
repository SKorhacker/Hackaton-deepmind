import { defineLevel } from '../defineLevel';

export default defineLevel({
  name: 'GUARD',
  map: [
    '#############',
    '#.....#.....#',
    '#.....#..E..#',
    '#P..........#',
    '#.....#.....#',
    '#.....#..G..#',
    '#############',
  ],
  rules: [{
    subject: 'GUARD', verb: 'CHASE', object: 'YOU',
    editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP'],
  }],
  solutions: ['FOLLOW', 'FLEE', 'SLEEP'],
  hintWords: ['sleep', 'flee', 'follow'],
});
