import { parseMap, type LevelData } from './LevelData';

// Legend: # wall  . floor  R red  B blue  E exit  _ plate  P player  G guard  K key  D door

export const LEVELS: LevelData[] = [
  {
    id: 1,
    name: 'RED',
    ...parseMap([
      '###########',
      '#....RRR..#',
      '#....RRR..#',
      '#.P..RRR.E#',
      '#....RRR..#',
      '#....RRR..#',
      '###########',
    ]),
    rules: [{
      subject: 'YOU', verb: 'DIE', condition: 'ON_RED',
      editablePart: 'verb', allowedReplacements: ['DIE', 'HIDE', 'HEAL', 'BOUNCE'],
    }],
    solutions: ['HIDE', 'HEAL', 'BOUNCE'],
    hintWords: ['hide', 'heal', 'bounce'],
    tutorial: true,
  },
  {
    id: 2,
    name: 'GUARD',
    ...parseMap([
      '#############',
      '#.....#.....#',
      '#.....#..E..#',
      '#P..........#',
      '#.....#.....#',
      '#.....#..G..#',
      '#############',
    ]),
    rules: [{
      subject: 'GUARD', verb: 'CHASE', object: 'YOU',
      editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP'],
    }],
    solutions: ['FOLLOW', 'FLEE', 'SLEEP'],
    hintWords: ['sleep', 'flee', 'follow'],
  },
  {
    id: 3,
    name: 'PRESSURE',
    ...parseMap([
      '#############',
      '#P.....#....#',
      '#...._.D...E#',
      '#.....##....#',
      '#..G..##....#',
      '#.....##....#',
      '#############',
    ]),
    rules: [{
      subject: 'GUARD', verb: 'CHASE', object: 'YOU',
      editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP', 'HELP', 'FREEZE'],
    }],
    solutions: ['HELP', 'FOLLOW'],
  },
  {
    id: 4,
    name: 'NOUN',
    ...parseMap([
      '#############',
      '#....#......#',
      '#P...D...E..#',
      '#....#......#',
      '##.######...#',
      '#...G..K#...#',
      '#############',
    ]),
    rules: [{
      subject: 'GUARD', verb: 'CHASE', object: 'YOU',
      editablePart: 'object', allowedReplacements: ['YOU', 'KEY', 'EXIT', 'RED', 'DOOR', 'PLATE'],
    }],
    solutions: ['KEY'],
  },
  {
    id: 5,
    name: 'CHOICES',
    ...parseMap([
      '###############',
      '#P......R...._#',
      '#.......R.....#',
      '#...G...R.....#',
      '#.......RRRRRR#',
      '#.........#####',
      '#######_.D..E##',
      '###############',
    ]),
    rules: [
      { subject: 'YOU', verb: 'DIE', condition: 'ON_RED' },
      {
        subject: 'GUARD', verb: 'CHASE', object: 'YOU',
        editablePart: 'verb', allowedReplacements: ['CHASE', 'FOLLOW', 'FLEE', 'SLEEP', 'HELP', 'FREEZE'],
      },
    ],
    solutions: ['HELP', 'FLEE', 'FOLLOW'],
  },
];
