// test/judge.extra.test.mjs -- G-B B4 (U7, plan-GB TASK 8 / ASSERTION A3): the rows that kill the mutants the U5 / U6
// reviewers found surviving the 114 judge rows (M14 PROV ISO round trip, M16 RAW AB column count when reps differ, M17
// WARM line grammar, R2 an inherited Object.prototype.laneSha). Each row is written from the SPEC rule it names, never
// from the judge's code; the synthetic TOOL log below has its own builder (independent of judge.rows.test.mjs and of
// parity.abgate.test.mjs). DETERMINISTIC (C-3): no clock, no child process.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. ASCII only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeSpec, verdictOf } from '../ABGate.js';

const K = 11, C = 3;
const IDS = ['y:g', 'y:r'];
const GATED = { 'y:g': 'WITHIN' };
const SHA = 'cd'.repeat(32);
const SPEC = () => judgeSpec({ laneIds: IDS, gated: GATED, K, C, laneSha: SHA });
const col = (v, n) => new Array(n).fill(v).join(',');

/** A clean TOOL-dialect log (C-27 tool checks, C-28 warm=1 / one WARM line / RAW of K values, C-11 when o.ab):
 *  o.ab = reps differ (A:4,B:1,AB:1: an AB column in RESULT bop, RAW and WARM); o.abN = values in the RAW AB column;
 *  o.provStart / o.provEnd = the PROV ISO times; o.warm = the WARM line of y:g (replaces the clean one). */
function log(o = {}) {
    const out = ['HEADER rung=ALL TIMED node v26.8.2 arch arm64 v8 14.6 cpu Synthetic K=' + K + ' C=' + C + ' inject=null',
        'HEADER spec extra lane-file /x/gate.mjs lane-sha256=' + SHA + ' transform=k.js:identity | tool /x/ABGate.js',
        'PROV start ' + (o.provStart ?? '2026-11-25T10:00:00.000Z') + ' load 1.00 1.00 1.00 busy-node [] quiet-lock none'];
    for (const id of IDS) {
        const ab = o.ab === true && id === 'y:g';
        out.push('RESULT lane=' + id + (GATED[id] ? ' (gated)' : ' (reported)') + ' A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=1.000[0.990..1.010]' +
            ' word=WITHIN B-A=0.00[0.00..0.00]ns aa=1.000[0.990..1.010] slow=2.000[1.900..2.100]' +
            (ab ? ' ab=1.800[1.790..1.810] B/AB=1.000[0.990..1.010] wordAB=WITHIN bop=A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000,AB:0.0000 win=64 reps=A:4,B:1,AB:1'
                : ' ab=n/a B/AB=n/a wordAB=n/a bop=A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000 win=64 reps=A:1,B:1') + ' spin=8 warm=1');
        out.push('RAW lane=' + id + ' B/A=' + col('1.0000', K) + ' AA=' + col('1.0000', K) + ' SLOW=' + col('2.0000', K) + (ab ? ' AB=' + col('1.8000', o.abN ?? K) : ''));
        out.push(id === 'y:g' && o.warm !== undefined ? o.warm
            : 'WARM lane=' + id + ' round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0000 AA/A=1.0000 SLOW/A=2.0000' + (ab ? ' AB/A=1.8000' : ''));
    }
    out.push('PROV end ' + (o.provEnd ?? '2026-11-25T10:00:01.000Z') + ' load 1.00 1.00 1.00 busy-node [] quiet-lock none');
    return out;
}

const NVS = 'VERDICT NO VERDICT (run shape)';
// [name, SPEC rule the row encodes, log, exit, VERDICT prefix, substring of the text before ' | cpu ' (or null)]
const ROWS = [
    ['control: the clean log (equal reps) reads PASS', 'C-15', () => log(), 0, 'VERDICT PASS gated=1/1', null],
    ['control: the clean log with reps A:4,B:1,AB:1 and a RAW AB column of K values reads PASS', 'C-11 + C-28', () => log({ ab: true }), 0, 'VERDICT PASS gated=1/1', null],
    // M14: PROV names an ISO instant (plan-GB TASK 2 "PROV start/end grammar (ISO time ...)"); a calendar date that does
    // not exist is not one, even though Date.parse rolls it over (C-14: an unverified state never passes)
    ['M14 PROV start at 2026-02-30 (no such day) is NO VERDICT', 'plan-GB TASK 2 PROV grammar (ISO time) + C-14',
        () => log({ provStart: '2026-02-30T10:00:00.000Z' }), 2, NVS, 'PROV start'],
    ['M14 PROV end at 2026-11-31 (no such day) is NO VERDICT', 'plan-GB TASK 2 PROV grammar (ISO time) + C-14',
        () => log({ provEnd: '2026-11-31T10:00:01.000Z' }), 2, NVS, 'PROV end'],
    // M16: when reps differ the AB column exists (C-11), and EVERY RAW column holds exactly K values (C-28)
    ['M16 reps differ, RAW AB holds K+1 values is NO VERDICT', 'C-11 + C-28 (every RAW column, AB included, exactly K values)',
        () => log({ ab: true, abN: K + 1 }), 2, 'VERDICT NO VERDICT', 'AB'],
    ['M16 reps differ, RAW AB holds K-1 values is NO VERDICT', 'C-11 + C-28 (every RAW column, AB included, exactly K values)',
        () => log({ ab: true, abN: K - 1 }), 2, 'VERDICT NO VERDICT', 'AB'],
    // M17: the WARM line is the record of round 0, the discarded warm round (C-12), one per lane (C-28); a line that names
    // another round, or carries no per-column ratio, is not that record
    ['M17 WARM line naming round 1 is NO VERDICT', 'C-12 (round 0 is the discarded round) + C-28 (one WARM line per lane)',
        () => log({ warm: 'WARM lane=y:g round 1 (discarded, not in any median) A/A=1.0000 B/A=1.0000 AA/A=1.0000 SLOW/A=2.0000' }), 2, 'VERDICT NO VERDICT', 'WARM'],
    ['M17 WARM line with no column ratios is NO VERDICT', 'C-12 + C-28 (a WARM line records round 0 per column)',
        () => log({ warm: 'WARM lane=y:g round 0 (discarded, not in any median) nothing measured' }), 2, 'VERDICT NO VERDICT', 'WARM'],
];

test('judge.extra: the table has 8 rows with unique names', () => {
    assert.equal(ROWS.length, 8);
    assert.equal(new Set(ROWS.map((r) => r[0])).size, ROWS.length);
});

for (const [name, rule, mk, exit, prefix, sub] of ROWS) {
    test('extra row: ' + name + ' [' + rule + ']', () => {
        const v = verdictOf(SPEC(), mk());
        assert.equal(v.code, exit, 'exit: ' + v.text);
        assert.ok(v.text.startsWith(prefix), 'prefix ' + JSON.stringify(prefix) + ' in: ' + v.text);
        const cut = v.text.indexOf(' | cpu ');
        const body = cut < 0 ? v.text : v.text.slice(0, cut);
        if (sub !== null) assert.ok(body.includes(sub), 'substring ' + JSON.stringify(sub) + ' in: ' + v.text);
    });
}

// R2 (C-33): laneSha is required in the TOOL dialect; a value inherited through a polluted Object.prototype is not the
// caller's laneSha. Both doors: judgeSpec throws, and the verdictOf belt reads code 2 for a hand-built spec without an
// own laneSha. The pollution is always removed (finally), and its absence is asserted afterwards.
test('R2 C-33: an inherited Object.prototype.laneSha never satisfies judgeSpec in the tool dialect', () => {
    try {
        Object.prototype.laneSha = SHA;
        assert.throws(() => judgeSpec({ laneIds: IDS, gated: GATED }), /laneSha/, 'judgeSpec accepted an inherited laneSha');
    } finally {
        delete Object.prototype.laneSha;
    }
    assert.equal(Object.hasOwn(Object.prototype, 'laneSha'), false);
});
test('R2 C-33 belt: verdictOf reads code 2 for a spec with no own laneSha while Object.prototype.laneSha is valid', () => {
    const good = SPEC();
    assert.equal(verdictOf(good, log()).code, 0, 'control: the clean log reads PASS under the valid spec');
    const { laneSha: _drop, ...noOwn } = good;
    let v = null;
    try {
        Object.prototype.laneSha = SHA;
        v = verdictOf(noOwn, log());
    } finally {
        delete Object.prototype.laneSha;
    }
    assert.equal(Object.hasOwn(Object.prototype, 'laneSha'), false);
    assert.equal(v.code, 2, 'belt read an inherited laneSha: ' + v.text);
    assert.ok(v.text.startsWith('VERDICT NO VERDICT (judge spec)'), v.text);
});
