// test/types/consumer.local.mjs (LOCAL ONLY, outside the npm test glob; run: `node test/types/consumer.local.mjs`) -- G-A B3: ABGate.d.ts compiles for a consumer (tsc strict, noEmit; node16 / nodenext / bundler
// resolution) through the SAME stage / tsconfig / spawn code as its controls:
//   (a) ABGate.d.ts left out of the staged copy -> non-zero with TS7016 (no declaration file);
//   (b) the first `// @ts-expect-error` line of consumer.ts removed -> non-zero with exactly one diagnostic, TS2353.
// typescript is NOT a devDependency of this package (law: no new dependency without the maintainer): tsc is found at
// <pkg>/node_modules/typescript (if installed) or at a sibling suite package's node_modules (../LiteBisect). With no tsc
// each test FAILS (never skips); the deterministic names / literals test (test/types.exports.test.mjs) is the CI gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let TSC = null;
for (const base of [join(ROOT, 'node_modules'), join(ROOT, '..', 'LiteBisect', 'node_modules')]) {
    try { TSC = (await import(pathToFileURL(join(base, 'typescript', 'lib', 'getExePath.js')).href)).default(); if (existsSync(TSC)) break; TSC = null; } catch (e) { TSC = null; }
}
const SKIP = 'typescript not found (no devDependency here; not in ../LiteBisect/node_modules either): this local check never skips';
const CONSUMER = readFileSync(join(ROOT, 'test', 'types', 'consumer.ts'), 'utf8');
const MODES = [['node16', 'node16', 'node16'], ['nodenext', 'nodenext', 'nodenext'], ['bundler', 'esnext', 'bundler']];

function withDir(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-types-'));
    try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function stage(dir, { dropDts, text }) {
    const pk = join(dir, 'node_modules', '@zakkster', 'lite-ab-gate');
    mkdirSync(pk, { recursive: true });
    for (const f of ['ABGate.js', 'ABGate.d.ts', 'package.json']) if (!(dropDts && f === 'ABGate.d.ts')) copyFileSync(join(ROOT, f), join(pk, f));
    writeFileSync(join(dir, 'consumer.ts'), text);
    writeFileSync(join(dir, 'package.json'), '{ "name": "c", "private": true, "type": "module" }\n');
    for (const [n, m, r] of MODES) writeFileSync(join(dir, 'tsconfig.' + n + '.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, lib: ['es2020'], skipLibCheck: false, module: m, moduleResolution: r }, files: ['consumer.ts'] }));
}
function tsc(dir, mode) {
    const r = spawnSync(TSC, ['-p', 'tsconfig.' + mode + '.json'], { cwd: dir, encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL' });
    assert.equal(r.error, undefined, 'tsc spawn error');
    assert.equal(r.signal, null, 'tsc killed by ' + r.signal);
    const out = (r.stdout || '') + (r.stderr || '');
    return { status: r.status, codes: [...out.matchAll(/error (TS\d+)/g)].map((m) => m[1]), out };
}
const dropFirstExpect = (t) => { const i = t.indexOf('// @ts-expect-error'); const j = t.indexOf('\n', i); return t.slice(0, i) + t.slice(j + 1); };

for (const [mode] of MODES) {
    test('types: consumer.ts compiles clean (tsc strict) in ' + mode + ' mode', () => {
    assert.ok(TSC !== null, SKIP);
        withDir((d) => { stage(d, { dropDts: false, text: CONSUMER }); const r = tsc(d, mode); assert.deepEqual(r.codes, [], r.out); assert.equal(r.status, 0); });
    });
}
test('types control (a): without ABGate.d.ts tsc fails with TS7016', () => {
    assert.ok(TSC !== null, SKIP);
    withDir((d) => { stage(d, { dropDts: true, text: CONSUMER }); const r = tsc(d, 'nodenext'); assert.notEqual(r.status, 0); assert.ok(r.codes.includes('TS7016'), r.out); });
});
test('types control (b): first @ts-expect-error removed -> exactly one diagnostic, TS2353', () => {
    assert.ok(TSC !== null, SKIP);
    withDir((d) => { stage(d, { dropDts: false, text: dropFirstExpect(CONSUMER) }); const r = tsc(d, 'nodenext'); assert.notEqual(r.status, 0); assert.deepEqual(r.codes, ['TS2353'], r.out); });
});
