// test/judge.extra.test.mjs -- G-B B4 (U7, plan-GB TASK 8 / ASSERTION A3): the rows that kill the mutants the U5 / U6
// reviewers found surviving the 114 judge rows (M14 PROV ISO round trip, M16 RAW AB column count when reps differ, M17
// WARM line grammar, R2 an inherited Object.prototype.laneSha). Each row is written from the SPEC rule it names, never
// from the judge's code; the synthetic TOOL log below has its own builder (independent of judge.rows.test.mjs and of
// parity.abgate.test.mjs). DETERMINISTIC (C-3): no clock, no child process.
// U5b adds the C-34 rows (RAW / WARM AB column and finite RAW values, TOOL dialect), from the CURRENT C-34 text; the
// U5b retry adds the two twice-printed AB rows (review r1 blocker 2) and the C-42 rows (RESULT reps unparsed or printed
// twice, on a gated OR a reported lane), from the CURRENT C-42 text. U5b retry 2 adds the no-reps-field C-42 row and the
// equal-reps RAW AB printed twice row (retry review r1 blocker 2 / nit), and the C-47 rows (RESULT ab / B/AB / wordAB and
// the bop AB entry on a REPORTED lane), from the CURRENT C-47 text, and the C-50 rows (the RESULT reps AB part on a
// REPORTED lane), from the CURRENT C-50 text. U5c adds the C-40 (WARM columns / values), C-41 (RAW column set) and
// C-51 (RESULT ab / B/AB / wordAB / bop grammar) rows on the REPORTED lane, from the CURRENT C-40 / C-41 / C-51 text, the
// outcome controls (ALLOC, a negative bop, REPS-DRIFT stay labels: C-15), the U5b3 review rows for mutants M6 / M14, and
// REPORTED-label tests for the C-11 labels that C-50 / C-51 now cover at verdict level (M13, C11b, C11c). U5c after SPEC A18
// adds the C-54 (the rest of the RESULT line) and C-55 (a negative bop) rows; the negative-bop control became a C-55 row.
// SPEC A19 adds the C-56 rows (the RESULT field set / order, a VOID tail, finite C-54 numbers). U9E B3 adds the C-48
// TIER-SETTLE rows (a gated lane whose settle cap is hit, and its settled control), from the CURRENT C-48 text.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. ASCII only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { judgeSpec, verdictOf } from '../ABGate.js';

const K = 11, C = 3;
const IDS = ['y:g', 'y:r'];
const GATED = { 'y:g': 'WITHIN' };
const SHA = 'cd'.repeat(32);
const SPEC = () => judgeSpec({ laneIds: IDS, gated: GATED, K, C, laneSha: SHA });
const col = (v, n) => new Array(n).fill(v).join(',');

/** A clean TOOL-dialect log (C-27 tool checks, C-28 warm=1 / one WARM line / RAW of K values, C-11 when o.ab):
 *  o.ab = reps differ (A:4,B:1,AB:1: an AB column in RESULT bop, RAW and WARM); o.abN = values in the RAW AB column;
 *  o.provStart / o.provEnd = the PROV ISO times; o.warm = the WARM line of y:g (replaces the clean one).
 *  C-34 (U5b): o.rawAB / o.warmAB = { laneId: bool } force the RAW AB / WARM AB/A column on or off for that lane (default:
 *  present exactly on the reps-differ lane); o.bad = [column, value] puts one value into the middle of that RAW column of y:g.
 *  C-42 (U5b retry): o.ab = a lane id puts the reps-differ lane there instead of y:g; o.reps = { laneId: text } replaces
 *  that lane's RESULT reps value (verbatim). */
function log(o = {}) {
    const out = ['HEADER rung=ALL TIMED node v26.8.2 arch arm64 v8 14.6 cpu Synthetic K=' + K + ' C=' + C + ' inject=null',
        'HEADER spec extra lane-file /x/gate.mjs lane-sha256=' + SHA + ' transform=k.js:identity | tool /x/ABGate.js',
        'PROV start ' + (o.provStart ?? '2026-11-25T10:00:00.000Z') + ' load 1.00 1.00 1.00 busy-node [] quiet-lock none'];
    for (const id of IDS) {
        const ab = o.ab === true ? id === 'y:g' : o.ab === id;
        const reps = o.reps?.[id] ?? (ab ? 'A:4,B:1,AB:1' : 'A:1,B:1');
        out.push('RESULT lane=' + id + (GATED[id] ? ' (gated)' : ' (reported)') + ' A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=1.000[0.990..1.010]' +
            ' word=WITHIN B-A=0.00[0.00..0.00]ns aa=1.000[0.990..1.010] slow=2.000[1.900..2.100]' +
            (ab ? ' ab=1.800[1.790..1.810] B/AB=1.000[0.990..1.010] wordAB=WITHIN bop=A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000,AB:0.0000 win=64'
                : ' ab=n/a B/AB=n/a wordAB=n/a bop=A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000 win=64') + ' reps=' + reps + ' spin=8 warm=1');
        const rawAB = o.rawAB?.[id] ?? ab, warmAB = o.warmAB?.[id] ?? ab;
        const rc = (c, v, n) => { const a = new Array(n).fill(v); if (o.bad !== undefined && o.bad[0] === c && id === 'y:g') a[n >> 1] = o.bad[1]; return a.join(','); };
        out.push('RAW lane=' + id + ' B/A=' + rc('B/A', '1.0000', K) + ' AA=' + rc('AA', '1.0000', K) + ' SLOW=' + rc('SLOW', '2.0000', K) + (rawAB ? ' AB=' + rc('AB', '1.8000', o.abN ?? K) : ''));
        out.push(id === 'y:g' && o.warm !== undefined ? o.warm
            : 'WARM lane=' + id + ' round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0000 AA/A=1.0000 SLOW/A=2.0000' + (warmAB ? ' AB/A=1.8000' : ''));
    }
    out.push('PROV end ' + (o.provEnd ?? '2026-11-25T10:00:01.000Z') + ' load 1.00 1.00 1.00 busy-node [] quiet-lock none');
    return out;
}

const NVS = 'VERDICT NO VERDICT (run shape)';
// C-47 rows: edit the REPORTED lane's RESULT line only; the three AB fields as log() prints them for differing / equal reps
const onR = (ls, f) => ls.map((l) => (l.startsWith('RESULT lane=y:r ') ? f(l) : l));
const onW = (ls, f) => ls.map((l) => (l.startsWith('WARM lane=y:r ') ? f(l) : l));
const onRaw = (ls, f) => ls.map((l) => (l.startsWith('RAW lane=y:r ') ? f(l) : l));
// C-48 (U9E): runLane prints SETTLE + WINDOW before a lane's RESULT and its VOID lines after WARM; settled=no -> the
// RESULT VOID=[TIER-SETTLE ..] tail + a 'VOID TIER-SETTLE lane=<id>: ..' line (the grammar of C-48 / A14)
const TSV = 'TIER-SETTLE pass-bytes 7968,7968,7968 (cap 3, none read exactly 0)';
function settleLog(voidOn) {
    const out = [];
    for (const l of log()) {
        const r = /^RESULT lane=(\S+) /.exec(l), w = /^WARM lane=(\S+) /.exec(l);
        if (r !== null) out.push(r[1] === voidOn ? 'SETTLE lane=' + r[1] + ' passes=3 pass-bytes=7968,7968,7968 settled=no' : 'SETTLE lane=' + r[1] + ' passes=1 pass-bytes=0 settled=yes',
            'WINDOW lane=' + r[1] + ' tool-bytes=0 scavenges=0');
        out.push(r !== null && r[1] === voidOn ? l + ' VOID=[' + TSV + ']' : l);
        if (w !== null && w[1] === voidOn) out.push('VOID TIER-SETTLE lane=' + w[1] + ': ' + TSV);
    }
    return out;
}
const DIF3 = ' ab=1.800[1.790..1.810] B/AB=1.000[0.990..1.010] wordAB=WITHIN ', EQ3 = ' ab=n/a B/AB=n/a wordAB=n/a ';
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
    // C-34 (U5b, TOOL dialect): the C-11 AB rule holds on RESULT, RAW and WARM alike -- reps differ: RAW carries an AB
    // column of exactly K values and WARM an AB/A column; equal reps: neither does; every RAW value is a finite number
    // (NUM_RE, C-14: null is not zero). Any violation is NO VERDICT, on a reported lane too. Red on 311761f (fail-open).
    ['C-34a reps differ, RAW AB column missing is NO VERDICT', 'C-34 (+ C-11, C-28)',
        () => log({ ab: true, rawAB: { 'y:g': false } }), 2, NVS, 'RAW lane=y:g AB'],
    ['C-34b RAW B/A value NaN is NO VERDICT', 'C-34 (every RAW value NUM_RE, finite) + C-14',
        () => log({ bad: ['B/A', 'NaN'] }), 2, NVS, 'RAW lane=y:g B/A'],
    ['C-34b RAW AA value x is NO VERDICT', 'C-34 (every RAW value NUM_RE, finite) + C-14',
        () => log({ bad: ['AA', 'x'] }), 2, NVS, 'RAW lane=y:g AA'],
    ['C-34b RAW SLOW value 1e3 (exponent form, not NUM_RE) is NO VERDICT', 'C-34 (every RAW value NUM_RE, finite) + C-14',
        () => log({ bad: ['SLOW', '1e3'] }), 2, NVS, 'RAW lane=y:g SLOW'],
    ['C-34b RAW SLOW value of 310 digits (overflows to Infinity) is NO VERDICT', 'C-34 (every RAW value a FINITE number) + C-14',
        () => log({ bad: ['SLOW', '1' + '0'.repeat(309)] }), 2, NVS, 'RAW lane=y:g SLOW'],
    ['C-34b reps differ, RAW AB value Infinity is NO VERDICT', 'C-34 (every RAW value, AB included, finite) + C-14',
        () => log({ ab: true, bad: ['AB', 'Infinity'] }), 2, NVS, 'RAW lane=y:g AB'],
    ['C-34c equal reps, RAW AB column of K values is NO VERDICT', 'C-34 (equal reps: no AB on any line family)',
        () => log({ rawAB: { 'y:g': true } }), 2, NVS, 'RAW lane=y:g AB'],
    ['C-34c equal reps on the REPORTED lane, RAW AB column is NO VERDICT', 'C-34 (any violation -> NO VERDICT)',
        () => log({ rawAB: { 'y:r': true } }), 2, NVS, 'RAW lane=y:r AB'],
    ['C-34d reps differ, WARM AB/A column missing is NO VERDICT', 'C-34 (reps differ: WARM carries AB/A)',
        () => log({ ab: true, warmAB: { 'y:g': false } }), 2, NVS, 'WARM lane=y:g'],
    ['C-34d equal reps, WARM AB/A column is NO VERDICT', 'C-34 (equal reps: no AB on any line family)',
        () => log({ warmAB: { 'y:g': true } }), 2, NVS, 'WARM lane=y:g'],
    ['C-34d equal reps on the REPORTED lane, WARM AB/A column is NO VERDICT', 'C-34 (any violation -> NO VERDICT)',
        () => log({ warmAB: { 'y:r': true } }), 2, NVS, 'WARM lane=y:r'],
    ['C-34d reps differ, WARM AB/A printed twice is NO VERDICT', 'C-34 (reps differ: WARM carries ONE AB/A)', () => log({ ab: true, warm: 'WARM lane=y:g round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0000 AA/A=1.0000 SLOW/A=2.0000 AB/A=1.8000 AB/A=1.8000' }), 2, NVS, 'WARM lane=y:g AB/A'],
    ['C-34a reps differ, RAW AB column printed twice is NO VERDICT', 'C-34 (+ C-28: one AB column of K values)', () => log({ ab: true }).map((l) => (l.startsWith('RAW lane=y:g ') ? l + ' AB=' + col('1.8000', K) : l)), 2, NVS, 'RAW lane=y:g AB'],
    ['C-34c equal reps, RAW AB column printed twice is NO VERDICT', 'C-34 (equal reps: no AB on any line family)', () => log().map((l) => (l.startsWith('RAW lane=y:g ') ? l + ' AB=' + col('1.8000', K) + ' AB=' + col('1.8000', K) : l)), 2, NVS, 'RAW lane=y:g AB'],
    // C-42 (U5b retry, TOOL dialect): a lane, gated OR reported, whose RESULT reps field is unparsed or printed twice is
    // run shape NO VERDICT (code 2): the C-34 AB rule cannot be verified on it (C-14, null is not zero). A gated lane
    // reads the run-shape heading, not "(gated lane not clean)". Red on d4991c39 (reported: PASS; gated: other heading).
    ['C-42 control: the REPORTED lane with reps A:4,B:1,AB:1 (RAW AB + WARM AB/A) reads PASS', 'C-11 + C-34 + C-42 (well-formed reps)',
        () => log({ ab: 'y:r' }), 0, 'VERDICT PASS gated=1/1', null],
    ['C-42 REPORTED lane reps A:4,B:1,AB:1x (unparsed) with RAW AB + WARM AB/A is run shape', 'C-42 (any lane; reps unparsed)',
        () => log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1,AB:1x' } }), 2, NVS, 'y:r reps A:4,B:1,AB:1x'],
    ['C-42 REPORTED lane reps printed twice on its RESULT line is run shape', 'C-42 (any lane; reps duplicated)',
        () => log().map((l) => (l.startsWith('RESULT lane=y:r ') ? l + ' reps=A:1,B:1' : l)), 2, NVS, 'y:r reps printed 2 times'],
    ['C-42 GATED lane reps A:1,B:1x (unparsed) is run shape, not gated-lane-not-clean', 'C-42 (gated heading -> run shape)',
        () => log({ reps: { 'y:g': 'A:1,B:1x' } }), 2, NVS, 'y:g reps A:1,B:1x'],
    ['C-42 GATED lane reps printed twice on its RESULT line is run shape', 'C-42 (gated heading -> run shape; reps duplicated)',
        () => log().map((l) => (l.startsWith('RESULT lane=y:g ') ? l + ' reps=A:1,B:1' : l)), 2, NVS, 'y:g reps printed 2 times'],
    ['C-42 REPORTED lane with no reps field on its RESULT line (RAW AB + WARM AB/A) is run shape', 'C-42 (any lane; reps missing = unparsed, C-14)',
        () => log({ ab: 'y:r' }).map((l) => (l.startsWith('RESULT lane=y:r ') ? l.replace(/ reps=\S+/, '') : l)), 2, NVS, 'RESULT lane=y:r reps'],
    // C-47 (U5b retry 2, TOOL dialect): on EVERY lane, reps differ -> RESULT ab, B/AB and wordAB each present once and not
    // n/a, and exactly one AB: entry in bop; equal reps -> all three n/a and no bop AB entry; any violation is run shape
    // NO VERDICT (code 2). Every row below edits the REPORTED lane y:r only (RAW + WARM AB columns correct for its reps).
    // Red on d4991c39 (the reported lane's NOT-CLEAN label never reached the verdict: PASS). Boundary rows (law 8): the
    // bop AB entry count at 0 and 2 (reps differ, want 1) and at 1 (equal reps, want 0).
    ['C-47 control: the REPORTED lane with reps A:4,B:1,AB:1, ab / B/AB / wordAB values and one bop AB entry reads PASS', 'C-47 (well-formed)',
        () => log({ ab: 'y:r' }), 0, 'VERDICT PASS gated=1/1', null],
    ['C-47a REPORTED lane reps differ, RESULT ab / B/AB / wordAB all n/a and no bop AB entry is run shape', 'C-47 (reps differ: present, not n/a; one bop AB)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(DIF3, EQ3).replace(',AB:0.0000 ', ' ')), 2, NVS, 'RESULT lane=y:r ab=n/a with reps A:4,B:1,AB:1 (C-47'],
    ['C-47a REPORTED lane reps differ, RESULT ab=n/a only is run shape', 'C-47 (reps differ: ab not n/a)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' ab=1.800[1.790..1.810] ', ' ab=n/a ')), 2, NVS, 'RESULT lane=y:r ab=n/a with reps'],
    ['C-47a REPORTED lane reps differ, RESULT B/AB=n/a only is run shape', 'C-47 (reps differ: B/AB not n/a)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' B/AB=1.000[0.990..1.010] ', ' B/AB=n/a ')), 2, NVS, 'RESULT lane=y:r B/AB=n/a with reps'],
    ['C-47a REPORTED lane reps differ, RESULT wordAB=n/a only is run shape', 'C-47 (reps differ: wordAB not n/a)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' wordAB=WITHIN ', ' wordAB=n/a ')), 2, NVS, 'RESULT lane=y:r wordAB=n/a with reps'],
    ['C-47a REPORTED lane reps differ, RESULT ab field absent is run shape', 'C-47 (reps differ: ab present)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' ab=1.800[1.790..1.810] ', ' ')), 2, NVS, 'RESULT lane=y:r ab missing or printed twice with reps'],
    ['C-47a REPORTED lane reps differ, RESULT wordAB printed twice is run shape', 'C-47 (reps differ: wordAB present exactly once)',
        () => onR(log({ ab: 'y:r' }), (l) => l + ' wordAB=WITHIN'), 2, NVS, 'RESULT lane=y:r wordAB missing or printed twice with reps'],
    ['C-47b REPORTED lane reps differ, bop with 0 AB: entries (fields right) is run shape', 'C-47 (reps differ: exactly one bop AB; boundary 0)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(',AB:0.0000 ', ' ')), 2, NVS, 'RESULT lane=y:r bop holds 0 AB: entries with reps'],
    ['C-47b REPORTED lane reps differ, bop with 2 AB: entries is run shape', 'C-47 (reps differ: exactly one bop AB; boundary 2)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(',AB:0.0000 ', ',AB:0.0000,AB:0.0000 ')), 2, NVS, 'RESULT lane=y:r bop holds 2 AB: entries with reps'],
    ['C-47c REPORTED lane equal reps, RESULT ab / B/AB / wordAB carry values is run shape', 'C-47 (equal reps: all three n/a)',
        () => onR(log(), (l) => l.replace(EQ3, DIF3)), 2, NVS, 'RESULT lane=y:r ab=1.800[1.790..1.810] with equal reps A:1,B:1 (C-47'],
    ['C-47c REPORTED lane equal reps, RESULT ab value only is run shape', 'C-47 (equal reps: ab n/a)',
        () => onR(log(), (l) => l.replace(' ab=n/a ', ' ab=1.800[1.790..1.810] ')), 2, NVS, 'RESULT lane=y:r ab=1.800[1.790..1.810] with equal reps'],
    ['C-47c REPORTED lane equal reps, RESULT B/AB value only is run shape', 'C-47 (equal reps: B/AB n/a)',
        () => onR(log(), (l) => l.replace(' B/AB=n/a ', ' B/AB=1.000[0.990..1.010] ')), 2, NVS, 'RESULT lane=y:r B/AB=1.000[0.990..1.010] with equal reps'],
    ['C-47c REPORTED lane equal reps, RESULT wordAB value only is run shape', 'C-47 (equal reps: wordAB n/a)',
        () => onR(log(), (l) => l.replace(' wordAB=n/a ', ' wordAB=WITHIN ')), 2, NVS, 'RESULT lane=y:r wordAB=WITHIN with equal reps'],
    ['C-47c REPORTED lane equal reps, RESULT ab field absent is run shape', 'C-47 (equal reps: ab exactly n/a)',
        () => onR(log(), (l) => l.replace(' ab=n/a ', ' ')), 2, NVS, 'RESULT lane=y:r ab missing or printed twice with equal reps'],
    ['C-47d REPORTED lane equal reps, bop with 1 AB: entry (fields n/a) is run shape', 'C-47 (equal reps: no bop AB; boundary 1)',
        () => onR(log(), (l) => l.replace(',SLOW:0.0000 ', ',SLOW:0.0000,AB:0.0000 ')), 2, NVS, 'RESULT lane=y:r bop holds 1 AB: entries with equal reps'],
    ['C-47d REPORTED lane equal reps, a second bop field holding an AB: entry is run shape', 'C-47 (equal reps: no AB entry in any bop)',
        () => onR(log(), (l) => l + ' bop=AB:0.0000'), 2, NVS, 'RESULT lane=y:r bop holds 1 AB: entries with equal reps'],
    // C-50 (U5b retry 2, TOOL dialect): on EVERY lane the RESULT reps AB part follows C-11 -- reps differ -> AB:<n> present
    // with n = B reps; equal reps -> no AB part; any violation is run shape NO VERDICT (code 2). Every row edits only the
    // REPORTED lane's reps (RAW / WARM / ab / B/AB / wordAB / bop as log() prints them for that reps state). Red on
    // d4991c39 (label only: PASS). Boundary rows (law 8) on the n = B compare: n = B + 1 and n = B - 1.
    ['C-50 REPORTED lane equal reps with an AB part (A:1,B:1,AB:1) is run shape', 'C-50 (equal reps: no AB part)',
        () => log({ reps: { 'y:r': 'A:1,B:1,AB:1' } }), 2, NVS, 'RESULT lane=y:r reps A:1,B:1,AB:1 AB part with equal reps (C-50'],
    ['C-50 REPORTED lane reps differ, AB part missing (A:4,B:1) is run shape', 'C-50 (reps differ: AB part present)',
        () => log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1' } }), 2, NVS, 'RESULT lane=y:r reps A:4,B:1 AB part missing (C-50'],
    ['C-50 REPORTED lane reps differ, AB timed at A reps (A:4,B:1,AB:4) is run shape', 'C-50 (reps differ: AB n = B reps)',
        () => log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1,AB:4' } }), 2, NVS, 'RESULT lane=y:r reps A:4,B:1,AB:4 AB part 4 != B reps 1 (C-50'],
    ['C-50 REPORTED lane reps differ, AB = B + 1 (A:4,B:1,AB:2) is run shape', 'C-50 (AB n = B reps; boundary B + 1)',
        () => log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1,AB:2' } }), 2, NVS, 'RESULT lane=y:r reps A:4,B:1,AB:2 AB part 2 != B reps 1 (C-50'],
    ['C-50 REPORTED lane reps differ, AB = B - 1 (A:4,B:1,AB:0) is run shape', 'C-50 (AB n = B reps; boundary B - 1)',
        () => log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1,AB:0' } }), 2, NVS, 'RESULT lane=y:r reps A:4,B:1,AB:0 AB part 0 != B reps 1 (C-50'],
    // C-40 / C-41 / C-51 (U5c, TOOL dialect): on EVERY lane, gated or reported, the WARM columns are exactly A/A B/A AA/A
    // SLOW/A [AB/A] in that order with finite NUM_RE values (C-40), the RAW columns exactly B/A AA SLOW [AB] once each
    // (C-41), and the RESULT values well formed (C-51): ab / B/AB finite where not n/a, the printed wordAB = the word its
    // B/AB reads (C-5 bands), one bop field whose entries are <KEY>:<number> over the keys A, B, AA, SLOW (+ AB by C-47).
    // Any violation is run shape NO VERDICT (code 2). Every row edits the REPORTED lane y:r only. Red on f5c94955 (label
    // only or unchecked: PASS), except the C-41 duplicated-column row (already run shape there through field()'s null:
    // red on the C-41 reason only). Boundary rows (law 8): WARM 3 and 6 columns, RAW one extra / one repeated column, bop
    // 3 and 6 keys, values of 310 digits (NUM_RE but not finite), wordAB on the 1.050 / 0.950 word boundaries.
    ['C-40a REPORTED lane reps differ, WARM AB/A=zz is run shape', 'C-40 (each WARM value NUM_RE / finite)',
        () => onW(log({ ab: 'y:r' }), (l) => l.replace(' AB/A=1.8000', ' AB/A=zz')), 2, NVS, 'WARM lane=y:r value AB/A=zz not a finite number (C-40'],
    ['C-40a REPORTED lane equal reps, WARM SLOW/A=NaN is run shape', 'C-40 (each WARM value NUM_RE / finite)',
        () => onW(log(), (l) => l.replace(' SLOW/A=2.0000', ' SLOW/A=NaN')), 2, NVS, 'WARM lane=y:r value SLOW/A=NaN not a finite number (C-40'],
    ['C-40a REPORTED lane WARM AA/A of 310 digits (NUM_RE, overflows to Infinity) is run shape', 'C-40 (each WARM value finite; boundary)',
        () => onW(log(), (l) => l.replace(' AA/A=1.0000', ' AA/A=1' + '0'.repeat(309))), 2, NVS, 'WARM lane=y:r value AA/A=1000'],
    ['C-40b REPORTED lane WARM with 3 columns (SLOW/A dropped) is run shape', 'C-40 (exactly A/A B/A AA/A SLOW/A [AB/A]; boundary 3)',
        () => onW(log(), (l) => l.replace(' SLOW/A=2.0000', '')), 2, NVS, 'WARM lane=y:r line unparsed (C-40'],
    ['C-40b REPORTED lane reps differ, WARM with 6 columns (X/A after AB/A) is run shape', 'C-40 (exactly A/A B/A AA/A SLOW/A [AB/A]; boundary 6)',
        () => onW(log({ ab: 'y:r' }), (l) => l + ' X/A=1.0000'), 2, NVS, 'WARM lane=y:r line unparsed (C-40'],
    ['C-40b REPORTED lane WARM with A/A and B/A swapped is run shape', 'C-40 (in that order)',
        () => onW(log(), (l) => l.replace('A/A=1.0000 B/A=1.0000', 'B/A=1.0000 A/A=1.0000')), 2, NVS, 'WARM lane=y:r line unparsed (C-40'],
    ['C-41 REPORTED lane RAW with an extra column X of K values is run shape', 'C-41 (any other column -> NO VERDICT)',
        () => onRaw(log(), (l) => l + ' X=' + col('1.0000', K)), 2, NVS, 'RAW lane=y:r column "X" unknown (C-41'],
    ['C-41 REPORTED lane RAW with a bare token (no =) is run shape', 'C-41 (any other column -> NO VERDICT)',
        () => onRaw(log(), (l) => l + ' junk'), 2, NVS, 'RAW lane=y:r column "junk" unknown (C-41'],
    ['C-41 REPORTED lane RAW with the AA column printed twice is run shape', 'C-41 (exactly B/A AA SLOW [AB]; a repeated column)',
        () => onRaw(log(), (l) => l + ' AA=' + col('1.0000', K)), 2, NVS, 'RAW lane=y:r column AA printed more than once (C-41'],
    ['C-51a REPORTED lane reps differ, RESULT ab=zz is run shape', 'C-51 (ab finite when not n/a)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' ab=1.800[1.790..1.810] ', ' ab=zz ')), 2, NVS, 'RESULT lane=y:r ab=zz not finite (C-51'],
    ['C-51a REPORTED lane reps differ, RESULT ab median of 310 digits is run shape', 'C-51 (ab finite; boundary)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' ab=1.800[', ' ab=1' + '0'.repeat(309) + '[')), 2, NVS, 'RESULT lane=y:r ab=1000'],
    ['C-51a REPORTED lane reps differ, RESULT B/AB q3 NaN is run shape', 'C-51 (B/AB finite when not n/a)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' B/AB=1.000[0.990..1.010] ', ' B/AB=1.000[0.990..NaN] ')), 2, NVS, 'RESULT lane=y:r B/AB=1.000[0.990..NaN] not finite (C-51'],
    ['C-51b REPORTED lane reps differ, printed wordAB=SLOWER but B/AB reads WITHIN is run shape', 'C-51 (wordAB = the word its B/AB reads)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' wordAB=WITHIN ', ' wordAB=SLOWER ')), 2, NVS, 'RESULT lane=y:r printed wordAB=SLOWER but B/AB 1.000[0.990..1.010] reads WITHIN (C-51'],
    ['C-51b REPORTED lane reps differ, printed wordAB empty is run shape', 'C-51 (wordAB = the word its B/AB reads)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' wordAB=WITHIN ', ' wordAB= ')), 2, NVS, 'RESULT lane=y:r printed wordAB= but B/AB'],
    ['C-51b REPORTED lane B/AB median exactly 1.050 (WITHIN) printed SLOWER is run shape', 'C-51 + C-5 (boundary 1.050)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' B/AB=1.000[0.990..1.010] wordAB=WITHIN ', ' B/AB=1.050[1.010..1.090] wordAB=SLOWER ')), 2, NVS, 'RESULT lane=y:r printed wordAB=SLOWER but B/AB 1.050[1.010..1.090] reads WITHIN (C-51'],
    ['C-51b REPORTED lane B/AB median exactly 0.950 (WITHIN) printed FASTER is run shape', 'C-51 + C-5 (boundary 0.950)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' B/AB=1.000[0.990..1.010] wordAB=WITHIN ', ' B/AB=0.950[0.910..0.990] wordAB=FASTER ')), 2, NVS, 'RESULT lane=y:r printed wordAB=FASTER but B/AB 0.950[0.910..0.990] reads WITHIN (C-51'],
    ['C-51 control: REPORTED lane B/AB median exactly 1.050 printed WITHIN (its word) reads PASS', 'C-51 + C-5 (boundary control)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' B/AB=1.000[0.990..1.010] ', ' B/AB=1.050[1.010..1.090] ')), 0, 'VERDICT PASS gated=1/1', null],
    ['C-51c REPORTED lane equal reps, bop printed twice is run shape', 'C-51 (bop printed twice)',
        () => onR(log(), (l) => l + ' bop=A:0.0000'), 2, NVS, 'RESULT lane=y:r bop printed 2 times (C-51'],
    ['C-51c REPORTED lane equal reps, no bop field is run shape', 'C-51 (bop unparseable: absent)',
        () => onR(log(), (l) => l.replace(/ bop=\S+/, '')), 2, NVS, 'RESULT lane=y:r bop missing (C-51'],
    ['C-51d REPORTED lane bop entry A:zz is run shape', 'C-51 (a bop entry not a number)',
        () => onR(log(), (l) => l.replace(' bop=A:0.0000,', ' bop=A:zz,')), 2, NVS, 'RESULT lane=y:r bop entry A:zz not a number (C-51'],
    ['C-51d REPORTED lane bop entry B of 310 digits (NUM_RE, overflows to Infinity) is run shape', 'C-51 (a bop entry not a number; boundary)',
        () => onR(log(), (l) => l.replace(',B:0.0000,', ',B:1' + '0'.repeat(309) + ',')), 2, NVS, 'RESULT lane=y:r bop entry B:1000'],
    ['C-51e REPORTED lane equal reps, bop with 3 keys (SLOW dropped) is run shape', 'C-51 (bop keys A, B, AA, SLOW; boundary 3)',
        () => onR(log(), (l) => l.replace(',SLOW:0.0000 ', ' ')), 2, NVS, 'RESULT lane=y:r bop has no SLOW entry (C-51'],
    ['C-51e REPORTED lane equal reps, bop key ab: (lower case) added is run shape', 'C-51 (bop entry with an unknown key)',
        () => onR(log(), (l) => l.replace(',SLOW:0.0000 ', ',SLOW:0.0000,ab:0.0000 ')), 2, NVS, 'RESULT lane=y:r bop entry ab:0.0000 unknown or repeated key (C-51'],
    ['C-51e REPORTED lane reps differ, bop with 6 keys (ABX: added) is run shape', 'C-51 (bop entry with an unknown key; boundary 6)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(',AB:0.0000 ', ',AB:0.0000,ABX:0.0000 ')), 2, NVS, 'RESULT lane=y:r bop entry ABX:0.0000 unknown or repeated key (C-51'],
    ['C-51e REPORTED lane reps differ, bop with 6 keys (A repeated) is run shape', 'C-51 (bop keys once each; boundary 6)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(',AB:0.0000 ', ',AB:0.0000,A:0.0000 ')), 2, NVS, 'RESULT lane=y:r bop entry A:0.0000 unknown or repeated key (C-51'],
    // outcomes stay lane labels on a REPORTED lane (C-51 / C-15): each reads PASS, the lane is NOT-CLEAN in `reported`
    ['C-51 control: REPORTED lane bop A:Infinity (allocBop disturbed window, an ALLOC outcome) reads PASS', 'C-51 + C-15 (ALLOC stays a label)',
        () => onR(log(), (l) => l.replace(' bop=A:0.0000,', ' bop=A:Infinity,')), 0, 'VERDICT PASS gated=1/1', null],
    ['C-51 control: REPORTED lane bop B:0.0200 (ALLOC >= 1/64) reads PASS', 'C-51 + C-15 (ALLOC stays a label)',
        () => onR(log(), (l) => l.replace(',B:0.0000,', ',B:0.0200,')), 0, 'VERDICT PASS gated=1/1', null],
    ['C-55 REPORTED lane bop A:-0.0100 (negative: grammar, allocBop prints >= 0 or Infinity) is run shape', 'C-55 (a negative bop value -> run shape)',
        () => onR(log(), (l) => l.replace(' bop=A:0.0000,', ' bop=A:-0.0100,')), 2, NVS, 'RESULT lane=y:r bop entry A:-0.0100 negative (C-55'],
    ['C-51 control: REPORTED lane REPS-DRIFT (B/AB SLOWER, its wordAB, B/A WITHIN) reads PASS', 'C-51 + C-15 (REPS-DRIFT stays a label)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(' B/AB=1.000[0.990..1.010] wordAB=WITHIN ', ' B/AB=1.500[1.490..1.510] wordAB=SLOWER ')), 0, 'VERDICT PASS gated=1/1', null],
    // C-54 / C-55 (U5c, SPEC A18, TOOL dialect): on EVERY lane the rest of the RESULT line is grammar -- A, B, B/A, B-A, aa,
    // slow as fmtS prints them (NUM_RE[NUM_RE..NUM_RE], B-A with its ns unit; NaN[NaN..NaN] only beside the VOID NAN item of
    // a column that field is computed from), the printed word = the word its B/A reads, win / spin integers, the (gated) /
    // (reported) tag as the spec gates the lane (C-54); a negative bop value (C-55). Run shape. Red on f5c94955 (label only
    // or unchecked: PASS); the controls are green on both. Boundary rows (law 8): B/A exactly 1.050 / 0.950, a negative
    // B-A (NUM_RE minus), bop -0.0000 (not below 0).
    ['C-54a REPORTED lane A=zz is run shape', 'C-54 (A in fmtS grammar)',
        () => onR(log(), (l) => l.replace(' A=1.00[1.00..1.00] ', ' A=zz ')), 2, NVS, 'RESULT lane=y:r A=zz off grammar (C-54'],
    ['C-54a REPORTED lane B=1.00 (no [lo..hi]) is run shape', 'C-54 (B in fmtS grammar)',
        () => onR(log(), (l) => l.replace(' B=1.00[1.00..1.00] ', ' B=1.00 ')), 2, NVS, 'RESULT lane=y:r B=1.00 off grammar (C-54'],
    ['C-54a REPORTED lane B/A q1 Infinity is run shape', 'C-54 (B/A NUM_RE grammar)',
        () => onR(log(), (l) => l.replace(' B/A=1.000[0.990..1.010] ', ' B/A=1.000[Infinity..1.010] ')), 2, NVS, 'RESULT lane=y:r B/A=1.000[Infinity..1.010] off grammar (C-54'],
    ['C-54a REPORTED lane B-A with unit xx instead of ns is run shape', 'C-54 (B-A grammar incl. its ns unit)',
        () => onR(log(), (l) => l.replace(' B-A=0.00[0.00..0.00]ns ', ' B-A=0.00[0.00..0.00]xx ')), 2, NVS, 'RESULT lane=y:r B-A=0.00[0.00..0.00]xx off grammar (C-54'],
    ['C-54a REPORTED lane aa=zz is run shape', 'C-54 (aa NUM_RE grammar)',
        () => onR(log(), (l) => l.replace(' aa=1.000[0.990..1.010] ', ' aa=zz ')), 2, NVS, 'RESULT lane=y:r aa=zz off grammar (C-54'],
    ['C-54a REPORTED lane slow median 2e0 (exponent, not NUM_RE) is run shape', 'C-54 (slow NUM_RE grammar)',
        () => onR(log(), (l) => l.replace(' slow=2.000[', ' slow=2e0[')), 2, NVS, 'RESULT lane=y:r slow=2e0[1.900..2.100] off grammar (C-54'],
    ['C-54 control: REPORTED lane B-A negative -0.50[-0.60..-0.40]ns (NUM_RE minus) reads PASS', 'C-54 (boundary control)',
        () => onR(log(), (l) => l.replace(' B-A=0.00[0.00..0.00]ns ', ' B-A=-0.50[-0.60..-0.40]ns ')), 0, 'VERDICT PASS gated=1/1', null],
    ['C-54b REPORTED lane B/A NaN[NaN..NaN] (word NONE) with no VOID NAN item is run shape', 'C-54 (NaN only as the VOID NAN outcome)',
        () => onR(log(), (l) => l.replace(' B/A=1.000[0.990..1.010] word=WITHIN ', ' B/A=NaN[NaN..NaN] word=NONE ')), 2, NVS, 'RESULT lane=y:r B/A=NaN[NaN..NaN] off grammar (C-54'],
    ['C-54b REPORTED lane aa NaN[NaN..NaN] with VOID=[NAN B] (a column aa does not read) is run shape', 'C-54 (NaN only beside its own VOID NAN)',
        () => onR(log(), (l) => l.replace(' aa=1.000[0.990..1.010] ', ' aa=NaN[NaN..NaN] ') + ' VOID=[NAN B]'), 2, NVS, 'RESULT lane=y:r aa=NaN[NaN..NaN] off grammar (C-54'],
    ['C-54 control: REPORTED lane VOID NAN A outcome (A, B/A, B-A, aa, slow NaN[NaN..NaN], word NONE) reads PASS', 'C-54 + C-15 (VOID NAN stays a label)',
        () => onR(log(), (l) => l.replace(' A=1.00[1.00..1.00] ', ' A=NaN[NaN..NaN] ').replace(' B/A=1.000[0.990..1.010] word=WITHIN B-A=0.00[0.00..0.00]ns aa=1.000[0.990..1.010] slow=2.000[1.900..2.100] ',
            ' B/A=NaN[NaN..NaN] word=NONE B-A=NaN[NaN..NaN]ns aa=NaN[NaN..NaN] slow=NaN[NaN..NaN] ') + ' VOID=[NAN A]'), 0, 'VERDICT PASS gated=1/1', null],
    ['C-54c REPORTED lane printed word=SLOWER over a WITHIN B/A is run shape', 'C-54 (word = the word its B/A reads)',
        () => onR(log(), (l) => l.replace(' word=WITHIN ', ' word=SLOWER ')), 2, NVS, 'RESULT lane=y:r printed word=SLOWER but B/A reads WITHIN (C-54'],
    ['C-54c REPORTED lane B/A median exactly 1.050 (WITHIN) printed SLOWER is run shape', 'C-54 + C-5 (boundary 1.050)',
        () => onR(log(), (l) => l.replace(' B/A=1.000[0.990..1.010] word=WITHIN ', ' B/A=1.050[1.010..1.090] word=SLOWER ')), 2, NVS, 'RESULT lane=y:r printed word=SLOWER but B/A reads WITHIN (C-54'],
    ['C-54c REPORTED lane B/A median exactly 0.950 (WITHIN) printed FASTER is run shape', 'C-54 + C-5 (boundary 0.950)',
        () => onR(log(), (l) => l.replace(' B/A=1.000[0.990..1.010] word=WITHIN ', ' B/A=0.950[0.910..0.990] word=FASTER ')), 2, NVS, 'RESULT lane=y:r printed word=FASTER but B/A reads WITHIN (C-54'],
    ['C-54d REPORTED lane win=64.5 is run shape', 'C-54 (win an integer)',
        () => onR(log(), (l) => l.replace(' win=64 ', ' win=64.5 ')), 2, NVS, 'RESULT lane=y:r win=64.5 not an integer (C-54'],
    ['C-54d REPORTED lane spin=-8 is run shape', 'C-54 (spin a count: digits only)',
        () => onR(log(), (l) => l.replace(' spin=8 ', ' spin=-8 ')), 2, NVS, 'RESULT lane=y:r spin=-8 not an integer (C-54'],
    ['C-54d REPORTED lane spin field absent is run shape', 'C-54 (spin present)',
        () => onR(log(), (l) => l.replace(' spin=8 ', ' ')), 2, NVS, 'RESULT lane=y:r spin=null not an integer (C-54'],
    ['C-54e REPORTED lane tagged (gated) is run shape', 'C-54 (the tag matches the spec)',
        () => onR(log(), (l) => l.replace(' (reported) ', ' (gated) ')), 2, NVS, 'RESULT lane=y:r tag is not (reported) (C-54'],
    ['C-54e REPORTED lane with no tag is run shape', 'C-54 (the tag matches the spec)',
        () => onR(log(), (l) => l.replace(' (reported) ', ' ')), 2, NVS, 'RESULT lane=y:r tag is not (reported) (C-54'],
    ['C-54e GATED lane tagged (reported) is run shape', 'C-54 (the tag matches the spec; gated twin)',
        () => log().map((l) => (l.startsWith('RESULT lane=y:g ') ? l.replace(' (gated) ', ' (reported) ') : l)), 2, NVS, 'RESULT lane=y:g tag is not (gated) (C-54'],
    ['C-55 control: REPORTED lane bop A:-0.0000 (not below 0) reads PASS', 'C-55 (boundary control)',
        () => onR(log(), (l) => l.replace(' bop=A:0.0000,', ' bop=A:-0.0000,')), 0, 'VERDICT PASS gated=1/1', null],
    // C-56 (U5c, SPEC A19, TOOL dialect): on EVERY lane the RESULT line holds exactly runLane's fields A B ns/op B/A word
    // B-A aa slow ab B/AB wordAB bop win reps spin warm, each once, in that order, then at most one VOID=[..] at the end; and
    // every C-54 number is finite. Run shape. Red on f5c94955 (unchecked: PASS); the controls are green on both. Boundary
    // rows (law 8): one field more (17) and one fewer (15); A median of 309 digits (1e308, finite) vs 310 (Infinity).
    ['C-56a REPORTED lane with an unknown field foo=1 is run shape', 'C-56 (exactly the producer fields; boundary 17)',
        () => onR(log(), (l) => l + ' foo=1'), 2, NVS, 'RESULT lane=y:r fields A,B,ns/op,B/A,word,B-A,aa,slow,ab,B/AB,wordAB,bop,win,reps,spin,warm,foo (C-56'],
    ['C-56a REPORTED lane with ns/op missing is run shape', 'C-56 (exactly the producer fields; boundary 15)',
        () => onR(log(), (l) => l.replace(' ns/op ', ' ')), 2, NVS, 'RESULT lane=y:r fields A,B,B/A,word,'],
    ['C-56b REPORTED lane with spin printed twice is run shape', 'C-56 (each field once)',
        () => onR(log(), (l) => l.replace(' spin=8 ', ' spin=8 spin=8 ')), 2, NVS, 'RESULT lane=y:r fields A,B,ns/op,B/A,word,B-A,aa,slow,ab,B/AB,wordAB,bop,win,reps,spin,spin,warm (C-56'],
    ['C-56c REPORTED lane with win and reps swapped is run shape', 'C-56 (in the producer order)',
        () => onR(log(), (l) => l.replace(/ win=(\S+) reps=(\S+) /, ' reps=$2 win=$1 ')), 2, NVS, 'RESULT lane=y:r fields A,B,ns/op,B/A,word,B-A,aa,slow,ab,B/AB,wordAB,bop,reps,win,spin,warm (C-56'],
    ['C-56d REPORTED lane with a VOID tail missing its closing ] is run shape', 'C-56 (one VOID=[..] at the end)',
        () => onR(log(), (l) => l + ' VOID=[GC-WINDOW major 1'), 2, NVS, 'RESULT lane=y:r VOID tail unparsed (C-56'],
    ['C-56 control: REPORTED lane with VOID=[GC-WINDOW major 1] at the end (an outcome label) reads PASS', 'C-56 + C-15 (VOID tail control)',
        () => onR(log(), (l) => l + ' VOID=[GC-WINDOW major 1]'), 0, 'VERDICT PASS gated=1/1', null],
    ['C-56e REPORTED lane A median of 310 digits (NUM_RE, overflows to Infinity) is run shape', 'C-56 (every C-54 number finite)',
        () => onR(log(), (l) => l.replace(' A=1.00[', ' A=1' + '0'.repeat(309) + '[')), 2, NVS, 'RESULT lane=y:r A=1000'],
    ['C-56e REPORTED lane B-A q3 of 310 digits is run shape', 'C-56 (every C-54 number finite)',
        () => onR(log(), (l) => l.replace(' B-A=0.00[0.00..0.00]ns ', ' B-A=0.00[0.00..1' + '0'.repeat(309) + ']ns ')), 2, NVS, 'RESULT lane=y:r B-A=0.00[0.00..1000'],
    ['C-56 control: REPORTED lane A median of 309 digits (1e308, finite) reads PASS', 'C-56 (finite boundary control)',
        () => onR(log(), (l) => l.replace(' A=1.00[', ' A=1' + '0'.repeat(308) + '[')), 0, 'VERDICT PASS gated=1/1', null],
    // U5c review r1 (blocker 1 + gate teeth): ns/op is a bare token (a keyed ns/op=1 is not it); law-8 / branch rows for the
    // C-55 negative boundary, the C-54 word on a NaN B/A, the C-54 whole-triple NaN, the C-56 single VOID tail, and the
    // C-51 Infinity literal (a signed -Infinity is not the allocBop value).
    ['C-56f REPORTED lane with ns/op=1 (keyed, not the bare unit token) is run shape', 'C-56 (the bare unit token ns/op)',
        () => onR(log(), (l) => l.replace(' ns/op ', ' ns/op=1 ')), 2, NVS, '(C-56: the bare unit token'],
    ['C-55 REPORTED lane bop A:-0.0001 (just below 0) is run shape', 'C-55 (negative boundary)',
        () => onR(log(), (l) => l.replace(' bop=A:0.0000,', ' bop=A:-0.0001,')), 2, NVS, 'bop entry A:-0.0001 negative (C-55'],
    ['C-54c REPORTED lane VOID NAN A outcome printed word=WITHIN (B/A NaN reads NONE) is run shape', 'C-54 (word = the word its B/A reads, NONE included)',
        () => onR(log(), (l) => l.replace(' A=1.00[1.00..1.00] ', ' A=NaN[NaN..NaN] ').replace(' B/A=1.000[0.990..1.010] word=WITHIN B-A=0.00[0.00..0.00]ns aa=1.000[0.990..1.010] slow=2.000[1.900..2.100] ',
            ' B/A=NaN[NaN..NaN] word=WITHIN B-A=NaN[NaN..NaN]ns aa=NaN[NaN..NaN] slow=NaN[NaN..NaN] ') + ' VOID=[NAN A]'), 2, NVS, 'printed word=WITHIN but B/A reads NONE (C-54'],
    ['C-54b REPORTED lane A=1.00[NaN..1.00] beside VOID=[NAN A] (a partial NaN, not the whole triple) is run shape', 'C-54 (NaN only as NaN[NaN..NaN])',
        () => onR(log(), (l) => l.replace(' A=1.00[1.00..1.00] ', ' A=1.00[NaN..1.00] ') + ' VOID=[NAN A]'), 2, NVS, 'A=1.00[NaN..1.00] off grammar (C-54'],
    ['C-56d REPORTED lane with two VOID tails is run shape', 'C-56 (one VOID=[..] at the end)',
        () => onR(log(), (l) => l + ' VOID=[GC-WINDOW major 1] VOID=[NAN A]'), 2, NVS, 'VOID tail unparsed (C-56'],
    ['C-51d REPORTED lane bop B:-Infinity (not the allocBop Infinity) is run shape', 'C-51 (a bop entry not a number; only the literal Infinity)',
        () => onR(log(), (l) => l.replace(',B:0.0000,', ',B:-Infinity,')), 2, NVS, 'bop entry B:-Infinity not a number (C-51'],
    // U5b3 review nits / leads: rows that tell the C-47 AB-entry count apart from the C-51 reasons now also on the line
    ['C-47d REPORTED lane equal reps, the AB: entry in the FIRST of two bop fields is run shape (M14)', 'C-47 (no AB entry in any bop field)',
        () => onR(log(), (l) => l.replace(',SLOW:0.0000 ', ',SLOW:0.0000,AB:0.0000 ') + ' bop=A:0.0000'), 2, NVS, 'RESULT lane=y:r bop holds 1 AB: entries with equal reps'],
    ['C-47b REPORTED lane reps differ, the AB: entry renamed ABX: is run shape (M6)', 'C-47 (reps differ: exactly one AB: entry)',
        () => onR(log({ ab: 'y:r' }), (l) => l.replace(',AB:0.0000 ', ',ABX:0.0000 ')), 2, NVS, 'RESULT lane=y:r bop holds 0 AB: entries with reps'],
    // C-48 (U9E): a settle cap hit is VOID TIER-SETTLE, never PASS; on the gated lane it is NO VERDICT (gated lane not clean).
    // Control: the same log with every lane settled=yes and no VOID reads PASS (SETTLE / WINDOW lines are not VOIDs).
    ['C-48 gated lane SETTLE settled=no + VOID=[TIER-SETTLE ..] + its VOID TIER-SETTLE line is NO VERDICT', 'C-48 (cap hit -> VOID TIER-SETTLE, never PASS) + C-15',
        () => settleLog('y:g'), 2, 'VERDICT NO VERDICT (gated lane not clean)', 'y:g VOID(TIER-SETTLE) + VOID-line(TIER-SETTLE)'],
    ['C-48 control: SETTLE settled=yes + WINDOW lines on both lanes, no VOID, reads PASS', 'C-48 (settled lanes) + C-15',
        () => settleLog(null), 0, 'VERDICT PASS gated=1/1', null],
];

test('judge.extra: the table has 117 rows with unique names (8 U7 + 14 C-34 + 6 C-42 + 18 C-47 + 5 C-50 + 6 C-40 + 3 C-41 + 20 C-51 + 21 C-54 + 3 C-55 + 11 C-56 + 2 C-48)', () => {
    assert.equal(ROWS.length, 117);
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

// C-11 + C-14 (U5b retry): an off-grammar reps field is never clean. C-42 turns such a run into run shape, so the
// verdict text no longer shows the per-lane label; the REPORTED line (verdictOf's `reported`) still must not call that
// lane clean. Forged AB:1/4 on the reported lane, every other C-11 field consistent with AB:1 (kills C11h: the C-11
// reps anchor, whose verdict-level row C-42 now subsumes). Control: the same lane with well-formed reps is clean.
test('C-11 + C-14: a REPORTED lane with forged reps A:4,B:1,AB:1/4 is NOT-CLEAN in the REPORTED line (run shape verdict)', () => {
    const v = verdictOf(SPEC(), log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1,AB:1/4' } }));
    assert.equal(v.code, 2, v.text);
    assert.ok(v.text.startsWith(NVS), v.text);
    assert.ok(/ y:r [A-Z]+ \S+ NOT-CLEAN /.test(v.reported), 'reported lane called clean: ' + v.reported);
    const ok = verdictOf(SPEC(), log({ ab: 'y:r' }));
    assert.equal(ok.code, 0, ok.text);
    assert.ok(!ok.reported.includes('NOT-CLEAN'), 'control: well-formed reps read NOT-CLEAN: ' + ok.reported);
});

// C-11 (U5b retry 2): equal reps print ab / B/AB / wordAB as n/a. C-47 turns a violation into run shape, so the verdict
// text no longer shows the per-lane label; the REPORTED line still must name the C-11 reason (kills C11g, whose verdict-level
// row C-47 now subsumes). Control: the same lane with n/a is clean.
test('C-11: a REPORTED lane with equal reps and a B/AB value is NOT-CLEAN in the REPORTED line (run shape verdict)', () => {
    const v = verdictOf(SPEC(), onR(log(), (l) => l.replace(' B/AB=n/a ', ' B/AB=1.000[0.990..1.010] ')));
    assert.equal(v.code, 2, v.text);
    assert.ok(v.text.startsWith(NVS), v.text);
    assert.ok(/ y:r [A-Z]+ \S+ NOT-CLEAN .*B\/AB=1\.000\[0\.990\.\.1\.010\] with equal reps \(want n\/a\)/.test(v.reported), 'reported lane label: ' + v.reported);
    const ok = verdictOf(SPEC(), log());
    assert.equal(ok.code, 0, ok.text);
    assert.ok(!ok.reported.includes('NOT-CLEAN'), 'control: n/a fields read NOT-CLEAN: ' + ok.reported);
});

// C-11 (U5b retry 2): the RESULT reps AB part (AB reps = B reps when reps differ, none when equal). C-50 turns a violation
// into run shape, so the verdict text no longer shows the per-lane label; the REPORTED line still must name the C-11 reason
// (kills C11a / C11f, whose verdict-level rows C-50 now subsumes). Control: well-formed reps are clean.
test('C-11: a REPORTED lane with reps A:4,B:1,AB:4 is NOT-CLEAN "AB reps 4 (want B:1)" in the REPORTED line (run shape verdict)', () => {
    const v = verdictOf(SPEC(), log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1,AB:4' } }));
    assert.equal(v.code, 2, v.text);
    assert.ok(v.text.startsWith(NVS), v.text);
    assert.ok(/ y:r [A-Z]+ \S+ NOT-CLEAN .*AB reps 4 \(want B:1\)/.test(v.reported), 'reported lane label: ' + v.reported);
    const ok = verdictOf(SPEC(), log({ ab: 'y:r' }));
    assert.equal(ok.code, 0, ok.text);
    assert.ok(!ok.reported.includes('NOT-CLEAN'), 'control: AB:1 reads NOT-CLEAN: ' + ok.reported);
});
test('C-11: a REPORTED lane with equal reps A:1,B:1,AB:1 is NOT-CLEAN "AB reps 1 with equal reps" in the REPORTED line (run shape verdict)', () => {
    const v = verdictOf(SPEC(), log({ reps: { 'y:r': 'A:1,B:1,AB:1' } }));
    assert.equal(v.code, 2, v.text);
    assert.ok(v.text.startsWith(NVS), v.text);
    assert.ok(/ y:r [A-Z]+ \S+ NOT-CLEAN .*AB reps 1 with equal reps \(want no AB\)/.test(v.reported), 'reported lane label: ' + v.reported);
    const ok = verdictOf(SPEC(), log());
    assert.equal(ok.code, 0, ok.text);
    assert.ok(!ok.reported.includes('NOT-CLEAN'), 'control: A:1,B:1 reads NOT-CLEAN: ' + ok.reported);
});

// C-11 (U5c, U5b3 review nit M13): the label half rm[3] === undefined (reps differ, no AB part); C-50 makes the verdict
// run shape, so only the REPORTED line shows it.
test('C-11: a REPORTED lane with reps A:4,B:1 (AB part missing) is NOT-CLEAN "AB reps undefined (want B:1)" in the REPORTED line (run shape verdict)', () => {
    const v = verdictOf(SPEC(), log({ ab: 'y:r', reps: { 'y:r': 'A:4,B:1' } }));
    assert.equal(v.code, 2, v.text);
    assert.ok(v.text.startsWith(NVS), v.text);
    assert.ok(/ y:r [A-Z]+ \S+ NOT-CLEAN .*AB reps undefined \(want B:1\)/.test(v.reported), 'reported lane label: ' + v.reported);
    const ok = verdictOf(SPEC(), log({ ab: 'y:r' }));
    assert.equal(ok.code, 0, ok.text);
    assert.ok(!ok.reported.includes('NOT-CLEAN'), 'control: A:4,B:1,AB:1 reads NOT-CLEAN: ' + ok.reported);
});
// C-11 (U5c): C-51 turns a B/AB that is not finite, or a printed wordAB off its B/AB word, into run shape, so the verdict
// text no longer shows the per-lane label; the REPORTED line still must name the C-11 reason (kills C11b / C11c, whose
// verdict-level rows C-51 now subsumes). Control: the well-formed reps-differ lane is clean.
test('C-11: a REPORTED lane with B/AB q3 NaN is NOT-CLEAN "B/AB .. not finite" in the REPORTED line (run shape verdict)', () => {
    const v = verdictOf(SPEC(), onR(log({ ab: 'y:r' }), (l) => l.replace(' B/AB=1.000[0.990..1.010] ', ' B/AB=1.000[0.990..NaN] ')));
    assert.equal(v.code, 2, v.text);
    assert.ok(v.text.startsWith(NVS), v.text);
    assert.ok(/ y:r [A-Z]+ \S+ NOT-CLEAN .*B\/AB 1\.000\[0\.990\.\.NaN\] not finite with reps A:4 != B:1/.test(v.reported), 'reported lane label: ' + v.reported);
    const ok = verdictOf(SPEC(), log({ ab: 'y:r' }));
    assert.equal(ok.code, 0, ok.text);
    assert.ok(!ok.reported.includes('NOT-CLEAN'), 'control: a finite B/AB reads NOT-CLEAN: ' + ok.reported);
});
test('C-11: a REPORTED lane with printed wordAB=SLOWER over a WITHIN B/AB is NOT-CLEAN "printed wordAB=SLOWER" in the REPORTED line (run shape verdict)', () => {
    const v = verdictOf(SPEC(), onR(log({ ab: 'y:r' }), (l) => l.replace(' wordAB=WITHIN ', ' wordAB=SLOWER ')));
    assert.equal(v.code, 2, v.text);
    assert.ok(v.text.startsWith(NVS), v.text);
    assert.ok(/ y:r [A-Z]+ \S+ NOT-CLEAN .*printed wordAB=SLOWER but B\/AB 1\.000\[0\.990\.\.1\.010\] reads WITHIN/.test(v.reported), 'reported lane label: ' + v.reported);
    const ok = verdictOf(SPEC(), log({ ab: 'y:r' }));
    assert.equal(ok.code, 0, ok.text);
    assert.ok(!ok.reported.includes('NOT-CLEAN'), 'control: wordAB=WITHIN reads NOT-CLEAN: ' + ok.reported);
});

// U5c review r1 nit 3: the producer's own grammar on a real tool log. test/fixtures/reproof/1-G.log is a real ABGate run
// (TOOL dialect); judged with a spec read from its own HEADER / RESULT lines it reads PASS with no C-40 .. C-56 reason, so
// a field runLane's print gains (or a grammar check that rejects a real line) turns this red.
test('real log: reproof/1-G.log (a real ABGate run) reads PASS with no C-40 .. C-56 shape reason', () => {
    const ls = readFileSync(fileURLToPath(new URL('./fixtures/reproof/1-G.log', import.meta.url)), 'utf8').split('\n');
    const hd = ls.find((l) => l.startsWith('HEADER rung=')), sl = ls.find((l) => l.startsWith('HEADER spec '));
    const res = ls.filter((l) => l.startsWith('RESULT lane='));
    assert.ok(hd !== undefined && sl !== undefined && res.length > 0, 'fixture has HEADER rung=, HEADER spec and RESULT lines');
    const gated = {};
    for (const l of res) if (l.includes(' (gated) ')) gated[/^RESULT lane=(\S+)/.exec(l)[1]] = / word=(\S+)/.exec(l)[1];
    const sh = / C=\d+ (.*) inject=/.exec(hd);
    const sp = judgeSpec({ laneIds: res.map((l) => /^RESULT lane=(\S+)/.exec(l)[1]), gated, K: Number(/ K=(\d+)/.exec(hd)[1]), C: Number(/ C=(\d+)/.exec(hd)[1]),
        shape: sh === null ? [] : sh[1].split(' ').map((kv) => kv.split('=')), run: /^HEADER rung=(\S+)/.exec(hd)[1], laneSha: / lane-sha256=(\S+)/.exec(sl)[1] });
    const v = verdictOf(sp, ls);
    assert.equal(v.code, 0, v.text);
    assert.ok(!/\(C-(4\d|5[0-6])\b/.test(v.text), 'a C-40 .. C-56 reason on a real line: ' + v.text);
});

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
