import { defineLevel } from '../defineLevel';

export default defineLevel({
  name: 'PRESSURE',
  map: [
    '#############',
    '#P.....#....#',
    '#...._.D...E#',
    '#.....##....#',
    '#..G..##....#',
    '#.....##....#',
    '#############',
  ],
  rules: [{
    subject: 'GUARD', verb: 'CHASE', object: 'YOU',
    editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP', 'HELP', 'FREEZE'],
  }],
  solutions: ['HELP', 'FOLLOW'],
});
