// test/settle.test.mjs -- U9E B3 (plan-U9E-v1 TASK 5, ASSERTION A2; SPEC C-48). DETERMINISTIC and untimed: no clock, no
// child process. tierSettle and its two consts are sliced from the ABGate.js source text and evaluated alone (the slice
// may name nothing outside itself: a free reference throws). The expected values are written from the C-48 text (cap 3;
// settled only on a read that is exactly 0 under ===: NaN, negative, positive and every non-number are not settled; -0
// is 0; the Float64Array slot holds the value read, NaN for a non-number), never from the code under test.
// Controls (law 4): the CONTROLS table mutates the sliced text and pins the exact set of rows each mutant turns red;
// every row is red under >= 1 control, and the 4 C-48 mutants of test/mutants.json (=== 0 -> <= 0, !(b > 0), cap 3 -> 4,
// cap 3 -> 2) are 4 of them. Old code (no tierSettle) fails the slice: red.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. ASCII only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = readFileSync(join(ROOT, 'ABGate.js'), 'utf8');
const CAP_HEAD = 'const TIER_SETTLE_CAP = ';
const FN_HEAD = 'function tierSettle(pass) {';
const count = (t, s) => t.split(s).length - 1;

/** -> the source text from `const TIER_SETTLE_CAP = ` through tierSettle's closing brace; throws unless each head is
 *  found exactly once, in that order. */
function settleText(src) {
    assert.equal(count(src, CAP_HEAD), 1, 'const TIER_SETTLE_CAP found ' + count(src, CAP_HEAD) + ' times (want 1)');
    assert.equal(count(src, FN_HEAD), 1, 'function tierSettle found ' + count(src, FN_HEAD) + ' times (want 1)');
    const a = src.indexOf(CAP_HEAD), f = src.indexOf(FN_HEAD), z = src.indexOf('\n}\n', f);
    assert.ok(a < f && z > f, 'TIER_SETTLE_CAP must precede tierSettle, which must close');
    return src.slice(a, z + 2);
}
/** Evaluate a settle slice alone -> { tierSettle, SETTLE_PB, TIER_SETTLE_CAP }. */
const load = (text) => new Function('"use strict";\n' + text + '\nreturn { tierSettle, SETTLE_PB, TIER_SETTLE_CAP };')();

// [id, reads, returns, calls]. A pass beyond the table reads 0, so a 4th pass would settle and show in the return.
// Slots: the first `calls` slots hold each read (a non-number -> NaN), compared with Object.is (NaN, -0).
const ROWS = [
    ['R1 [0]', [0], 1, 1],
    ['R2 [NaN,0]', [NaN, 0], 2, 2],
    ['R3 [-1,0]', [-1, 0], 2, 2],
    ['R4 [+1,0]', [1, 0], 2, 2],
    ['R5 [-0]', [-0], 1, 1],
    ['R6 [7,7,0]', [7, 7, 0], 3, 3],
    ['R7 [7,7,7,0] (pass 4 never runs)', [7, 7, 7, 0], 0, 3],
    ['R8 [NaN,NaN,NaN]', [NaN, NaN, NaN], 0, 3],
    ['R9 [null x3]', [null, null, null], 0, 3],
    ['R10 [false x3]', [false, false, false], 0, 3],
    ["R11 ['' x3]", ['', '', ''], 0, 3],
    ['R12 [[] x3]', [[], [], []], 0, 3],
    ["R13 ['0' x3]", ['0', '0', '0'], 0, 3],
    ['R14 [undefined x3]', [undefined, undefined, undefined], 0, 3],
];
const CONST = 'CONST cap 3, Float64Array(3)';
const SENTINEL = 12345;
const slotOf = (v) => (typeof v === 'number' ? v : NaN);

/** -> the reasons one row breaks A2 under `api` (empty = holds). */
function rowProblems(api, [id, reads, ret, calls]) {
    const bad = [];
    api.SETTLE_PB.fill(SENTINEL);
    const args = [];
    let k = 0;
    const got = api.tierSettle((i) => { args.push(i); const v = k < reads.length ? reads[k] : 0; k++; return v; });
    if (!Object.is(got, ret)) bad.push(id + ': returned ' + String(got) + ' (want ' + ret + ')');
    if (k !== calls) bad.push(id + ': ' + k + ' calls (want ' + calls + ')');
    if (args.join() !== Array.from({ length: k }, (_, i) => i).join()) bad.push(id + ': pass args ' + args.join() + ' (want 0..' + (k - 1) + ')');
    for (let i = 0; i < calls; i++) {
        const want = slotOf(reads[i]), have = api.SETTLE_PB[i];
        if (!Object.is(have, want)) bad.push(id + ': slot ' + i + ' = ' + String(have) + ' (want ' + String(want) + ')');
    }
    return bad;
}
function constProblems(api) {
    const bad = [];
    if (api.TIER_SETTLE_CAP !== 3) bad.push(CONST + ': TIER_SETTLE_CAP ' + api.TIER_SETTLE_CAP);
    if (!(api.SETTLE_PB instanceof Float64Array) || api.SETTLE_PB.length !== 3) bad.push(CONST + ': SETTLE_PB ' + Object.prototype.toString.call(api.SETTLE_PB) + ' length ' + api.SETTLE_PB.length);
    return bad;
}
/** -> the sorted ids of every row (and CONST) red under `api`. */
function redSet(api) {
    const red = ROWS.filter((r) => rowProblems(api, r).length > 0).map((r) => r[0]);
    if (constProblems(api).length > 0) red.push(CONST);
    return red.sort();
}

const TEXT = settleText(SRC);
const API = load(TEXT);

test('A2 slice: tierSettle + TIER_SETTLE_CAP + SETTLE_PB, once each, evaluate alone', () => {
    assert.equal(count(TEXT, 'const SETTLE_PB = '), 1);
    assert.equal(typeof API.tierSettle, 'function');
    assert.deepEqual(constProblems(API), []);
});

for (const r of ROWS) {
    test('A2 row ' + r[0] + ' -> ' + r[2] + ' / ' + r[3] + ' calls, slots hold the reads', () => {
        assert.deepEqual(rowProblems(API, r), []);
    });
}

// [name, find (exactly once in the slice), replace, the rows it must turn red (exactly)]
const NUMS = ['R9 [null x3]', 'R10 [false x3]', "R11 ['' x3]", 'R12 [[] x3]', "R13 ['0' x3]"];
const NONNUM = [...NUMS, 'R14 [undefined x3]'];
const CONTROLS = [
    ['C-48 mutant === 0 -> <= 0', 'if (b === 0)', 'if (b <= 0)', ['R3 [-1,0]', ...NUMS]],
    ['C-48 mutant !(b > 0)', 'if (b === 0)', 'if (!(b > 0))', ['R2 [NaN,0]', 'R3 [-1,0]', 'R8 [NaN,NaN,NaN]', ...NONNUM]],
    ['C-48 mutant cap 3 -> 4', 'const TIER_SETTLE_CAP = 3;', 'const TIER_SETTLE_CAP = 4;', ['R7 [7,7,7,0] (pass 4 never runs)', 'R8 [NaN,NaN,NaN]', ...NONNUM, CONST]],
    ['C-48 mutant cap 3 -> 2', 'const TIER_SETTLE_CAP = 3;', 'const TIER_SETTLE_CAP = 2;', ['R6 [7,7,0]', 'R7 [7,7,7,0] (pass 4 never runs)', 'R8 [NaN,NaN,NaN]', ...NONNUM, CONST]],
    ['-0 is not 0 (Object.is)', 'if (b === 0)', 'if (Object.is(b, 0))', ['R5 [-0]']],
    ['first pass never settles', 'if (b === 0)', 'if (b === 0 && i > 0)', ['R1 [0]', 'R5 [-0]']],
    ['=== 0 -> >= 0', 'if (b === 0)', 'if (b >= 0)', ['R4 [+1,0]', 'R6 [7,7,0]', 'R7 [7,7,7,0] (pass 4 never runs)', ...NUMS]],
    ['slot without the number guard', "typeof b === 'number' ? b : NaN", 'b', NUMS],
    ['slot b ?? 0', "typeof b === 'number' ? b : NaN", 'b ?? 0', NONNUM],
    ['return off by one', 'return i + 1;', 'return i;', ['R1 [0]', 'R2 [NaN,0]', 'R3 [-1,0]', 'R4 [+1,0]', 'R5 [-0]', 'R6 [7,7,0]']],
];

test('A2 controls: each slice mutant turns exactly its pinned rows red; every row is red under >= 1 control', (t) => {
    const covered = new Set();
    for (const [name, find, replace, want] of CONTROLS) {
        assert.equal(count(TEXT, find), 1, name + ': site ' + JSON.stringify(find) + ' found ' + count(TEXT, find) + ' times (want 1)');
        const red = redSet(load(TEXT.replace(find, () => replace)));
        t.diagnostic(name + ': red ' + red.join(' | '));
        assert.deepEqual(red, want.slice().sort(), name);
        for (const id of red) covered.add(id);
    }
    assert.deepEqual([...ROWS.map((r) => r[0]), CONST].filter((id) => !covered.has(id)), [], 'a row no control turns red');
    assert.deepEqual(redSet(API), [], 'the live slice turns no row red');
});

test('A2 control: a source with no tierSettle (old code) fails the slice', () => {
    assert.throws(() => settleText(SRC.replace(TEXT, () => '')), /function tierSettle found 0 times|TIER_SETTLE_CAP found 0 times/);
    assert.throws(() => settleText(SRC.replace(FN_HEAD, () => 'function tierSettleX(pass) {')), /function tierSettle found 0 times/);
    assert.throws(() => load(TEXT.replace('new Float64Array(TIER_SETTLE_CAP)', () => 'new Float64Array(UNDECLARED_CAP)')), ReferenceError);
});
