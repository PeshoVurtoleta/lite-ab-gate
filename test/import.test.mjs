// test/import.test.mjs -- C-29 test floor: importing ABGate.js must be side-effect free.
// Until ABGate.js exists this file fails with ERR_MODULE_NOT_FOUND, so `npm test` fails closed.
// The in-process test is the only one that sees a synchronous `process.exitCode = 0`; the child probe sees
// what happens after import() resolves (late stdout, fs.writeSync(1), process.exit, an ungated async main).
// A synchronous process.exit(0) during the in-process import would end this file with code 0 before any test is
// registered (the runner counts that as a pass); the 'exit' guard turns it into exit code 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const writes = [];
const exitBefore = process.exitCode;
const realWrite = process.stdout.write;
let ns = null;
let importError = null;
const onExitDuringImport = () => {
  process.stderr.write('import.test.mjs: process exited during import of ../ABGate.js\n');
  process.exitCode = 1;
};
process.once('exit', onExitDuringImport);
process.stdout.write = function (chunk) { writes.push(String(chunk)); return true; };
try {
  ns = await import('../ABGate.js');
} catch (e) {
  importError = e;
} finally {
  process.stdout.write = realWrite;
  process.removeListener('exit', onExitDuringImport);
}
const exitAfter = process.exitCode;

test('import ../ABGate.js is side-effect free', () => {
  if (importError !== null) throw importError;
  assert.deepEqual(writes, [], 'stdout written during import');
  assert.equal(exitAfter, exitBefore, 'process.exitCode changed during import');
  assert.equal(typeof ns.verdictOf, 'function', 'verdictOf export (C-26)');
  assert.equal(typeof ns.judgeSpec, 'function', 'judgeSpec export (C-26)');
});

const PROBE = "const m = await import(process.argv[1]); process.once('beforeExit', () => process.stdout.write('IMPORTED ' + typeof m.verdictOf + ' ' + typeof m.judgeSpec + '\\n'));";

test('import ../ABGate.js in a child: no stdout, no process.exit, exit 0', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', PROBE, new URL('../ABGate.js', import.meta.url).href],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.stdout, 'IMPORTED function function\n', 'stdout written, process.exit called, or import failed');
  assert.equal(r.status, 0, 'child exit status ' + r.status);
});
