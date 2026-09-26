import { defineLevel } from '../defineLevel';

export default defineLevel({
  name: 'CHOICES',
  map: [
    '###############',
    '#P......R...._#',
    '#.......R.....#',
    '#...G...R.....#',
    '#.......RRRRRR#',
    '#.........#####',
    '#######_.D..E##',
    '###############',
  ],
  rules: [
    { subject: 'YOU', verb: 'DIE', condition: 'ON_RED' },
    {
      subject: 'GUARD', verb: 'CHASE', object: 'YOU',
      editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP', 'HELP', 'FREEZE'],
    },
  ],
  solutions: ['HELP', 'FLEE', 'FOLLOW'],
});
