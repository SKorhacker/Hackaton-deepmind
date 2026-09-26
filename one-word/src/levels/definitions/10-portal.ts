import { defineLevel } from '../defineLevel';

// TELEPORT: the exit room has no door. Blue tiles send you to the next blue tile.
export default defineLevel({
  name: 'PORTAL',
  map: [
    '#############',
    '#P....#.....#',
    '#..B..#.....#',
    '#.....#..B..#',
    '#.....#.....#',
    '#.B...#..E..#',
    '#############',
  ],
  rules: [{
    subject: 'YOU', verb: 'HIDE', condition: 'ON_BLUE',
    editablePart: 'verb', allowedReplacements: ['HIDE', 'TELEPORT', 'SLIDE', 'BOUNCE', 'FREEZE'],
  }],
  solutions: ['TELEPORT'],
  intro: 'No door. No problem?',
});
