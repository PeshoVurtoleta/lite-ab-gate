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
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
};
const PINS = [
    "say(ctx, e instanceof Stop ? 'STOP ' + e.reason + ': ' + e.message",
    "say(ctx, 'VOID ' + v.split(' ')[0] + ' lane=' + L.id + ': ' + v);",
    "' (' + where + ') op ' + op + ' field ' + k + ' got ' + got[k] + ' want ' + ex[op * R + k]",
    "verifyAll(e, L, L.expect, 'after the oracle pass')", "verifyAll(e, L, fresh, 'after timing, fresh reference')",
    "' fold (' + where + '): got ' + got + ' want ' + want", "verifyRun(e, got, e.wants[x], L, 'timed')",
    "' data.' + k + ' (' + where + ') differs from the lane data'", "stop('ORACLE', at + ' at byte ' + i)", "checkArr(e, L, 'after warm')",
    "voids.push('ALLOC ' + c + ' ' + fmt(bop[c], 3) + ' B/op')", "voids.push('SLOW-DEAD ' + fmtS(slow, 3))", "voids.push('AA-DRIFT ' + fmtS(aa, 3))",
    "voids.push('REPS-DRIFT B/AB ' + fmtS(bab, 3) + ' reads ' + wordAB + ' but B/A ' + fmtS(ratio, 3) + ' reads ' + word(ratio) + ' (AB = A at B\\'s reps ' + repsB + ' vs A\\'s ' + reps + ')')",
    "'WARM lane=' + L.id + ' round 0 (discarded, not in any median) ' + liveCols.map((c) => c.id + '/A=' + fmt(warm0[c.id] / warm0.A, 4)).join(' ')",
    "voids.push('NOT-TF tool timedRounds (TF at window start ' + toolTfStart + ', end ' + toolTfEnd + ')')",
];
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
];
const NAMES = ['bent-oracle', 'boxed', 'slow-dead', 'aa-drift', 'live-drift', 'frozen-drift', 'late-bend', 'post-bend', 'ab-drift', 'warm-skew', 'arr-bend', 'tool-deopt'];

test('marker gate (C-21): each of the 12 INJECTIONS markers is an anchored RegExp matching only its own rendered message; must-fail controls rejected', () => {
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
