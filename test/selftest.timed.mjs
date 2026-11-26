// test/selftest.timed.mjs -- U8 B2 (plan-U8 TASK 2, ASSERTIONS A1 / A2 / A4; SPEC C-3, C-11, C-21, C-34, C-37, C-38,
// C-39, C-60 G3, C-62). The LOCAL timed selftest harness. It is NOT *.test.mjs and never runs inside npm test / verify
// (C-3): every step below spawns timed children. Run it ONLY under the quiet-host lock, before each dogfood dispatch:
//   node ~/.claude/hooks/quiet-lock.mjs run --strict "lite-ab-gate timed selftest" -- node test/selftest.timed.mjs [--capture]
// Options: --capture (write test/fixtures/timed-real/lines.json, only when every step is ok), --tool <ABGate.js>
// (default ./ABGate.js; e.g. a frozen build for a revert check), --gate <gate file> (default examples/ab.gate.mjs).
// The node flags of the tool are package.json's "torture" script flags (the tool spawns its own children with them).
// Steps:
//   (i)   `--selftest` on the gate: exit 0, `SELFTEST ran 78 of 78 (untimed 67, timed 11)`, `SELFTEST all ok`, and >= 4
//         lines starting `SELFTEST   VOID ` (C-60 G3: the passing-row VOID replay).
//   (ii)  must-fail: a temp copy of the tool (exact-once replace, else FAIL) whose timed loop spawns every child with
//         envWith(null): exit 1, `SELFTEST <n> FAIL` with n = the injection cases (10 on the dogfood gate), no `all ok`.
//   (iii) 13 own children: the 9 --selftest injections + tool-deopt on lane `null`, bent-oracle on `double`, clean on
//         `null` and `double` (K = the injection's K, else 3), INJECTIONS sliced from the tool's source (never imported).
//         Gates (test/fixtures/timed-real/surface.mjs, shared with npm test): markerRealGate (A2), childGate (C-11 /
//         C-34 / C-62 (1) / A4), realControls (the loosened-prefix / literal / child-edit must-fail controls).
//   (iv)  --capture: lines.json = toolSha, surfaceSha (surface.mjs surfaceSha: the ONE definition), node, ISO date,
//         load1, busy-node, the quiet-lock status line, and per child its exit and ONLY its STOP / VOID / WARM / RESULT /
//         RAW / WINDOW / SETTLE lines.
// Exit: 0 every step ok | 1 FAIL (incl. a step that cannot run: never a skip) | 2 node < 26 (C-31: the WINDOW rows).
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir, loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectionsOf, surfaceSha, sha256, CHILDREN, KEEP_RE, markerRealGate, childGate, realControls, TIMED } from './fixtures/timed-real/surface.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'test', 'fixtures', 'timed-real');
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
if (!(NODE_MAJOR >= 26)) {
    console.log('TIMED node ' + process.version + ' < 26: the WINDOW tool-bytes rows cannot hold (C-31) -> exit 2');
    process.exit(2);
}
const argv = process.argv.slice(2);
let capture = false, tool = join(ROOT, 'ABGate.js'), gate = join(ROOT, 'examples', 'ab.gate.mjs');
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--capture') capture = true;
    else if (argv[i] === '--tool' && i + 1 < argv.length) tool = resolve(argv[++i]);
    else if (argv[i] === '--gate' && i + 1 < argv.length) gate = resolve(argv[++i]);
    else { console.log('TIMED unknown or incomplete option ' + JSON.stringify(argv[i]) + ' (want --capture, --tool <file>, --gate <file>) -> FAIL'); process.exit(1); }
}
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const FLAGS = String((PKG.scripts || {}).torture || '').split(/\s+/).filter((t) => t.startsWith('--'));
if (FLAGS.length === 0) { console.log('TIMED package.json "torture" script has no node flags -> FAIL'); process.exit(1); }

function lockStatus() {
    try {
        const r = spawnSync(process.execPath, [join(homedir(), '.claude', 'hooks', 'quiet-lock.mjs'), 'status'], { encoding: 'utf8', timeout: 30000 });
        const l = ((r.stdout || '') + (r.stderr || '')).split('\n').map((s) => s.trim()).filter(Boolean);
        return l.length > 0 ? l.join(' | ') : 'quiet-lock: status printed nothing (exit ' + r.status + ')';
    } catch (e) { return 'quiet-lock: status unavailable (' + e.message + ')'; }
}
function busyNode() {
    try {
        const out = execFileSync('ps', ['-Ao', 'pcpu=,pid=,comm='], { encoding: 'utf8' });
        return out.split('\n').map((l) => l.trim()).filter((l) => l && /(^|\/)node( |$)/.test(l.split(/\s+/).slice(2).join(' ')) &&
            Number(l.split(/\s+/)[0]) >= 10 && Number(l.split(/\s+/)[1]) !== process.pid).join(' | ');
    } catch (e) { return 'ps failed: ' + e.message; }
}
const env = (inject) => {
    const e = { ...process.env };
    delete e.AB_GATE_INJECT; delete e.GITHUB_ACTIONS; delete e.NODE_OPTIONS;
    if (inject !== null) e.AB_GATE_INJECT = inject;
    return e;
};
function run(toolPath, args, inject) {
    const r = spawnSync(process.execPath, [...FLAGS, toolPath, gate, ...args], { cwd: ROOT, env: env(inject), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1800000 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') + (r.error ? '\nspawn error ' + r.error.message : '') };
}

let bad = 0;
const row = (ok, txt) => { console.log('TIMED ' + txt + ' -> ' + (ok ? 'ok' : 'FAIL')); if (!ok) bad++; };
const src = readFileSync(tool, 'utf8');
const toolSha = sha256(src);
const lock = lockStatus(), load1 = loadavg()[0], busy = busyNode(), date = new Date().toISOString();
let surf = null, table = null;
try { surf = surfaceSha(src); table = injectionsOf(src); } catch (e) { row(false, 'INJECTIONS slice: ' + e.message); }
console.log('TIMED HEADER tool ' + tool + ' sha256 ' + toolSha.slice(0, 8) + ' surface ' + (surf === null ? 'none' : surf.slice(0, 8)) + ' gate ' + gate +
    ' node ' + process.version + ' ' + date + ' load1 ' + load1.toFixed(2) + ' busy-node [' + busy + '] flags ' + FLAGS.join(' '));
console.log('TIMED HEADER lock ' + lock);

// ---- (i) the tool's own --selftest
const t0 = Date.now();
const st = run(tool, ['--selftest'], null);
const stLines = st.out.split('\n');
const nVoid = stLines.filter((l) => l.startsWith('SELFTEST   VOID ')).length;
const ranOk = stLines.includes('SELFTEST ran 78 of 78 (untimed 67, timed 11)'), allOk = stLines.includes('SELFTEST all ok');
row(st.status === 0 && ranOk && allOk && nVoid >= 4, '(i) --selftest: exit ' + st.status + ' (want 0) ran-line ' + (ranOk ? 'present' : 'ABSENT') +
    ' all-ok ' + (allOk ? 'present' : 'ABSENT') + ' "SELFTEST   VOID " lines ' + nVoid + ' (want >= 4) [' + ((Date.now() - t0) / 1000).toFixed(0) + ' s]');
if (st.status !== 0 || !ranOk || !allOk) for (const l of stLines) if (/ -> FAIL$|^SELFTEST (ran|all ok|\d+ FAIL)/.test(l)) console.log('TIMED   ' + l.slice(0, 400));

// ---- (ii) must-fail: the timed loop with envWith(null)
const FROM = "const r = child(ctx, ['--run', lane, '--K', String(k)], envWith(name), undefined);";
const TO = "const r = child(ctx, ['--run', lane, '--K', String(k)], envWith(null), undefined);";
const nFrom = src.split(FROM).length - 1;
if (nFrom !== 1) row(false, '(ii) must-fail site matches ' + nFrom + ' times (want exactly 1)');
else {
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-timed-'));
    try {
        const copy = join(dir, 'ABGate.js');
        writeFileSync(copy, src.replace(FROM, TO));
        const t1 = Date.now();
        const mf = run(copy, ['--selftest'], null);
        const ml = mf.out.split('\n');
        const failRows = ml.filter((l) => /^SELFTEST \S+ \S+ K=\d+: .* -> FAIL$/.test(l));
        const injFail = failRows.filter((l) => TIMED.includes(l.split(' ')[1])).length;
        const sum = ml.find((l) => /^SELFTEST (\d+ FAIL|all ok)$/.test(l));
        const want = 10;
        row(mf.status === 1 && sum === 'SELFTEST ' + want + ' FAIL' && injFail === want && failRows.length === want && !ml.includes('SELFTEST all ok'),
            '(ii) must-fail envWith(null) copy: exit ' + mf.status + ' (want 1) summary ' + JSON.stringify(sum) + ' (want "SELFTEST ' + want + ' FAIL") failing timed rows ' +
            failRows.length + ' (injection rows ' + injFail + ', want ' + want + ') [' + ((Date.now() - t1) / 1000).toFixed(0) + ' s]');
    } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---- (iii) the 13 own children
const children = {};
const t2 = Date.now();
if (table !== null) {
    for (const c of CHILDREN) {
        const k = c.inject === null ? 3 : (table[c.inject] && table[c.inject].K) || 3;
        const r = run(tool, ['--run', c.lane, '--K', String(k)], c.inject);
        const lines = r.out.split('\n').filter((l) => KEEP_RE.test(l));
        children[c.key] = { inject: c.inject, lane: c.lane, K: k, exit: r.status, lines };
        console.log('TIMED child ' + c.key + ' K=' + k + ' exit ' + r.status + ' kept ' + lines.length + ' lines');
        for (const l of lines) console.log('TIMED   ' + l.slice(0, 460));
    }
    const mg = markerRealGate(table, children), cg = childGate(table, children), ctl = realControls(table, children);
    row(mg.length === 0, '(iii) A2 marker gate on ' + CHILDREN.length + ' real children (' + Object.keys(table).length + ' markers, ' + TIMED.length + ' timed): ' +
        (mg.length === 0 ? 'own marker 1 line each, CLEAN_ZERO 0 in clean, 0 clashes' : mg.join('; ')));
    row(cg.length === 0, '(iii) child gate (exit, C-11 / C-34 AB iff reps differ, C-62 (1), A4 WINDOW / bop): ' + (cg.length === 0 ? 'clean' : cg.join('; ')));
    row(ctl.miss.length === 0 && ctl.loose === TIMED.length, '(iii) must-fail controls: loosened prefixes rejected ' + ctl.loose + '/' + TIMED.length +
        (ctl.miss.length === 0 ? ', literals + child edits rejected' : '; NOT rejected: ' + ctl.miss.join('; ')));
} else row(false, '(iii) no INJECTIONS table: children not run');
console.log('TIMED children done [' + ((Date.now() - t2) / 1000).toFixed(0) + ' s]');

// ---- (iv) --capture (only on an all-ok run: a red run never lands a fixture)
if (capture) {
    if (bad === 0) {
        mkdirSync(OUT_DIR, { recursive: true });
        const doc = { schema: 'lite-ab-gate timed-real lines v1', toolSha, surfaceSha: surf, node: process.version, date, load1: Number(load1.toFixed(2)), busyNode: busy, lockStatus: lock, children };
        writeFileSync(join(OUT_DIR, 'lines.json'), JSON.stringify(doc, null, 2) + '\n');
        console.log('TIMED capture wrote test/fixtures/timed-real/lines.json (surface ' + surf.slice(0, 8) + ', tool ' + toolSha.slice(0, 8) + ')');
    } else row(false, '--capture refused: ' + bad + ' step(s) red, lines.json not written');
}
console.log('TIMED end load1 ' + loadavg()[0].toFixed(2) + ' busy-node [' + busyNode() + ']');
console.log('TIMED ' + (bad === 0 ? 'all ok' : bad + ' FAIL'));
process.exitCode = bad === 0 ? 0 : 1;
