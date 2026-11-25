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
const globalsBefore = Reflect.ownKeys(globalThis);   // C-32 / M15: string AND symbol keys, before the import
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
const globalsAfter = Reflect.ownKeys(globalThis);

test('import ../ABGate.js is side-effect free', () => {
  if (importError !== null) throw importError;
  assert.deepEqual(writes, [], 'stdout written during import');
  assert.equal(exitAfter, exitBefore, 'process.exitCode changed during import');
  assert.equal(typeof ns.verdictOf, 'function', 'verdictOf export (C-26)');
  assert.equal(typeof ns.judgeSpec, 'function', 'judgeSpec export (C-26)');
});

// C-32 (maintainer 2026-11-25), plan-GA ASSERTION 5: importing adds 0 globalThis keys (the __lab* injection cells are
// created lazily in armNatives, never at import). `addedKeys` is judged by the same function in the must-fail control.
const addedKeys = (before, after) => after.filter((k) => !before.includes(k)).map(String);
test('import adds 0 globalThis keys', () => {
  if (importError !== null) throw importError;
  assert.deepEqual(addedKeys(globalsBefore, globalsAfter), [], 'import added globalThis keys');
  for (const k of ['__labSpin', '__labBox', '__labBoxN', '__labLate', '__labWarm']) assert.equal(Object.hasOwn(globalThis, k), false, k + ' exists after import');
});
test('import adds 0 globalThis keys: must-fail control (a string key and a symbol key added are both reported)', () => {
  const sym = Symbol('leak');
  assert.deepEqual(addedKeys(globalsBefore, [...globalsBefore, '__leak', sym]), ['__leak', 'Symbol(leak)']);
  assert.deepEqual(addedKeys(globalsBefore, globalsBefore), []);
});
test('import adds 0 globalThis keys in a child (fresh process, nothing else loaded)', () => {
  const CHILD = "const b = Reflect.ownKeys(globalThis); await import(process.argv[1]); const a = Reflect.ownKeys(globalThis); process.stdout.write('ADDED ' + JSON.stringify(a.filter((k) => !b.includes(k)).map(String)) + '\\n');";
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD, new URL('../ABGate.js', import.meta.url).href], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.stdout, 'ADDED []\n', 'a global was added by the import (or the import failed): ' + r.stderr.slice(0, 300));
});

const PROBE = "const m = await import(process.argv[1]); process.once('beforeExit', () => process.stdout.write('IMPORTED ' + typeof m.verdictOf + ' ' + typeof m.judgeSpec + '\\n'));";

test('import ../ABGate.js in a child: no stdout, no process.exit, exit 0', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', PROBE, new URL('../ABGate.js', import.meta.url).href],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.stdout, 'IMPORTED function function\n', 'stdout written, process.exit called, or import failed');
  assert.equal(r.status, 0, 'child exit status ' + r.status);
});
