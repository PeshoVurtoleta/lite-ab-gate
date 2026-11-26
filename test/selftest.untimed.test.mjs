// test/selftest.untimed.test.mjs -- G-B B2 rung J2 (plan-GB TASK 7, ASSERTION A4 untimed part; SPEC C-3, C-14, C-15,
// C-17, C-21, C-25, C-30). DETERMINISTIC (C-3): every child here stops before the clock (no HEADER rung=, no PROV, no
// WINDOW line), so nothing in this file is a timing claim.
//   1. `--selftest-untimed` on the judge-lane fixture gates (frozen only, and with a live binding): 67/67 ok, exit 0,
//      ran 67 of 67 = replay 1 + allocBop 1 + empty-gated 1 + live-drift 1 + frozen-drift 1 + judge 59 + consumer 3.
//   2. C-30: frozen only -> the live-drift row is 'n/a (frozen only)' and passes ONLY with this run's HEADER line
//      'live not bound (frozen only)'; must-fail: a temp copy of ABGate.js that does not print it reads that row FAIL.
//   3. The marker gate (C-21, X5): each INJECTIONS marker (sliced from ABGate.js, never imported: it is not exported)
//      matches its OWN rendered message and no other; must-fail controls: the old literals ('STOP ANCHOR: live ',
//      'STOP ANCHOR: live', 'STOP ORACLE', 'WARM lane='), an unanchored and a global RegExp.
//   4. --selftest-untimed takes no other flag (C-15 exit 1, STOP CLI).
//   U8 B2 (plan-U8 TASK 3, A3; SPEC C-37, C-38, C-58, C-60 G1 / G2). DETERMINISTIC: no child here reaches the clock.
//   5. C-38: the marker gate on REAL timed-child lines (test/fixtures/timed-real/lines.json, captured by
//      test/selftest.timed.mjs --capture under quiet-lock): markerRealGate / childGate / realControls (shared with the
//      harness in test/fixtures/timed-real/surface.mjs) + the SYNTH-style table gate on the real own lines. A missing
//      lines.json is red (fail closed, never a skip).
//   6. C-38 staleness: surfaceSha (surface.mjs, the one definition) recomputed on ABGate.js must equal the captured one,
//      else red "re-capture via quiet-lock"; must-fail: a flipped sha, an edited marker, an edited PIN.
//   7. markerClash (C-37), sliced from ABGate.js: 0 clashes on lines.json, 1 on a built 2-marker line; C-60 G2: every
//      marker's own line joined in one output -> '', 2 clashing lines -> 2 clauses; must-fail: a `>= 3` copy.
//   8. C-60 G1: the timed loop's markerClash fold + passing-row VOID replay, and the C-58 untimed fold (live-drift /
//      frozen-drift), sliced from ABGate.js and driven by stub children with a loosened marker table; must-fail on
//      no-fold copies and on the pre-U8 replay regex.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINS, injectionsBlock, surfaceSha, staleText, CHILDREN, KEEP_RE, TIMED, markerRealGate, childGate, realControls } from './fixtures/timed-real/surface.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ABGATE = join(ROOT, 'ABGate.js');
const JL = join(ROOT, 'test', 'fixtures', 'judge-lane');
const FROZEN_ONLY = join(JL, 'frozen-only.gate.mjs');
const LIVE = join(JL, 'live.gate.mjs');
const FLAGS = ['--expose-gc', '--allow-natives-syntax', '--no-concurrent-recompilation', '--min-semi-space-size=4', '--max-semi-space-size=4', '--single-threaded-gc'];
const UNTIMED = 67;   // plan-GB A4

const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });
const cleanEnv = (extra) => { const e = { ...process.env }; delete e.AB_GATE_INJECT; delete e.GITHUB_ACTIONS; return { ...e, ...(extra || {}) }; };
function run(tool, args, extra) {
    const r = spawnSync(process.execPath, [...FLAGS, tool, ...args], { cwd: ROOT, env: cleanEnv(extra), encoding: 'utf8', maxBuffer: 1 << 24, timeout: 300000 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const rowsOf = (out) => out.split('\n').filter((l) => /^SELFTEST .* -> (ok|FAIL)$/.test(l));
// A child that reached the clock prints one of these; an untimed run prints none of them
const TIMED_RE = /^(HEADER rung=|PROV (start|end) |CONTROL gc-window|WINDOW lane=|RESULT lane=)/m;
const GROUPS = [['replay', /^SELFTEST replay: /, 1], ['allocBop', /^SELFTEST allocBop: /, 1], ['empty-gated', /^SELFTEST empty-gated: /, 1],
    ['live-drift', /^SELFTEST live-drift[ :]/, 1], ['frozen-drift', /^SELFTEST frozen-drift /, 1], ['judge', /^SELFTEST judge /, 59], ['consumer', /^SELFTEST consumer /, 3]];

function checkUntimed(r, name) {
    assert.equal(r.status, 0, name + ': exit ' + r.status + '\n' + r.out.slice(-3000));
    const rows = rowsOf(r.out);
    assert.equal(rows.length, UNTIMED, name + ': ' + rows.length + ' rows');
    const bad = rows.filter((l) => !l.endsWith(' -> ok'));
    assert.deepEqual(bad, [], name + ': FAIL rows');
    let sum = 0;
    for (const [g, re, n] of GROUPS) {
        const k = rows.filter((l) => re.test(l)).length;
        assert.equal(k, n, name + ': group ' + g + ' has ' + k + ' rows (want ' + n + ')');
        sum += k;
    }
    assert.equal(sum, UNTIMED, name + ': the groups cover every row');
    assert.match(r.out, /^SELFTEST ran 67 of 67 \(untimed 67, timed not run: --selftest-untimed\)$/m, name);
    assert.match(r.out, /^SELFTEST all ok$/m, name);
    assert.doesNotMatch(r.out, TIMED_RE, name + ': the untimed selftest reached the clock');
    return rows;
}

// ============================================================ A4: 67 / 67, exit 0, on both fixture gates
test('--selftest-untimed, frozen-only gate: 67/67 ok, exit 0, ran 67 of 67; live-drift is the C-30 n/a row', () => {
    const r = run(ABGATE, [FROZEN_ONLY, '--selftest-untimed']);
    const rows = checkUntimed(r, 'frozen-only');
    assert.match(r.out, /^HEADER frozen k\.js frozen\/k\.js sha256 2a83d841 ok; live not bound \(frozen only\)$/m);
    const ld = rows.find((l) => l.startsWith('SELFTEST live-drift'));
    assert.match(ld, /^SELFTEST live-drift: n\/a \(frozen only\): .* in this run 1 \(want 1, C-30\) -> ok$/);
    const fd = rows.find((l) => l.startsWith('SELFTEST frozen-drift '));
    assert.match(fd, /^SELFTEST frozen-drift frozen\/k\.js: exit 1 \(want 1\) marker .* present, stopped before the clock verdict "VERDICT NO VERDICT \(STOP ANCHOR\)/);
});
test('--selftest-untimed, live-bound gate: 67/67 ok, exit 0; live-drift runs its pre-clock child (STOP ANCHOR: live-drift)', () => {
    const r = run(ABGATE, [LIVE, '--selftest-untimed']);
    const rows = checkUntimed(r, 'live');
    assert.match(r.out, /^HEADER frozen k\.js frozen\/k\.js sha256 2a83d841 ok; live live\/k\.js byte-identical -- ok \(AB-G2\)$/m);
    const ld = rows.find((l) => l.startsWith('SELFTEST live-drift'));
    assert.match(ld, /^SELFTEST live-drift jl:clean: exit 1 \(want 1\) marker \/\^STOP ANCHOR: live-drift .* present, stopped before the clock verdict "VERDICT NO VERDICT \(STOP ANCHOR\)/);
    assert.doesNotMatch(r.out, /n\/a \(frozen only\)/);
});
test('the judge rows name the declared K / C and the tool-owned lanes; the consumer rows use the consumer lanes', () => {
    const r = run(ABGATE, [FROZEN_ONLY, '--selftest-untimed']);
    assert.match(r.out, /^SELFTEST judge \(i\) K=7: code 2 \(want 2\) verdict "VERDICT NO VERDICT \(run shape\) shape=\[K=7 \(want 11\)\]/m);
    assert.match(r.out, /^SELFTEST judge \(i\) K=12 against the declared 11: .*K=12 \(want 11\)/m);
    assert.match(r.out, /^SELFTEST judge PASS \(every gated lane its GATED word\): code 0 \(want 0\) verdict "VERDICT PASS gated=3\/3 /m);
    assert.match(r.out, /^SELFTEST judge belt empty gated: code 2 \(tool\) \/ 2 \(ab-gate@7e0f9262\) \(want 2 \/ 2\)/m);
    assert.match(r.out, /^SELFTEST consumer PASS \(every gated lane its GATED word\): exit 0 \(want 0\) verdict "VERDICT PASS gated=1\/1 /m);
    assert.match(r.out, /^SELFTEST consumer FINDING \(jl:clean clean SLOWER\): exit 3 \(want 3\)/m);
    assert.match(r.out, /^SELFTEST consumer NO VERDICT \(jl:clean A\/A 1\.080\): exit 2 \(want 2\)/m);
});

// ============================================================ C-30: the selftest's frozen HEADER line is main's line
test('C-30: the selftest run prints the same HEADER frozen line as a real run of the same gate (--oracle-only, no clock)', () => {
    for (const g of [FROZEN_ONLY, LIVE]) {
        const st = run(ABGATE, [g, '--selftest-untimed']);
        const oo = run(ABGATE, [g, '--oracle-only']);
        assert.equal(oo.status, 0, oo.out.slice(-2000));
        const pick = (out) => out.split('\n').filter((l) => l.startsWith('HEADER frozen '));
        assert.equal(pick(st.out).length, 1);
        assert.deepEqual(pick(st.out), pick(oo.out), g);
    }
});
test('C-30 must-fail: a build whose selftest does not print the frozen-only HEADER line reads the n/a row FAIL (exit 1)', () => {
    const src = readFileSync(ABGATE, 'utf8');
    const from = '    for (const f of ctx.spec.frozen) say(ctx, frozenHeader(f));\n';
    const i = src.indexOf(from);
    assert.ok(i >= 0 && src.indexOf(from, i + 1) < 0, 'mutant site must match exactly once');
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-c30-'));
    tmps.push(dir);
    const tool = join(dir, 'ABGate.js');
    writeFileSync(tool, src.slice(0, i) + src.slice(i + from.length));
    const r = run(tool, [FROZEN_ONLY, '--selftest-untimed']);
    assert.equal(r.status, 1, r.out.slice(-2000));
    assert.doesNotMatch(r.out, /^HEADER frozen /m);
    assert.match(r.out, /^SELFTEST live-drift: n\/a \(frozen only\): .* in this run 0 \(want 1, C-30\) -> FAIL$/m);
    assert.match(r.out, /^SELFTEST 1 FAIL$/m);
    assert.doesNotMatch(r.out, /^SELFTEST all ok$/m);
    // the live-bound gate does not depend on that line (its live-drift row runs the child): still all ok
    assert.equal(run(tool, [LIVE, '--selftest-untimed']).status, 0);
});

// ============================================================ ran === total: a row that never runs is a FAIL, never a skip
test('ran === total must-fail: a build that drops one untimed row (allocBop) reads "ran 66 of 67 cases -> FAIL", exit 1', () => {
    const src = readFileSync(ABGATE, 'utf8');
    const from = '    row(ar.ok, ar.txt, null);\n';
    const i = src.indexOf(from);
    assert.ok(i >= 0 && src.indexOf(from, i + 1) < 0, 'mutant site must match exactly once');
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-ran-'));
    tmps.push(dir);
    const tool = join(dir, 'ABGate.js');
    writeFileSync(tool, src.slice(0, i) + src.slice(i + from.length));
    const r = run(tool, [FROZEN_ONLY, '--selftest-untimed']);
    assert.equal(r.status, 1, r.out.slice(-2000));
    assert.match(r.out, /^SELFTEST ran 66 of 67 cases -> FAIL$/m);
    assert.match(r.out, /^SELFTEST 1 FAIL$/m);
    assert.doesNotMatch(r.out, /^SELFTEST all ok$/m);
});

// ============================================================ C-21 / X5: the marker gate
/** INJECTIONS sliced from the tool's source text and evaluated (it is module-private; ab-gate's between() style). */
function injectionsOf(src) {
    const head = 'const INJECTIONS = Object.freeze(';
    const a = src.indexOf(head), z = src.indexOf('\n});', a);
    assert.ok(a >= 0 && z > a && src.indexOf(head, a + 1) < 0, 'INJECTIONS block not found once');
    return new Function('return (' + src.slice(a + head.length, z + 2) + ');')();
}
const hits = (m, line) => (typeof m === 'string' ? line.includes(m) : m instanceof RegExp ? m.test(line) : false);
/** -> the list of reasons a marker table is rejected (empty = accepted). rendered: { name: the line the tool prints for
 *  that injection }; others: lines of other failures / clean runs that no marker may match. */
function markerGate(table, rendered, others) {
    const bad = [];
    for (const name of Object.keys(rendered)) if (!Object.hasOwn(table, name)) bad.push(name + ': no marker');
    for (const name of Object.keys(table)) {
        const m = table[name].marker;
        if (!(m instanceof RegExp)) bad.push(name + ': marker ' + JSON.stringify(m) + ' is not a RegExp');
        else if (!m.source.startsWith('^') || !m.flags.includes('m') || m.flags.includes('g') || m.flags.includes('y')) bad.push(name + ': marker ' + m + ' not anchored ^ / m, or stateful (g / y)');
        if (!Object.hasOwn(rendered, name)) { bad.push(name + ': no rendered message'); continue; }
        if (!hits(m, rendered[name])) bad.push(name + ': misses its own message ' + JSON.stringify(rendered[name]));
        for (const other of Object.keys(rendered)) if (other !== name && hits(m, rendered[other])) bad.push(name + ': also matches ' + other + ' ' + JSON.stringify(rendered[other]));
        for (const line of others) if (hits(m, line)) bad.push(name + ': also matches ' + JSON.stringify(line));
    }
    return bad;
}
/** The four ANCHOR STOP lines as the tool really prints them (pre-clock children / --oracle-only on temp variants). */
function anchorLines() {
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-marker-'));
    tmps.push(dir);
    mkdirSync(join(dir, 'frozen')); mkdirSync(join(dir, 'live'));
    copyFileSync(join(JL, 'frozen', 'k.js'), join(dir, 'frozen', 'k.js'));
    copyFileSync(join(JL, 'live', 'k.js'), join(dir, 'live', 'k.js'));
    const gate = readFileSync(LIVE, 'utf8');
    const variant = (file, from, to) => {
        const i = gate.indexOf(from);
        assert.ok(i >= 0 && gate.indexOf(from, i + 1) < 0, 'variant edit must match once: ' + from);
        writeFileSync(join(dir, file), gate.slice(0, i) + to + gate.slice(i + from.length));
        return join(dir, file);
    };
    const stopOf = (r, what) => {
        const ls = r.out.split('\n').filter((l) => l.startsWith('STOP ANCHOR: '));
        assert.equal(r.status, 1, what + ': ' + r.out.slice(-1500));
        assert.equal(ls.length, 1, what + ': one STOP ANCHOR line');
        assert.doesNotMatch(r.out, TIMED_RE, what + ' reached the clock');
        return ls[0];
    };
    return {
        'live-drift': stopOf(run(ABGATE, [LIVE, '--run', 'jl:clean', '--K', '3'], { AB_GATE_INJECT: 'live-drift' }), 'live-drift'),
        'frozen-drift': stopOf(run(ABGATE, [LIVE, '--run', 'jl:clean', '--K', '3'], { AB_GATE_INJECT: 'frozen-drift' }), 'frozen-drift'),
        frozenUnreadable: stopOf(run(ABGATE, [variant('fu.gate.mjs', "frozen: 'frozen/k.js'", "frozen: 'frozen/nope.js'"), '--oracle-only']), 'frozen-unreadable'),
        liveUnreadable: stopOf(run(ABGATE, [variant('lu.gate.mjs', "live: 'live/k.js'", "live: 'live/nope.js'"), '--oracle-only']), 'live-unreadable'),
    };
}
// The timed failures' lines, built from the tool's own message templates (each template pinned below in ABGate.js, so a
// changed text turns this test red rather than leaving a stale sample).
const SYNTH = {
    'bent-oracle': 'STOP ORACLE: jl:clean B#2 (after the oracle pass) op 0 field 0 got 1027 want 1601',
    'boxed': 'VOID ALLOC lane=jl:clean: ALLOC B 16.000 B/op',
    'slow-dead': 'VOID SLOW-DEAD lane=jl:clean: SLOW-DEAD 1.002[0.991..1.010]',
    'aa-drift': 'VOID AA-DRIFT lane=jl:clean: AA-DRIFT 1.312[1.290..1.330]',
    'late-bend': 'STOP ORACLE: jl:clean B#0 fold (timed): got 0 want -1834221',
    'post-bend': 'STOP ORACLE: jl:clean B#1 (after timing, fresh reference) op 0 field 0 got 0 want 1601',
    'ab-drift': 'VOID REPS-DRIFT lane=jl:clean: REPS-DRIFT B/AB 0.402[0.398..0.410] reads FASTER but B/A 1.003[0.998..1.010] reads WITHIN (AB = A at B\'s reps 4 vs A\'s 1)',
    'warm-skew': 'WARM lane=jl:clean round 0 (discarded, not in any median) A/A=1.0000 B/A=0.9981 AA/A=1.9124 SLOW/A=2.4410',
    'arr-bend': 'STOP ORACLE: jl:clean B#1 data.x (after warm) differs from the lane data at byte 1023',
    'tool-deopt': 'VOID NOT-TF lane=jl:clean: NOT-TF tool timedRounds (TF at window start true, end false)',
    'no-settle': 'SETTLE lane=jl:clean skipped (AB_GATE_INJECT=no-settle)',
    'settle-void': 'VOID TIER-SETTLE lane=jl:clean: TIER-SETTLE pass-bytes 64,64,64 (cap 3, none read exactly 0)',
};
// PINS (the pinned message templates) live in test/fixtures/timed-real/surface.mjs: they are part of the C-38 surface sha
// Lines other failures (or clean runs) print: no marker may match any of them
const OTHERS = [
    'WARM lane=jl:clean round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0012 AA/A=1.0031 SLOW/A=2.0144',
    'WARM lane=jl:clean round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0012 AA/A=1.0500 SLOW/A=2.0144',
    'WARM lane=jl:clean round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0012 AA/A=0.9100 SLOW/A=2.0144',
    'VOID ALLOC lane=jl:clean: ALLOC A 0.500 B/op',
    'VOID NOT-TF lane=jl:clean: NOT-TF A#1,B#2',
    'VOID GC-WINDOW lane=jl:clean: GC-WINDOW major 1',
    'STOP ORACLE: jl:clean B#0 fold (tf): got 1 want 2',
    'STOP ORACLE: jl:clean B#0 fold (warm): got 1 want 2',
    'STOP ORACLE: jl:clean A#0 (after the oracle pass) op 3 field 0 got 1 want 2',
    'STOP ORACLE: jl:clean B#0 (after TF) op 3 field 0 got 1 want 2',
    'STOP ORACLE: jl:clean B#0 (after the oracle pass) op 3: one() did not return a Float64Array of >= 1',
    'STOP ORACLE: jl:clean B#0 data.x (after timing) differs from the lane data at byte 3',
    'STOP ORACLE: jl:clean B#0 data.x (after the oracle pass) differs from the lane data at byte 3',
    'STOP ANCHOR: jl:clean B anchor: "function sumInto(x, op, out) {" not unique',
    'RESULT lane=jl:clean (gated) A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=1.000[0.990..1.010] word=WITHIN B-A=0.00[0.00..0.00]ns aa=1.312[1.290..1.330] slow=1.002[0.991..1.010] ab=n/a B/AB=n/a wordAB=n/a bop=A:0.0000,B:16.0000,AA:0.0000,SLOW:0.0000 win=8 reps=A:1,B:1 spin=8 warm=1 VOID=[AA-DRIFT 1.312[1.290..1.330]; SLOW-DEAD 1.002[0.991..1.010]; ALLOC B 16.000 B/op]',
    'SELFTEST   STOP ANCHOR: frozen-sha frozen/k.js sha256 12345678 (want 2a83d841)',
    'SELFTEST   WARM lane=jl:clean round 0 (discarded, not in any median) A/A=1.0000 B/A=0.9981 AA/A=1.9124 SLOW/A=2.4410',
    'SETTLE lane=jl:clean passes=1 pass-bytes=0 settled=yes',   // U9E (C-48): the ordinary SETTLE line of every timed lane
];
const NAMES = ['bent-oracle', 'boxed', 'slow-dead', 'aa-drift', 'live-drift', 'frozen-drift', 'late-bend', 'post-bend', 'ab-drift', 'warm-skew', 'arr-bend', 'tool-deopt', 'no-settle', 'settle-void'];

test('marker gate (C-21): each of the 14 INJECTIONS markers is an anchored RegExp matching only its own rendered message; must-fail controls rejected', () => {
    const src = readFileSync(ABGATE, 'utf8');
    for (const p of PINS) assert.ok(src.includes(p), 'message template no longer in ABGate.js: ' + p);
    const table = injectionsOf(src);
    assert.deepEqual(Object.keys(table).sort(), NAMES.slice().sort());
    const A = anchorLines();
    // the real ANCHOR texts: four distinct STOPs (frozen-unreadable, frozen-sha, live-unreadable, live-drift)
    assert.match(A['live-drift'], /^STOP ANCHOR: live-drift live\/k\.js differs from the frozen frozen\/k\.js at char \d+ /);
    assert.match(A['frozen-drift'], /^STOP ANCHOR: frozen-sha frozen\/k\.js sha256 [0-9a-f]{8} \(want 2a83d841\)$/);
    assert.match(A.frozenUnreadable, /^STOP ANCHOR: frozen-unreadable frozen\/nope\.js \(/);
    assert.match(A.liveUnreadable, /^STOP ANCHOR: live-unreadable live\/nope\.js \(/);
    const rendered = { ...SYNTH, 'live-drift': A['live-drift'], 'frozen-drift': A['frozen-drift'] };
    const others = [...OTHERS, A.frozenUnreadable, A.liveUnreadable];
    assert.deepEqual(markerGate(table, rendered, others), [], 'the real marker table');
    // must-fail controls: each altered table is rejected, for the reason named
    const withMarker = (name, m) => ({ ...table, [name]: { ...table[name], marker: m } });
    const reasons = (t) => markerGate(t, rendered, others);
    // (1) the OLD literal 'STOP ANCHOR: live ' ...
    const old = reasons(withMarker('live-drift', 'STOP ANCHOR: live '));
    assert.ok(old.some((s) => s.startsWith('live-drift: marker "STOP ANCHOR: live " is not a RegExp')), old.join('\n'));
    assert.ok(old.some((s) => s.startsWith('live-drift: misses its own message')), old.join('\n'));
    // ... on ab-gate 7e0f9262's live texts (where it was the marker) also matches 'live <p> unreadable': rejected
    const legacy = { ...rendered, 'live-drift': 'STOP ANCHOR: live live/k.js differs from the frozen frozen/k.js at char 101' };
    const lold = markerGate(withMarker('live-drift', 'STOP ANCHOR: live '), legacy, [...others, 'STOP ANCHOR: live live/nope.js unreadable (ENOENT)']);
    assert.ok(lold.includes('live-drift: also matches "STOP ANCHOR: live live/nope.js unreadable (ENOENT)"'), lold.join('\n'));
    // (2) a prefix 'STOP ANCHOR: live' on today's texts matches live-drift AND live-unreadable
    const pre = reasons(withMarker('live-drift', 'STOP ANCHOR: live'));
    assert.ok(pre.includes('live-drift: also matches ' + JSON.stringify(A.liveUnreadable)), pre.join('\n'));
    // (3) the old bent-oracle 'STOP ORACLE' matches the late-bend / post-bend / arr-bend STOPs
    const bo = reasons(withMarker('bent-oracle', 'STOP ORACLE'));
    for (const n of ['late-bend', 'post-bend', 'arr-bend']) assert.ok(bo.some((s) => s.startsWith('bent-oracle: also matches ' + n + ' ')), n + '\n' + bo.join('\n'));
    // (4) the old warm-skew 'WARM lane=' matches a clean WARM line
    const ws = reasons(withMarker('warm-skew', 'WARM lane='));
    assert.ok(ws.includes('warm-skew: also matches ' + JSON.stringify(OTHERS[0])), ws.join('\n'));
    // (5) an unanchored RegExp: rejected as unanchored, and it matches the replayed 'SELFTEST   STOP ...' line
    const un = reasons(withMarker('frozen-drift', /STOP ANCHOR: frozen-sha \S+ sha256 [0-9a-f]{8} \(want [0-9a-f]{8}\)$/m));
    assert.ok(un.some((s) => s.startsWith('frozen-drift: marker ') && s.endsWith('not anchored ^ / m, or stateful (g / y)')), un.join('\n'));
    assert.ok(un.some((s) => s.startsWith('frozen-drift: also matches "SELFTEST   STOP ANCHOR: frozen-sha')), un.join('\n'));
    // (6) a global RegExp (RegExp.prototype.test is stateful with g): rejected
    const gl = reasons(withMarker('aa-drift', new RegExp(table['aa-drift'].marker.source, 'gm')));
    assert.ok(gl.some((s) => s.startsWith('aa-drift: marker ') && s.endsWith('not anchored ^ / m, or stateful (g / y)')), gl.join('\n'));
    // (7) U9E: a no-settle marker loosened to /^SETTLE lane=/m matches the ordinary SETTLE line every timed lane prints: rejected;
    // without that OTHERS line the loosened marker would pass (the OTHERS line is what gives this control its teeth)
    const SETTLE_OK = 'SETTLE lane=jl:clean passes=1 pass-bytes=0 settled=yes';
    assert.ok(OTHERS.includes(SETTLE_OK));
    const loose = withMarker('no-settle', /^SETTLE lane=/m);
    assert.deepEqual(reasons(loose), ['no-settle: also matches ' + JSON.stringify(SETTLE_OK)]);
    assert.deepEqual(markerGate(loose, rendered, others.filter((l) => l !== SETTLE_OK)), [], 'without the ordinary SETTLE line the loosened marker is accepted');
});

// ============================================================ U8 B2: real lines (C-38), staleness, markerClash (C-37 / C-60 G2), the folds (C-60 G1, C-58)
const LINES = join(ROOT, 'test', 'fixtures', 'timed-real', 'lines.json');
/** lines.json, read per row: a missing or unparsable fixture throws, so that row is red (fail closed, never a skip). */
const realDoc = () => JSON.parse(readFileSync(LINES, 'utf8'));
/** The text of `src` from `from` (included, exactly once) to the first `to` after it (excluded). */
function between(src, from, to) {
    const a = src.indexOf(from);
    assert.ok(a >= 0 && src.indexOf(from, a + 1) < 0, 'slice start not found exactly once: ' + from);
    const z = src.indexOf(to, a + from.length);
    assert.ok(z > a, 'slice end not found: ' + to);
    return src.slice(a, z);
}
/** An exact-once replacement (a mutant / control copy of the source text). */
function once(src, from, to) {
    const i = src.indexOf(from);
    assert.ok(i >= 0 && src.indexOf(from, i + 1) < 0, 'mutant site must match exactly once: ' + from);
    return src.slice(0, i) + to + src.slice(i + from.length);
}
/** markerClash sliced from the source text, bound to `table` as its INJECTIONS. */
const clashOf = (src, table) => new Function('INJECTIONS', between(src, 'function markerClash(out) {', '\n/** --selftest (untimed rows') + '\nreturn markerClash;')(table);
let ANCHOR_MEMO = null;
/** The real live-drift / frozen-drift STOP lines (anchorLines spawns 4 pre-clock children: once per file). */
function anchors() {
    if (ANCHOR_MEMO === null) { const A = anchorLines(); ANCHOR_MEMO = { 'live-drift': A['live-drift'], 'frozen-drift': A['frozen-drift'] }; }
    return ANCHOR_MEMO;
}

test('C-38 lines.json: schema, the 13 children, only STOP / VOID / WARM / RESULT / RAW / WINDOW / SETTLE lines, node >= 26, provenance fields', () => {
    const d = realDoc();
    assert.deepEqual(Object.keys(d), ['schema', 'toolSha', 'surfaceSha', 'node', 'date', 'load1', 'busyNode', 'lockStatus', 'children']);
    assert.equal(d.schema, 'lite-ab-gate timed-real lines v1');
    assert.match(d.toolSha, /^[0-9a-f]{64}$/);
    assert.match(d.surfaceSha, /^[0-9a-f]{64}$/);
    const nm = /^v(\d+)\.\d+\.\d+$/.exec(d.node);
    assert.ok(nm !== null && Number(nm[1]) >= 26, 'captured on node ' + d.node + ' (C-31: >= 26)');
    assert.equal(new Date(d.date).toISOString(), d.date);
    assert.ok(typeof d.load1 === 'number' && Number.isFinite(d.load1) && d.load1 >= 0, 'load1 ' + d.load1);
    assert.equal(typeof d.busyNode, 'string');
    assert.match(d.lockStatus, /^quiet-lock: held by "lite-ab-gate [^"]+" \(pid \d+, since \S+, node \S*selftest\.timed\.mjs --capture\)/, 'captured under the lock: ' + d.lockStatus);
    assert.deepEqual(Object.keys(d.children).sort(), CHILDREN.map((c) => c.key).sort());
    for (const c of CHILDREN) {
        const ch = d.children[c.key];
        assert.deepEqual(Object.keys(ch), ['inject', 'lane', 'K', 'exit', 'lines'], c.key);
        assert.equal(ch.inject, c.inject, c.key);
        assert.equal(ch.lane, c.lane, c.key);
        assert.ok(Array.isArray(ch.lines) && ch.lines.length >= 1, c.key + ': no lines');
        for (const l of ch.lines) assert.match(l, KEEP_RE, c.key);
    }
});

test('C-38 / A2 real lines: each timed marker 1 line in its own child, CLEAN_ZERO 0 in clean, no 2-marker line; childGate clean (C-11 / C-34 / A4); the controls rejected (loosened 10/10, literals, child edits)', () => {
    const src = readFileSync(ABGATE, 'utf8'), table = injectionsOf(src), d = realDoc();
    const reg = /for \(const name of \[([^\]]*), null\]\) cases\.push\(\[name, l0\.id\]\);/.exec(src);
    assert.ok(reg !== null && src.split(reg[0]).length === 2, 'the selftest injection list not found exactly once');
    assert.deepEqual(reg[1].split(', ').map((s) => JSON.parse(s.replace(/'/g, '"'))).concat('tool-deopt'), TIMED, 'TIMED = the selftest injection list (ABGate.js) + tool-deopt');
    assert.deepEqual(markerRealGate(table, d.children), [], 'markerRealGate on lines.json');
    assert.deepEqual(childGate(table, d.children), [], 'childGate on lines.json');
    const ctl = realControls(table, d.children);
    assert.deepEqual(ctl.miss, [], 'every control rejected');
    assert.equal(ctl.loose, TIMED.length, 'loosened prefixes rejected ' + ctl.loose + '/' + TIMED.length);
    // the SYNTH-style table gate with each timed marker's REAL own line in place of its SYNTH line (14 / 14 markers)
    const rendered = { ...SYNTH, ...anchors() };
    for (const n of TIMED) rendered[n] = d.children[n + ' null'].lines.find((l) => table[n].marker.test(l));
    assert.equal(Object.keys(rendered).length, Object.keys(table).length);
    assert.deepEqual(markerGate(table, rendered, OTHERS), [], 'the real own lines in the marker gate');
    // must-fail on the same real lines: the old literal bent-oracle marker also matches the real late-bend / post-bend / arr-bend STOPs
    const bo = markerGate({ ...table, 'bent-oracle': { ...table['bent-oracle'], marker: 'STOP ORACLE' } }, rendered, OTHERS);
    for (const n of ['late-bend', 'post-bend', 'arr-bend']) assert.ok(bo.some((s) => s.startsWith('bent-oracle: also matches ' + n + ' ')), n + '\n' + bo.join('\n'));
    // and markerRealGate rejects the empty child set (never vacuous)
    assert.ok(markerRealGate(table, {}).length >= CHILDREN.length);
    assert.ok(childGate(table, {}).length >= 1);
});

test('C-38 staleness: surfaceSha(ABGate.js) equals lines.json surfaceSha, else red "re-capture via quiet-lock"; must-fail: a flipped sha, an edited marker', () => {
    const src = readFileSync(ABGATE, 'utf8'), d = realDoc(), now = surfaceSha(src);
    assert.equal(staleText(d.surfaceSha, now), '', staleText(d.surfaceSha, now));
    // the sha is the documented definition, computed here independently: sha256(INJECTIONS block + '\n' + PINS joined by '\n')
    const blockA = src.indexOf('const INJECTIONS = Object.freeze('), blockZ = src.indexOf('\n});', blockA) + 4;
    assert.equal(injectionsBlock(src), src.slice(blockA, blockZ));
    assert.equal(now, createHash('sha256').update(src.slice(blockA, blockZ) + '\n' + PINS.join('\n')).digest('hex'));
    assert.equal(surfaceSha(src + '\n// a tail outside the surface\n'), now, 'text outside the block does not move the sha');
    // must-fail controls
    const flip = (d.surfaceSha[0] === '0' ? '1' : '0') + d.surfaceSha.slice(1);
    assert.match(staleText(flip, now), /re-capture via quiet-lock/);
    const edited = surfaceSha(once(src, "'boxed': { want: 2, marker: /^VOID ALLOC lane=", "'boxed': { want: 2, marker: /^VOID  ALLOC lane="));
    assert.notEqual(edited, now);
    assert.match(staleText(d.surfaceSha, edited), /re-capture via quiet-lock/);
    const pinned = createHash('sha256').update(src.slice(blockA, blockZ) + '\n' + PINS.slice(1).join('\n')).digest('hex');
    assert.notEqual(pinned, now, 'a dropped PIN moves the sha');
});

test('C-37 / C-60 G2 markerClash (sliced from ABGate.js): 0 on lines.json; every marker\'s own line joined -> ""; a built 2-marker line -> 1 clause, 2 such lines -> 2; must-fail: a ">= 3" copy', () => {
    const src = readFileSync(ABGATE, 'utf8'), table = injectionsOf(src), d = realDoc();
    const mc = clashOf(src, table);
    const all = CHILDREN.flatMap((c) => d.children[c.key].lines);
    assert.ok(all.length >= 13);
    assert.equal(mc(all.join('\n')), '', 'lines.json');
    // G2: ALL own lines of every marker (live count: 14) in one output -> ''
    const own = { ...SYNTH, ...anchors() };
    assert.equal(Object.keys(table).length, 14);
    assert.deepEqual(Object.keys(own).sort(), Object.keys(table).sort());
    for (const [n, l] of Object.entries(own)) assert.deepEqual(Object.keys(table).filter((m) => table[m].marker.test(l)), [n], 'own line of ' + n);
    assert.equal(mc(Object.values(own).join('\n')), '');
    // a built 2-marker line: JS /m also ends a line at \r, so one '\n' piece can hold two marker lines
    const two1 = SYNTH.boxed + '\r' + SYNTH['aa-drift'], two2 = SYNTH['late-bend'] + '\r' + SYNTH['arr-bend'];
    const c1 = mc(two1);
    assert.equal(c1.split(' marker clash: ').length - 1, 1, c1);
    assert.ok(c1.startsWith(' marker clash: 2 markers (boxed, aa-drift) match one line '), c1);
    const c2 = mc([SYNTH['slow-dead'], two1, 'RESULT lane=x (gated) clean', two2].join('\n'));
    assert.equal(c2.split(' marker clash: ').length - 1, 2, c2);
    assert.ok(c2.includes('2 markers (boxed, aa-drift)') && c2.includes('2 markers (late-bend, arr-bend)'), c2);
    // a loosened bent-oracle clashes on the 3 other real STOP ORACLE children of lines.json
    const loose = clashOf(src, { ...table, 'bent-oracle': { ...table['bent-oracle'], marker: /^STOP ORACLE: /m } });
    assert.equal(loose(all.join('\n')).split(' marker clash: ').length - 1, 3);
    // must-fail: a copy that needs >= 3 markers never reports these clashes
    const weak = clashOf(once(src, 'if (hit.length >= 2) desc +=', 'if (hit.length >= 3) desc +='), table);
    assert.equal(weak(two1), '');
    assert.equal(weak([two1, two2].join('\n')), '');
});

// C-60 G1: the timed loop of selftest(), sliced from the source and driven by stub children (no spawn, no clock)
const X_RESULT = 'RESULT lane=x (gated) A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=1.000[0.990..1.010] word=WITHIN B-A=0.00[0.00..0.00]ns aa=1.000[0.990..1.010] slow=2.000[1.900..2.100] ab=n/a B/AB=n/a wordAB=n/a bop=A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000 win=1 reps=A:1,B:1 spin=1 warm=1';
const X_RAW = 'RAW lane=x B/A=1.0000,1.0000,1.0000 AA=1.0000,1.0000,1.0000 SLOW=2.0000,2.0000,2.0000';
const X_WARM = 'WARM lane=x round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0012 AA/A=1.0031 SLOW/A=2.0144';
const X_LATE = 'STOP ORACLE: x B#0 fold (timed): got 0 want -1834221';
const X_BOX = 'VOID ALLOC lane=x: ALLOC B 16.000 B/op';
const TIMED_OUTS = {
    'late-bend': { status: 1, out: ['HEADER rung=x TIMED (stub)', X_LATE, 'VERDICT NO VERDICT (STOP ORACLE) shape=[STOP ORACLE] (stub)', ''].join('\n') },
    'boxed': { status: 2, out: [X_RESULT, X_RAW, X_WARM, X_BOX, 'VERDICT NO VERDICT (run shape) shape=[inject=boxed (want null)] (stub)', ''].join('\n') },
    'clean': { status: 2, out: [X_RESULT, X_RAW, X_WARM, 'VERDICT NO VERDICT (run shape) shape=[rung=x (want ALL); K=3 (want 11)] (stub)', ''].join('\n') },
};
const stubChild = (outs) => (ctx, args, env) => {
    const o = outs[env.inject === null ? 'clean' : env.inject];
    const vs = o.out.split('\n').filter((l) => l.startsWith('VERDICT '));
    return { status: o.status, out: o.out, vline: vs.length === 1 ? vs[0] : null, nV: vs.length };
};
/** -> { rows: [{ ok, txt }], log } of the sliced timed loop over TIMED_OUTS (cases late-bend, boxed, clean on lane x). */
function timedLoop(src, table) {
    const body = between(src, '    for (const [name, lane] of cases) {\n', '    if (l0 === undefined) { bad++;');
    const h = new Function(between(src, 'const NUM_RE = ', '\nconst fin3 = ') + '\n' + between(src, 'function field(line, key) {', '\nfunction stat3(') + '\nreturn { num, field };')();
    const aaHi = Number(/^export const AA_HI = ([0-9.]+);$/m.exec(src)[1]);
    const ctx = { jspec: { K: 11 }, log: [] }, rows = [];
    const cases = Object.keys(TIMED_OUTS).map((k) => [k === 'clean' ? null : k, 'x']);
    new Function('ctx', 'lanes', 'cases', 'INJECTIONS', 'child', 'envWith', 'field', 'num', 'AA_HI', 'markerClash', 'row', 'say', body)(
        ctx, [{ id: 'x' }], cases, table, stubChild(TIMED_OUTS), (n) => ({ inject: n }), h.field, h.num, aaHi, clashOf(src, table),
        (ok, txt) => { rows.push({ ok, txt }); }, (c, s) => { c.log.push(s); });
    return { rows, log: ctx.log };
}
const LOOSE_T = (table) => ({ ...table, 'bent-oracle': { ...table['bent-oracle'], marker: /^STOP ORACLE: /m }, 'slow-dead': { ...table['slow-dead'], marker: /^VOID /m } });

test('C-60 G1 timed loop (sliced): a loosened table fails the late-bend / boxed rows on the markerClash fold; passing rows replay RESULT / STOP / WARM / VOID; must-fail: no-fold copy, pre-U8 replay regex', () => {
    const src = readFileSync(ABGATE, 'utf8'), table = injectionsOf(src);
    const real = timedLoop(src, table);
    assert.deepEqual(real.rows.map((r) => r.ok), [true, true, true], real.rows.map((r) => r.txt).join('\n'));
    assert.deepEqual(real.log, ['SELFTEST   ' + X_LATE, 'SELFTEST   ' + X_RESULT, 'SELFTEST   ' + X_WARM, 'SELFTEST   ' + X_BOX, 'SELFTEST   ' + X_RESULT, 'SELFTEST   ' + X_WARM]);
    const lo = timedLoop(src, LOOSE_T(table));
    assert.deepEqual(lo.rows.map((r) => r.ok), [false, false, true], lo.rows.map((r) => r.txt).join('\n'));
    assert.ok(lo.rows[0].txt.includes(' marker clash: 2 markers (bent-oracle, late-bend) match one line ' + JSON.stringify(X_LATE) + ';'), lo.rows[0].txt);
    assert.ok(lo.rows[1].txt.includes(' marker clash: 2 markers (boxed, slow-dead) match one line ' + JSON.stringify(X_BOX) + ';'), lo.rows[1].txt);
    assert.deepEqual(lo.log, ['SELFTEST   ' + X_RESULT, 'SELFTEST   ' + X_WARM], 'a FAIL row replays nothing on this path');
    // must-fail 1: the fold removed -> the loosened table passes both rows (this gate would read red)
    const nf = timedLoop(once(src, "        if (clash !== '') extra += clash + ';';\n", ''), LOOSE_T(table));
    assert.deepEqual(nf.rows.map((r) => r.ok), [true, true, true], 'the no-fold copy must pass the loosened rows');
    // must-fail 2: the pre-U8 replay regex (no VOID) -> the passing boxed row's VOID line is not replayed
    const nv = timedLoop(once(src, 'if (/^(RESULT|STOP|WARM|VOID) /.test(l))', 'if (/^(RESULT|STOP|WARM) /.test(l))'), table);
    assert.deepEqual(nv.rows.map((r) => r.ok), [true, true, true]);
    assert.ok(!nv.log.includes('SELFTEST   ' + X_BOX) && real.log.includes('SELFTEST   ' + X_BOX));
});

// C-58: the untimed live-drift / frozen-drift rows' markerClash fold, sliced the same way
const U_LIVE = 'STOP ANCHOR: live-drift live/k.js differs from the frozen frozen/k.js at char 101 (live 300 vs frozen 300 chars)';
const U_FROZEN = 'STOP ANCHOR: frozen-sha frozen/k.js sha256 12345678 (want 2a83d841)';
const UNTIMED_OUTS = {
    'live-drift': { status: 1, out: [U_LIVE, 'VERDICT NO VERDICT (STOP ANCHOR) shape=[STOP ANCHOR] (stub)', ''].join('\n') },
    'frozen-drift': { status: 1, out: [U_FROZEN, 'VERDICT NO VERDICT (STOP ANCHOR) shape=[STOP ANCHOR] (stub)', ''].join('\n') },
};
/** -> [{ ok, txt }] of the sliced untimed sections (4) live-drift and (5) frozen-drift, on a live-bound stub spec. */
function untimedFold(src, table) {
    const body = between(src, '    // (4) live-drift, pre-clock.', '    // (6) the judge rows');
    const preClock = new Function(between(src, 'const preClock = ', '\nconst JUDGE_ROWS') + '\nreturn preClock;')();
    const tail = new Function(between(src, 'const FROZEN_ONLY_TAIL = ', '\n') + '\nreturn FROZEN_ONLY_TAIL;')();
    const ctx = { spec: { frozen: [{ name: 'k.js', frozen: 'frozen/k.js', sha256: '2a83d841' + '0'.repeat(56), live: 'live/k.js' }] }, log: [] }, rows = [];
    new Function('ctx', 'INJECTIONS', 'child', 'envWith', 'runId', 'preClock', 'markerClash', 'row', 'FROZEN_ONLY_TAIL', body)(
        ctx, table, stubChild(UNTIMED_OUTS), (n) => ({ inject: n }), 'x', preClock, clashOf(src, table), (ok, txt) => { rows.push({ ok, txt }); }, tail);
    return rows;
}
const LOOSE_U = (table) => ({ ...table, 'live-drift': { ...table['live-drift'], marker: /^STOP ANCHOR: /m }, 'frozen-drift': { ...table['frozen-drift'], marker: /^STOP ANCHOR: /m } });

test('C-58 untimed fold (sliced): a loosened table fails the live-drift and frozen-drift rows on markerClash; must-fail: each row\'s no-fold copy passes its own row only', () => {
    const src = readFileSync(ABGATE, 'utf8'), table = injectionsOf(src);
    const real = untimedFold(src, table);
    assert.deepEqual(real.map((r) => r.ok), [true, true], real.map((r) => r.txt).join('\n'));
    assert.ok(real[0].txt.startsWith('live-drift x: exit 1 (want 1) marker ') && real[1].txt.startsWith('frozen-drift frozen/k.js: exit 1 (want 1) marker '));
    const lo = untimedFold(src, LOOSE_U(table));
    assert.deepEqual(lo.map((r) => r.ok), [false, false], lo.map((r) => r.txt).join('\n'));
    assert.ok(lo[0].txt.includes(' marker clash: 2 markers (live-drift, frozen-drift) match one line ' + JSON.stringify(U_LIVE) + ';'), lo[0].txt);
    assert.ok(lo[1].txt.includes(' marker clash: 2 markers (live-drift, frozen-drift) match one line ' + JSON.stringify(U_FROZEN) + ';'), lo[1].txt);
    const nfL = untimedFold(once(src, "const clash = markerClash(r.out), extra = clash === '' ? '' : clash + ';';", "const clash = '', extra = '';"), LOOSE_U(table));
    assert.deepEqual(nfL.map((r) => r.ok), [true, false], 'the live-drift no-fold copy passes its row only');
    const nfF = untimedFold(once(src, "const fdClash = markerClash(fd.out), fdExtra = fdClash === '' ? '' : fdClash + ';';", "const fdClash = '', fdExtra = '';"), LOOSE_U(table));
    assert.deepEqual(nfF.map((r) => r.ok), [false, true], 'the frozen-drift no-fold copy passes its row only');
});

// ============================================================ CLI: --selftest-untimed takes no other flag
test('--selftest-untimed takes no other flag (STOP CLI, exit 1), and a typo gets a did-you-mean', () => {
    for (const [args, want] of [
        [[FROZEN_ONLY, '--selftest-untimed', '--run', 'ALL'], 'STOP CLI: --selftest-untimed takes no other flag'],
        [[FROZEN_ONLY, '--selftest-untimed', '--K', '11'], 'STOP CLI: --selftest-untimed takes no other flag'],
        [[FROZEN_ONLY, '--selftest-untimed', '--oracle-only'], 'STOP CLI: --selftest-untimed takes no other flag'],
        [[FROZEN_ONLY, '--selftest', '--selftest-untimed'], 'STOP CLI: --selftest-untimed takes no other flag'],
        [[FROZEN_ONLY, '--selftest-untimed', '--verdict-file', '-'], 'STOP CLI: --verdict-file takes no other flag'],
        // (a trailing unknown flag reads "needs a value" first, as ab-proto's parseCli; give it one)
        [[FROZEN_ONLY, '--selftest-untimd', 'x'], 'STOP CLI: unknown flag --selftest-untimd (did you mean --selftest-untimed?)'],
    ]) {
        const r = run(ABGATE, args);
        assert.equal(r.status, 1, args.join(' '));
        assert.ok(r.out.split('\n').includes(want), args.join(' ') + ' -> ' + r.out.slice(0, 300));
        assert.match(r.out, /^VERDICT NO VERDICT \(STOP CLI\) no spec loaded$/m);
        assert.doesNotMatch(r.out, /^SELFTEST /m);
    }
});
