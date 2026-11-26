// test/reproof.cold.test.mjs -- U9A2 (plan-U9A2-v1 C7, C-67): the cold-start settle and the SETTLE / PIDS / COLD log grammar.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
// Expected values come from the plan text only (SPEC DELTA d/e, tasks C1-C3, C7). No child process, no clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { COLD, pcpuOf, coldSettle, parseOuter, parseLog, sha256, PIN, ORDER, GATED } from '../bench/reproof.mjs';

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

/** scripted ps: read() returns the next snapshot (last one repeats); counts reads and sleeps. */
function script(snaps) {
    const s = { reads: 0, sleeps: [] };
    s.read = () => snaps[Math.min(s.reads++, snaps.length - 1)];
    s.sleep = (ms) => { s.sleeps.push(ms); };
    return s;
}
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

test('H2 coldSettle: both pids below 10 on the third poll -> settled, 2 sleeps of 500', () => {
    const s = script([ps(25, 11), ps(9.9, 10.0), ps(0.0, 9.9)]);
    const r = coldSettle(s.read, s.sleep, { outer: 100, parent: 200 });
    assert.equal(r.settled, true);
    assert.equal(r.polls, 3);
    assert.equal(r.outer, 0);
    assert.equal(r.parent, 9.9);
    assert.equal(s.reads, 3);
    assert.deepEqual(s.sleeps, [500, 500]);
});

test('H3 coldSettle: parent fixed at 11 -> cap 60 polls, 60 reads, 59 sleeps, not settled', () => {
    const s = script([ps(0.0, 11)]);
    const r = coldSettle(s.read, s.sleep, { outer: 100, parent: 200 });
    assert.equal(r.settled, false);
    assert.equal(r.polls, 60);
    assert.equal(s.reads, 60);
    assert.equal(s.sleeps.length, 59);
    assert.ok(s.sleeps.every((m) => m === 500));
});

test('H4 coldSettle: parent pid absent, or empty ps text -> not settled at 60, parent NaN', () => {
    for (const snap of ['0.0 100 node\n0.0 1 launchd\n', '']) {
        const s = script([snap]);
        const r = coldSettle(s.read, s.sleep, { outer: 100, parent: 200 });
        assert.equal(r.settled, false);
        assert.equal(r.polls, 60);
        assert.ok(Number.isNaN(r.parent));
        assert.equal(s.reads, 60);
        assert.equal(s.sleeps.length, 59);
    }
});

// ---- H5: parseOuter. clean text = the existing outer.log shape + PIDS / COLD before CHILD 1.
const PIDS_L = 'PIDS outer=4242 parent=4241';
const COLD_L = 'COLD polls=1 cap=60 interval-ms=500 outer=0.0 parent=0.0 settled=yes';
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
        ['COLD malformed', { cold: 'COLD polls=1 cap=60 interval-ms=500 outer=0.0 settled=yes' }, /COLD line malformed/],
        ['PIDS/COLD after CHILD 1', { late: true }, /PIDS after CHILD 1[\s\S]*COLD after CHILD 1/],
        ['PIDS outer == parent', { pids: 'PIDS outer=4242 parent=4242' }, /outer == parent|outer==parent/],
        ['COLD cap not 60', { cold: 'COLD polls=1 cap=59 interval-ms=500 outer=0.0 parent=0.0 settled=yes' }, /cap/],
        ['COLD interval not 500', { cold: 'COLD polls=1 cap=60 interval-ms=400 outer=0.0 parent=0.0 settled=yes' }, /interval/],
        ['COLD polls 0', { cold: 'COLD polls=0 cap=60 interval-ms=500 outer=0.0 parent=0.0 settled=yes' }, /polls/],
        ['COLD polls 61', { cold: 'COLD polls=61 cap=60 interval-ms=500 outer=0.0 parent=0.0 settled=yes' }, /polls/],
        ['settled=yes with parent=10.0', { cold: 'COLD polls=1 cap=60 interval-ms=500 outer=0.0 parent=10.0 settled=yes' }, /disagrees/],
        ['settled=yes with outer=NaN', { cold: 'COLD polls=1 cap=60 interval-ms=500 outer=NaN parent=0.0 settled=yes' }, /disagrees/],
        ['settled=no before the cap', { cold: 'COLD polls=59 cap=60 interval-ms=500 outer=0.0 parent=11.0 settled=no' }, /before the cap/],
        ['negative reading', { cold: 'COLD polls=1 cap=60 interval-ms=500 outer=-1 parent=0.0 settled=yes' }, /COLD line malformed/],
        ['settled=no with both below 10', { cold: 'COLD polls=1 cap=60 interval-ms=500 outer=0.0 parent=0.0 settled=no' }, /disagrees/],
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
