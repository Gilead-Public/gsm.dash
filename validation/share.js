// @ts-check
// Packages a passing validation run's reports to share for feedback, with a read-me naming the run.
// Usage: node validation/share.js <run folder> --out <new folder>
import { resolve } from 'node:path';
import { option } from './lib/cli.js';
import { shareRun } from './lib/share.js';

const args = process.argv.slice(2);
const [dir] = args;
const out = option(args, '--out');
if (!dir || dir.startsWith('--') || !out) {
  console.error('usage: node validation/share.js <run folder> --out <new folder>');
  process.exit(2);
}
try {
  const files = shareRun(resolve(dir), resolve(out));
  console.log(`Shared ${files.length} reports in ${resolve(out)}`);
} catch (e) {
  console.error(`Not shared: ${/** @type {Error} */ (e).message}`);
  process.exit(1);
}
