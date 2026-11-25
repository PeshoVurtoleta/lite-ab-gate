// frozen-only.gate.mjs -- lite-ab-gate test fixture (J2, plan-GB TASK 7): the minimal gate for the UNTIMED selftest
// (`--selftest-untimed`). Frozen only: no live binding, so the live-drift row is the C-30 n/a row (it passes only with
// this run's HEADER line 'live not bound (frozen only)'). live.gate.mjs is the same gate with a live binding.
// Paths are RELATIVE (C-17 / C-25: resolved against this file's directory). No import, no node: builtin. ASCII only.
// Lanes (declared, never derived from a run):
//   jl:clean  A = sumInto, B = sumInto (the null lane)   GATED WITHIN
//   jl:rep    A = sumInto, B = sumInto                   REPORTED
// Data: 64 ops x 4 seeded int32 elements in [0, 1000) (xorshift32). Oracle: the exact sum of the 4 elements (small
// non-negative integers, so the sum is exact and never wraps); no code from k.js. Fold: foldOf(rec, off) = rec[off] | 0.

const K_SHA = '2a83d8419ea0da02d33c9169a5464d91c6100424db10061382902d83705acb26';
const OPS = 64;
const PER = 4;

let X = null;
function elems() {
    if (X !== null) return X;
    let s = 0x9e3779b9;
    X = new Int32Array(OPS * PER);
    for (let i = 0; i < X.length; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; X[i] = s % 1000; }
    return X;
}
function ref(op, out, off) {
    const x = elems();
    out[off] = x[op * PER] + x[op * PER + 1] + x[op * PER + 2] + x[op * PER + 3];
}
const foldOf = (rec, off) => rec[off] | 0;

const COL = Object.freeze({
    source: 'k.js',
    anchor: 'function sumInto(x, op, out) {',
    setup: 'function setup(d) { return { x: d.x, out: new Float64Array(1) }; }',
    run: 'function run(st, start, n, reps) { const x = st.x, out = st.out; let acc = 0; const end = start + n; ' +
        'for (let p = 0; p < reps; p++) for (let i = start; i < end; i++) { sumInto(x, i, out); acc = (acc + out[0]) | 0; } return acc; }',
    one: 'function one(st, op) { sumInto(st.x, op, st.out); return st.out; }',
});
const BEND = Object.freeze(['s = (s + x[b + j]) | 0;', 's = (s - x[b + j]) | 0;']);
const lane = (id) => Object.freeze({
    id, ops: OPS, minWindow: 8, spin: 8, recLen: 1, A: COL, B: COL, bend: BEND,
    make() { return { data: { x: elems(), n: OPS }, ref, foldOf }; },
});

export default Object.freeze({
    name: 'lite-ab-gate-judge-lane',
    frozen: [{ name: 'k.js', frozen: 'frozen/k.js', sha256: K_SHA }],
    transform: (name, text) => text.replace(/^export /gm, ''),
    gated: Object.freeze({ 'jl:clean': 'WITHIN' }),
    lanes: [lane('jl:clean'), lane('jl:rep')],
});
