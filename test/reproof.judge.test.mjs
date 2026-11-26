// test/reproof.judge.test.mjs -- U9 TASK 4 (plan-U9-v1, C-36): DETERMINISTIC rows for bench/reproof.mjs's pure judge.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
// No child process, no clock. The unedited control is 5 holds built from research/timing-ab/r1/logs/hold-1..5.log with
// P = G (G = the same log in ABGate's format: a WINDOW line per lane, the G tool sha8) and M = G with B x 1.04 (RAW
// rounds scaled, RESULT B/A re-summarized from them): it must read PASS with every r = 1.000. Every must-fail row is the
// control plus ONE edit (edit1 throws unless its anchor matches exactly once) and must read its own non-PASS verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { judgeHolds, decide, parseLog, assessLog, buildMutant, sha256, summary, PIN, ORDER, GATED, BAND, MUT } from '../bench/reproof.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LANES = Object.keys(GATED);
const RESEARCH = [1, 2, 3, 4, 5].map((h) => readFileSync(join(ROOT, 'research', 'timing-ab', 'r1', 'logs', 'hold-' + h + '.log'), 'utf8'));
const G_SHA = 'd4991c39294d535b5f4464b42fd826ef72c5cf7ccd0a98769aec5715d3fd710d';   // 311761f ABGate.js (calibration G)
const M_SHA = sha256('M of ' + G_SHA);   // any 64-hex != G (outer.log binding only; buildMutant has its own rows)
const H_SHA = sha256('harness');
const OPTS = Object.freeze({ gSha: G_SHA, harnessSha: H_SHA });

function edit1(text, from, to) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error('edit1: anchor matched ' + n + ' times: ' + from.slice(0, 80));
    return text.replace(from, () => to);
}
const lineOf = (text, prefix) => {
    const ls = text.split('\n').filter((l) => l.startsWith(prefix));
    if (ls.length !== 1) throw new Error('lineOf: ' + ls.length + ' lines start with ' + prefix);
    return ls[0];
};
/** P-format log -> G-format log: the G tool sha8 on HEADER spec, a SETTLE line (settled on pass 1, C-48 / C-67) and a
 *  WINDOW line (0 tool bytes) before each RESULT. */
function toG(p, sha8) {
    let t = edit1(p, ' sha256 74f1a3d4\n', ' sha256 ' + sha8 + '\n');
    for (const id of LANES) t = edit1(t, '\nRESULT lane=' + id + ' ', '\nSETTLE lane=' + id + ' passes=1 pass-bytes=0 settled=yes\nWINDOW lane=' + id + ' tool-bytes=0 scavenges=0\nRESULT lane=' + id + ' ');
    return t;
}
const f3 = (s) => s.med.toFixed(3) + '[' + s.q1.toFixed(3) + '..' + s.q3.toFixed(3) + ']';
/** Scale B on one lane (or all): RAW B/A x f (4 dp), RESULT B/A re-summarized from the scaled RAW, B/AB x f. */
function scaleB(text, f, lanes = LANES) {
    let t = text;
    for (const id of lanes) {
        const raw = lineOf(t, 'RAW lane=' + id + ' ');
        const m = / B\/A=(\S+)/.exec(raw);
        const vs = m[1].split(',').map((x) => Number((Number(x) * f).toFixed(4)));
        t = edit1(t, raw, raw.replace(m[0], ' B/A=' + vs.map((v) => v.toFixed(4)).join(',')));
        const res = lineOf(t, 'RESULT lane=' + id + ' ');
        let nr = res.replace(/ B\/A=\S+/, ' B/A=' + f3(summary(vs)));
        const ab = / B\/AB=(\S+?)\[(\S+?)\.\.(\S+?)\]/.exec(res);
        if (ab !== null) nr = nr.replace(ab[0], ' B/AB=' + f3({ med: Number(ab[1]) * f, q1: Number(ab[2]) * f, q3: Number(ab[3]) * f }));
        t = edit1(t, res, nr);
    }
    return t;
}
/** B/AB only (B/A untouched) x f on one lane. */
function scaleAB(text, f, id) {
    const res = lineOf(text, 'RESULT lane=' + id + ' ');
    const ab = / B\/AB=(\S+?)\[(\S+?)\.\.(\S+?)\]/.exec(res);
    return edit1(text, res, res.replace(ab[0], ' B/AB=' + f3({ med: Number(ab[1]) * f, q1: Number(ab[2]) * f, q3: Number(ab[3]) * f })));
}
/** one RAW column (AA / SLOW) x f on one lane, no printed VOID. */
function scaleRaw(text, id, col, f) {
    const raw = lineOf(text, 'RAW lane=' + id + ' ');
    const m = new RegExp(' ' + col + '=(\\S+)').exec(raw);
    return edit1(text, raw, raw.replace(m[0], ' ' + col + '=' + m[1].split(',').map((x) => (Number(x) * f).toFixed(4)).join(',')));
}
const G_LOGS = RESEARCH.map((p) => toG(p, G_SHA.slice(0, 8)));
const M_LOGS = G_LOGS.map((g) => scaleB(edit1(g, ' sha256 ' + G_SHA.slice(0, 8) + '\n', ' sha256 ' + M_SHA.slice(0, 8) + '\n'), MUT));

/** hold n (1..5) -> { n, logs: {1..5}, sha, node, exits, rejudge, pids, cold } (mutable); outer.log is built LAST (mk).
 *  pids / cold = the outer.log PIDS / COLD line (C-67), null = line dropped. */
function baseHold(n, src = n) {
    const order = ORDER(n), logs = {};
    order.forEach((role, j) => { logs[j + 1] = role === 'P' ? RESEARCH[src - 1] : role === 'G' ? G_LOGS[src - 1] : M_LOGS[src - 1]; });
    return { n, order, logs, sha: { P: PIN.P, G: G_SHA, M: M_SHA, lane: PIN.lane, ohlc: PIN.ohlc, baseline: PIN.baseline, harness: H_SHA },
        node: 'v26.8.2', exits: [0, 0, 0, 0, 0], match: ['yes', 'yes', 'yes', 'yes', 'yes'],
        pids: 'PIDS outer=4242 parent=4241', cold: 'COLD polls=1 cap=60 interval-ms=500 outer=0.0 parent=0.0 settled=yes' };
}
function mk(h) {
    const L = ['OUTER u9-reproof hold=' + h.n + ' order=' + h.order.join(','), 'NODE ' + h.node + ' v8 14.6.202.34-node.28'];
    if (h.pids !== null) L.push(h.pids);
    for (const k of ['P', 'G', 'M', 'lane', 'ohlc', 'baseline', 'harness']) L.push('SHA ' + k + ' ' + h.sha[k]);
    if (h.cold !== null) L.push(h.cold);
    for (let i = 1; i <= 5; i++) {
        L.push('CHILD ' + i + ' ' + h.order[i - 1] + ' exit ' + h.exits[i - 1] + ' ms 1 stderr-bytes 0 log-sha256 ' + sha256(h.logs[i]));
        L.push('REJUDGE ' + i + ' ' + h.order[i - 1] + ' exit 0 verdict PASS match ' + h.match[i - 1]);
    }
    const outer = L.join('\n') + '\n';
    return { outer: h.outerEdit ? h.outerEdit(outer) : outer, logs: h.logs };
}
const slot = (h, role, k) => h.order.map((r, j) => (r === role ? j + 1 : 0)).filter((j) => j > 0)[k];
/** the control plus ONE edit: fn(holds) mutates the base holds before outer.log is built. */
function run(fn, opts = OPTS) {
    const hs = [1, 2, 3, 4, 5].map((n) => baseHold(n));
    const r = fn ? fn(hs) : undefined;
    return judgeHolds((r || hs).map(mk), opts);
}

test('control (unedited): P = G from research hold-1..5 reads PASS, every r = 1.000, mutant fires', () => {
    const j = run(null);
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    assert.equal(j.exit, 0);
    assert.equal(j.valid, 5);
    for (const s of j.holds) {
        assert.equal(s.status, 'VALID');
        for (const id of LANES) { assert.equal(s.r[id], 1); assert.equal(s.t[id], 1); }
        for (const id of ['bounds:1e5:1e3', 'bounds:1e5:1e5']) assert.equal(s.rAB[id], 1);
    }
    for (const id of LANES) {
        assert.equal(j.med.r[id], 1);
        assert.ok(j.med.rM[id] > 1.035 && j.med.rM[id] < 1.045, id + ' rM ' + j.med.rM[id]);
    }
});
test('every research hold log parses with 0 errors and 0 VOID / FINDING (P format)', () => {
    for (const t of RESEARCH) {
        const o = parseLog(t, 'P');
        assert.deepEqual(o.errors, []);
        const a = assessLog(o);
        assert.deepEqual([a.voids, a.finding, a.kill, a.busy], [[], [], [], []]);
    }
});

// ---- must-fail rows: [name, edit, verdict, reason RegExp] -- each red on its own edit alone
const ROWS = [
    // G's B reads 4 % slower: its mutant M (built from G's own bytes) moves with it, so the edit scales G1, G2 and M
    ['B/A x1.04 on every G run (and on M, which is G + 1 line)', (hs) => { for (const h of hs) for (const [role, k] of [['G', 0], ['G', 1], ['M', 0]]) { const i = slot(h, role, k); h.logs[i] = scaleB(h.logs[i], MUT); } }, 'KILL', /median r\(B\/A\)=1\.04/],
    ['word flip (G, hold 1, bounds:1e5:1e3 SLOWER -> WITHIN)', (hs) => { const h = hs[0], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], '(gated) A=44.09[43.66..44.23] B=1981.70[1971.31..1986.38] ns/op B/A=45.009[44.810..45.247] word=SLOWER', '(gated) A=44.09[43.66..44.23] B=1981.70[1971.31..1986.38] ns/op B/A=45.009[44.810..45.247] word=WITHIN'); }, 'KILL', /G FINDING bounds:1e5:1e3 printed word WITHIN/],
    ['consistent G FINDING (G, hold 2: null:1e5:1e3 B x1.10, word=SLOWER, VERDICT FINDING)', (hs) => { const h = hs[1], i = slot(h, 'G', 0); let t = scaleB(h.logs[i], 1.10, ['null:1e5:1e3']); const res = lineOf(t, 'RESULT lane=null:1e5:1e3 '); t = edit1(t, res, res.replace(' word=WITHIN ', ' word=SLOWER ')); t = edit1(t, lineOf(t, 'VERDICT '), 'VERDICT FINDING wrong-gated=[null:1e5:1e3 SLOWER]'); h.logs[i] = t; }, 'KILL', /G FINDING null:1e5:1e3 word SLOWER \(gated WITHIN\)/],
    ['B/AB x1.04 on every G and M run (B/A unchanged)', (hs) => { for (const h of hs) for (const [role, k] of [['G', 0], ['G', 1], ['M', 0]]) { const i = slot(h, role, k); const res = lineOf(h.logs[i], 'RESULT lane=bounds:1e5:1e5 '); const ab = / B\/AB=(\S+?)\[(\S+?)\.\.(\S+?)\]/.exec(res); h.logs[i] = edit1(h.logs[i], res, res.replace(ab[0], ' B/AB=' + f3({ med: Number(ab[1]) * MUT, q1: Number(ab[2]) * MUT, q3: Number(ab[3]) * MUT }))); } }, 'KILL', /median r\(B\/AB\)=1\.04/],
    ['VERDICT line dropped (G, hold 5)', (hs) => { const h = hs[4], i = slot(h, 'G', 1); h.logs[i] = edit1(h.logs[i], '\n' + lineOf(h.logs[i], 'VERDICT ') + '\n', '\n'); }, 'STOP', /VERDICT lines: 0/],
    ['4 valid holds (hold 5 not run)', (hs) => hs.slice(0, 4), 'PENDING', /4\/5 valid holds/],
    ['NOT-TF tool line (G, hold 1)', (hs) => { const h = hs[0], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], '\nPROV end ', '\nVOID NOT-TF lane=null:1e5:1e3: NOT-TF tool timedRounds (TF at window start true, end false)\nPROV end '); }, 'KILL', /NOT-TF tool/],
    ['tool-bytes=16 (G, hold 1)', (hs) => { const h = hs[0], i = slot(h, 'G', 1); h.logs[i] = edit1(h.logs[i], 'WINDOW lane=null:1e5:1e3 tool-bytes=0 ', 'WINDOW lane=null:1e5:1e3 tool-bytes=16 '); }, 'KILL', /tool-bytes=16/],
    // C-43: tool-bytes > 0 on ANY gated lane = KILL (1 byte, each lane)
    ...LANES.map((id) => ['tool-bytes=1 on ' + id + ' (G, hold 3) [C-43]', (hs) => { const h = hs[2], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], 'WINDOW lane=' + id + ' tool-bytes=0 ', 'WINDOW lane=' + id + ' tool-bytes=1 '); }, 'KILL', new RegExp(id.replace(/\./g, '\\.') + ' tool-bytes=1')]),
    // C-45 (a): a G KILL fact inside an INVALID hold (P VOID in the same hold) still KILLs
    ['G tool-bytes=16 in a hold made INVALID by a P VOID (hold 1) [C-45]', (hs) => { const h = hs[0], g = slot(h, 'G', 0), pp = slot(h, 'P', 0); h.logs[pp] = edit1(h.logs[pp], ' spin=112\n', ' spin=112 VOID=[AA-DRIFT 1.060[1.050..1.070]]\n'); h.logs[g] = edit1(h.logs[g], 'WINDOW lane=null:1e5:1e3 tool-bytes=0 ', 'WINDOW lane=null:1e5:1e3 tool-bytes=16 '); }, 'KILL', /KILL hold 1: .*tool-bytes=16/],
    // C-45 (c): a P FINDING (printed VERDICT FINDING, numbers untouched) makes the hold INVALID
    ['P FINDING (P, hold 4: VERDICT FINDING) -> INVALID [C-45]', (hs) => { const h = hs[3], i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], lineOf(h.logs[i], 'VERDICT '), 'VERDICT FINDING wrong-gated=[null:1e5:1e3 SLOWER]'); }, 'PENDING', /-P FINDING VERDICT FINDING/],
    ['P VOID (hold 1) -> INVALID hold', (hs) => { const h = hs[0], i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], ' spin=112\n', ' spin=112 VOID=[AA-DRIFT 1.060[1.050..1.070]]\n'); }, 'PENDING', /4\/5 valid/],
    ['M == G (sha, hold 2)', (hs) => { hs[1].sha.M = G_SHA; }, 'STOP', /M == G/],
    ['M fails to fire (M = G with M\'s sha8, unscaled, every hold)', (hs) => { for (const h of hs) { const i = slot(h, 'M', 0); h.logs[i] = edit1(G_LOGS[h.n - 1], ' sha256 ' + G_SHA.slice(0, 8) + '\n', ' sha256 ' + M_SHA.slice(0, 8) + '\n'); } }, 'STOP', /mutant did not fire/],
    ['1-byte lane sha flip (P, hold 3)', (hs) => { const h = hs[2], i = slot(h, 'P', 1); h.logs[i] = edit1(h.logs[i], 'lane-sha256=' + PIN.lane, 'lane-sha256=' + PIN.lane.slice(0, 63) + 'd'); }, 'STOP', /lane-sha256 2377d193 != pinned|lane-sha256/],
    ['truncated log (G, hold 4: last 3 lines dropped)', (hs) => { const h = hs[3], i = slot(h, 'G', 0); h.logs[i] = h.logs[i].split('\n').slice(0, -4).join('\n') + '\n'; }, 'STOP', /VERDICT lines: 0|PROV lines/],
    ['busy-node non-empty in a PROV line (G, hold 2)', (hs) => { const h = hs[1], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], 'busy-node [] quiet-lock quiet\nCONTROL', 'busy-node [55.0 123 node] quiet-lock quiet\nCONTROL'); }, 'PENDING', /4\/5 valid/],
    ['twin t outside [0.95, 1.05] (P2 x1.06, hold 2) [C-44]', (hs) => { const h = hs[1], i = slot(h, 'P', 1); h.logs[i] = scaleB(h.logs[i], 1.06, ['null:1e5:1e3']); }, 'PENDING', /null:1e5:1e3 twin t=1\.0\d+ outside \[0\.95, 1\.05\]/],
    ['M VOID (hold 5)', (hs) => { const h = hs[4], i = slot(h, 'M', 0); h.logs[i] = edit1(h.logs[i], ' spin=112\n', ' spin=112 VOID=[ALLOC B 0.031 B/op]\n'); }, 'PENDING', /4\/5 valid/],
    ['GC-WINDOW major 1 (G, hold 3)', (hs) => { const h = hs[2], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], ' spin=128\nRAW lane=null', ' spin=128 VOID=[GC-WINDOW major 1]\nRAW lane=null'); }, 'KILL', /GC-WINDOW major 1/],
    ['2 G VOIDs with a clean P (> 1)', (hs) => { for (const h of hs.slice(0, 2)) { const i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], ' spin=112\n', ' spin=112 VOID=[ALLOC B 0.031 B/op]\n'); } }, 'KILL', /2 G VOIDs/],
    ['per-hold r = 1.06 (G1 + G2 x1.06, hold 1 only)', (hs) => { const h = hs[0]; for (const k of [0, 1]) { const i = slot(h, 'G', k); h.logs[i] = scaleB(h.logs[i], 1.06, ['bounds:1e5:1e3']); } }, 'KILL', /hold 1: bounds:1e5:1e3 r\(B\/A\)=1\.06/],
    ['child exit 1 (hold 2)', (hs) => { hs[1].exits[2] = 1; }, 'STOP', /exit 1/],
    ['Node v25 (outer, hold 1)', (hs) => { hs[0].node = 'v25.9.0'; }, 'STOP', /C-31/],
    ['harness changed (hold 3 run on another reproof.mjs)', (hs) => { hs[2].sha.harness = sha256('old harness'); }, 'PENDING', /4\/5 valid/],
    ['RESULT B/A disagrees with its RAW rounds (G, hold 1)', (hs) => { const h = hs[0], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], 'B/A=45.009[44.810..45.247]', 'B/A=45.019[44.810..45.247]'); }, 'STOP', /disagrees with its RAW/],
    ['--verdict-file re-judge disagrees (hold 4)', (hs) => { hs[3].match[1] = 'no'; }, 'STOP', /re-judge disagrees/],
    ['G sha differs across holds (no expected G given)', (hs) => { hs[4].sha.G = sha256('other G'); for (let i = 1; i <= 5; i++) if (hs[4].order[i - 1] === 'G') hs[4].logs[i] = edit1(hs[4].logs[i], ' sha256 ' + G_SHA.slice(0, 8) + '\n', ' sha256 ' + hs[4].sha.G.slice(0, 8) + '\n'); }, 'STOP', /G sha differs across holds/, { harnessSha: H_SHA }],
    ['inject= not null (G, hold 1)', (hs) => { const h = hs[0], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], ' inject=null\n', ' inject=boxed\n'); }, 'STOP', /inject=boxed/],
    // review r1 blockers 1-3 (fail-open probes)
    ['B/AB=n/a in every run of hold 2 (reps equal, no RAW AB) on bounds:1e5:1e3; holds 1,3,4,5 G+M B/AB x1.04', (hs) => { const na = (t) => { const res = lineOf(t, 'RESULT lane=bounds:1e5:1e3 '), raw = lineOf(t, 'RAW lane=bounds:1e5:1e3 '); return edit1(edit1(t, res, res.replace(/ B\/AB=\S+/, ' B/AB=n/a').replace(/ wordAB=\S+/, ' wordAB=n/a').replace(/ reps=A:(\d+),B:\d+,AB:\d+/, ' reps=A:$1,B:$1')), raw, raw.replace(/ AB=\S+/, '')); }; for (const h of hs) for (let i = 1; i <= 5; i++) if (h.n === 2) h.logs[i] = na(h.logs[i]); else if (h.order[i - 1] !== 'P') h.logs[i] = scaleAB(h.logs[i], MUT, 'bounds:1e5:1e3'); }, 'STOP', /B\/AB present in some holds only/],
    ['Node differs across holds (hold 5 on v26.9.0)', (hs) => { hs[4].node = 'v26.9.0'; }, 'STOP', /Node differs across holds/],
    ['a KILL hold (tool-bytes=16) with its SHA harness line deleted, beside 5 valid holds', (hs) => { const h = baseHold(6, 1), i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], 'WINDOW lane=null:1e5:1e3 tool-bytes=0 ', 'WINDOW lane=null:1e5:1e3 tool-bytes=16 '); h.outerEdit = (o) => edit1(o, 'SHA harness ' + H_SHA + '\n', ''); return [...hs, h]; }, 'STOP', /SHA harness missing/],
    ['an empty outer.log hold beside 5 valid holds', (hs) => { const h = baseHold(6, 1); h.outerEdit = () => ''; return [...hs, h]; }, 'STOP', /no OUTER line/],
    ['9 attempts with 5 valid holds (4 INVALID extra attempts) -> NO VERDICT', (hs) => [...hs, ...[6, 7, 8, 9].map((n) => { const h = baseHold(n, ((n - 1) % 5) + 1), i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], ' spin=112\n', ' spin=112 VOID=[AA-DRIFT 1.060[1.050..1.070]]\n'); return h; })], 'NO VERDICT', /5\/5 valid holds after 9 attempt/],
    ['duplicate CHILD line in outer.log (hold 2)', (hs) => { hs[1].outerEdit = (o) => o.replace(/^(CHILD 3 .*)$/m, '$1\n$1'); }, 'STOP', /CHILD 3 twice/],
    // review r1 blocker 5: one row per guard
    ['WINDOW lines dropped (G, hold 1)', (hs) => { const h = hs[0], i = slot(h, 'G', 0); h.logs[i] = h.logs[i].split('\n').filter((l) => !l.startsWith('WINDOW ')).join('\n'); }, 'STOP', /WINDOW lanes/],
    ['HEADER spec tool sha8 flipped (P, hold 2)', (hs) => { const h = hs[1], i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], ' sha256 74f1a3d4\n', ' sha256 74f1a3d5\n'); }, 'STOP', /tool sha256 74f1a3d5 != P 74f1a3d4/],
    ['HEADER frozen Ohlc.js sha8 flipped (G, hold 3)', (hs) => { const h = hs[2], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], ' sha256 a600028c ok;', ' sha256 a600028d ok;'); }, 'STOP', /frozen Ohlc\.js not a600028c ok/],
    ['HEADER rung node v25 (M, hold 4)', (hs) => { const h = hs[3], i = slot(h, 'M', 0); h.logs[i] = edit1(h.logs[i], 'HEADER rung=ALL TIMED node v26.8.2 ', 'HEADER rung=ALL TIMED node v25.8.2 '); }, 'STOP', /node v25\.8\.2 < 26/],
    ['quiet-lock none in a PROV line (G, hold 1)', (hs) => { const h = hs[0], i = slot(h, 'G', 1); h.logs[i] = edit1(h.logs[i], 'busy-node [] quiet-lock quiet\nCONTROL', 'busy-node [] quiet-lock none\nCONTROL'); }, 'PENDING', /quiet-lock none/],
    ['expected G sha differs (opts.gSha)', null, 'STOP', /SHA G d4991c39 != expected/, { gSha: sha256('another G'), harnessSha: H_SHA }],
    ['B/AB=n/a in one G run (hold 2, bounds:1e5:1e3)', (hs) => { const h = hs[1], i = slot(h, 'G', 0); const res = lineOf(h.logs[i], 'RESULT lane=bounds:1e5:1e3 '); h.logs[i] = edit1(h.logs[i], res, res.replace(/ B\/AB=\S+/, ' B/AB=n/a')); }, 'STOP', /B\/AB printed by some runs only/],
    ['outer SHA P last char flipped (hold 5)', (hs) => { hs[4].sha.P = PIN.P.slice(0, 63) + 'd'; }, 'STOP', /SHA P 74f1a3d4 != pinned/],
    ['outer order line swapped (hold 1 claims G,P,M,P,G)', (hs) => { hs[0].outerEdit = (o) => edit1(o, 'order=P,G,M,G,P\n', 'order=G,P,M,P,G\n'); }, 'STOP', /order G,P,M,P,G \(hold 1 wants P,G,M,G,P\)/],
    ['two holds numbered 1', (hs) => { hs[1] = baseHold(1, 2); return hs; }, 'STOP', /hold number repeated/],
    ['6 valid holds', (hs) => [...hs, baseHold(6, 1)], 'STOP', /6 valid holds/],
    ['K=9 in HEADER rung (P, hold 1)', (hs) => { const h = hs[0], i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], ' K=11 C=3 ops=', ' K=9 C=3 ops='); }, 'STOP', /K=9 C=3 \(want K=11 C=3\)/],
    ['a word changed in HEADER GATED (G, hold 2)', (hs) => { const h = hs[1], i = slot(h, 'G', 1); h.logs[i] = edit1(h.logs[i], ' null:1e5:1e3=WITHIN;', ' null:1e5:1e3=SLOWER;'); }, 'STOP', /HEADER GATED .* \(pinned/],
    ['bop B:0.02 in one P (hold 1, bounds:1e5:1e3)', (hs) => { const h = hs[0], i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], ',B:0.0000 win=512 reps=A:256,B:8,', ',B:0.0200 win=512 reps=A:256,B:8,'); }, 'PENDING', /ALLOC B 0\.02/],
    ['P RAW AA x1.08, no printed VOID (hold 3, null:1e5:1e3)', (hs) => { const h = hs[2], i = slot(h, 'P', 0); h.logs[i] = scaleRaw(h.logs[i], 'null:1e5:1e3', 'AA', 1.08); }, 'PENDING', /AA-DRIFT \(re-derived/],
    // x0.6, not x0.9: the research SLOW medians are ~2.0, so x0.9 (1.8) stays above the 1.25 floor and could not go red
    ['P RAW SLOW x0.6, no printed VOID (hold 3, null:1e5:1e3)', (hs) => { const h = hs[2], i = slot(h, 'P', 1); h.logs[i] = scaleRaw(h.logs[i], 'null:1e5:1e3', 'SLOW', 0.6); }, 'PENDING', /SLOW-DEAD \(re-derived/],
    ['tool-bytes=NaN (G, hold 4)', (hs) => { const h = hs[3], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], 'WINDOW lane=bounds:1e5:1e5 tool-bytes=0 ', 'WINDOW lane=bounds:1e5:1e5 tool-bytes=NaN '); }, 'KILL', /tool-bytes=NaN/],
    // U9A2 (C-67, plan-U9A2-v1 C6): the outer's cold settle (PIDS / COLD) and the G / M SETTLE lines; each red on c20ee2d5
    ['COLD parent=11.0 settled=no after the 60-poll cap (hold 2) -> INVALID [C-67]', (hs) => { hs[1].cold = 'COLD polls=60 cap=60 interval-ms=500 outer=0.0 parent=11.0 settled=no'; }, 'PENDING', /^COLD outer=0\.0 parent=11\.0 not < 10 after 60 polls \(cap 60, C-67\)$/m],
    ['COLD parent=10.0 settled=no (boundary: 10 is not < 10, hold 3) -> INVALID [C-67]', (hs) => { hs[2].cold = 'COLD polls=60 cap=60 interval-ms=500 outer=0.0 parent=10.0 settled=no'; }, 'PENDING', /^COLD outer=0\.0 parent=10\.0 not < 10 after 60 polls/m],
    ['COLD settled=yes with parent=10.0 (hold 1) -> STOP [C-67]', (hs) => { hs[0].cold = 'COLD polls=1 cap=60 interval-ms=500 outer=0.0 parent=10.0 settled=yes'; }, 'STOP', /outer\.log: COLD settled=yes disagrees with outer=0\.0 parent=10\.0/],
    ['PIDS line missing (hold 3) -> STOP [C-67]', (hs) => { hs[2].pids = null; }, 'STOP', /outer\.log: no PIDS line/],
    ['COLD line missing (hold 4) -> STOP [C-67]', (hs) => { hs[3].cold = null; }, 'STOP', /outer\.log: no COLD line/],
    ['COLD line after CHILD 1 (hold 5) -> STOP [C-67]', (hs) => { const h = hs[4], c = h.cold; h.cold = null; h.outerEdit = (o) => o.replace(/^(CHILD 1 .*)$/m, (s) => s + '\n' + c); }, 'STOP', /outer\.log: COLD after CHILD 1/],
    ['COLD polls=61 (hold 2) -> STOP [C-67]', (hs) => { hs[1].cold = 'COLD polls=61 cap=60 interval-ms=500 outer=0.0 parent=0.0 settled=yes'; }, 'STOP', /outer\.log: COLD polls outside 1\.\.60/],
    ['m8: SETTLE line duplicated (G, hold 1, null:1e5:1e3) -> STOP [C-67]', (hs) => { const h = hs[0], i = slot(h, 'G', 0), s = 'SETTLE lane=null:1e5:1e3 passes=1 pass-bytes=0 settled=yes\n'; h.logs[i] = edit1(h.logs[i], s, s + s); }, 'STOP', /-G: SETTLE lane=null:1e5:1e3 twice/],
    ['m7: lone SETTLE settled=no pass-bytes=8,8,8, no VOID TIER-SETTLE (G, hold 2) -> STOP [C-67]', (hs) => { const h = hs[1], i = slot(h, 'G', 1); h.logs[i] = edit1(h.logs[i], 'SETTLE lane=bounds:1e5:1e5 passes=1 pass-bytes=0 settled=yes\n', 'SETTLE lane=bounds:1e5:1e5 passes=3 pass-bytes=8,8,8 settled=no\n'); }, 'STOP', /-G: SETTLE lane=bounds:1e5:1e5 settled=no without VOID TIER-SETTLE/],
    ['SETTLE settled=yes with pass-bytes=16 (M, hold 5) -> STOP [C-67]', (hs) => { const h = hs[4], i = slot(h, 'M', 0); h.logs[i] = edit1(h.logs[i], 'SETTLE lane=bounds:1e5:1e3 passes=1 pass-bytes=0 settled=yes\n', 'SETTLE lane=bounds:1e5:1e3 passes=1 pass-bytes=16 settled=yes\n'); }, 'STOP', /3-M: SETTLE lane=bounds:1e5:1e3 settled=yes disagrees with pass-bytes 16/],
    ['SETTLE line dropped on one lane (G, hold 3, bounds:1e5:1e5) -> STOP [C-67]', (hs) => { const h = hs[2], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], 'SETTLE lane=bounds:1e5:1e5 passes=1 pass-bytes=0 settled=yes\n', ''); }, 'STOP', /-G: SETTLE lanes bounds:1e5:1e3,null:1e5:1e3 \(want bounds:1e5:1e3,bounds:1e5:1e5,null:1e5:1e3\)/],
    ['SETTLE line in a P log (P, hold 4) -> STOP [C-67]', (hs) => { const h = hs[3], i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], '\nRESULT lane=null:1e5:1e3 ', '\nSETTLE lane=null:1e5:1e3 passes=1 pass-bytes=0 settled=yes\nRESULT lane=null:1e5:1e3 '); }, 'STOP', /-P: SETTLE line in a P log/],
    ['tool-bytes=0x, not a number (G, hold 1) -> STOP (KILL before C-67)', (hs) => { const h = hs[0], i = slot(h, 'G', 1); h.logs[i] = edit1(h.logs[i], 'WINDOW lane=bounds:1e5:1e3 tool-bytes=0 ', 'WINDOW lane=bounds:1e5:1e3 tool-bytes=0x '); }, 'STOP', /-G: WINDOW lane=bounds:1e5:1e3 tool-bytes not a number/],
    ['COLD outer=NaN parent=NaN settled=no (ps failed, hold 4) -> INVALID [C-67]', (hs) => { hs[3].cold = 'COLD polls=60 cap=60 interval-ms=500 outer=NaN parent=NaN settled=no'; }, 'PENDING', /^COLD outer=NaN parent=NaN not < 10 after 60 polls/m],
    ['COLD settled=no before the cap (polls=59, hold 2) -> STOP [C-67]', (hs) => { hs[1].cold = 'COLD polls=59 cap=60 interval-ms=500 outer=0.0 parent=11.0 settled=no'; }, 'STOP', /outer\.log: COLD settled=no before the cap/],
    ['COLD outer=-1 settled=yes (hold 3) -> STOP [C-67]', (hs) => { hs[2].cold = 'COLD polls=1 cap=60 interval-ms=500 outer=-1 parent=0.0 settled=yes'; }, 'STOP', /outer\.log: COLD line malformed/],
];
for (const [name, fn, want, re, opts] of ROWS) {
    test('must-fail: ' + name + ' -> ' + want, () => {
        const j = run(fn, opts || OPTS);
        assert.equal(j.verdict, want, j.reasons.join('\n') + '\n' + j.holds.map((s) => s.n + ' ' + s.status + ' ' + [...s.stop, ...s.invalid, ...s.kill].join(' | ')).join('\n'));
        const all = [...j.reasons, ...j.holds.flatMap((s) => [...s.stop, ...s.invalid, ...s.kill])].join('\n');
        assert.match(all, re);
    });
}
test('must-fail: log bytes edited after the hold (outer.log log-sha256 stale) -> STOP', () => {
    const hs = [1, 2, 3, 4, 5].map((n) => baseHold(n)).map(mk);
    hs[0].logs[1] = hs[0].logs[1].replace('word=WITHIN', 'word=SLOWER');
    const j = judgeHolds(hs, OPTS);
    assert.equal(j.verdict, 'STOP');
    assert.match(j.holds[0].stop.join('\n'), /bytes differ from outer\.log/);
});
test('8 attempts without 5 valid holds -> NO VERDICT; 7 attempts -> PENDING', () => {
    const inval = (n) => { const h = baseHold(n, ((n - 1) % 5) + 1); const i = slot(h, 'P', 0); h.logs[i] = edit1(h.logs[i], ' spin=112\n', ' spin=112 VOID=[AA-DRIFT 1.060[1.050..1.070]]\n'); return mk(h); };
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map(inval);
    assert.equal(judgeHolds(eight, OPTS).verdict, 'NO VERDICT');
    assert.equal(judgeHolds(eight.slice(0, 7), OPTS).verdict, 'PENDING');
});
// review r1 blocker 4: asymmetric fixtures, expected values by plain arithmetic (never from reproof.mjs)
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-3, msg + ': ' + a + ' vs ' + b);
test('asymmetric: G1 only x1.08 on bounds:1e5:1e5 (hold 1) -> r = (1.08 + 1) / 2 = 1.04, r\' = 1.04 / 1.04 = 1.000, PASS', () => {
    const j = run((hs) => { const h = hs[0], i = slot(h, 'G', 0); h.logs[i] = scaleB(h.logs[i], 1.08, ['bounds:1e5:1e5']); });
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    near(j.holds[0].r['bounds:1e5:1e5'], 1.04, 'r');
    near(j.holds[0].rM['bounds:1e5:1e5'], 1.0, 'rM');
});
test('asymmetric: P1 only x1.04 on bounds:1e5:1e5 (hold 2) -> t = 1 / 1.04 = 0.9615, r = 2 / 2.04 = 0.9804', () => {
    const j = run((hs) => { const h = hs[1], i = slot(h, 'P', 0); h.logs[i] = scaleB(h.logs[i], 1.04, ['bounds:1e5:1e5']); });
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    near(j.holds[1].t['bounds:1e5:1e5'], 1 / 1.04, 't');
    near(j.holds[1].r['bounds:1e5:1e5'], 2 / 2.04, 'r');
});
test('asymmetric: P1 only B/AB x1.04 on bounds:1e5:1e5 (hold 2) -> rAB = 2 / 2.04 = 0.9804, r = 1', () => {
    const j = run((hs) => { const h = hs[1], i = slot(h, 'P', 0); h.logs[i] = scaleAB(h.logs[i], 1.04, 'bounds:1e5:1e5'); });
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    near(j.holds[1].rAB['bounds:1e5:1e5'], 2 / 2.04, 'rAB');
    assert.equal(j.holds[1].r['bounds:1e5:1e5'], 1);
});
test('asymmetric: G1 VOID with its P1 clean, P2 VOID, G2 clean (hold 1) -> gVoid exactly 1 (pairs G1-P1, G2-P2)', () => {
    const j = run((hs) => { const h = hs[0], g = slot(h, 'G', 0), pp = slot(h, 'P', 1); h.logs[g] = edit1(h.logs[g], ' spin=112\n', ' spin=112 VOID=[ALLOC B 0.031 B/op]\n'); h.logs[pp] = edit1(h.logs[pp], ' spin=112\n', ' spin=112 VOID=[AA-DRIFT 1.060[1.050..1.070]]\n'); });
    assert.equal(j.gVoid, 1);
    assert.equal(j.holds[0].gVoidCleanP, 1);
});
// C-44 twin boundary (law 8): P2 of hold 2 scaled on bounds:1e5:1e5 (B/A ~5632, so 3 dp cannot move t across the edge)
for (const [f, want] of [[0.9499, 'PENDING'], [0.9501, 'PASS'], [1.0499, 'PASS'], [1.0501, 'PENDING']]) {
    test('boundary: twin t = ' + f + ' on bounds:1e5:1e5 (hold 2) -> ' + want + ' [C-44]', () => {
        const j = run((hs) => { const h = hs[1], i = slot(h, 'P', 1); h.logs[i] = scaleB(h.logs[i], f, ['bounds:1e5:1e5']); });
        assert.equal(j.verdict, want, j.reasons.join('\n'));
        assert.equal(j.holds[1].status, want === 'PASS' ? 'VALID' : 'INVALID');
        assert.ok(Math.abs(j.holds[1].t['bounds:1e5:1e5'] - f) < 1e-6, String(j.holds[1].t['bounds:1e5:1e5']));
    });
}
// C-45 (b): the mutant is judged on its 5-hold median r', never per hold
test('M unscaled in ONE hold only (its r\' = 1.000) -> PASS: the 5-hold median r\' still fires [C-45]', () => {
    const j = run((hs) => { const h = hs[2], i = slot(h, 'M', 0); h.logs[i] = edit1(G_LOGS[2], ' sha256 ' + G_SHA.slice(0, 8) + '\n', ' sha256 ' + M_SHA.slice(0, 8) + '\n'); });
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    for (const id of LANES) { assert.equal(j.holds[2].rM[id], 1); assert.ok(j.med.rM[id] > BAND.fire); }
});
test('1 G VOID with a clean P is allowed (boundary of > 1) -> PASS', () => {
    const j = run((hs) => { const h = hs[0], i = slot(h, 'G', 0); h.logs[i] = edit1(h.logs[i], ' spin=112\n', ' spin=112 VOID=[ALLOC B 0.031 B/op]\n'); });
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    assert.equal(j.gVoid, 1);
});
// U9A2 controls (C-67): green on c20ee2d5 and on the new harness
test('control: COLD polls=60 outer=0.0 parent=9.9 settled=yes in every hold (cap and 10 % boundaries) -> PASS [C-67]', () => {
    const j = run((hs) => { for (const h of hs) h.cold = 'COLD polls=60 cap=60 interval-ms=500 outer=0.0 parent=9.9 settled=yes'; });
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    assert.equal(j.valid, 5);
    for (const s of j.holds) assert.deepEqual([s.status, s.invalid], ['VALID', []]);
});
test('control: consistent SETTLE settled=no + VOID TIER-SETTLE + RESULT VOID (G, hold 1, bounds:1e5:1e5) -> a G VOID, PASS, gVoid 1 [C-67]', () => {
    const j = run((hs) => {
        const h = hs[0], i = slot(h, 'G', 0), why = 'TIER-SETTLE pass-bytes 8,8,8 (cap 3, none read exactly 0)';
        let t = edit1(h.logs[i], 'SETTLE lane=bounds:1e5:1e5 passes=1 pass-bytes=0 settled=yes\n', 'SETTLE lane=bounds:1e5:1e5 passes=3 pass-bytes=8,8,8 settled=no\n');
        t = edit1(t, ' spin=112\n', ' spin=112 VOID=[' + why + ']\nVOID TIER-SETTLE lane=bounds:1e5:1e5: ' + why + '\n');
        h.logs[i] = t;
    });
    assert.equal(j.verdict, 'PASS', j.reasons.join('\n'));
    assert.equal(j.gVoid, 1);
    assert.equal(j.holds[0].gVoidCleanP, 1);
    assert.deepEqual(j.holds[0].stop, []);
});

// ---- boundary rows (law 8): the decision on the control's parsed summaries with r set to the edge
const CONTROL = run(null).holds;
const withR = (fn) => decide(CONTROL.map((s) => { const c = structuredClone(s); fn(c); return c; }), OPTS);
for (const [v, want] of [[1.0199, 'PASS'], [1.0201, 'KILL'], [0.9801, 'PASS'], [0.9799, 'KILL'], [BAND.medHi, 'PASS'], [BAND.medLo, 'PASS']]) {
    test('boundary: median r = ' + v + ' on null:1e5:1e3 -> ' + want, () => {
        assert.equal(withR((c) => { c.r['null:1e5:1e3'] = v; }).verdict, want);
    });
}
for (const [v, want] of [[1.0499, 'PASS'], [1.0501, 'KILL'], [0.9501, 'PASS'], [0.9499, 'KILL']]) {
    test('boundary: one hold r = ' + v + ' (median 1.000) on bounds:1e5:1e5 -> ' + want, () => {
        assert.equal(withR((c) => { if (c.n === 3) c.r['bounds:1e5:1e5'] = v; }).verdict, want);
    });
}
for (const [v, want] of [[1.0499, 'PASS'], [1.0501, 'KILL']]) {
    test('boundary: one hold r(B/AB) = ' + v + ' on bounds:1e5:1e3 -> ' + want, () => {
        assert.equal(withR((c) => { if (c.n === 2) c.rAB['bounds:1e5:1e3'] = v; }).verdict, want);
    });
}
for (const [v, want] of [[1.0201, 'PASS'], [1.02, 'STOP']]) {
    test('boundary: mutant median r\' = ' + v + ' on bounds:1e5:1e3 -> ' + want, () => {
        assert.equal(withR((c) => { c.rM['bounds:1e5:1e3'] = v; }).verdict, want);
    });
}
test('boundary: NaN r fails closed (KILL, never PASS)', () => {
    assert.equal(withR((c) => { c.r['null:1e5:1e3'] = NaN; }).verdict, 'KILL');
});

// ---- buildMutant (TASK 3) on timedRounds' verbatim text (311761f), and the anchor in the live ABGate.js
const TR = [
    'function timedRounds(live, N, starts, KR, n, L, tfBad, WARM) {',
    '    for (let x = 0; x < KR; x++) {',
    '        const st = starts[x];',
    '        for (let y = 0; y < N; y++) {',
    '            const e = live[(y + x) % N];',
    '            T[0] = performance.now();',
    '            const got = e.run(e.state, st, n, e.reps);',
    '            T[1] = performance.now();',
    "            if (got !== e.wants[x]) verifyRun(e, got, e.wants[x], L, 'timed');",
    '            e.ns[x] = (T[1] - T[0]) * 1e6 / (n * e.reps);',
    '        }',
    '    }',
    '}',
].join('\n');
test('buildMutant: M differs from G in exactly 1 line (the ns write, x 1.04 on B only, branch-free)', () => {
    const m = buildMutant(TR), gl = TR.split('\n'), ml = m.split('\n');
    assert.equal(ml.length, gl.length);
    assert.deepEqual(gl.map((l, i) => (l === ml[i] ? -1 : i)).filter((i) => i >= 0), [9]);
    assert.equal(ml[9], "            e.ns[x] = (T[1] - T[0]) * 1e6 / (n * e.reps) * (e.col === 'B' ? 1.04 : 1);   // U9 mutant M (bench/reproof.mjs buildMutant)");
    assert.doesNotMatch(ml[9], /\bif\b/);
    assert.notEqual(sha256(m), sha256(TR));
});
test('buildMutant aborts unless the anchor matches exactly once', () => {
    assert.throws(() => buildMutant(TR.replace('e.ns[x] = ', 'e.ns[x]= ')), /matched 0 times/);
    assert.throws(() => buildMutant(TR + '\n' + TR.split('\n')[9]), /matched 2 times/);
    assert.throws(() => buildMutant(TR.replace('T[1] = performance.now();', 'T[1] = Date.now();')), /T\[1\] clock read not unique/);
});
test('C-61: buildMutant accepts exactly one T[1] clock read in either form (performance.now / PERF.now); 2 hits throw (must-fail)', () => {
    const perf = TR.replace('T[0] = performance.now();', 'T[0] = PERF.now();').replace('T[1] = performance.now();', 'T[1] = PERF.now();');
    assert.equal(perf.split('PERF.now()').length, 3);
    assert.equal(perf.split('performance').length, 1);
    for (const g of [TR, perf]) {
        const ml = buildMutant(g).split('\n'), gl = g.split('\n');
        assert.deepEqual(gl.map((l, i) => (l === ml[i] ? -1 : i)).filter((i) => i >= 0), [9]);
    }
    assert.throws(() => buildMutant(TR + '\n            T[1] = PERF.now();'), /T\[1\] clock read not unique/);
    assert.throws(() => buildMutant(perf + '\n            T[1] = PERF.now();'), /T\[1\] clock read not unique/);
});
test('the live ABGate.js still carries exactly one mutant anchor (U9 B2 builds M from the RC)', () => {
    const live = readFileSync(join(ROOT, 'ABGate.js'), 'utf8');
    const ml = buildMutant(live).split('\n'), gl = live.split('\n');
    assert.equal(ml.length, gl.length);
    assert.equal(gl.filter((l, i) => l !== ml[i]).length, 1);
});

// ---- law 4 + the calibration fixtures (real G / P / M output, TASK 5; numbers VOID, used for the parser only)
test('law 4: bench/reproof.mjs never imports ABGate.js', () => {
    const src = readFileSync(join(ROOT, 'bench', 'reproof.mjs'), 'utf8');
    const imports = src.split('\n').filter((l) => /^\s*import\b|\bimport\s*\(/.test(l));
    for (const l of imports) assert.doesNotMatch(l, /ABGate/);
    assert.ok(imports.length >= 5);
});
const NO_SETTLE = 'SETTLE lanes none (want bounds:1e5:1e3,bounds:1e5:1e5,null:1e5:1e3)';
test('calibration fixtures (311761f, pre-U9E): P parses with 0 errors; G / M must-fail on exactly [no SETTLE lines], one WINDOW per lane [C-67]', () => {
    const dir = join(ROOT, 'test', 'fixtures', 'reproof');
    assert.ok(existsSync(dir), 'test/fixtures/reproof/ missing (TASK 5)');
    const fs = readdirSync(dir).filter((f) => /^[1-5]-[PGM]\.log$/.test(f));
    assert.equal(fs.length, 5, 'want 5 child logs, got ' + fs.join(','));
    for (const f of fs) {
        const role = f[2];
        const o = parseLog(readFileSync(join(dir, f), 'utf8'), role);
        assert.deepEqual(o.errors, role === 'P' ? [] : [NO_SETTLE], f);
        if (role !== 'P') {
            assert.deepEqual(Object.keys(o.windows).sort(), LANES.slice().sort(), f);
            for (const id of LANES) assert.ok(Number.isFinite(o.windows[id].bytes), f + ' ' + id);
        }
    }
});
const CAL = join(ROOT, 'test', 'fixtures', 'reproof');
const calRead = (f) => readFileSync(join(CAL, f), 'utf8');
test('calibration fixtures match their SHA256SUMS', () => {
    const rows = calRead('SHA256SUMS').trim().split('\n');
    assert.equal(rows.length, 7);
    for (const r of rows) { const [s, f] = r.split(/\s+/); assert.equal(sha256(readFileSync(join(CAL, f))), s, f); }
});
test('calibration hold (real outer.log + 5 real logs, 311761f G, first mutant): STOP on exactly no PIDS / COLD + no SETTLE; KILL / NOT-TF facts still read [C-67]', () => {
    const hold = { outer: calRead('outer.log'), logs: { 1: calRead('1-G.log'), 2: calRead('2-P.log'), 3: calRead('3-M.log'), 4: calRead('4-P.log'), 5: calRead('5-G.log') } };
    const s = judgeHolds([hold], { gSha: G_SHA }).holds[0];
    assert.deepEqual(s.stop, ['outer.log: no PIDS line', 'outer.log: no COLD line', '1-G: ' + NO_SETTLE, '3-M: ' + NO_SETTLE, '5-G: ' + NO_SETTLE]);
    assert.equal(s.status, 'STOP');
    for (const f of ['1-G.log', '5-G.log']) assert.deepEqual(assessLog(parseLog(calRead(f), 'G')).kill, ['bounds:1e5:1e5 tool-bytes=4320'], f);
    assert.ok(assessLog(parseLog(calRead('3-M.log'), 'M')).voids.some((x) => /NOT-TF tool timedRounds/.test(x)));
    assert.equal(judgeHolds([hold], { gSha: G_SHA, harnessSha: H_SHA }).holds[0].excluded, true);
});
test('mutant recheck log (branch-free M on 311761f, real): errors exactly [no SETTLE lines]; no VOID, no NOT-TF tool [C-67]', () => {
    const o = parseLog(calRead('M-recheck.log'), 'M');
    assert.deepEqual(o.errors, [NO_SETTLE]);
    const a = assessLog(o);
    assert.deepEqual(a.voids, []);
    assert.deepEqual(a.kill, ['bounds:1e5:1e5 tool-bytes=4320']);
});
