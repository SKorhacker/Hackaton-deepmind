import { defineLevel } from '../defineLevel';

// SLIDE: the ice lane is too slow to walk with a guard on your heels — but you can fly across it.
export default defineLevel({
  name: 'ICE',
  map: [
    '###############',
    '#BBBBBBBBBBBBE#',
    '#P............#',
    '#.............#',
    '#......G......#',
    '###############',
  ],
  rules: [
    { subject: 'GUARD', verb: 'CHASE', object: 'YOU' },
    {
      subject: 'YOU', verb: 'FREEZE', condition: 'ON_BLUE',
      editablePart: 'verb', allowedReplacements: ['FREEZE', 'SLIDE', 'SLEEP', 'HEAL', 'DIE'],
    },
  ],
  solutions: ['SLIDE'],
  intro: 'Blue is ice.',
});
