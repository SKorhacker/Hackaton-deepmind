import { defineLevel } from '../defineLevel';

export default defineLevel({
  name: 'RED',
  map: [
    '###########',
    '#....RRR..#',
    '#....RRR..#',
    '#.P..RRR.E#',
    '#....RRR..#',
    '#....RRR..#',
    '###########',
  ],
  rules: [{
    subject: 'YOU', verb: 'DIE', condition: 'ON_RED',
    editablePart: 'verb', allowedReplacements: ['DIE', 'HIDE', 'HEAL', 'BOUNCE'],
  }],
  solutions: ['HIDE', 'HEAL', 'BOUNCE'],
  hintWords: ['hide', 'heal', 'bounce'],
  tutorial: true,
});
