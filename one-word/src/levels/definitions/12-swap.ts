import { defineLevel } from '../defineLevel';

// SWAP: a sleeping guard blocks the only corridor. Pushing it just parks it on the exit.
export default defineLevel({
  name: 'SWAP',
  map: [
    '###########',
    '#P........#',
    '#.........#',
    '#######.###',
    '#######G###',
    '#######.###',
    '#######E###',
    '###########',
  ],
  rules: [
    { subject: 'GUARD', verb: 'SLEEP' },
    {
      subject: 'YOU', verb: 'FLEE', object: 'GUARD',
      editablePart: 'verb', allowedReplacements: ['FLEE', 'PUSH', 'SWAP', 'FOLLOW'],
    },
  ],
  solutions: ['SWAP'],
});
