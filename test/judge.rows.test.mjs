// G-B B3: the INDEPENDENT ORACLE for the judge (rung J1). 59 synthetic rows written from plan-GB ASSERTION A2 and
// SPEC CURRENT (C-4, C-5, C-8, C-11, C-12, C-14, C-15, C-27, C-28) only -- never from the judge's own code. Expected
// values come from the spec rules and the R0/R1 row list (ab-proto selftest rows, R0 BROWS B1-B10), not from running
// ABGate.js. Several rows are RED until J1 lands (see the REDNESS note in .handoff/evidence/U4-GBB3-rows.log).
//
// One clean synthetic TOOL log (K=11, C=3, warm=1, one WARM line per lane, RAW = exactly K values, arch in HEADER,
// PROV start / end in the tool grammar) over a tool-owned spec: x:f gated FASTER, x:s gated SLOWER, x:w gated WITHIN,
// x:r reported. Each row is a string edit of it: [name, lines, exit, VERDICT prefix, substring | null].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeSpec, verdictOf } from '../ABGate.js';

const K = 11, C = 3;
const IDS = ['x:f', 'x:s', 'x:w', 'x:r'];
const GATED = { 'x:f': 'FASTER', 'x:s': 'SLOWER', 'x:w': 'WITHIN' };
const SHAPE = [['ops', '1024,1024,1024,1024'], ['minWindow', '64,64,64,64']];
const SHA = 'ab'.repeat(32);
const g0 = 'x:f', gN = 'x:w';            // first / last gated lane (as in the R1 rows)
const wN = GATED[gN];
const SPEC = () => judgeSpec({ laneIds: IDS, gated: GATED, shape: SHAPE, K, C, laneSha: SHA });

// word bands by C-5 (FASTER: median < 0.95 and q3 < 1; SLOWER: median > 1.05 and q1 > 1; else WITHIN)
const RAT = { FASTER: '0.500[0.490..0.510]', SLOWER: '1.500[1.490..1.510]', WITHIN: '1.000[0.990..1.010]' };
const BOP4 = 'A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000', BOP5 = BOP4.replace(',SLOW:0.0000', ',SLOW:0.0000') + ',AB:0.0000';
const want = (id) => GATED[id] ?? 'WITHIN';

const head = 'HEADER rung=ALL TIMED node v26.8.2 arch arm64 v8 14.6.202.34-node.28 cpu Synthetic CPU K=' + K + ' C=' + C +
    SHAPE.map(([k, v]) => ' ' + k + '=' + v).join('') + ' inject=null';
const specLine = 'HEADER spec synth-spec lane-file /synthetic/lane.mjs lane-sha256=' + SHA + ' transform=k.js:edited | tool /synthetic/ABGate.js';
const PROV_S = 'PROV start 2026-11-24T05:59:30.367Z load 1.61 1.63 1.79 busy-node [] quiet-lock quiet';
const PROV_E = 'PROV end 2026-11-24T05:59:31.075Z load 1.61 1.63 1.79 busy-node [] quiet-lock quiet';

function vec(base, n) {   // n values around the base (rounded, 4 decimals); RAW grammar of the tool
    const out = [];
    for (let i = 0; i < n; i++) out.push((base + (i - (n >> 1)) * 0.001).toFixed(4));
    return out.join(',');
}
const lead = (s) => Number(s.slice(0, s.indexOf('[')));
function laneLines(id, o) {
    const ba = o.ba ?? RAT[o.w], aa = o.aa ?? '1.000[0.990..1.010]', slow = o.slow ?? '2.000[1.900..2.100]';
    const res = 'RESULT lane=' + id + (GATED[id] ? ' (gated)' : ' (reported)') + ' A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=' + ba +
        ' word=' + (o.word ?? o.w) + ' B-A=0.00[0.00..0.00]ns aa=' + aa + ' slow=' + slow + ' ab=' + (o.ab ?? 'n/a') +
        ' B/AB=' + (o.bab ?? 'n/a') + ' wordAB=' + (o.wab ?? 'n/a') + ' bop=' + (o.bop ?? BOP4) + ' win=1 reps=' + (o.reps ?? 'A:1,B:1') +
        ' spin=16' + (o.warm ?? ' warm=1') + (o.tail ?? '');
    const n = o.rawN ?? K;
    const raw = 'RAW lane=' + id + ' B/A=' + vec(lead(RAT[o.w]), n) + ' AA=' + vec(1, n) + ' SLOW=' + vec(2, n) + (o.rawAB ? ' AB=' + vec(1.8, n) : '');
    const warm = 'WARM lane=' + id + ' round 0 (discarded, not in any median) A/A=1.0000 B/A=' + lead(RAT[o.w]).toFixed(4) +
        ' AA/A=1.0000 SLOW/A=2.0000' + (o.rawAB ? ' AB/A=1.0000' : '');
    return [res, raw, warm];
}
// the synthetic log (patch[id] overrides that lane's fields); the clean log is patch = {}
const lines = (patch = {}) => [head, specLine, PROV_S, ...IDS.flatMap((id) => laneLines(id, { w: want(id), ...(patch[id] || {}) })), PROV_E];
const P = (o) => ({ [gN]: o });
const resOf = (ls, id) => ls.findIndex((l) => l.startsWith('RESULT lane=' + id + ' '));
const mapLine = (ls, from, f) => ls.map((l) => (l === from ? f(l) : l));
const editHead = (ls, a, b) => ls.map((l) => (l === head ? l.replace(a, b) : l));
const dropWhere = (ls, re) => ls.filter((l) => !re.test(l));

const NVS = 'VERDICT NO VERDICT (run shape)', NVG = 'VERDICT NO VERDICT (gated lane not clean)', NV = 'VERDICT NO VERDICT';
const flip = GATED[g0] === 'SLOWER' ? 'WITHIN' : 'SLOWER';
const other = wN === 'WITHIN' ? 'SLOWER' : 'WITHIN';
const wAlt = wN === 'FASTER' ? 'SLOWER' : 'FASTER';
const AB_OK = { reps: 'A:4,B:1,AB:1', ab: '1.818[1.806..1.850]', bab: RAT[wN], wab: wN, bop: BOP5, rawAB: true };
const voidLine = (ls) => { const c = ls.slice(); c.splice(c.length - 1, 0, 'VOID NOT-TF lane=' + gN + ': NOT-TF A#1'); return c; };
const wordExit = wN === 'WITHIN' ? 0 : 3, wordPre = wN === 'WITHIN' ? 'VERDICT PASS' : 'VERDICT FINDING';

// ---------------------------------------------------------------------------------------------- the 59 rows
const ROWS = [
    // core 3 (C-15)
    ['core PASS (every gated lane its GATED word)', () => lines(), 0, 'VERDICT PASS gated=3/3', null],
    ['core FINDING (' + g0 + ' clean ' + flip + ')', () => lines({ [g0]: { w: flip } }), 3, 'VERDICT FINDING wrong-gated=[' + g0 + ' ' + flip, null],
    ['core NO VERDICT (' + gN + ' A/A 1.080, C-8)', () => lines(P({ aa: '1.080[1.070..1.090]' })), 2, NVG, 'not-clean=[' + gN + ' aa 1.080'],
    // lane checks (a)-(h) + (j) (C-14, C-15)
    ['lane (a) VOID NOT-TF line on ' + gN, () => voidLine(lines()), 2, NVG, gN + ' VOID-line(NOT-TF)'],
    ['lane (b) VOID=[GC-WINDOW] tag on ' + gN, () => lines(P({ tail: ' VOID=[GC-WINDOW major 1]' })), 2, NVG, gN + ' VOID(GC-WINDOW)'],
    ['lane (c) PROV end dropped', () => lines().slice(0, -1), 2, NVS, '0 PROV end lines (want 1)'],
    ['lane (d) ' + gN + ' slow median 1.200', () => lines(P({ slow: '1.200[1.150..1.250]' })), 2, NVG, gN + ' slow 1.200[1.150..1.250] not med'],
    ['lane (e) ' + gN + ' bop B 0.0200', () => lines(P({ bop: 'A:0.0000,B:0.0200,AA:0.0000,SLOW:0.0000' })), 2, NVG, gN + ' bop A:0.0000,B:0.0200'],
    ['lane (f) ' + gN + ' slow q1 1.050', () => lines(P({ slow: '2.000[1.050..2.100]' })), 2, NVG, gN + ' slow 2.000[1.050..2.100] not med'],
    ['lane (g) ' + gN + ' B/A q3 NaN', () => lines(P({ ba: RAT[wN].replace(/\.\.[^\]]*\]$/, '..NaN]') })), 2, NVS, 'RESULT lane=' + gN + ' B/A=' + RAT[wN].replace(/\.\.[^\]]*\]$/, '..NaN]') + ' off grammar (C-54'],
    ['lane (h) ' + gN + ' printed word ' + other + ', numbers kept', () => lines(P({ word: other })), 2, NVS, 'RESULT lane=' + gN + ' printed word=' + other + ' but B/A reads ' + wN + ' (C-54'],
    ['lane (j) FINDING ' + g0 + ' wins over VOID on ' + gN + ' (C-15)', () => voidLine(lines({ [g0]: { w: flip } })), 3, 'VERDICT FINDING wrong-gated=[' + g0 + ' ' + flip, gN + ' VOID-line(NOT-TF)'],
    // shape 12 (C-4, C-27 tool dialect keeps the HEADER spec line)
    ['shape K=7', () => editHead(lines(), ' K=' + K + ' ', ' K=7 '), 2, NVS, 'K=7 (want ' + K + ')'],
    ['shape K=12 against a declared 11 (C-4: a log K must equal the declared K)', () => editHead(lines(), ' K=' + K + ' ', ' K=12 '), 2, NVS, 'K=12 (want ' + K + ')'],
    ['shape C=2', () => editHead(lines(), ' C=' + C + ' ', ' C=2 '), 2, NVS, 'C=2 (want ' + C + ')'],
    ['shape inject=aa-drift', () => editHead(lines(), ' inject=null', ' inject=aa-drift'), 2, NVS, 'inject=aa-drift (want null)'],
    ['shape rung=x', () => editHead(lines(), 'HEADER rung=ALL ', 'HEADER rung=x '), 2, NVS, 'rung=x (want ALL)'],
    ['shape HEADER rung line twice', () => [head, ...lines()], 2, NVS, '2 HEADER rung= lines (want 1)'],
    ['shape ' + gN + ' RESULT twice', () => { const c = lines(); c.splice(c.length - 1, 0, laneLines(gN, { w: wN })[0]); return c; }, 2, NVS, 'several RESULT lines for ' + gN],
    ['shape STOP appended', () => [...lines(), 'STOP ORACLE: synthetic'], 2, 'VERDICT NO VERDICT (STOP ORACLE)', 'STOP ORACLE'],
    ['shape CRASH appended', () => [...lines(), 'CRASH Error: synthetic'], 2, 'VERDICT NO VERDICT (CRASH)', 'CRASH'],
    ['shape HEADER spec line dropped', () => lines().filter((l) => l !== specLine), 2, NVS, '0 HEADER spec lines (want 1)'],
    ['shape HEADER spec lane-sha256 of a foreign lane file', () => mapLine(lines(), specLine, (l) => l.replace(SHA, '0'.repeat(64))), 2, NVS, 'lane-sha256=00000000 (want ' + SHA.slice(0, 8) + ')'],
    ['shape HEADER spec transform= dropped', () => mapLine(lines(), specLine, (l) => l.replace(/ transform=\S+/, '')), 2, NVS, 'HEADER spec transform missing'],
    // C-11 REPS 14
    ['reps (i) ab 1.818 REPORTED + B/AB agreeing', () => lines(P(AB_OK)), 0, 'VERDICT PASS', null],
    ['reps (ii) B/AB reads ' + wAlt + ' vs B/A ' + wN, () => lines(P({ ...AB_OK, bab: RAT[wAlt], wab: wAlt })), 2, NVG, gN + ' REPS-DRIFT B/AB ' + RAT[wAlt] + ' reads ' + wAlt],
    ['reps (iii) reps differ, B/AB missing', () => lines(P({ ...AB_OK, bab: 'n/a', wab: 'n/a' })), 2, NVS, 'RESULT lane=' + gN + ' B/AB=n/a with reps A:4,B:1,AB:1 (C-47'],
    ['reps (iv) printed wordAB=' + wN + ' but B/AB numbers read ' + wAlt, () => lines(P({ ...AB_OK, bab: RAT[wAlt], wab: wN })), 2, NVS, 'RESULT lane=' + gN + ' printed wordAB=' + wN + ' but B/AB ' + RAT[wAlt] + ' reads ' + wAlt + ' (C-51'],
    ['reps (v) B/AB median exactly 1.050 WITHIN vs B/A clearly SLOWER', () => lines(P({ ...AB_OK, ba: RAT.SLOWER, word: 'SLOWER', bab: '1.050[1.040..1.060]', wab: 'WITHIN' })), 2, NVG, gN + ' REPS-DRIFT B/AB 1.050[1.040..1.060] reads WITHIN but B/A ' + RAT.SLOWER + ' reads SLOWER'],
    ['reps no AB bop (reps differ)', () => lines(P({ ...AB_OK, bop: BOP4 })), 2, NVS, 'RESULT lane=' + gN + ' bop holds 0 AB: entries with reps A:4,B:1,AB:1 (C-47'],
    ['reps equal reps with a finite B/AB', () => lines(P({ bab: '1.000[0.990..1.010]' })), 2, NVS, 'RESULT lane=' + gN + ' B/AB=1.000[0.990..1.010] with equal reps A:1,B:1 (C-47'],
    ['reps AB timed at A\'s reps (A:4,B:1,AB:4)', () => lines(P({ ...AB_OK, reps: 'A:4,B:1,AB:4' })), 2, NVS, 'RESULT lane=' + gN + ' reps A:4,B:1,AB:4 AB part 4 != B reps 1 (C-50'],
    ['reps differ, AB reps not printed', () => lines(P({ ...AB_OK, reps: 'A:4,B:1' })), 2, NVS, 'RESULT lane=' + gN + ' reps A:4,B:1 AB part missing (C-50'],
    ['reps equal reps with an AB reps field', () => lines(P({ reps: 'A:1,B:1,AB:1' })), 2, NVS, 'RESULT lane=' + gN + ' reps A:1,B:1,AB:1 AB part with equal reps (C-50'],
    ['reps B/AB q3 NaN', () => lines(P({ ...AB_OK, bab: '1.000[0.990..NaN]' })), 2, NVS, 'RESULT lane=' + gN + ' B/AB=1.000[0.990..NaN] not finite (C-51'],
    ['reps B above A (A:1,B:4,AB:4) is valid, PASS', () => lines(P({ ...AB_OK, reps: 'A:1,B:4,AB:4' })), 0, 'VERDICT PASS', null],
    ['reps unparsed (A:1 only)', () => lines(P({ reps: 'A:1' })), 2, NVS, gN + ' reps A:1 unparsed'],
    // forged AB:1/4 (C-11 carried nit: the AB reps value is not a plain integer). Message left open: 'reps' (C-11).
    ['reps forged AB:1/4', () => lines(P({ ...AB_OK, reps: 'A:4,B:1,AB:1/4' })), 2, NVS, 'reps'],
    // C-12 / C-28 WARM 4
    ['warm warm=0 in RESULT', () => lines(P({ warm: ' warm=0' })), 2, NV, 'warm'],
    ['warm field missing in RESULT', () => lines(P({ warm: '' })), 2, NV, 'warm'],
    ['warm RAW with K+1 values (the discarded round leaked)', () => lines(P({ rawN: K + 1 })), 2, NV, 'RAW'],
    ['warm WARM line dropped for ' + gN, () => dropWhere(lines(), new RegExp('^WARM lane=' + gN + ' ')), 2, NV, 'WARM'],
    // PROV / HEADER 4 (each NO VERDICT; the substring is the dropped field's name, the VERDICT tail also prints arch/node
    // so the exit + prefix carry the tooth)
    ['prov PROV start load dropped', () => mapLine(lines(), PROV_S, (l) => l.replace(' load 1.61 1.63 1.79', '')), 2, NV, 'PROV start'],
    ['prov PROV end timestamp altered', () => mapLine(lines(), PROV_E, (l) => l.replace('2026-11-24T05:59:31.075Z', 'yesterday')), 2, NV, 'PROV end'],
    ['prov HEADER arch dropped', () => editHead(lines(), ' arch arm64', ''), 2, NV, 'arch'],
    ['prov HEADER node dropped', () => editHead(lines(), ' node v26.8.2', ''), 2, NV, 'node'],
    // boundaries 12 (R0 P5): one value ON each comparator boundary so a > / >= flip changes the verdict (C-4, C-5)
    ['B1 ' + gN + ' aa median exactly 0.950', () => lines(P({ aa: '0.950[0.940..0.960]' })), 0, 'VERDICT PASS', null],
    ['B2 ' + gN + ' aa median exactly 1.050', () => lines(P({ aa: '1.050[1.040..1.060]' })), 0, 'VERDICT PASS', null],
    ['B3 ' + gN + ' slow median exactly 1.250', () => lines(P({ slow: '1.250[1.200..1.300]' })), 2, NVG, gN + ' slow 1.250[1.200..1.300] not med'],
    ['B4 ' + gN + ' slow q1 exactly 1.100', () => lines(P({ slow: '2.000[1.100..2.100]' })), 2, NVG, gN + ' slow 2.000[1.100..2.100] not med'],
    ['B5 ' + gN + ' bop B exactly 1/64', () => lines(P({ bop: 'A:0.0000,B:0.015625,AA:0.0000,SLOW:0.0000' })), 2, NVG, gN + ' bop A:0.0000,B:0.015625'],
    ['B6 ' + gN + ' B/A median exactly 1.050, WITHIN', () => lines(P({ ba: '1.050[1.040..1.060]', word: 'WITHIN' })), wordExit, wordPre, null],
    ['B7 ' + gN + ' B/A q1 exactly 1.000, WITHIN', () => lines(P({ ba: '1.100[1.000..1.200]', word: 'WITHIN' })), wordExit, wordPre, null],
    ['B8 ' + gN + ' B/A median exactly 0.950, WITHIN', () => lines(P({ ba: '0.950[0.940..0.960]', word: 'WITHIN' })), wordExit, wordPre, null],
    ['B9 ' + gN + ' B/A q3 exactly 1.000, WITHIN', () => lines(P({ ba: '0.900[0.800..1.000]', word: 'WITHIN' })), wordExit, wordPre, null],
    // B10 / B10b: the proto renders the unparsed value as NaN; only 'not finite' (C-14 fail closed) is asserted
    ['B10 ' + gN + ' aa q1 literal Infinity', () => lines(P({ aa: '1.001[Infinity..1.003]' })), 2, NVS, 'RESULT lane=' + gN + ' aa=1.001[Infinity..1.003] off grammar (C-54'],
    ['B10b ' + gN + ' slow median 1e309 digits (overflows to Infinity)', () => lines(P({ slow: '1' + '0'.repeat(309) + '[1.900..2.100]' })), 2, NVS, 'RESULT lane=' + gN + ' slow=1' + '0'.repeat(309) + '[1.900..2.100] off grammar (C-54 / C-56'],
    ['B11 ' + gN + ' bop A exactly -0 (>= 0 boundary)', () => lines(P({ bop: 'A:-0.0000,B:0.0000,AA:0.0000,SLOW:0.0000' })), 0, 'VERDICT PASS', null],
    // empty-gated belt (C-14): mk returns null -> the dedicated runner below (it builds the spec without judgeSpec)
    ['belt empty-gated (code 2, never 0, every dialect)', null, 2, NV, null],
];

test('the table has exactly 59 rows with unique names', () => {
    assert.equal(ROWS.length, 59);
    const names = new Set(ROWS.map((r) => r[0]));
    assert.equal(names.size, ROWS.length, 'row names are unique');
});

test('the clean synthetic tool log reads PASS', () => {
    const v = verdictOf(SPEC(), lines());
    assert.equal(v.code, 0, v.text);
    assert.ok(v.text.startsWith('VERDICT PASS'), v.text);
    assert.ok(typeof v.reported === 'string' && v.reported.startsWith('REPORTED'), String(v.reported));
});

for (const [name, mk, exit, prefix, sub] of ROWS) {
    if (mk === null) continue;
    test('row: ' + name, () => {
        const v = verdictOf(SPEC(), mk());
        assert.equal(v.code, exit, 'exit: ' + v.text);
        assert.ok(v.text.startsWith(prefix), 'prefix ' + JSON.stringify(prefix) + ' in: ' + v.text);
        // the substring is searched only before the ' | cpu ' tail, which always prints arch and node
        const cut = v.text.indexOf(' | cpu ');
        const body = cut < 0 ? v.text : v.text.slice(0, cut);
        if (sub !== null) assert.ok(body.includes(sub), 'substring ' + JSON.stringify(sub) + ' in: ' + v.text);
    });
}

// the 59th table row: empty-gated belt (C-14) -- verdictOf on a spec whose gated is {} never reads 0, in every dialect.
// The spec object is built WITHOUT judgeSpec's validation (judgeSpec must throw on an empty gated): take a valid spec
// and overwrite gated.
test('row: ' + ROWS[ROWS.length - 1][0], () => {
    for (const dialect of [undefined, 'ab-gate@7e0f9262']) {
        const good = judgeSpec({ laneIds: IDS, gated: GATED, shape: SHAPE, K, C, laneSha: SHA, ...(dialect ? { dialect } : {}) });
        const bad = { ...good, gated: {} };
        const v = verdictOf(bad, lines());
        assert.equal(v.code, 2, 'dialect ' + dialect + ': ' + v.text);
        assert.ok(v.text.startsWith(NV), v.text);
    }
});

// ---------------------------------------------------------------------------------------------- judgeSpec API (not rows)
test('judgeSpec throws on bad input (C-13, C-14, C-4, C-27)', () => {
    const ok = { laneIds: IDS, gated: GATED, shape: SHAPE, laneSha: SHA };   // C-33: laneSha required in the tool dialect
    assert.doesNotThrow(() => judgeSpec(ok));
    assert.throws(() => judgeSpec({ ...ok, bogus: 1 }), /bogus/, 'unknown key');
    assert.throws(() => judgeSpec({ ...ok, gated: {} }), /gated/, 'empty gated');
    assert.throws(() => judgeSpec({ ...ok, gated: { 'x:nope': 'FASTER' } }), /x:nope/, 'gated id not in laneIds');
    assert.throws(() => judgeSpec({ ...ok, gated: { 'x:f': 'FAST' } }), /FAST/, 'bad word');
    assert.throws(() => judgeSpec({ ...ok, K: 10 }), /K/, 'K < 11');
    assert.throws(() => judgeSpec({ ...ok, C: 2 }), /C/, 'C < 3');
    assert.throws(() => judgeSpec({ ...ok, dialect: 'nope' }), /dialect/, 'unknown dialect');
    assert.throws(() => judgeSpec({ ...ok, band: [0.9, 1.1] }), /band/, 'band is a constant, not a key');
});
