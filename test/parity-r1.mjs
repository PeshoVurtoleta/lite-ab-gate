// test/parity-r1.mjs -- G-A B3 (plan-GA ASSERTION 3): LOCAL-ONLY parity of ABGate.js against the frozen ab-proto 74f1a3d4 on the
// R1 (LiteOhlc) lane: `--oracle-only`, masked (timing: false), must equal golden/r1-oracle-only.log: 0 of 16 lines differ.
// Run by `npm run parity:r1`; NOT a *.test.mjs, so `npm test` never runs it. It never skips and never exits 0 unless it
// compared: exit 1 when GITHUB_ACTIONS=true (the lane binds the live LiteOhlc files by ABSOLUTE paths, X5 / C-17: hosted
// runs must not depend on a local path), when a LiteOhlc source the lane needs is missing, or on any difference.
// The expected text is read from the golden file; the LiteOhlc paths are read from the lane file's own LIVE_PKG constant.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { maskLog } from './fixtures/golden/mask.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R1 = join(ROOT, 'test', 'fixtures', 'r1');
const FLAGS = ['--expose-gc', '--allow-natives-syntax', '--no-concurrent-recompilation', '--min-semi-space-size=4', '--max-semi-space-size=4', '--single-threaded-gc'];
const WANT_LINES = 16;
function fail(msg) { process.stderr.write('parity-r1: FAIL ' + msg + '\n'); process.exit(1); }

if (process.env.GITHUB_ACTIONS === 'true') fail('GITHUB_ACTIONS=true: this check is local only (the r1 lane binds absolute LiteOhlc paths); it never skips');
const laneText = readFileSync(join(R1, 'ohlc-lane.mjs'), 'utf8');
const pk = /const LIVE_PKG = '([^']+)';/.exec(laneText);
if (pk === null) fail('ohlc-lane.mjs has no LIVE_PKG constant');
const needs = [join(pk[1], 'Ohlc.js'), join(pk[1], 'bench', 'baseline.mjs')];
for (const f of needs) if (!existsSync(f)) fail('LiteOhlc source missing: ' + f + ' (check out LiteOhlc at ' + pk[1] + '; this check never skips)');

const golden = readFileSync(join(ROOT, 'test', 'fixtures', 'golden', 'r1-oracle-only.log'), 'utf8');
const gl = golden.split('\n'); if (gl[gl.length - 1] === '') gl.pop();
if (gl.length !== WANT_LINES) fail('golden r1-oracle-only.log has ' + gl.length + ' lines (want ' + WANT_LINES + ')');

const env = { ...process.env }; delete env.AB_GATE_INJECT; delete env.GITHUB_ACTIONS;
const r = spawnSync(process.execPath, [...FLAGS, join(ROOT, 'ABGate.js'), 'ohlc-lane.mjs', '--oracle-only'], { cwd: R1, encoding: 'utf8', env, timeout: 300000 });
if (r.status !== 0) fail('ABGate.js exit ' + r.status + '\n' + (r.stdout || '').slice(-600) + (r.stderr || '').slice(-600));
const al = maskLog(r.stdout, { timing: false }).split('\n'); if (al[al.length - 1] === '') al.pop();
let diff = 0;
for (let i = 0; i < Math.max(al.length, gl.length); i++) {
    if (al[i] !== gl[i]) { diff++; process.stderr.write('parity-r1: line ' + (i + 1) + ' differs\n  got : ' + String(al[i]).slice(0, 300) + '\n  want: ' + String(gl[i]).slice(0, 300) + '\n'); }
}
if (diff !== 0) fail(diff + ' of ' + WANT_LINES + ' lines differ');
process.stdout.write('parity-r1: 0 of ' + WANT_LINES + ' lines differ (ABGate.js --oracle-only on the r1 lane vs golden/r1-oracle-only.log, masked)\n');
