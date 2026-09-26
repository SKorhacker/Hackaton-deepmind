import { defineLevel } from '../defineLevel';

// PUSH: the guard is fast asleep. Shove it onto the plate (down, then left) to open the door.
export default defineLevel({
  name: 'SHOVE',
  map: [
    '#############',
    '#P..........#',
    '#...........#',
    '#...G.......#',
    '#...........#',
    '#._.........#',
    '########D####',
    '#.......E...#',
    '#############',
  ],
  rules: [
    { subject: 'GUARD', verb: 'SLEEP' },
    {
      subject: 'YOU', verb: 'FLEE', object: 'GUARD',
      editablePart: 'verb', allowedReplacements: ['FLEE', 'PUSH', 'FOLLOW', 'HELP'],
    },
  ],
  solutions: ['PUSH'],
});
