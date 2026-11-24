// toy-lane.mjs -- lite-ab-gate test fixture: a tiny lane file in ab-proto's lane-file contract (default export = the spec).
// Kernel: frozen/k.js (pinned by sha256 below), bound to the byte-identical live/k.js. Both paths are RELATIVE: ab-proto
// 74f1a3d4 reads them against the process cwd, and ABGate (C-25) against this file's directory, so every run uses
// cwd = this directory. No absolute path, no import, no node: builtin. ASCII only, zero deps.
// Lanes (declared before any run; never derived from a run):
//   toy:clean     A = kInto, B = kInto (the null lane: identical code)      GATED WITHIN
//   toy:unrolled  A = kInto, B = kUnrolledInto (same record, unrolled x2)   REPORTED
// Data: OPS = 1024 ops, 8 seeded Int32 elements each (xorshift32, full int32 range incl. negatives).
// Oracle: an independent definition per op computed with BigInt modular arithmetic (no code from k.js): the record
// [sum, hash] with sum = the int32 wrap of the exact sum, hash = asIntN(32, (h ^ v) * 16777619) chained over the 8 values.
// In-clock fold (int32, exact): acc = (acc + out[0] + out[1]) | 0; foldOf(rec, off) = (rec[off] + rec[off + 1]) | 0.
// Sizing note: one op costs a few ns, so at n = ops / 2 = 512 even reps = 256 stays far below ab-proto's 5 ms TARGET_MS:
// A's and B's reps both saturate at MAX_REPS = 256, so reps are equal and no AB column is timed (12 live entries).

const K_SHA = '73e13711b12bfcf9db418555f9a53ce226028e0a1f266bddb7ce11b5d436ddd2';
const OPS = 1024;
const PER = 8;
const REC = 2;
const SPIN = 16;           // SLOW spin per kernel entry (several x the ~8-element kernel body)
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
    const r = rng(fnv('toy:x:1024x8'));
    X = new Int32Array(OPS * PER);
    for (let i = 0; i < X.length; i++) X[i] = r() | 0;
    return X;
}
/** The reference: the definition, in BigInt (independent of k.js and of Math.imul). */
function ref(op, out, off) {
    const x = elems();
    let sum = 0n, h = 0n;
    for (let j = 0; j < PER; j++) {
        const v = BigInt(x[op * PER + j]);
        sum += v;
        h = BigInt.asIntN(32, (BigInt.asIntN(32, h ^ v)) * 16777619n);
    }
    out[off] = Number(BigInt.asIntN(32, sum));
    out[off + 1] = Number(h);
}
const foldOf = (rec, off) => (rec[off] + rec[off + 1]) | 0;

const SETUP = 'function setup(d) { return { x: d.x, out: new Float64Array(2) }; }';
const col = (fn) => Object.freeze({
    source: 'k.js',
    anchor: 'function ' + fn + '(x, op, out) {',
    setup: SETUP,
    run: 'function run(st, start, n, reps) { const x = st.x, out = st.out; let acc = 0; const end = start + n; ' +
        'for (let p = 0; p < reps; p++) for (let i = start; i < end; i++) { ' + fn + '(x, i, out); acc = (acc + out[0] + out[1]) | 0; } return acc; }',
    one: 'function one(st, op) { ' + fn + '(st.x, op, st.out); return st.out; }',
});
const CLEAN = col('kInto');
const UNROLLED = col('kUnrolledInto');
// bent-oracle: B's sum step flipped (each text is unique in the transformed k.js)
const CLEAN_BEND = Object.freeze(['s = (s + v) | 0;', 's = (s - v) | 0;']);
const UNROLLED_BEND = Object.freeze(['s = (s + v0 + v1) | 0;', 's = (s + v0 - v1) | 0;']);

function lane(id, A, B, bend) {
    return Object.freeze({
        id, ops: OPS, minWindow: MIN_WINDOW, spin: SPIN, recLen: REC, A, B, bend,
        make() { return { data: { x: elems(), n: OPS }, ref, foldOf }; },
    });
}

export default Object.freeze({
    name: 'lite-ab-gate-toy',
    frozen: [{ name: 'k.js', frozen: 'frozen/k.js', sha256: K_SHA, live: 'live/k.js' }],
    transform: (name, text) => text.replace(/^export /gm, ''),
    gated: Object.freeze({ 'toy:clean': 'WITHIN' }),
    lanes: [
        lane('toy:clean', CLEAN, CLEAN, CLEAN_BEND),
        lane('toy:unrolled', CLEAN, UNROLLED, UNROLLED_BEND),
    ],
});
