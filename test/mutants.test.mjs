// test/mutants.test.mjs -- G-B B4 (U7): plan-GB TASK 8, ASSERTION A3 (teeth). DETERMINISTIC (C-3): no clock; every
// child is a `node --test` run of row suites, or (M2 only) of selftest.untimed, whose children stop before the clock, or
// (U9E C-48) of settle.test / hotbody.parity, which read source text only, or (WF1 C-59) of workfloor.test, whose children run
// --oracle-only or under its clock trap (performance.now throws), so no timed number is read.
// Each mutant in test/mutants.json is an EXACT-ONCE replacement in a temp copy of ABGate.js (a site that does not match
// exactly once is a FAIL, never a skip). The temp layout is <tmp>/ABGate.js + <tmp>/test/<the real test files, copied
// byte for byte> + <tmp>/test/fixtures/<copies>, so the SAME rows (the 55 golden parity rows, the 59 judge.rows rows,
// their API tests and judge.extra) run against the mutant -- expectations are never re-derived from mutated code.
// A mutant is KILLED when >= 1 test goes red on an ASSERTION (ERR_ASSERTION), with the same test count as the
// unmutated control: a mutant that crashes a file (fewer tests) or only throws is not a kill. The unmutated control,
// in the same layout, turns 0 tests red.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. ASCII only.
import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = readFileSync(join(ROOT, 'ABGate.js'), 'utf8');
const DOC = JSON.parse(readFileSync(join(ROOT, 'test', 'mutants.json'), 'utf8'));
const M = DOC.mutants;
const ALLOWED = ['test/parity.abgate.test.mjs', 'test/judge.rows.test.mjs', 'test/judge.extra.test.mjs', 'test/selftest.untimed.test.mjs', 'test/settle.test.mjs', 'test/hotbody.parity.test.mjs', 'test/workfloor.test.mjs'];
const FIXTURES = ['ab-gate-7e0f9262', 'judge-lane', 'reproof', 'hotbody', 'timed-real', 'toy', 'workfloor'];   // reproof: judge.extra's real-log row (U5c review r1); hotbody: the A1 golden (U9E); timed-real: selftest.untimed's C-38 lines.json + surface.mjs (U8 B2); toy + workfloor: workfloor.test's toy gate variants + clock trap (WF1 B3)
// plan-GB A3: 29 = 10 r0 FLIPS + 8 C-11 + 3 C-12 + 6 HEADER/PROV + the belt + a dialect leak; then the U5 reviewer
// survivors (M14, M16, M17 x2, R2 x2) and the U6 runner check M2 (killer: selftest.untimed); C-34 (U5b, + the 2
// twice-printed AB mutants of review r1 blocker 2) and C-42 (U5b retry: RESULT reps unparsed / printed twice, any lane);
// U5b retry 2: + C34c2 (equal reps, RAW AB twice) + C42e (no reps field) + 11 C-47 (RESULT ab / B/AB / wordAB / bop AB, any lane)
// + 3 C-50 (RESULT reps AB part, any lane); U5c: + 7 C-40 (WARM column grammar / finite values, any lane) + 3 C-41 (RAW
// column set) + 12 C-51 (RESULT ab / B/AB / wordAB / bop grammar, any lane) + 3 U5b3 reviewer survivors (M6, M13, M14); SPEC A18: + 17 C-54 (the rest of the RESULT line, any lane) + 3 C-55
// (a negative bop value); SPEC A19: + 8 C-56 (the RESULT field set / order, the VOID tail, finite C-54 numbers); U5c review r1: + 6 (reviewer R1 / R2 / R3 / R4 / R11 +
// the blocker-1 bare ns/op check); U9E B3: + 4 C-48 (tierSettle; killer test/settle.test.mjs) + 1 C-48 PERF hoist
// (killer test/hotbody.parity.test.mjs); WF1 B3: + 3 C-59 (floorSweep call, reserved-kind check, TIER-SETTLE kind; killer
// test/workfloor.test.mjs); WF1 review r1: + 3 C-59 (uncapped ladder, sweep skips a non-string, no format regex; killers R2b / R8b / R8c)
const GROUPS = { 'r0-flip': 10, 'C-11': 8, 'C-12': 3, 'header-prov': 6, belt: 1, dialect: 1, 'u5-survivor': 6, 'u6-runner': 1, 'C-34': 8, 'C-42': 5, 'C-47': 11, 'C-50': 3, 'C-40': 7, 'C-41': 3, 'C-51': 12, 'u5b3-review': 3, 'C-54': 17, 'C-55': 3, 'C-56': 8, 'u5c-review': 6, 'C-48': 4, 'C-48-hoist': 1, 'C-59': 6 };
const CONCURRENCY = 4;

const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });

/** The site's index if `find` occurs exactly once in `text`, else -1 (0 or >= 2 matches). */
function onceAt(text, find) {
    const i = text.indexOf(find);
    return i >= 0 && text.indexOf(find, i + 1) < 0 ? i : -1;
}
/** A temp layout holding `tool` as ABGate.js plus byte copies of the test files and fixtures. */
function layout(tool, tag) {
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-mut-' + tag + '-'));
    tmps.push(dir);
    writeFileSync(join(dir, 'ABGate.js'), tool);
    mkdirSync(join(dir, 'test', 'fixtures'), { recursive: true });
    for (const f of ALLOWED) copyFileSync(join(ROOT, f), join(dir, f));
    for (const f of FIXTURES) cpSync(join(ROOT, 'test', 'fixtures', f), join(dir, 'test', 'fixtures', f), { recursive: true });
    return dir;
}
/** `node --test --test-reporter=tap <files>` in `dir` -> { status, out }. The nested runner must not inherit this
 *  runner's NODE_TEST_CONTEXT (it would report to us in the v8 wire format instead of TAP). */
function runTests(dir, files) {
    const env = { ...process.env };
    for (const k of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'AB_GATE_INJECT', 'GITHUB_ACTIONS', 'AB_TORTURE_TOOL']) delete env[k];
    return new Promise((res) => {
        const ch = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: dir, env });
        let out = '';
        ch.stdout.on('data', (b) => { out += b; });
        ch.stderr.on('data', (b) => { out += b; });
        ch.on('close', (status) => res({ status, out }));
        ch.on('error', (e) => res({ status: -1, out: out + '\nspawn error ' + e.message }));
    });
}
/** TAP summary + the top-level red tests with their error code. A missing summary line reads NaN (never 0). */
function parseTap(out) {
    const n = (k) => { const m = new RegExp('^# ' + k + ' (\\d+)$', 'm').exec(out); return m === null ? NaN : Number(m[1]); };
    const lines = out.split('\n'), reds = [];
    for (let i = 0; i < lines.length; i++) {
        const m = /^not ok \d+ - (.*)$/.exec(lines[i]);
        if (m === null) continue;
        let code = null;
        for (let j = i + 1; j < lines.length && !/^(not )?ok \d+ /.test(lines[j]); j++) {
            const c = /^ {2}code: '([A-Z_]+)'$/.exec(lines[j]);
            if (c !== null) { code = c[1]; break; }
        }
        reds.push({ name: m[1], code });
    }
    return { tests: n('tests'), pass: n('pass'), fail: n('fail'), cancelled: n('cancelled'), skipped: n('skipped'), todo: n('todo'), reds };
}
const setKey = (files) => files.join(' ');
/** The kill rule, one place for the mutants and the harness controls: killed = the suite exited non-zero, the same test
 *  count as the control (no file crashed out), nothing cancelled, and >= 1 test red on an assertion. */
function judgeKill(r, control) {
    const p = parseTap(r.out), c = parseTap(control.out);
    const asserted = p.reds.filter((x) => x.code === 'ERR_ASSERTION');
    let why = 'killed';
    if (!(p.tests === c.tests)) why = 'test count ' + p.tests + ' != control ' + c.tests + ' (a crashed file is not a kill)';
    else if (p.cancelled !== 0) why = 'cancelled ' + p.cancelled;
    else if (r.status === 0 || !(p.fail >= 1) || asserted.length === 0) why = 'SURVIVED (no test red on an assertion)';
    return { killed: why === 'killed', why, p, asserted };
}
const mutate = (find, replace) => { const at = onceAt(SRC, find); return at < 0 ? null : SRC.slice(0, at) + replace + SRC.slice(at + find.length); };

test('mutants.json: schema, unique ids, group counts (A3 29 + 6 U5 survivors + 1 U6 runner + 8 C-34 + 5 C-42 + 11 C-47 + 3 C-50 + 7 C-40 + 3 C-41 + 12 C-51 + 3 U5b3 review + 17 C-54 + 3 C-55 + 8 C-56 + 6 U5c review + 4 C-48 + 1 C-48 hoist + 6 C-59), every site exactly once', () => {
    assert.ok(Array.isArray(M), 'mutants must be an array');
    const ids = new Set();
    const groups = {};
    const texts = new Set();
    for (const m of M) {
        assert.deepEqual(Object.keys(m).sort(), ['files', 'find', 'group', 'id', 'replace', 'why'], 'keys of ' + m.id);
        for (const k of ['id', 'group', 'why', 'find', 'replace']) assert.equal(typeof m[k], 'string', m.id + '.' + k);
        assert.ok(m.find.length > 0 && m.find !== m.replace, m.id + ': find must be non-empty and differ from replace');
        assert.ok(!ids.has(m.id), 'duplicate id ' + m.id);
        ids.add(m.id);
        assert.ok(Array.isArray(m.files) && m.files.length > 0 && m.files.every((f) => ALLOWED.includes(f)), m.id + ': files ' + JSON.stringify(m.files));
        groups[m.group] = (groups[m.group] || 0) + 1;
        const at = onceAt(SRC, m.find);
        assert.ok(at >= 0, m.id + ': site matches ' + (SRC.split(m.find).length - 1) + ' times in ABGate.js (want exactly 1; a stale site is a FAIL)');
        const t = SRC.slice(0, at) + m.replace + SRC.slice(at + m.find.length);
        assert.ok(!texts.has(t), m.id + ': same mutated text as another mutant');
        texts.add(t);
    }
    assert.deepEqual(groups, GROUPS);
    const a3 = ['r0-flip', 'C-11', 'C-12', 'header-prov', 'belt', 'dialect'].reduce((s, g) => s + groups[g], 0);
    assert.equal(a3, 29, 'plan-GB A3 names 29 mutants');
    assert.equal(M.length, 133);
});

describe('A3 mutants: each turns >= 1 row red (an assertion, same test count as the control); the control turns 0 red', { concurrency: CONCURRENCY }, () => {
    const control = new Map();   // file-set key -> parsed control TAP
    before(async () => {
        const dir = layout(SRC, 'control');
        const sets = [...new Set(M.map((m) => setKey(m.files)))];
        await Promise.all(sets.map(async (k) => { control.set(k, { ...(await runTests(dir, k.split(' '))) }); }));
    });
    it('control (unmutated ABGate.js, same temp layout): 0 red on every file set', (t) => {
        assert.ok(control.size >= 1);
        for (const [k, r] of control) {
            const p = parseTap(r.out);
            t.diagnostic('control [' + k + ']: tests ' + p.tests + ' pass ' + p.pass + ' fail ' + p.fail);
            assert.equal(r.status, 0, 'control exit on ' + k + '\n' + r.out.slice(-3000));
            assert.ok(p.tests > 0 && p.pass === p.tests, 'control on ' + k + ': ' + JSON.stringify(p));
            assert.equal(p.fail, 0);
            assert.equal(p.cancelled, 0);
            assert.equal(p.skipped + p.todo, 0, 'no skipped / todo row may hide in a row suite');
            assert.deepEqual(p.reds, []);
        }
    });
    // harness must-fail controls: the kill rule must reject an equivalent mutant (no behavior change) and a mutant that
    // only crashes the import (a syntax error), else every mutant would read killed
    it('harness control: an equivalent mutant (fin3 conjuncts reordered) SURVIVES, a syntax-error mutant is NOT a kill', async (t) => {
        const ROWS = ['test/parity.abgate.test.mjs', 'test/judge.rows.test.mjs', 'test/judge.extra.test.mjs'];
        const ctl = control.get(setKey(ROWS));
        assert.ok(ctl !== undefined, 'the row file set has a control run');
        const eq = mutate('const fin3 = (s) => Number.isFinite(s.med) && Number.isFinite(s.q1) && Number.isFinite(s.q3);',
            'const fin3 = (s) => Number.isFinite(s.q3) && Number.isFinite(s.q1) && Number.isFinite(s.med);');
        const sx = mutate('export function verdictOf(sp, lines) {', 'export function verdictOf(sp, lines) {{');
        assert.ok(eq !== null && sx !== null, 'harness control sites must match exactly once');
        const ke = judgeKill(await runTests(layout(eq, 'equiv'), ROWS), ctl);
        const ks = judgeKill(await runTests(layout(sx, 'syntax'), ROWS), ctl);
        t.diagnostic('equivalent: ' + ke.why + ' (red ' + ke.p.fail + '/' + ke.p.tests + '); syntax error: ' + ks.why);
        assert.equal(ke.killed, false, 'an equivalent mutant read killed: ' + ke.why);
        assert.equal(ke.p.fail, 0, 'an equivalent mutant turned a row red');
        assert.equal(ks.killed, false, 'a syntax-error mutant read killed');
        assert.ok(ks.why.startsWith('test count '), ks.why);
    });
    for (const m of M) {
        it('mutant ' + m.id + ' (' + m.group + ') is killed', async (t) => {
            const tool = mutate(m.find, m.replace);
            assert.ok(tool !== null, m.id + ': site does not match exactly once (stale mutant = FAIL)');
            const r = await runTests(layout(tool, m.id), m.files);
            const k = judgeKill(r, control.get(setKey(m.files)));
            t.diagnostic(m.id + ': red ' + k.p.fail + '/' + k.p.tests + ' (assertion ' + k.asserted.length + '); first: ' +
                k.asserted.slice(0, 3).map((x) => x.name).join(' | '));
            assert.ok(k.killed, m.id + ': ' + k.why + ' ' + JSON.stringify(k.p.reds.slice(0, 5)) + '\n' + r.out.slice(-1500));
        });
    }
});
