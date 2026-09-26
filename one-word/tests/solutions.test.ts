// Brute-force solver: for every level and every allowed combination of words
// (at most `maxChanges` rewritten, normally one), BFS over player inputs
// (4 moves + wait) to find whether the level is solvable.
//
// Normal levels: the winners must equal the level's declared solutions.
// Timed levels (`timed: true`): no word typed at the start may work, and a
// solution that rewrites words mid-level must exist.
//
//   npm test

import { loadLevels } from './loadLevels';
import { comboKey, solveEveryWord, solveTimed } from '../src/systems/Solver';

let failed = false;
for (const level of await loadLevels()) {
  const results = solveEveryWord(level);
  const found = results.filter((r) => r.steps !== null).map((r) => comboKey(r.words));
  let ok: boolean;
  let summary: string;
  if (level.timed) {
    const t = solveTimed(level);
    ok = found.length === 0 && t !== null;
    summary = `no fixed solution: ${found.length === 0 ? 'yes' : `NO [${found}]`}; timed: ${t ? `${t.script}  (ends as ${t.final})` : 'UNSOLVABLE'}`;
  } else {
    const expected = level.solutions.map(comboKey).sort().join(',');
    const got = [...found].sort().join(',');
    ok = expected === got;
    summary = `expected [${expected}] got [${got}]`;
  }
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'} Level ${level.id} ${level.name}: ${summary}`);
  if (!ok || process.env.VERBOSE) {
    console.log(results.map((r) => `   ${comboKey(r.words).padEnd(20)} ${r.steps === null ? 'unsolvable' : `solved in ${r.steps} turns`}`).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
