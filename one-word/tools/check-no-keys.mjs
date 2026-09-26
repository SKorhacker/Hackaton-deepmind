// Fails the build if an API key ended up in dist/ (keys must only be read in dev).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [/sk-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{30,}/];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const leaks = walk('dist').filter((f) => PATTERNS.some((p) => p.test(readFileSync(f, 'utf8'))));
if (leaks.length) {
  console.error(`API key found in build output: ${leaks.join(', ')}`);
  process.exit(1);
}
console.log('no API keys in dist/');
