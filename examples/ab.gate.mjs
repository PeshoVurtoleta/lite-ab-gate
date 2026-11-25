// ab.gate.mjs -- @zakkster/lite-ab-gate example gate file (the default export is the gate spec).
// The package's own .github/workflows/ab.yml runs it (AB_GATE: examples/ab.gate.mjs); a consumer copies it as a
// starting point next to their own frozen kernel file and replaces the kernel, the lanes and the oracle.
// Kernel: ab.kernel.js in this directory, FROZEN only (pinned by sha256, no live binding: the HEADER prints
// 'live not bound (frozen only)'). Paths in `frozen` are relative to THIS file's directory, never absolute (a hosted
// run STOPs HARNESS on an absolute path). The import below is the package's own name: inside this repo it resolves
// through the package self-reference, in a consumer repo through the installed devDependency.
// Lanes (declared before any run; never derived from a run):
//   null    A = kInto, B = kInto       (identical code: the null lane)             GATED WITHIN
//   double  A = kInto, B = kTwiceInto  (same record, 2x the work per op)            GATED SLOWER
// Data: OPS = 4096 ops, 8 seeded Int32 elements each (xorshift32, full int32 range incl. negatives).
// Oracle: an independent definition per op in BigInt modular arithmetic (no code from ab.kernel.js): the record
// [sum, hash] with sum = the int32 wrap of the exact sum, hash = asIntN(32, (h ^ v) * 16777619) chained over the 8 values.
// In-clock fold (int32, exact): acc = (acc + out[0] + out[1]) | 0; foldOf(rec, off) = (rec[off] + rec[off + 1]) | 0.
// ASCII only, zero deps.

import { defineGate } from '@zakkster/lite-ab-gate';

const KERNEL_SHA = '533eb647ba80a35e6aaf0146e5fd058853c6bac38a89281e008ee090c090326e';
const OPS = 4096;
const PER = 8;
const REC = 2;
const SPIN = 32;           // SLOW spin per kernel entry (several x the 8-element kernel body; too small reads VOID SLOW-DEAD)
const MIN_WINDOW = 64;

function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
}
function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}
let X = null;
function elems() {
    if (X !== null) return X;
    const r = rng(fnv('example:x:4096x8'));
    X = new Int32Array(OPS * PER);
    for (let i = 0; i < X.length; i++) X[i] = r() | 0;
    return X;
}
/** The reference: the definition, in BigInt (independent of ab.kernel.js and of Math.imul). */
function ref(op, out, off) {
    const x = elems();
    let sum = 0n, h = 0n;
    for (let j = 0; j < PER; j++) {
        const v = BigInt(x[op * PER + j]);
        sum += v;
        h = BigInt.asIntN(32, BigInt.asIntN(32, h ^ v) * 16777619n);
    }
    out[off] = Number(BigInt.asIntN(32, sum));
    out[off + 1] = Number(h);
}
const foldOf = (rec, off) => (rec[off] + rec[off + 1]) | 0;

const SETUP = 'function setup(d) { return { x: d.x, out: new Float64Array(2) }; }';
const col = (fn) => ({
    source: 'ab.kernel.js',
    anchor: 'function ' + fn + '(x, op, out) {',
    setup: SETUP,
    run: 'function run(st, start, n, reps) { const x = st.x, out = st.out; let acc = 0; const end = start + n; ' +
        'for (let p = 0; p < reps; p++) for (let i = start; i < end; i++) { ' + fn + '(x, i, out); acc = (acc + out[0] + out[1]) | 0; } return acc; }',
    one: 'function one(st, op) { ' + fn + '(st.x, op, st.out); return st.out; }',
});
const ONE = col('kInto');
const TWICE = col('kTwiceInto');
// bent-oracle (selftest): B's sum step flipped; each text occurs exactly once in ab.kernel.js
const ONE_BEND = ['s = (s + v) | 0;', 's = (s - v) | 0;'];
const TWICE_BEND = ['s2 = (w + s2) | 0;', 's2 = (w - s2) | 0;'];

function lane(id, A, B, bend) {
    return {
        id, ops: OPS, minWindow: MIN_WINDOW, spin: SPIN, recLen: REC, A, B, bend,
        make() { return { data: { x: elems(), n: OPS }, ref, foldOf }; },
    };
}

export default defineGate({
    name: 'lite-ab-gate-example',
    frozen: [{ name: 'ab.kernel.js', frozen: 'ab.kernel.js', sha256: KERNEL_SHA }],
    transform: (name, text) => text,
    gated: { null: 'WITHIN', double: 'SLOWER' },
    lanes: [
        lane('null', ONE, ONE, ONE_BEND),
        lane('double', ONE, TWICE, TWICE_BEND),
    ],
});
