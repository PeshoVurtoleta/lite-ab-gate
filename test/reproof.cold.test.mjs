// test/reproof.cold.test.mjs -- U9A3 (plan-U9A3-v1 TASK 5, C-67 minimum dwell, ASSERTIONS 10-13) over U9A2 (plan-U9A2-v1 C7, C-67): the cold-start settle and the SETTLE / PIDS / COLD log grammar.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
// Expected values come from the plan text only (SPEC DELTA d/e, tasks C1-C3, C7). No child process, no clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { COLD, pcpuOf, coldSettle, parseOuter, parseLog, judgeHolds, sha256, PIN, ORDER, GATED } from '../bench/reproof.mjs';
import * as HARNESS from '../bench/reproof.mjs';   // coldLine via the namespace: a build without it fails H8-H10 only, not the whole file
const coldLine = (r) => HARNESS.coldLine(r);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LANES = Object.keys(GATED);
const P_LOG = readFileSync(join(ROOT, 'research', 'timing-ab', 'r1', 'logs', 'hold-1.log'), 'utf8');
const G_SHA = sha256('G of cold test');

function edit1(text, from, to) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error('edit1: anchor matched ' + n + ' times: ' + from.slice(0, 80));
    return text.replace(from, () => to);
}
const SETTLE = (id) => 'SETTLE lane=' + id + ' passes=1 pass-bytes=0 settled=yes';
/** research P log -> G-format log with one clean SETTLE line before each WINDOW line (own construction). */
function toG(p) {
    let t = edit1(p, ' sha256 74f1a3d4\n', ' sha256 ' + G_SHA.slice(0, 8) + '\n');
    for (const id of LANES) t = edit1(t, '\nRESULT lane=' + id + ' ', '\n' + SETTLE(id) + '\nWINDOW lane=' + id + ' tool-bytes=0 scavenges=0\nRESULT lane=' + id + ' ');
    return t;
}
const G_OK = toG(P_LOG);
const errs = (t, role = 'G') => parseLog(t, role).errors.join('\n');

/** scripted ps + clock: read() returns the next snapshot (snaps = array, last repeats, or fn(index)); now() = t0 + step*(call index).
 *  Counts reads, nows, sleeps; ev logs the call order ('n' now, 'r' read, 's' sleep). */
function script(snaps, t0 = 2000, step = 500) {
    const s = { reads: 0, nows: 0, sleeps: [], ev: [] };
    s.read = () => { s.ev.push('r'); const i = s.reads++; return typeof snaps === 'function' ? snaps(i) : snaps[Math.min(i, snaps.length - 1)]; };
    s.sleep = (ms) => { s.ev.push('s'); s.sleeps.push(ms); };
    s.now = () => { s.ev.push('n'); return typeof t0 === 'function' ? t0(s.nows++) : t0 + step * s.nows++; };
    return s;
}
const PIDS = { outer: 100, parent: 200 };
const run = (s) => coldSettle(s.read, s.sleep, PIDS, s.now);
const ps = (o, p) => o + ' 100 node\n' + p + ' 200 node\n0.0 1 launchd\n';

test('H1 pcpuOf: exact pid match, number or NaN', () => {
    const t = '10.9 81404 node\n9.9 81405 /usr/local/bin/node\n12.0 814 node\n';
    assert.equal(pcpuOf(t, 81404), 10.9);
    assert.equal(pcpuOf(t, 81405), 9.9);
    assert.equal(pcpuOf(t, 814), 12);
    assert.ok(Number.isNaN(pcpuOf(t, 8140)));
    assert.ok(Number.isNaN(pcpuOf('1.0 7 node\n2.0 7 node', 7)), 'a pid on two rows reads NaN');
    assert.ok(Number.isNaN(pcpuOf('10,9 7 node', 7)), 'a comma decimal reads NaN');
    assert.equal(COLD.max, 10); assert.equal(COLD.ms, 500); assert.equal(COLD.cap, 60);
});

test("H2' coldSettle: readings (25,11),(9.9,10.0),(0,9.9),(0,9.9) -> pair is polls 3+4 -> polls 4, 3 sleeps of 500", () => {
    // poll 2 has parent 10.0 (not < 10); polls 1-2 cannot pair; polls 3,4 both below 10 and t3 = 3000 >= 2000
    const s = script([ps(25, 11), ps(9.9, 10.0), ps(0.0, 9.9)]);   // last snapshot repeats
    const r = run(s);
    assert.equal(r.settled, true);
    assert.equal(r.polls, 4);
    assert.equal(r.outer, 0);
    assert.equal(r.parent, 9.9);
    assert.equal(r.prevOuter, 0);
    assert.equal(r.prevParent, 9.9);
    assert.equal(r.pairMs, 3000);
    assert.equal(s.reads, 4);
    assert.deepEqual(s.sleeps, [500, 500, 500]);
});

test('H3 coldSettle: parent fixed at 11 -> cap 60 polls, 60 reads, 59 sleeps, not settled', () => {
    const s = script([ps(0.0, 11)]);
    const r = run(s);
    assert.equal(r.settled, false);
    assert.equal(r.polls, 60);
    assert.equal(s.reads, 60);
    assert.equal(s.nows, 60);   // one now() per poll (C-67 dwell clock)
    assert.equal(r.pairMs, 31000);   // t59 = 2000 + 500 * 58
    assert.equal(s.sleeps.length, 59);
    assert.ok(s.sleeps.every((m) => m === 500));
});

test('H4 coldSettle: parent pid absent, or empty ps text -> not settled at 60, parent NaN', () => {
    for (const snap of ['0.0 100 node\n0.0 1 launchd\n', '']) {
        const s = script([snap]);
        const r = run(s);
        assert.equal(r.settled, false);
        assert.equal(r.polls, 60);
        assert.ok(Number.isNaN(r.parent));
        assert.equal(s.reads, 60);
        assert.equal(s.nows, 60);
        assert.equal(s.sleeps.length, 59);
    }
});

// ---- H5: parseOuter. clean text = the existing outer.log shape + PIDS / COLD before CHILD 1.
const PIDS_L = 'PIDS outer=4242 parent=4241';
const cl = (o = {}) => 'COLD polls=' + (o.polls ?? 2) + ' cap=' + (o.cap ?? 60) + ' interval-ms=' + (o.interval ?? 500) + ' dwell-ms=' + (o.dwell ?? 2000) +
    ' pair-ms=' + (o.pair ?? 2000) + ' prev-outer=' + (o.po ?? '0.0') + ' prev-parent=' + (o.pp ?? '0.0') + ' outer=' + (o.outer ?? '0.0') +
    ' parent=' + (o.parent ?? '0.0') + ' settled=' + (o.settled ?? 'yes');
const COLD_L = 'COLD polls=2 cap=60 interval-ms=500 dwell-ms=2000 pair-ms=2000 prev-outer=0.0 prev-parent=0.0 outer=0.0 parent=0.0 settled=yes';
function outerText(h = {}) {
    const order = ORDER(1), L = ['OUTER u9-reproof hold=1 order=' + order.join(','), 'NODE v26.8.2 v8 14.6.202.34-node.28'];
    const sha = { P: PIN.P, G: G_SHA, M: sha256('M of cold test'), lane: PIN.lane, ohlc: PIN.ohlc, baseline: PIN.baseline, harness: sha256('harness') };
    for (const k of ['P', 'G', 'M', 'lane', 'ohlc', 'baseline', 'harness']) L.push('SHA ' + k + ' ' + sha[k]);
    const pre = [h.pids === undefined ? PIDS_L : h.pids, h.cold === undefined ? COLD_L : h.cold].flat().filter((x) => x !== null);
    for (let i = 1; i <= 5; i++) {
        if (i === 1 && !h.late) L.push(...pre);
        L.push('CHILD ' + i + ' ' + order[i - 1] + ' exit 0 ms 1 stderr-bytes 0 log-sha256 ' + sha256('log' + i));
        L.push('REJUDGE ' + i + ' ' + order[i - 1] + ' exit 0 verdict PASS match yes');
        if (i === 1 && h.late) L.push(...pre);
    }
    return L.join('\n') + '\n';
}
const oerr = (t) => parseOuter(t).errors.join('\n');

test('H5 parseOuter: every PIDS / COLD error fragment, each against a clean control', () => {
    const clean = parseOuter(outerText());
    assert.deepEqual(clean.pids, { outer: 4242, parent: 4241 });
    assert.deepEqual(clean.errors, []);
    const cleanErr = oerr(outerText());
    const cases = [
        ['no PIDS', { pids: null }, /no PIDS/i],
        ['no COLD', { cold: null }, /no COLD/i],
        ['PIDS twice', { pids: [PIDS_L, PIDS_L] }, /PIDS.*twice|twice.*PIDS/i],
        ['COLD twice', { cold: [COLD_L, COLD_L] }, /COLD.*twice|twice.*COLD/i],
        ['PIDS malformed', { pids: 'PIDS outer=4242' }, /PIDS line malformed/],
        ['COLD malformed', { cold: COLD_L.replace(' parent=0.0 settled', ' settled') }, /COLD line malformed/],
        ['PIDS/COLD after CHILD 1', { late: true }, /PIDS after CHILD 1[\s\S]*COLD after CHILD 1/],
        ['PIDS outer == parent', { pids: 'PIDS outer=4242 parent=4242' }, /outer == parent|outer==parent/],
        ['COLD cap not 60', { cold: cl({ cap: 59 }) }, /cap/],
        ['COLD interval not 500', { cold: cl({ interval: 400 }) }, /interval/],
        ['COLD polls 0', { cold: cl({ polls: 0 }) }, /polls/],
        ['COLD polls 61', { cold: cl({ polls: 61 }) }, /polls/],
        ['settled=yes with parent=10.0', { cold: cl({ parent: '10.0' }) }, /disagrees/],
        ['settled=yes with outer=NaN', { cold: cl({ outer: 'NaN' }) }, /disagrees/],
        ['settled=yes with prev-parent=10.0', { cold: cl({ pp: '10.0' }) }, /disagrees/],
        ['settled=yes with prev-outer=10.0', { cold: cl({ po: '10.0' }) }, /disagrees/],
        ['settled=yes with outer=10.0', { cold: cl({ outer: '10.0' }) }, /disagrees/],
        ['settled=no before the cap', { cold: cl({ polls: 59, pair: 30500, parent: '11.0', settled: 'no' }) }, /before the cap/],
        ['negative reading', { cold: cl({ outer: '-1' }) }, /COLD line malformed/],
        ['negative prev reading', { cold: cl({ po: '-1' }) }, /COLD line malformed/],
        ['settled=no with all four below 10 and pair-ms 2000', { cold: cl({ settled: 'no' }) }, /disagrees/],
    ];
    for (const [name, h, re] of cases) {
        const e = oerr(outerText(h));
        assert.match(e, re, name + ': ' + e);
        assert.doesNotMatch(cleanErr, re, name + ' (clean control): ' + cleanErr);
    }
});

// ---- H6: parseLog SETTLE / WINDOW fragments on a G log built from research hold-1.
test('H6 parseLog: every SETTLE / WINDOW error fragment, each against a clean control', () => {
    const L0 = LANES[0], L1 = LANES[1];
    const win = (id) => 'WINDOW lane=' + id + ' tool-bytes=0 scavenges=0';
    const voidLine = (id) => 'VOID TIER-SETTLE lane=' + id + ': tool bytes did not settle';
    const cases = [
        ['SETTLE malformed (skipped)', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' skipped'), /SETTLE line malformed/, 'G'],
        ['pass-bytes not numbers', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' passes=1 pass-bytes=0x settled=yes'), /SETTLE line malformed/, 'G'],
        ['settled=yes with an earlier 0', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' passes=2 pass-bytes=0,0 settled=yes'), /settled=yes disagrees with pass-bytes 0,0/, 'G'],
        ['settled=no before the 3-pass cap', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' passes=2 pass-bytes=8,8 settled=no'), /settled=no disagrees with pass-bytes 8,8$/m, 'G'],
        ['settled=no with a 0 pass', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' passes=3 pass-bytes=8,0,8 settled=no'), /settled=no disagrees with pass-bytes 8,0,8/, 'G'],
        ['SETTLE lane twice', edit1(G_OK, SETTLE(L0) + '\n' + win(L0), SETTLE(L0) + '\n' + SETTLE(L0) + '\n' + win(L0)), /SETTLE lane=\S+ twice/, 'G'],
        ['SETTLE lanes missing one', edit1(G_OK, SETTLE(L1) + '\n', ''), /SETTLE lanes/, 'G'],
        ['pass-bytes count != passes', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' passes=2 pass-bytes=0 settled=yes'), /pass-bytes count/, 'G'],
        ['settled=yes disagrees with pass-bytes', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' passes=1 pass-bytes=16 settled=yes'), /disagrees with pass-bytes/, 'G'],
        ['settled=no without VOID TIER-SETTLE', edit1(G_OK, SETTLE(L0), 'SETTLE lane=' + L0 + ' passes=3 pass-bytes=8,8,8 settled=no'), /settled=no without VOID TIER-SETTLE/, 'G'],
        ['VOID TIER-SETTLE without SETTLE settled=no', edit1(G_OK, '\nPROV end ', '\n' + voidLine(L0) + '\nPROV end '), /VOID TIER-SETTLE lane=\S+ without SETTLE settled=no/, 'G'],
        ['SETTLE line in a P log', edit1(P_LOG, '\nRESULT lane=' + L0 + ' ', '\n' + SETTLE(L0) + '\nRESULT lane=' + L0 + ' '), /SETTLE line in a P log/, 'P'],
        ['WINDOW tool-bytes not a number', edit1(G_OK, 'WINDOW lane=' + L0 + ' tool-bytes=0 ', 'WINDOW lane=' + L0 + ' tool-bytes=0x '), /WINDOW lane=\S+ tool-bytes not a number/, 'G'],
    ];
    assert.equal(errs(G_OK, 'G'), '', 'clean G control');
    assert.equal(errs(P_LOG, 'P'), '', 'clean P control');
    for (const [name, t, re, role] of cases) {
        const e = errs(t, role);
        assert.match(e, re, name + ': ' + e);
        assert.doesNotMatch(errs(role === 'P' ? P_LOG : G_OK, role), re, name + ' (clean control)');
    }
});

// ---- U9A3 (C-67 "Minimum dwell", A36 / A37): ASSERTIONS 10-13. Every expected value is derived by hand from the rule.
const FLAT = (o, p) => () => ps(o, p);

test('H7 parseOuter (A10): polls=1 is impossible; the burst-13 old-grammar lines are malformed; the new default is clean', () => {
    const e1 = oerr(outerText({ cold: cl({ polls: 1, pair: 0 }) }));
    assert.match(e1, /COLD polls outside 2\.\.60 \(polls=1\)/);
    // burst-13 literals (.handoff is gitignored): outer itself read 0 on a one-poll settle
    const old = outerText({ pids: 'PIDS outer=89404 parent=89397', cold: 'COLD polls=1 cap=60 interval-ms=500 outer=0 parent=8.5 settled=yes' });
    assert.match(oerr(old), /COLD line malformed/);
    assert.equal(oerr(outerText({ cold: COLD_L })), '');
    assert.deepEqual(parseOuter(outerText({ cold: COLD_L })).errors, []);
});

test('H8 coldSettle (A11): clock 2000,2500,..; a 10.0 reading resets the pair; an alternating busy parent runs to the cap', () => {
    // (0,0),(0,10.0),(0,0),(0,0): poll 2 parent 10.0 is not < 10; pair = polls 3+4, t3 = 3000
    const a = script([ps(0, 0), ps(0, 10.0), ps(0, 0), ps(0, 0)]);
    const ra = run(a);
    assert.equal(ra.settled, true);
    assert.equal(ra.polls, 4);
    assert.equal(ra.pairMs, 3000);
    // (0,0),(0,11) alternating: no two consecutive polls both below 10 -> cap, pair = polls 59 (0,0) + 60 (0,11)
    const b = script((i) => (i % 2 === 0 ? ps(0, 0) : ps(0, 11)));
    const rb = run(b);
    assert.equal(rb.settled, false);
    assert.equal(rb.polls, 60);
    assert.equal(rb.parent, 11);
    assert.equal(rb.prevParent, 0);
    assert.equal(rb.pairMs, 2000 + 500 * 58);   // t59
    assert.equal(b.reads, 60);
    const o10 = run(script([ps(0, 0), ps(10.0, 0), ps(0, 0), ps(0, 0)])); assert.deepEqual([o10.settled, o10.polls, o10.pairMs], [true, 4, 3000]);
    assert.equal(coldLine(run(script([ps(1.5, 2.5), ps(3.5, 4.5)]))), 'COLD polls=2 cap=60 interval-ms=500 dwell-ms=2000 pair-ms=2000 prev-outer=1.5 prev-parent=2.5 outer=3.5 parent=4.5 settled=yes');
});

test('H9 coldSettle (A12): the first poll of the pair must be at uptime >= 2000 ms (floored); pair-ms 1999 + settled=yes is STOP', () => {
    const a = script([ps(0, 0)], 1999.9, 500);   // 1999.9, 2499.9, 2999.9: floor -> 1999 (too early), 2499, 2999
    const ra = run(a);
    assert.equal(ra.settled, true);
    assert.equal(ra.polls, 3);
    assert.equal(ra.pairMs, 2499);
    const b = script([ps(0, 0)], 2000, 500);
    const rb = run(b);
    assert.equal(rb.settled, true);
    assert.equal(rb.polls, 2);
    assert.equal(rb.pairMs, 2000);
    assert.match(oerr(outerText({ cold: cl({ pair: 1999 }) })), /disagrees/);
    assert.doesNotMatch(oerr(outerText({ cold: cl({ pair: 2000 }) })), /disagrees/);   // boundary control
});

/** a minimal 1-hold judgeHolds input whose outer.log carries `coldText`; P / G / M logs from research hold-1 (own construction). */
function holdWith(coldText) {
    const order = ORDER(1), M_SHA = sha256('M of cold test'), H_SHA = sha256('harness');
    const gl = G_OK, ml = edit1(G_OK, ' sha256 ' + G_SHA.slice(0, 8) + '\n', ' sha256 ' + M_SHA.slice(0, 8) + '\n');
    const logs = {};
    order.forEach((role, j) => { logs[j + 1] = role === 'P' ? P_LOG : role === 'G' ? gl : ml; });
    const sha = { P: PIN.P, G: G_SHA, M: M_SHA, lane: PIN.lane, ohlc: PIN.ohlc, baseline: PIN.baseline, harness: H_SHA };
    const L = ['OUTER u9-reproof hold=1 order=' + order.join(','), 'NODE v26.8.2 v8 14.6.202.34-node.28', PIDS_L];
    for (const k of ['P', 'G', 'M', 'lane', 'ohlc', 'baseline', 'harness']) L.push('SHA ' + k + ' ' + sha[k]);
    L.push(coldText);
    for (let i = 1; i <= 5; i++) {
        L.push('CHILD ' + i + ' ' + order[i - 1] + ' exit 0 ms 1 stderr-bytes 0 log-sha256 ' + sha256(logs[i]));
        L.push('REJUDGE ' + i + ' ' + order[i - 1] + ' exit 0 verdict PASS match yes');
    }
    return { outer: L.join('\n') + '\n', logs };
}

test('H10 coldSettle / coldLine (A13): cap, no work after the last poll, call counts, round trip, impossible-line STOPs', () => {
    assert.deepEqual({ ...COLD }, { max: 10, ms: 500, cap: 60, dwell: 2000 });
    // cap: parent fixed 11 -> polls 60, t59 = 2000 + 500 * 58 = 31000
    const c = script([ps(0, 11)]);
    const rc = run(c);
    assert.equal(rc.settled, false);
    assert.equal(rc.polls, 60);
    assert.equal(rc.pairMs, 31000);
    assert.equal(c.reads, 60);
    assert.equal(c.nows, 60);
    assert.equal(c.sleeps.length, 59);
    assert.ok(c.sleeps.every((m) => m === 500));
    assert.equal(c.ev[c.ev.length - 1], 'r', 'nothing (no sleep / now / read) after poll 60');
    assert.equal(c.ev.join(''), 'nr' + 'snr'.repeat(59), 'per poll one now() then one read(); sleeps only between polls');
    // every settled row: reads = nows = polls, sleeps = polls - 1, nothing after the deciding poll
    const rows = [
        [[ps(0, 0)], 2],
        [[ps(25, 11), ps(9.9, 10.0), ps(0.0, 9.9)], 4],
        [[ps(0, 0), ps(0, 10), ps(0, 0), ps(0, 0)], 4],
        [[ps(0, 12), ps(0, 12), ps(0, 12), ps(0, 0)], 5],
    ];
    for (const [snaps, polls] of rows) {
        const s = script(snaps);
        const r = run(s);
        assert.equal(r.settled, true);
        assert.equal(r.polls, polls);
        assert.equal(s.reads, polls);
        assert.equal(s.nows, polls);
        assert.equal(s.sleeps.length, polls - 1);
        assert.equal(s.ev[s.ev.length - 1], 'r');
        // round trip: the line parses clean inside an outer.log, and the hold judges PENDING (1 hold < 8), not STOP
        assert.equal(oerr(outerText({ cold: coldLine(r) })), '', coldLine(r));
        const j = judgeHolds([holdWith(coldLine(r))], { gSha: G_SHA, harnessSha: sha256('harness') });
        assert.deepEqual(j.holds[0].stop, []);
        assert.equal(j.verdict, 'PENDING');
    }
    // exact text of the default settle (grammar from SPEC C-67): (0,0),(0,0) at 2000, 2500; readings print as String(n),
    // as holdMain always did (burst-13 outer.log: `outer=0`), so 0 prints `0`, not COLD_L's `0.0`
    assert.equal(coldLine(run(script([ps(0, 0)]))),
        'COLD polls=2 cap=60 interval-ms=500 dwell-ms=2000 pair-ms=2000 prev-outer=0 prev-parent=0 outer=0 parent=0 settled=yes');
    // the cap row: settled=no round-trips clean and judges PENDING
    assert.equal(oerr(outerText({ cold: coldLine(rc) })), '');
    assert.equal(judgeHolds([holdWith(coldLine(rc))], { gSha: G_SHA, harnessSha: sha256('harness') }).verdict, 'PENDING');
    // pair-ms floor at the cap: (60 - 2) * 500 = 29000 passes, 28999 is STOP
    const capLine = (pair, dwell = 2000) => cl({ polls: 60, pair, dwell, parent: '11.0', settled: 'no' });
    assert.equal(oerr(outerText({ cold: capLine(29000) })), '');
    assert.notEqual(oerr(outerText({ cold: capLine(28999) })), '');
    // dwell-ms != 2000 is STOP (control: 2000 clean)
    assert.notEqual(oerr(outerText({ cold: cl({ dwell: 1999 }) })), '');
    assert.equal(oerr(outerText({ cold: cl({ dwell: 2000 }) })), '');
});
