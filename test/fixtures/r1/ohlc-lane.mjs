// ohlc-lane.mjs -- timing-ab research burst, rung R1: the LiteOhlc lane file for ab-proto.mjs (default export = the spec).
// Kernels: r1/frozen/Ohlc.js (a600028c, = LiteOhlc 7d33a2f Ohlc.js) and r1/frozen/baseline.mjs (9c875a5e, = LiteOhlc
// bench/baseline.mjs), compiled per copy by the tool with `export ` stripped at line start and NO other edit. Both are bound
// to the live LiteOhlc files (byte-identical, else STOP ANCHOR). LiteOhlc is never imported or written.
// Lanes and GATED words are PROGRESS R1.0's (declared before any run): bounds:1e5:1e3 SLOWER, bounds:1e5:1e5 SLOWER,
// null:1e5:1e3 WITHIN. Data: n = 1e5 CLOSED bars (no live bar) from a seeded rng; prices = integer ticks / 64 (dyadic,
// exact), positive, o / c within [l, h]; volumes integers 1..1000; 1024 seeded window starts per lane with i0 + w - 1 < n.
// Oracle: an independent plain loop over the generated Float64 columns (no code from Ohlc.js or baseline.mjs) -> the
// 9-field boundsInto record [minLow, maxHigh, maxVol, open(i0), close(i1), sumVol, i0, i1, n]. In-clock fold (int32,
// exact): acc = (acc + n + ((minLow * 64) | 0) + ((maxHigh * 64) | 0) + (sumVol | 0)) | 0.
// Research file: ASCII only, zero deps.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE_PKG = '/Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteOhlc';
const OHLC_SHA = 'a600028c4cbba39086f93b21be34c57305e4d4acaec35d9faded8ac46dc275b2';
const BASE_SHA = '9c875a5ecb9bf8ef26436254d72b8d9c2ba9345167bd4c4b7d93d6a567bbe89e';
if (!OHLC_SHA.startsWith('a600028c') || !BASE_SHA.startsWith('9c875a5e')) throw new Error('ohlc-lane: frozen pins changed');

const N = 100000;          // closed bars
const CAP = 131072;        // OhlcSeries capacity (power of two >= N: no eviction, no ring wrap)
const OPS = 1024;          // window starts per lane
const REC = 9;
const SPIN_1E3 = 128;      // SLOW spin per boundsInto call, w = 1e3 lanes (calibrated PRELIMINARY, see the R1 report)
const SPIN_1E5 = 112;      // w = 1e5 lane

// ---------------------------------------------------------------- seeded data (the lane's own rng; xorshift32)
function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
}
function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}
let BARS = null;
/** buf (stride 6: t, o, h, l, c, v) + the oracle's own columns. Ticks: a reflected random walk, price = ticks / 64. */
function bars() {
    if (BARS !== null) return BARS;
    const r = rng(fnv('ohlc:bars:1e5'));
    const buf = new Float64Array(N * 6);
    const lo = new Float64Array(N), hi = new Float64Array(N), vo = new Float64Array(N), op = new Float64Array(N), cl = new Float64Array(N);
    let p = 64000;
    for (let i = 0; i < N; i++) {
        const o = p;
        let c = o + (r() % 129) - 64;
        if (c < 640) c = 1280 - c;
        const h = Math.max(o, c) + (r() % 33);
        const l = Math.max(64, Math.min(o, c) - (r() % 33));
        const v = 1 + (r() % 1000);
        const k = i * 6;
        buf[k] = i; buf[k + 1] = o / 64; buf[k + 2] = h / 64; buf[k + 3] = l / 64; buf[k + 4] = c / 64; buf[k + 5] = v;
        op[i] = o / 64; hi[i] = h / 64; lo[i] = l / 64; cl[i] = c / 64; vo[i] = v;
        if (!(l <= o && o <= h && l <= c && c <= h && l > 0)) throw new Error('ohlc-lane: bar ' + i + ' out of shape');
        p = c;
    }
    BARS = { buf, lo, hi, vo, op, cl };
    return BARS;
}
function starts(w, id) {
    const r = rng(fnv('ohlc:starts:' + id));
    const q = new Int32Array(OPS);
    const span = N - w + 1;
    for (let j = 0; j < OPS; j++) q[j] = r() % span;
    for (let j = 0; j < OPS; j++) if (!(q[j] >= 0 && q[j] + w - 1 < N)) throw new Error('ohlc-lane: start out of range');
    return q;
}
/** The reference: the definition, one plain pass per window over the generated columns. */
function makeRef(w, q) {
    const B = bars();
    return (opi, out, off) => {
        const i0 = q[opi], i1 = i0 + w - 1;
        let mn = Infinity, mx = -Infinity, mv = -Infinity, sv = 0;
        for (let i = i0; i <= i1; i++) {
            if (B.lo[i] < mn) mn = B.lo[i];
            if (B.hi[i] > mx) mx = B.hi[i];
            if (B.vo[i] > mv) mv = B.vo[i];
            sv += B.vo[i];
        }
        out[off] = mn; out[off + 1] = mx; out[off + 2] = mv; out[off + 3] = B.op[i0]; out[off + 4] = B.cl[i1];
        out[off + 5] = sv; out[off + 6] = i0; out[off + 7] = i1; out[off + 8] = w;
    };
}
const foldOf = (rec, off) => (rec[off + 8] + ((rec[off] * 64) | 0) + ((rec[off + 1] * 64) | 0) + (rec[off + 5] | 0)) | 0;

// ---------------------------------------------------------------- columns (source text compiled per copy by the tool)
const FOLD = 'acc = (acc + out[8] + ((out[0] * 64) | 0) + ((out[1] * 64) | 0) + (out[5] | 0)) | 0;';
const OHLC_COL = Object.freeze({
    source: 'Ohlc.js',
    anchor: 'boundsInto(i0, i1, out, off = 0) {',
    setup: 'function setup(d) { const s = new OhlcSeries(d.cap, 1); const b = d.buf; for (let i = 0; i < d.n; i++) { const k = i * 6; ' +
        's.appendBar(b[k], b[k + 1], b[k + 2], b[k + 3], b[k + 4], b[k + 5]); } if (s.count !== d.n || s.hasLive) throw new Error("setup: count " + s.count); ' +
        'return { s, out: new Float64Array(9), q: d.q, w: d.w }; }',
    run: 'function run(st, start, n, reps) { const s = st.s, out = st.out, q = st.q, w1 = st.w - 1; let acc = 0; const end = start + n; ' +
        'for (let p = 0; p < reps; p++) for (let i = start; i < end; i++) { const i0 = q[i]; s.boundsInto(i0, i0 + w1, out, 0); ' + FOLD + ' } return acc; }',
    one: 'function one(st, op) { const i0 = st.q[op]; st.s.boundsInto(i0, i0 + st.w - 1, st.out, 0); return st.out; }',
});
const BASE_COL = Object.freeze({
    source: 'baseline.mjs',
    anchor: 'function baseBoundsInto(bars, i0, i1, out, off) {',
    setup: 'function setup(d) { return { bars: makeBars(d.buf, d.n), out: new Float64Array(9), q: d.q, w: d.w }; }',
    run: 'function run(st, start, n, reps) { const bars = st.bars, out = st.out, q = st.q, w1 = st.w - 1; let acc = 0; const end = start + n; ' +
        'for (let p = 0; p < reps; p++) for (let i = start; i < end; i++) { const i0 = q[i]; baseBoundsInto(bars, i0, i0 + w1, out, 0); ' + FOLD + ' } return acc; }',
    one: 'function one(st, op) { const i0 = st.q[op]; baseBoundsInto(st.bars, i0, i0 + st.w - 1, st.out, 0); return st.out; }',
});
// bent-oracle: baseBoundsInto's min-low comparison flipped (the plain loop's first compare; unique: the decimate twin's
// `l` line is followed by `sm`, not `const h`); the null lane's B: the tree query `_q`, left-edge branch (`const k = l << 2`)
// min-low compare flipped -- the path every closed-bar range walks (a live-bar-only line would never fire here).
const BASE_BEND = Object.freeze(['if (l < mn) mn = l;\n        const h = b.h;', 'if (l > mn) mn = l;\n        const h = b.h;']);
const TREE_BEND = Object.freeze(['const k = l << 2;\n                let x = tr[k]; if (x < mn) mn = x;', 'const k = l << 2;\n                let x = tr[k]; if (x > mn) mn = x;']);

function lane(id, w, A, B, bend, spin, minWindow) {
    return Object.freeze({
        id, ops: OPS, minWindow, spin, recLen: REC, A, B, bend,
        make() {
            const q = starts(w, id);
            return { data: { buf: bars().buf, n: N, cap: CAP, q, w }, ref: makeRef(w, q), foldOf };
        },
    });
}

export default Object.freeze({
    name: 'lite-ohlc-r1',
    frozen: [
        { name: 'Ohlc.js', frozen: join(HERE, 'frozen/Ohlc.js'), sha256: OHLC_SHA, live: join(LIVE_PKG, 'Ohlc.js') },
        { name: 'baseline.mjs', frozen: join(HERE, 'frozen/baseline.mjs'), sha256: BASE_SHA, live: join(LIVE_PKG, 'bench/baseline.mjs') },
    ],
    transform: (name, text) => text.replace(/^export /gm, ''),
    // PROGRESS R1.0 (declared before any run; never derived from a run)
    gated: Object.freeze({ 'bounds:1e5:1e3': 'SLOWER', 'bounds:1e5:1e5': 'SLOWER', 'null:1e5:1e3': 'WITHIN' }),
    lanes: [
        lane('bounds:1e5:1e3', 1000, OHLC_COL, BASE_COL, BASE_BEND, SPIN_1E3, 64),
        lane('bounds:1e5:1e5', 100000, OHLC_COL, BASE_COL, BASE_BEND, SPIN_1E5, 32),
        lane('null:1e5:1e3', 1000, OHLC_COL, OHLC_COL, TREE_BEND, SPIN_1E3, 64),
    ],
});
