// ABGate.js -- @zakkster/lite-ab-gate: the STATISTICAL timing A/B gate for zero-GC kernels.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
//
// Rung E1 (port-base): a port BY LABEL of the proven research prototype ab-proto.mjs (sha256 74f1a3d4, R1 law 11
// APPROVED), itself a package-agnostic port of the audited LiteBisect bench/ab-gate.mjs (sha256 7e0f9262; line numbers
// below are in that file). The method is ported, not redesigned: K = 11 interleaved (counted) rounds, C = 3 fresh
// compilations per column, columns A / B / AA (A twin) / SLOW (A + spin) / AB (A twin at B's reps, when they differ),
// entries shuffled once and rotated (y + x) % N each round, tier checked before / after every round / after, GC window,
// B/op lane, fold check on every timed call, oracle before / after, RESULT + RAW + VOID + HEADER + PROV lines, one verdict
// function (verdictOf) for the live run and `--verdict-file`, injections + failReplay selftest.
// Everything package-specific comes from the GATE FILE (default export = the spec); this file names no package.
// ASCII only, zero deps (node: builtins only), writes no file. Importing this module does nothing: the CLI runs only
// under the isMain guard at the end of the file, the only place that sets process.exitCode.
//
//   FLAGS="--expose-gc --allow-natives-syntax --no-concurrent-recompilation --min-semi-space-size=4 --max-semi-space-size=4 --single-threaded-gc"
//   node $FLAGS ABGate.js <gate-file.mjs> --run ALL               the gate run: every lane, the declared K (default 11) and C (default 3)
//   node $FLAGS ABGate.js <gate-file.mjs> --run <ids> [--K k]     a subset / research run (always NO VERDICT: wrong shape)
//   node $FLAGS ABGate.js <gate-file.mjs> --oracle-only           every lane built: oracle + fold + TF + workFloor, no clock
//   node $FLAGS ABGate.js <gate-file.mjs> --selftest              `SELFTEST all ok` (0) or FAIL (1)
//   node $FLAGS ABGate.js <gate-file.mjs> --selftest-untimed      the untimed rows only (67, no clock; npm test): 0 / 1
//   node        ABGate.js <gate-file.mjs> --verdict-file <log|->  the verdict of a saved log (untimed, no flags)
//   API: runGate(gateFile, { run, K, oracleOnly, out }) -> Promise<0|1|2|3>; defineGate(spec) -> deep-frozen spec;
//        verdictOf(judgeSpec({...}), lines) -> { code, reported, text } (pure).
//
// Exits (as ab-gate :59-64): 0 PASS | 3 FINDING | 2 NO VERDICT | 1 STOP (ORACLE, ANCHOR, CLI, FLAGS, CLASSIFIER, HARNESS)
// or CRASH. `--oracle-only`: 0 = no VOID on a gated lane, 2 = a VOID on a gated lane. `--selftest`: 0 / 1.
// VOID kinds per lane: SLOW-DEAD, AA-DRIFT, REPS-DRIFT, NOT-TF, ALLOC, GC-WINDOW, NAN, plus the lane's workFloor reason.
// Rung E2 (C-23, Q-HOTLOOP (a)): the in-window loop is the TF-forced timedRounds (t0 / t1 in a Float64Array(2) slot),
// armed once per timed run on 5 tool-owned dummy entries; not TF across a window = VOID NOT-TF (tool). Each timed lane
// prints `WINDOW lane=<id> tool-bytes=<n> scavenges=<k>` (new-space bytes allocated in the window, net of the probe).
// R1 fix round (law-11 review r1; maintainer rulings Q-REPS = (a), Q-WARM = (a)): a fifth column AB = A compiled fresh,
// timed at B's reps when they differ from A's; Q-REPS-2 (re-ruled "judge both ratios"): word(B/AB) must equal word(B/A),
// else VOID REPS-DRIFT; ab = AB / A is REPORTED, no band; equal reps print ab, B/AB, wordAB = n/a; K + 1 rounds per window with round 0 discarded from every column (printed on a WARM line); checkArr after every
// phase; HEADER spec carries lane-sha256= and transform= (checked by the judge); gated:{} is STOP HARNESS.
// Words: SLOWER = median > 1.05 and q1 > 1; FASTER = median < 0.95 and q3 < 1; else WITHIN. Ratio = B / A per round.
//
// GATE-FILE CONTRACT (C-13; ab-proto's lane-file contract + K / C (C-4, C-19) and an optional live path (C-25)):
//   spec = { name, frozen: [{ name, frozen, sha256, live? }], transform(name, text) -> kernel text, gated: { id: word },
//            shape?: [[key, value]], lanes: [lane], harnessControls?(rows, stop), K? (integer 11..51), C? (integer 3..9) }
//   frozen / live paths: relative = against the gate file's directory; absolute = local only (STOP HARNESS when
//            GITHUB_ACTIONS=true, C-25 / C-17). No live path = frozen only (the HEADER says so).
//   lane = { id, ops (power of two >= 4), minWindow (1..ops/2), spin, recLen, A: col, B: col, bend: [from, to],
//            make() -> { data, ref(op, out, off), foldOf(rec, off) -> int32 }, workFloor?(start, n) -> reason | null }
//   col  = { source: <frozen name>, anchor: <unique text ending in '{' = the opening of the entry body>,
//            setup: 'function setup(d) {...}' (returns the copy state), run: 'function run(st, start, n, reps) {...}'
//            (int32 fold over ops [start, start + n) x reps), one: 'function one(st, op) {...}' (returns a Float64Array
//            whose first recLen slots are op's record) }

import os from 'node:os';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { GCProfiler, getHeapSpaceStatistics } from 'node:v8';

const ME = fileURLToPath(import.meta.url);
export const REQUIRED_FLAGS = Object.freeze(['--expose-gc', '--allow-natives-syntax', '--no-concurrent-recompilation',
    '--min-semi-space-size=4', '--max-semi-space-size=4', '--single-threaded-gc']);   // ab-gate :100-101
export const K_ROUNDS = 11;       // C-4: the tool's K; a gate may raise it (C-19: integer K_ROUNDS..K_MAX), never lower it
export const C_COPIES = 3;        // C-4: the tool's C; a gate may raise it (C-19: integer C_COPIES..C_MAX), never lower it
const K_MAX = 51;
const C_MAX = 9;
export const EXIT = Object.freeze({ PASS: 0, STOP: 1, NO_VERDICT: 2, FINDING: 3 });
const INJECT_ENV = 'AB_GATE_INJECT';   // the selftest injection env (read per run, never at import)
const TARGET_MS = 5;
const MAX_REPS = 256;
const TF_TRIES = 300;
const SETTLE_TRIES = 4;
const WARM_ROUNDS = 3;
const WARM_N = 1 << 14;          // capped at the lane's ops / 2
const ALLOC_REPS = 4;
const ALLOC_WINDOWS = 5;
export const ALLOC_MAX = 1 / 64;
export const AA_LO = 0.95;
export const AA_HI = 1.05;
export const SLOW_MED = 1.25;
export const SLOW_Q1 = 1.10;
// J2 (C-21, X5): every marker is an anchored, multiline, non-global RegExp over the ONE line the tool prints for that
// failure (site, column and lane named), so it matches only its own rendered message: a bare substring such as
// 'STOP ORACLE' also matched the late-bend / post-bend / arr-bend STOPs, and 'WARM lane=' matched every clean WARM line.
// test/selftest.untimed.test.mjs gates the table (each marker vs every rendered message, + must-fail controls).
const INJECTIONS = Object.freeze({   // ab-gate :142-151, the generic five
    // the bent B entry is caught at its first pre-clock site: the record check after the oracle pass, on a B copy
    'bent-oracle': { want: 1, marker: /^STOP ORACLE: \S+ B#\d+ \(after the oracle pass\) op \d+ field \d+ got \S+ want \S+$/m, verdict: 'VERDICT NO VERDICT (STOP ORACLE)' },
    'boxed': { want: 2, marker: /^VOID ALLOC lane=\S+: ALLOC B \S+ B\/op$/m, verdict: 'VERDICT NO VERDICT' },
    'slow-dead': { want: 2, marker: /^VOID SLOW-DEAD lane=\S+: SLOW-DEAD \S+$/m, verdict: 'VERDICT NO VERDICT' },
    'aa-drift': { want: 2, marker: /^VOID AA-DRIFT lane=\S+: AA-DRIFT \S+$/m, verdict: 'VERDICT NO VERDICT' },
    // untimed (J2): live-drift / frozen-drift flip one byte in loadSources, pre-clock; the four ANCHOR STOPs are distinct
    'live-drift': { want: 1, marker: /^STOP ANCHOR: live-drift \S+ differs from the frozen \S+ at char \d+ \(live \d+ vs frozen \d+ chars\)$/m, verdict: 'VERDICT NO VERDICT (STOP ANCHOR)' },
    'frozen-drift': { want: 1, marker: /^STOP ANCHOR: frozen-sha \S+ sha256 [0-9a-f]{8} \(want [0-9a-f]{8}\)$/m, verdict: 'VERDICT NO VERDICT (STOP ANCHOR)' },
    // fix round R1 (law-11 review r1, blockers 4 / 5 / nits): the in-clock fold and the post-timing reference get a
    // must-fail control each; AB (Q-REPS a) and the discarded warm round 0 (Q-WARM a) get one each; checkArr gets one.
    'late-bend': { want: 1, marker: /^STOP ORACLE: \S+ B#\d+ fold \(timed\): got -?\d+ want -?\d+$/m, verdict: 'VERDICT NO VERDICT (STOP ORACLE)' },
    'post-bend': { want: 1, marker: /^STOP ORACLE: \S+ B#\d+ \(after timing, fresh reference\) op \d+ field \d+ got \S+ want \S+$/m, verdict: 'VERDICT NO VERDICT (STOP ORACLE)' },
    'ab-drift': { want: 2, marker: /^VOID REPS-DRIFT lane=\S+: REPS-DRIFT B\/AB \S+ reads [A-Z]+ but B\/A \S+ reads [A-Z]+ \(AB = A at B's reps \d+ vs A's \d+\)$/m, verdict: 'VERDICT NO VERDICT' },
    // the WARM line whose AA/A is above the A/A band at the printed precision (never 0.xxxx, 1.00xx..1.04xx or 1.0500)
    'warm-skew': { want: 2, marker: /^WARM lane=\S+ round 0 \(discarded, not in any median\) A\/A=\S+ B\/A=\S+ AA\/A=(?!0\.|1\.0[0-4]|1\.0500 )\d+\.\d{4} /m, absent: 'VOID AA-DRIFT', verdict: 'VERDICT NO VERDICT (run shape)', K: 1 },
    'arr-bend': { want: 1, marker: /^STOP ORACLE: \S+ B#\d+ data\.\S+ \(after warm\) differs from the lane data at byte \d+$/m, verdict: 'VERDICT NO VERDICT (STOP ORACLE)' },
    // E2 (C-23): timedRounds deoptimized and pinned out of TF INSIDE the window (TF at its start, not at its end) -> the
    // window runs interpreted (WINDOW reads > 0 tool bytes) and the lane is VOID NOT-TF tool. Not in the selftest list.
    'tool-deopt': { want: 2, marker: /^VOID NOT-TF lane=\S+: NOT-TF tool timedRounds \(TF at window start (?:true|false), end (?:true|false)\)$/m, verdict: 'VERDICT NO VERDICT' },
});
// untimed spec injection (selftest only): the lane file's gated map replaced by {} -> STOP HARNESS in loadSpec
const SPEC_INJECT = 'empty-gated';
const TR_RE = /^[^:,\s]+:(edited|identity)(,[^:,\s]+:(edited|identity))*$/;
const SELFTEST_CASE_MS = 600000;
const AB_DRIFT_X = 64;   // ab-drift only: on bounds:1e5:1e3 (A ~45 ns, B ~2000 ns, SLOW spin ~ +45 ns) AB ~ +2900 ns -> B/AB FASTER
const LANE_ID_RE = /^[A-Za-z0-9:._-]+$/;
const WORDS = Object.freeze(['FASTER', 'SLOWER', 'WITHIN']);

class Stop extends Error { constructor(reason, msg) { super(msg); this.reason = reason; } }
function stop(reason, msg) { throw new Stop(reason, msg); }
/** Every printed line goes to the run's ctx: the log the judge reads, and out.write (default process.stdout). */
function say(ctx, s) { ctx.log.push(s); ctx.out.write(s + '\n'); }
function settle(ms) { return new Promise((res) => { setTimeout(res, ms); }); }
const fmt = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const fmtS = (s, d) => fmt(s.med, d) + '[' + fmt(s.q1, d) + '..' + fmt(s.q3, d) + ']';

// ---------------------------------------------------------------- statistics (ab-gate :183-195, verbatim)
function quant(sorted, p) {
    const n = sorted.length;
    if (!(n > 0) || typeof p !== 'number' || !(p >= 0 && p <= 1)) return NaN;
    if (n === 1) return sorted[0];
    const h = (n - 1) * p, i = Math.floor(h);
    return i + 1 < n ? sorted[i] + (h - i) * (sorted[i + 1] - sorted[i]) : sorted[i];
}
function summarize(arr) {
    const s = Array.from(arr);
    for (let i = 0; i < s.length; i++) if (typeof s[i] !== 'number' || !Number.isFinite(s[i])) return { med: NaN, q1: NaN, q3: NaN };
    s.sort((a, b) => a - b);
    return { med: quant(s, 0.5), q1: quant(s, 0.25), q3: quant(s, 0.75) };
}
// ab-gate :198-217
const aaOk = (s) => s.med >= AA_LO && s.med <= AA_HI;
const slowOk = (s) => s.med > SLOW_MED && s.q1 > SLOW_Q1;
function word(s) {
    if (!Number.isFinite(s.med)) return 'NONE';
    if (s.med > AA_HI && s.q1 > 1) return 'SLOWER';
    if (s.med < AA_LO && s.q3 < 1) return 'FASTER';
    return 'WITHIN';
}
function ratioVec(a, b) {
    if (!a || !b || !(a.length > 0) || a.length !== b.length) return [NaN];
    const v = new Array(a.length);
    for (let i = 0; i < a.length; i++) v[i] = a[i] / b[i];
    return v;
}
function diffVec(a, b) {
    if (!a || !b || !(a.length > 0) || a.length !== b.length) return [NaN];
    const v = new Array(a.length);
    for (let i = 0; i < a.length; i++) v[i] = a[i] - b[i];
    return v;
}

// ---------------------------------------------------------------- kernel text (ab-gate :220-288, generic anchors)
function uniqueAt(text, needle, what) {
    const i = text.indexOf(needle);
    if (i < 0 || text.indexOf(needle, i + 1) >= 0) stop('ANCHOR', what + ': ' + JSON.stringify(needle) + ' not unique');
    return i;
}
/** C-21: `what` is 'frozen' or 'live'; the STOP names `shown` (the path as the gate file declared it). */
function readOrStop(path, shown, what) {
    try { return readFileSync(path); } catch (e) { return stop('ANCHOR', what + '-unreadable ' + shown + ' (' + (e.code || e.message) + ')'); }
}
function sub1(name, text, from, to) {
    const i = uniqueAt(text, from, name);
    return text.slice(0, i) + to + text.slice(i + from.length);
}
/** Insert `code` right after the lane-declared anchor (it ends with the `{` that opens the entry body). Works for a
 *  `function f(...) {` head and for a class method head alike (S-3 / S-8). */
function atAnchor(text, anchor, code, what) {
    const i = uniqueAt(text, anchor, what);
    const j = i + anchor.length;
    return text.slice(0, j) + ' ' + code + text.slice(j);
}
// globalThis.__labSpin / __labBox / __labBoxN / __labLate / __labWarm are created lazily in armNatives (never at import).
const spinned = (text, anchor, iters) => atAnchor(text, anchor, 'const __s = globalThis.__labSpin; for (let __i = 0; __i < ' + iters +
    '; __i++) { __s[__i & 255] = (__s[(__i + 1) & 255] + __i) | 0; }', 'spin anchor');
// selftest `boxed` (S-9: no parameter names): a fractional double (k + 0.5, never integral) stored into a PACKED_ELEMENTS
// array escapes as a HeapNumber on every entry call; the index is a module counter.
const boxed = (text, anchor) => atAnchor(text, anchor, 'const __b = globalThis.__labBox, __c = globalThis.__labBoxN; __c[0] = (__c[0] + 1) | 0; ' +
    '__b[__c[0] & 255] = (__c[0] & 1023) + 0.5;', 'boxed anchor');
// late-bend / post-bend: B returns early (out keeps the previous record: a bent result) once __labLate[0] is set; the
// guard is compiled into B ONLY in those injection children. warm-skew: AA spins while __labWarm[0] is set (round 0).
const lateGuard = (text, anchor) => atAnchor(text, anchor, 'if (globalThis.__labLate[0] !== 0) return;', 'late-bend anchor');
const warmSpun = (text, anchor, iters) => atAnchor(text, anchor, 'if (globalThis.__labWarm[0] !== 0) { const __s = globalThis.__labSpin; for (let __i = 0; __i < ' + iters +
    '; __i++) { __s[__i & 255] = (__s[(__i + 1) & 255] + __i) | 0; } }', 'warm-skew anchor');

// ---------------------------------------------------------------- natives + TF check (ab-gate :290-302)
const TF_BIT = 32;
let optStatus = null, forceOpt = null;
function armNatives() {
    for (const f of REQUIRED_FLAGS) if (!process.execArgv.includes(f)) stop('FLAGS', 'needs ' + f + ' (got ' + process.execArgv.join(' ') + ')');
    // the injection cells, created on the first run (never at import); the two flags start at 0 on every run
    if (globalThis.__labSpin === undefined) globalThis.__labSpin = new Int32Array(256);
    if (globalThis.__labBox === undefined) globalThis.__labBox = new Array(256).fill(null);
    if (globalThis.__labBoxN === undefined) globalThis.__labBoxN = new Int32Array(1);
    if (globalThis.__labLate === undefined) globalThis.__labLate = new Int32Array(1);
    if (globalThis.__labWarm === undefined) globalThis.__labWarm = new Int32Array(1);
    globalThis.__labLate[0] = 0;
    globalThis.__labWarm[0] = 0;
    optStatus = new Function('f', 'return %GetOptimizationStatus(f);');
    forceOpt = new Function('f', '%PrepareFunctionForOptimization(f); %OptimizeFunctionOnNextCall(f);');
    const forceTf = new Function('f', '%PrepareFunctionForOptimization(f); f(1); f(2); %OptimizeFunctionOnNextCall(f); f(3);');
    const pTf = new Function('x', 'return (x * 3 + 1) | 0;');
    const pIn = new Function('x', 'return (x * 7 + 1) | 0;');
    forceTf(pTf); pIn(1);
    if ((optStatus(pTf) & TF_BIT) === 0 || (optStatus(pIn) & TF_BIT) !== 0) stop('CLASSIFIER', 'TF_BIT self-check failed');
}

// ---------------------------------------------------------------- GC window, B/op (ab-gate :304-351)
const notMinor = (s) => s.gcType !== 'Scavenge' && s.gcType !== 'MinorMarkSweep';
async function gcWindow(fn) {
    globalThis.gc();
    await settle(50);
    const p = new GCProfiler();
    p.start();
    fn();
    await settle(50);
    const st = p.stop().statistics;
    return { major: st.filter(notMinor).length, all: st.length };
}
async function gcControl(ctx) {
    const clean = await gcWindow(() => {});
    const forced = await gcWindow(() => { globalThis.gc(); });
    if (clean.major !== 0 || forced.major < 1) stop('CLASSIFIER', 'gc window: empty ' + clean.major + ' / forced ' + forced.major);
    say(ctx, 'CONTROL gc-window: empty clean; forced gc flips major (' + forced.major + ') -- ok');
}
function newSpaceUsed() {
    for (const s of getHeapSpaceStatistics()) if (s.space_name === 'new_space') return s.space_used_size;
    return -1;
}
// The window is the column's own timed window (ops [0, n) x its reps), not ab-gate's fixed ALLOC_N = 16384 ops: a lane's
// op domain may be smaller than ALLOC_N, and a slow column (a linear baseline) cannot afford 16384 x 6 x 5 ops.
function allocWindow(e, n, reps) {
    let min = -1, valid = 0;
    for (let w = 0; w < ALLOC_WINDOWS; w++) {
        globalThis.gc({ type: 'minor' });
        const gp = new GCProfiler();
        gp.start();
        const s0 = newSpaceUsed();
        e.run(e.state, 0, n, reps);
        const s1 = newSpaceUsed();
        const gcs = gp.stop().statistics.length;
        if (s0 < 0 || s1 < 0 || gcs !== 0 || w === 0) continue;
        valid++;
        if (min < 0 || s1 - s0 < min) min = s1 - s0;
    }
    return valid >= (ALLOC_WINDOWS >>> 1) ? min : null;
}
function allocBop(e, n) {
    forceOpt(e.run);
    e.run(e.state, 0, n, 1);
    e.run(e.state, 0, n, 1);
    allocWindow(e, n, e.reps);
    const b1 = allocWindow(e, n, e.reps);
    const bN = allocWindow(e, n, ALLOC_REPS * e.reps);
    if (b1 === null || bN === null) return Infinity;
    return Math.max(0, bN - b1) / ((ALLOC_REPS - 1) * n * e.reps);
}

// ---------------------------------------------------------------- spec (the gate file) -> validated, fail closed
// The per-run state (ab-proto's SPEC / JSPEC / LOG / LANE_FILE / LANE_SHA / TRANSFORMED module globals) lives in one ctx
// per runGate / CLI call, so two runs in one process share nothing. transformed = per frozen file 'name:edited|identity'
// (did spec.transform change the text), printed on HEADER spec.
function newCtx(out) {
    return { spec: null, jspec: null, log: [], transformed: [], laneFile: null, laneSha: null, out };
}
const SPEC_KEYS = ['name', 'frozen', 'transform', 'gated', 'shape', 'lanes', 'harnessControls', 'K', 'C'];
const LANE_KEYS = ['id', 'ops', 'minWindow', 'spin', 'recLen', 'A', 'B', 'bend', 'make', 'workFloor'];
const COL_KEYS = ['source', 'anchor', 'setup', 'run', 'one'];
function didYouMean(k, keys) {
    let best = null, bd = Infinity;
    for (const c of keys) {
        const a = k.toLowerCase(), b = c.toLowerCase();
        const d = Array.from({ length: b.length + 1 }, (_, j) => j);
        for (let i = 1; i <= a.length; i++) {
            let prev = d[0]; d[0] = i;
            for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
        }
        if (d[b.length] < bd) { bd = d[b.length]; best = c; }
    }
    return bd <= 3 ? ' (did you mean ' + best + '?)' : '';
}
function keysOk(o, keys, what) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) stop('HARNESS', 'spec: ' + what + ' must be a plain object');
    for (const k of Object.keys(o)) if (!keys.includes(k)) stop('HARNESS', 'spec: unknown key ' + what + '.' + k + didYouMean(k, keys));
}
const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
function checkCol(c, what, frozenNames) {
    keysOk(c, COL_KEYS, what);
    if (!frozenNames.includes(c.source)) stop('HARNESS', 'spec: ' + what + '.source ' + c.source + ' is not a frozen name (' + frozenNames.join(', ') + ')');
    if (typeof c.anchor !== 'string' || !c.anchor.endsWith('{')) stop('HARNESS', 'spec: ' + what + '.anchor must be a string ending in "{"');
    for (const [k, head] of [['setup', 'function setup('], ['run', 'function run('], ['one', 'function one(']]) {
        if (typeof c[k] !== 'string' || !c[k].startsWith(head)) stop('HARNESS', 'spec: ' + what + '.' + k + ' must be source text starting ' + JSON.stringify(head));
    }
}
/** A snapshot of `v`: arrays and other objects copied (own enumerable string keys, in order; a shared or cyclic reference
 *  stays shared in the copy), functions and primitives kept by reference. Validation and the run read only the copy. */
function copyDeep(v, memo, plain) {
    if (v === null || typeof v !== 'object') return v;
    const seen = memo.get(v);
    if (seen !== undefined) return seen;
    if (Array.isArray(v)) {
        const a = new Array(v.length);
        memo.set(v, a);
        for (let i = 0; i < v.length; i++) a[i] = copyDeep(v[i], memo, plain);
        return a;
    }
    if (plain) { const pr = Object.getPrototypeOf(v); if ((pr !== Object.prototype && pr !== null) || Object.getOwnPropertySymbols(v).length !== 0) stop('HARNESS', 'spec: every object in a gate spec must be a plain object (no class instance, prototype or Symbol keys)'); }
    const o = {};
    memo.set(v, o);
    for (const k of Object.keys(v)) Object.defineProperty(o, k, { value: copyDeep(v[k], memo, plain), enumerable: true, writable: true, configurable: true });
    return o;
}
/** Freeze every array / object reachable from a copyDeep result (functions are the gate's own: never frozen). */
function freezeDeep(v, seen) {
    if (v === null || typeof v !== 'object' || seen.has(v)) return v;
    seen.add(v);
    for (const k of Object.keys(v)) freezeDeep(v[k], seen);
    return Object.freeze(v);
}
/** The gate-file contract check (ab-proto loadSpec :264-306, messages verbatim) + K / C (C-4, C-19) + optional live (C-25)
 *  + the exact empty-gated text (C-14). Throws Stop('HARNESS', ...) on the first violation. */
function checkSpec(s) {
    keysOk(s, SPEC_KEYS, 'spec');
    if (typeof s.name !== 'string' || !LANE_ID_RE.test(s.name)) stop('HARNESS', 'spec: name');
    if (!Array.isArray(s.frozen) || s.frozen.length === 0) stop('HARNESS', 'spec: frozen must be a non-empty array (the frozen-vs-live binding)');
    for (const f of s.frozen) {
        keysOk(f, ['name', 'frozen', 'sha256', 'live'], 'frozen[]');
        if (typeof f.name !== 'string' || typeof f.frozen !== 'string' || (f.live !== undefined && typeof f.live !== 'string') || !/^[0-9a-f]{64}$/.test(f.sha256)) stop('HARNESS', 'spec: frozen ' + f.name + ' needs name, frozen, live paths and a full sha256');
    }
    const fnames = s.frozen.map((f) => f.name);
    if (typeof s.transform !== 'function') stop('HARNESS', 'spec: transform(name, text) is required');
    if (!Array.isArray(s.lanes) || s.lanes.length === 0) stop('HARNESS', 'spec: lanes must be a non-empty array');
    const ids = [];
    for (const l of s.lanes) {
        keysOk(l, LANE_KEYS, 'lane');
        if (typeof l.id !== 'string' || !LANE_ID_RE.test(l.id) || ids.includes(l.id)) stop('HARNESS', 'spec: lane id ' + l.id + ' bad or duplicated');
        ids.push(l.id);
        if (!isInt(l.ops) || l.ops < 4 || (l.ops & (l.ops - 1)) !== 0 || l.ops > (1 << 24)) stop('HARNESS', 'spec: ' + l.id + '.ops must be a power of two in [4, 2^24]');
        if (!isInt(l.minWindow) || l.minWindow < 1 || l.minWindow > (l.ops >>> 1)) stop('HARNESS', 'spec: ' + l.id + '.minWindow must be an integer in [1, ops / 2]');
        if (!isInt(l.spin) || l.spin < 1) stop('HARNESS', 'spec: ' + l.id + '.spin must be a positive integer');
        if (!isInt(l.recLen) || l.recLen < 1) stop('HARNESS', 'spec: ' + l.id + '.recLen must be a positive integer');
        if (typeof l.make !== 'function') stop('HARNESS', 'spec: ' + l.id + '.make is required');
        if (l.workFloor !== undefined && typeof l.workFloor !== 'function') stop('HARNESS', 'spec: ' + l.id + '.workFloor must be a function');
        if (!Array.isArray(l.bend) || l.bend.length !== 2 || typeof l.bend[0] !== 'string' || typeof l.bend[1] !== 'string' || l.bend[0] === l.bend[1]) stop('HARNESS', 'spec: ' + l.id + '.bend must be [from, to], two different strings (fail closed: every B entry declares a bend)');
        checkCol(l.A, l.id + '.A', fnames);
        checkCol(l.B, l.id + '.B', fnames);
    }
    keysOk(s.gated, ids, 'gated');
    for (const id of Object.keys(s.gated)) if (!WORDS.includes(s.gated[id])) stop('HARNESS', 'spec: gated ' + id + ' word ' + s.gated[id]);
    if (Object.keys(s.gated).length === 0) stop('HARNESS', 'spec: gated must name at least one lane');
    const extra = s.shape === undefined ? [] : s.shape;
    if (!Array.isArray(extra)) stop('HARNESS', 'spec: shape must be an array of [key, value]');
    for (const kv of extra) if (!Array.isArray(kv) || kv.length !== 2 || !/^[A-Za-z][A-Za-z0-9]*$/.test(kv[0]) || !/^\S+$/.test(kv[1]) || ['ops', 'minWindow', 'K', 'C', 'inject'].includes(kv[0])) stop('HARNESS', 'spec: bad shape entry ' + JSON.stringify(kv));
    if (s.harnessControls !== undefined && typeof s.harnessControls !== 'function') stop('HARNESS', 'spec: harnessControls must be a function');
    if (s.K !== undefined && (!isInt(s.K) || s.K < K_ROUNDS || s.K > K_MAX)) stop('HARNESS', 'spec: K must be an integer in [' + K_ROUNDS + ', ' + K_MAX + '] (C-4: a gate may raise K, never lower it)');
    if (s.C !== undefined && (!isInt(s.C) || s.C < C_COPIES || s.C > C_MAX)) stop('HARNESS', 'spec: C must be an integer in [' + C_COPIES + ', ' + C_MAX + '] (C-4: a gate may raise C, never lower it)');
}
/** defineGate(spec) -> a validated, deep-frozen copy of the gate spec (plain objects / arrays copied and frozen, functions
 *  kept by reference). Invalid -> throws an Error whose .reason === 'HARNESS'. */
export function defineGate(spec) {
    const s = copyDeep(spec, new Map(), true);
    checkSpec(s);
    return freezeDeep(s, new Set());
}
/** Import the gate file and re-validate its default export (a defineGate result or a plain object alike). */
async function loadSpec(ctx, file, inject) {
    ctx.laneFile = resolve(file);
    let laneBuf;
    try { laneBuf = readFileSync(ctx.laneFile); } catch (e) { stop('CLI', 'lane file ' + ctx.laneFile + ' unreadable (' + (e.code || e.message) + ')'); }
    ctx.laneSha = createHash('sha256').update(laneBuf).digest('hex');
    const mod = await import(pathToFileURL(ctx.laneFile).href + '?sha256=' + ctx.laneSha);
    const s = defineGate(inject === SPEC_INJECT && mod.default !== null && typeof mod.default === 'object' ? { ...mod.default, gated: {} } : mod.default);
    const ids = s.lanes.map((l) => l.id);
    const extra = s.shape === undefined ? [] : s.shape;
    // S-2: the HEADER shape = per-lane ops and minWindow (lane order), then the spec's own fields
    const shape = [['ops', s.lanes.map((l) => l.ops).join(',')], ['minWindow', s.lanes.map((l) => l.minWindow).join(',')], ...extra.map((kv) => [kv[0], kv[1]])];
    ctx.spec = s;
    // C-4 / C-19: the judge checks the DECLARED K and C (default K_ROUNDS / C_COPIES); any other --K is a shape mismatch
    try { ctx.jspec = judgeSpec({ laneIds: ids, gated: s.gated, K: s.K === undefined ? K_ROUNDS : s.K, C: s.C === undefined ? C_COPIES : s.C, shape, run: 'ALL', laneSha: ctx.laneSha }); } catch (e) { stop('HARNESS', 'spec: ' + e.message); }
}
const isGated = (ctx, id) => Object.hasOwn(ctx.spec.gated, id);
const gateTag = (ctx, id) => (isGated(ctx, id) ? ' (gated)' : ' (reported)');

/** S-3 / AB-G2 (ab-gate :243-263, whole-file form): each frozen file's sha256 must equal its pin, and a bound live file must
 *  be byte-identical to it (else STOP ANCHOR, four distinct texts: C-21). `live-drift` flips one byte of the FIRST bound
 *  live text in memory first; `frozen-drift` (J2) flips one byte of the FIRST frozen file's bytes as read, before its
 *  sha256 (-> the frozen-sha STOP). Both are pre-clock: the run stops here, before any HEADER rung= line. Paths (C-25): relative = against the gate file's directory; an absolute path is STOP HARNESS
 *  when GITHUB_ACTIONS=true (C-17), checked for every path before any file is read. */
function loadSources(ctx, inject) {
    const base = dirname(ctx.laneFile);
    if (process.env.GITHUB_ACTIONS === 'true') {
        for (const f of ctx.spec.frozen) {
            for (const p of f.live === undefined ? [f.frozen] : [f.frozen, f.live]) {
                if (isAbsolute(p)) stop('HARNESS', 'spec: frozen ' + f.name + ' path ' + p + ' is absolute; a hosted run (GITHUB_ACTIONS=true) takes only paths relative to the gate file (C-25)');
            }
        }
    }
    const src = {};
    let first = true;
    for (const f of ctx.spec.frozen) {
        const buf = readOrStop(resolve(base, f.frozen), f.frozen, 'frozen');
        if (inject === 'frozen-drift' && f === ctx.spec.frozen[0]) {
            if (buf.length === 0) stop('HARNESS', 'frozen-drift: ' + f.frozen + ' is empty, no byte to flip');
            buf[buf.length >>> 1] ^= 1;
        }
        const sha = createHash('sha256').update(buf).digest('hex');
        if (sha !== f.sha256) stop('ANCHOR', 'frozen-sha ' + f.frozen + ' sha256 ' + sha.slice(0, 8) + ' (want ' + f.sha256.slice(0, 8) + ')');
        const ftext = buf.toString('utf8');
        if (f.live !== undefined) {
            let ltext = readOrStop(resolve(base, f.live), f.live, 'live').toString('utf8');
            if (inject === 'live-drift' && first) { const k = ltext.length >>> 1; ltext = ltext.slice(0, k) + String.fromCharCode(ltext.charCodeAt(k) ^ 1) + ltext.slice(k + 1); }
            first = false;
            if (ftext !== ltext) {
                let i = 0;
                while (i < ftext.length && i < ltext.length && ftext.charCodeAt(i) === ltext.charCodeAt(i)) i++;
                stop('ANCHOR', 'live-drift ' + f.live + ' differs from the frozen ' + f.frozen + ' at char ' + i + ' (live ' + ltext.length + ' vs frozen ' + ftext.length + ' chars)');
            }
        }
        const t = ctx.spec.transform(f.name, ftext);
        if (typeof t !== 'string') stop('HARNESS', 'spec.transform(' + f.name + ') did not return text');
        if (/[:,\s]/.test(f.name)) stop('HARNESS', 'spec: frozen name ' + JSON.stringify(f.name) + ' must have no ":", "," or space (HEADER transform= field)');
        ctx.transformed.push(f.name + ':' + (t === ftext ? 'identity' : 'edited'));
        src[f.name] = t;
    }
    return src;
}

// ---------------------------------------------------------------- lane runtime: data, oracle records, per-op fold
/** lane.make() once per run (ab-gate's spec.mk()); the reference records for every op, the per-op int32 fold from them. */
function buildLane(l) {
    const m = l.make();
    if (m === null || typeof m !== 'object' || typeof m.ref !== 'function' || typeof m.foldOf !== 'function' || m.data === null || typeof m.data !== 'object') stop('HARNESS', l.id + ': make() must return { data, ref, foldOf }');
    const L = { id: l.id, spec: l, ops: l.ops, NQ: l.ops >>> 1, minWindow: l.minWindow, spin: l.spin, recLen: l.recLen, data: m.data, ref: m.ref, foldOf: m.foldOf, expect: null, fold: null };
    L.expect = refAll(L);
    L.fold = new Int32Array(L.ops);
    for (let op = 0; op < L.ops; op++) {
        const f = L.foldOf(L.expect, op * L.recLen);
        if (!isInt(f) || f !== (f | 0)) stop('HARNESS', l.id + ': foldOf(op ' + op + ') = ' + f + ' is not an int32');
        L.fold[op] = f;
    }
    return L;
}
function refAll(L) {
    const ex = new Float64Array(L.ops * L.recLen);
    for (let op = 0; op < L.ops; op++) L.ref(op, ex, op * L.recLen);
    return ex;
}
/** Per copy: every typed array of lane.data copied, scalars kept; anything else is HARNESS (never shared state). */
function copyData(d) {
    const out = {};
    for (const k of Object.keys(d)) {
        const v = d[k];
        if (ArrayBuffer.isView(v)) out[k] = v.slice();
        else if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
        else stop('HARNESS', 'lane data.' + k + ': only typed arrays and scalars are copied per copy');
    }
    return out;
}

// ---------------------------------------------------------------- columns: fresh `new Function` per copy (ab-gate :518-563)
function makeCols(L, inject, SRC) {
    const ls = L.spec;
    const a = SRC[ls.A.source];
    let b = SRC[ls.B.source];
    uniqueAt(a, ls.A.anchor, L.id + ' A anchor');
    uniqueAt(b, ls.B.anchor, L.id + ' B anchor');
    if (inject === 'bent-oracle') b = sub1('bent-oracle ' + L.id, b, ls.bend[0], ls.bend[1]);
    if (inject === 'boxed') b = boxed(b, ls.B.anchor);
    if (inject === 'late-bend' || inject === 'post-bend') b = lateGuard(b, ls.B.anchor);
    const aa = inject === 'aa-drift' ? spinned(a, ls.A.anchor, L.spin) : inject === 'warm-skew' ? warmSpun(a, ls.A.anchor, 2 * L.spin) : a;
    return [
        { id: 'A', def: ls.A, text: a },
        { id: 'B', def: ls.B, text: b },
        { id: 'AA', def: ls.A, text: aa },
        { id: 'SLOW', def: ls.A, text: inject === 'slow-dead' ? a : spinned(a, ls.A.anchor, L.spin) },
        // Q-REPS (a): A compiled fresh (own nonce, like AA), timed at B's reps; kept only when B's reps differ from A's
        // ab-drift (Q-REPS-2): AB spun AB_DRIFT_X x the lane spin, so B/AB's word differs from B/A's (REPS-DRIFT by disagreement)
        { id: 'AB', def: ls.A, text: inject === 'ab-drift' ? spinned(a, ls.A.anchor, AB_DRIFT_X * L.spin) : a },
    ];
}
let NONCE = 0;   // module-wide on purpose: never reset, so no two compilations in one process share source text
/** "use strict" + a nonce comment (defeats the eval cache: T-d) + the column's kernel text + setup + run + one. setup runs
 *  INSIDE this scope, so a class kernel's instances are built from this copy's own class. */
function compileColumn(col, tag) {
    const src = '"use strict"; // ab-gate #' + (NONCE++) + ' ' + tag + '\n' + col.text + '\n' + col.def.setup + '\n' + col.def.run + '\n' + col.def.one + '\nreturn { setup, run, one };';
    return new Function(src)();
}
function buildEntry(col, copy, L) {
    const f = compileColumn(col, L.id + ' ' + col.id + '#' + copy);
    const data = copyData(L.data);
    const state = f.setup(data);
    return { col: col.id, copy, run: f.run, one: f.one, state, data, ns: null, reps: 1, wants: null };
}
/** ab-gate :597-604 checkArr, generic: every typed array of the copy's data (the object its setup received) equals the
 *  lane's data byte for byte, every scalar is unchanged; else STOP ORACLE. Returns the elements compared. */
function checkArr(e, L, where) {
    let n = 0;
    for (const k of Object.keys(L.data)) {
        const want = L.data[k], got = e.data[k];
        const at = L.id + ' ' + e.col + '#' + e.copy + ' data.' + k + ' (' + where + ') differs from the lane data';
        if (!ArrayBuffer.isView(want)) { if (got !== want) stop('ORACLE', at + ' (scalar ' + got + ' vs ' + want + ')'); continue; }
        if (!ArrayBuffer.isView(got) || got.byteLength !== want.byteLength) stop('ORACLE', at + ' (not a typed array of ' + want.byteLength + ' bytes)');
        const g8 = new Uint8Array(got.buffer, got.byteOffset, got.byteLength), w8 = new Uint8Array(want.buffer, want.byteOffset, want.byteLength);
        for (let i = 0; i < w8.length; i++) if (g8[i] !== w8[i]) stop('ORACLE', at + ' at byte ' + i);
        n += want.length;
    }
    return n;
}
/** arr-bend: one byte of B#0's first data typed array flipped behind the oracle's back (after warm). */
function bendArr(e) {
    for (const k of Object.keys(e.data)) {
        const v = e.data[k];
        if (ArrayBuffer.isView(v) && v.byteLength > 0) { new Uint8Array(v.buffer, v.byteOffset, v.byteLength)[v.byteLength - 1] ^= 1; return; }
    }
    stop('HARNESS', 'arr-bend: no typed array in the lane data');
}
// ab-gate :680-692
function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
}
function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}
function shuffled(arr, r) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = r() % (i + 1);
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}
function buildEntries(L, cols, C) {
    const r = rng(fnv('order:' + L.id));
    const entries = [];
    for (const c of cols) for (let i = 0; i < C; i++) entries.push(buildEntry(c, i, L));
    return shuffled(entries, r);
}

// ---------------------------------------------------------------- self-checks (S-5 / S-6, generic)
const CMP = new Float64Array(2), CMPU = new Uint32Array(CMP.buffer);
/** Every op's record from the copy's `one` equals `ex` bit for bit (Float64 patterns) on all recLen fields. */
function verifyAll(e, L, ex, where) {
    const R = L.recLen;
    for (let op = 0; op < L.ops; op++) {
        const got = e.one(e.state, op);
        if (!(got instanceof Float64Array) || got.length < R) stop('ORACLE', L.id + ' ' + e.col + '#' + e.copy + ' (' + where + ') op ' + op + ': one() did not return a Float64Array of >= ' + R);
        for (let k = 0; k < R; k++) {
            CMP[0] = got[k]; CMP[1] = ex[op * R + k];
            if (CMPU[0] !== CMPU[2] || CMPU[1] !== CMPU[3]) stop('ORACLE', L.id + ' ' + e.col + '#' + e.copy + ' (' + where + ') op ' + op + ' field ' + k + ' got ' + got[k] + ' want ' + ex[op * R + k]);
        }
    }
    return L.ops;
}
function windowSum(L, start, n) {
    let acc = 0;
    for (let i = start; i < start + n; i++) acc = (acc + L.fold[i]) | 0;
    return acc;
}
const foldWant = (L, start, n, reps) => Math.imul(windowSum(L, start, n), reps);
function verifyRun(e, got, want, L, where) {
    if (got !== want) stop('ORACLE', L.id + ' ' + e.col + '#' + e.copy + ' fold (' + where + '): got ' + got + ' want ' + want);
}
const callRun = (e, start, n, reps) => e.run(e.state, start, n, reps);
// ab-gate :646-659; the TF window is the lane's minWindow (ab-gate's TF_N = 4096 may exceed a lane's op domain)
function toTf(e, L) {
    const want = foldWant(L, 0, L.minWindow, 1);
    let m = 0;
    do { verifyRun(e, callRun(e, 0, L.minWindow, 1), want, L, 'tf'); m++; }
    while (m < TF_TRIES && (optStatus(e.run) & TF_BIT) === 0);
    if ((optStatus(e.run) & TF_BIT) === 0) { forceOpt(e.run); verifyRun(e, callRun(e, 0, L.minWindow, 1), want, L, 'tf-forced'); }
    const wantAll = foldWant(L, 0, L.NQ, 1);
    for (let a = 0; a < SETTLE_TRIES; a++) {
        verifyRun(e, callRun(e, 0, L.NQ, 1), wantAll, L, 'settle');
        if ((optStatus(e.run) & TF_BIT) !== 0) return true;
        forceOpt(e.run);
    }
    return (optStatus(e.run) & TF_BIT) !== 0;
}
// ab-gate :660-673 on column A (n from minWindow up to NQ, then reps)
function sizeWindow(e, L) {
    let n = L.minWindow, reps = 1;
    for (;;) {
        const t0 = performance.now();
        callRun(e, 0, n, reps);
        const dt = performance.now() - t0;
        if (dt >= TARGET_MS) break;
        if (n < L.NQ) { n = Math.min(L.NQ, n * 2); continue; }
        if (reps >= MAX_REPS) break;
        reps *= 2;
    }
    return { n, reps };
}
/** B's own reps at A's window n (same ops; reps doubled from 1 to TARGET_MS or MAX_REPS). AA and SLOW use A's reps. */
function sizeReps(e, n) {
    let reps = 1;
    for (;;) {
        const t0 = performance.now();
        callRun(e, 0, n, reps);
        const dt = performance.now() - t0;
        if (dt >= TARGET_MS || reps >= MAX_REPS) break;
        reps *= 2;
    }
    return reps;
}
const roundStart = (L, r) => Math.imul(r + 1, 39313) & (L.NQ - 1);
function floorReason(L, starts, n) {
    if (L.spec.workFloor === undefined) return null;
    for (let x = 0; x < starts.length; x++) {
        const r = L.spec.workFloor(starts[x], n);
        if (r !== null) {
            if (typeof r !== 'string' || !/^[A-Z][A-Z0-9-]* /.test(r)) stop('HARNESS', L.id + ': workFloor reason must be "<KIND> <text>", got ' + JSON.stringify(r));
            return r;
        }
    }
    return null;
}

// ---------------------------------------------------------------- oracle-only lane (no clock; ab-gate :694-725)
function oracleLane(ctx, L, cols, K) {
    const entries = buildEntries(L, cols, ctx.jspec.C);
    let ops = 0;
    for (const e of entries) ops += verifyAll(e, L, L.expect, 'after the oracle pass');
    let arr = 0;
    for (const e of entries) arr += checkArr(e, L, 'after the oracle pass');
    let tf = 0;
    const tfBad = [];
    for (const e of entries) {
        verifyRun(e, callRun(e, 0, L.NQ, 1), foldWant(L, 0, L.NQ, 1), L, 'oracle-only fold');
        if (toTf(e, L)) tf++;
        verifyRun(e, callRun(e, 0, L.NQ, 1), foldWant(L, 0, L.NQ, 1), L, 'oracle-only fold after TF');
        if ((optStatus(e.run) & TF_BIT) === 0) tfBad.push(e.col + '#' + e.copy);
    }
    for (const e of entries) ops += verifyAll(e, L, L.expect, 'after the TF folds');
    for (const e of entries) arr += checkArr(e, L, 'after the TF folds');
    const fresh = refAll(L);
    for (const e of entries) ops += verifyAll(e, L, fresh, 'oracle-only, fresh reference');
    for (const e of entries) arr += checkArr(e, L, 'after the fresh reference');
    const starts = new Int32Array(K);
    for (let x = 0; x < K; x++) starts[x] = roundStart(L, x);
    const voids = [];
    const fr = floorReason(L, starts, L.minWindow);
    if (fr !== null) voids.push(fr + ' (at the shortest window, ' + L.minWindow + ' ops)');
    if (tfBad.length > 0) voids.push('NOT-TF after the oracle-only folds: ' + tfBad.join(','));
    say(ctx, 'ORACLE lane=' + L.id + gateTag(ctx, L.id) + ' A=' + L.spec.A.source + ' B=' + L.spec.B.source + ' copies=' + entries.length +
        ' records-checked=' + ops + ' x ' + L.recLen + ' fields fold ok tf=' + tf + '/' + entries.length +
        ' tf-after-fold=' + (entries.length - tfBad.length) + '/' + entries.length + ' data-elements-compared=' + arr + (voids.length > 0 ? ' VOID=[' + voids.join('; ') + ']' : ' ok'));
    for (const v of voids) say(ctx, 'VOID ' + v.split(' ')[0] + ' lane=' + L.id + ': ' + v);
    return { lane: L.id, gated: isGated(ctx, L.id), voids, ops };
}

// ---------------------------------------------------------------- timedRounds (rung E2, C-23 Q-HOTLOOP (a))
// ab-proto's in-window closure loop, hoisted verbatim except that t0 / t1 live in the T slots: on node >= 26, in TF code
// a clock read stored into a Float64Array never boxes (census (a), measured on node 26.8.2: 0 B / call; on node 22
// performance.now() itself boxes 16 B / read, C-31), where the closure (called once, never optimized)
// boxed t0, t1 and the ns quotient (census (b): 224 B per entry per round). The e.run call site is armed megamorphic on
// tool-owned dummies (never a lane kernel), so no lane kernel is inlined into the loop.
const T = new Float64Array(2);
function timedRounds(live, N, starts, KR, n, L, tfBad, WARM) {
    for (let x = 0; x < KR; x++) {
        const st = starts[x];
        for (let y = 0; y < N; y++) {
            const e = live[(y + x) % N];
            T[0] = performance.now();
            const got = e.run(e.state, st, n, e.reps);
            T[1] = performance.now();
            if (got !== e.wants[x]) verifyRun(e, got, e.wants[x], L, 'timed');
            e.ns[x] = (T[1] - T[0]) * 1e6 / (n * e.reps);
        }
        if (x === 0) WARM[0] = 0;
        for (let y = 0; y < N; y++) if ((optStatus(live[y].run) & TF_BIT) === 0) tfBad[y] = 1;
    }
}
// The WINDOW probe: new-space bytes allocated while fn runs = the used-size delta across fn, plus the new-space bytes
// every GC inside fn freed, minus the same delta across an empty read pair (the probe's own cost). Called around the
// window, never between the clock reads. -> { bytes, scavenges }.
const WIN = new Float64Array(4);
const usedNew = (h) => { for (const s of h.heapSpaceStatistics) if (s.spaceName === 'new_space') return s.spaceUsedSize; return NaN; };
function windowProbe(fn) {
    WIN[0] = newSpaceUsed();
    WIN[1] = newSpaceUsed();
    const q = new GCProfiler();
    q.start();
    WIN[2] = newSpaceUsed();
    try { fn(); } catch (e) { q.stop(); throw e; }   // a STOP inside the window never leaves this profiler running
    WIN[3] = newSpaceUsed();
    const st = q.stop().statistics;
    let freed = 0, scavenges = 0;
    for (const g of st) { if (!notMinor(g)) scavenges++; freed += usedNew(g.beforeGC) - usedNew(g.afterGC); }
    if (WIN[0] < 0 || WIN[1] < 0 || WIN[2] < 0 || WIN[3] < 0) return { bytes: NaN, scavenges };   // unmeasured, never 0
    return { bytes: (WIN[3] - WIN[2]) - (WIN[1] - WIN[0]) + freed, scavenges };
}
const ARM_N = 5, ARM_KR = 2, ARM_OPS = 8;
/** Once per timed run: 5 tool-owned entries of the lane-entry shape (buildEntry's literal; state / data / one of
 *  varied shapes, so every field type is already general), each with its own non-allocating run (fresh nonce: the
 *  e.run site goes megamorphic), two dry runs, then forceOpt and a third. The probe is warmed on an empty window. */
function armTimed(inject) {
    const prep = new Function('f', '%PrepareFunctionForOptimization(f);');
    const dummies = [];
    for (let i = 0; i < ARM_N; i++) {
        const f = new Function('"use strict"; // ab-gate tool-arm #' + (NONCE++) + '\nreturn { run: function run(st, start, n, reps) { ' +
            'let a = ' + i + '; for (let p = 0; p < reps; p++) for (let j = start; j < start + n; j++) a = (a + st.x[j & 7]) | 0; return a; }, ' +
            'one: function one(st, op) { return st.x[op & 7]; } };')();
        const x = new Int32Array(ARM_OPS);
        for (let j = 0; j < ARM_OPS; j++) x[j] = (i + 1) * (j + 3);
        const data = i === 0 ? { x } : i === 1 ? { x, n: ARM_OPS } : i === 2 ? { n: ARM_OPS, x } : i === 3 ? { x, s: 'tool' } : { x, n: ARM_OPS, k: 0 };
        const state = i === 0 ? { x } : i === 1 ? { x, out: new Float64Array(2) } : i === 2 ? { out: null, x } : i === 3 ? { x, a: 0, b: 'tool' } : data;
        const e = { col: 'TOOL' + i, copy: i, run: f.run, one: f.one, state, data, ns: null, reps: 1, wants: null };
        e.ns = new Float64Array(ARM_KR);
        e.reps = i + 1;
        e.wants = new Int32Array(ARM_KR);
        dummies.push(e);
    }
    const starts = new Int32Array(ARM_KR), tfBad = new Uint8Array(ARM_N), warm = new Int32Array(1);
    for (let x = 0; x < ARM_KR; x++) starts[x] = x;
    for (const e of dummies) for (let x = 0; x < ARM_KR; x++) e.wants[x] = e.run(e.state, starts[x], ARM_OPS >>> 1, e.reps);
    const L = { id: 'tool-arm' };
    prep(timedRounds);
    timedRounds(dummies, ARM_N, starts, ARM_KR, ARM_OPS >>> 1, L, tfBad, warm);
    timedRounds(dummies, ARM_N, starts, ARM_KR, ARM_OPS >>> 1, L, tfBad, warm);
    forceOpt(timedRounds);
    timedRounds(dummies, ARM_N, starts, ARM_KR, ARM_OPS >>> 1, L, tfBad, warm);
    for (let i = 0; i < 4; i++) windowProbe(() => {});
}

// ---------------------------------------------------------------- timed lane (ab-gate :727-815)
async function runLane(ctx, L, cols, K, inject) {
    const entries = buildEntries(L, cols, ctx.jspec.C);
    // Q-WARM (a): K + 1 rounds in the GC window; round 0 is a warm round, dropped from EVERY column before the medians
    const KR = K + 1;
    for (const e of entries) e.ns = new Float64Array(KR);
    for (const e of entries) verifyAll(e, L, L.expect, 'after the oracle pass');
    for (const e of entries) checkArr(e, L, 'after the oracle pass');
    for (const e of entries) toTf(e, L);
    for (const e of entries) verifyAll(e, L, L.expect, 'after TF');
    for (const e of entries) checkArr(e, L, 'after TF');
    const wn = Math.min(WARM_N, L.NQ);
    for (let w = 0; w < WARM_ROUNDS; w++) {
        const st = roundStart(L, w + 1000), want = foldWant(L, st, wn, 1);
        for (const e of entries) verifyRun(e, callRun(e, st, wn, 1), want, L, 'warm');
    }
    const st2 = roundStart(L, 1000 + WARM_ROUNDS), want2 = foldWant(L, st2, wn, 2);
    for (const e of entries) verifyRun(e, callRun(e, st2, wn, 2), want2, L, 'warm reps=2');
    if (inject === 'arr-bend') bendArr(entries.find((e) => e.col === 'B'));
    for (const e of entries) checkArr(e, L, 'after warm');
    const { n, reps } = sizeWindow(entries.find((e) => e.col === 'A'), L);
    const repsB = sizeReps(entries.find((e) => e.col === 'B'), n);
    for (const e of entries) checkArr(e, L, 'after sizing');
    // Q-REPS (a): the AB column (A at B's reps) is timed only when B's reps differ from A's
    const live = repsB !== reps ? entries : entries.filter((e) => e.col !== 'AB');
    const liveCols = cols.filter((c) => live.some((e) => e.col === c.id));
    const starts = new Int32Array(KR);
    starts[0] = roundStart(L, 2000);
    for (let x = 0; x < K; x++) starts[x + 1] = roundStart(L, x);
    for (const e of live) {
        e.reps = e.col === 'B' || e.col === 'AB' ? repsB : reps;
        e.wants = new Int32Array(KR);
        for (let x = 0; x < KR; x++) e.wants[x] = foldWant(L, starts[x], n, e.reps);
    }
    const voids = [];
    const fr = floorReason(L, starts, n);
    if (fr !== null) voids.push(fr);
    const tierStart = live.map((e) => (optStatus(e.run) & TF_BIT) !== 0);
    const N = live.length;
    const tfBad = new Uint8Array(N);
    const LATE = globalThis.__labLate, WARM = globalThis.__labWarm;
    LATE[0] = inject === 'late-bend' ? 1 : 0;
    WARM[0] = inject === 'warm-skew' ? 1 : 0;
    const toolTfStart = (optStatus(timedRounds) & TF_BIT) !== 0;
    let win = null;
    const toolDeopt = inject === 'tool-deopt' ? new Function('f', '%DeoptimizeFunction(f); %NeverOptimizeFunction(f);') : null;
    const w = await gcWindow(() => { win = windowProbe(() => { if (toolDeopt !== null) toolDeopt(timedRounds); timedRounds(live, N, starts, KR, n, L, tfBad, WARM); }); });
    const toolTfEnd = (optStatus(timedRounds) & TF_BIT) !== 0;
    say(ctx, 'WINDOW lane=' + L.id + ' tool-bytes=' + win.bytes + ' scavenges=' + win.scavenges);
    if (inject === 'post-bend') LATE[0] = 1;
    const tierEnd = live.map((e) => (optStatus(e.run) & TF_BIT) !== 0);
    if (w.major !== 0) voids.push('GC-WINDOW major ' + w.major);
    const fresh = refAll(L);
    for (const e of live) verifyAll(e, L, fresh, 'after timing, fresh reference');
    for (const e of live) checkArr(e, L, 'after timing');
    const bop = {};
    for (const e of live) {
        const b = allocBop(e, n);
        if (!(e.col in bop) || b > bop[e.col]) bop[e.col] = b;
    }
    for (const e of live) verifyAll(e, L, L.expect, 'after the B/op lane');
    for (const e of live) checkArr(e, L, 'after the B/op lane');
    for (const c in bop) if (!(bop[c] < ALLOC_MAX)) voids.push('ALLOC ' + c + ' ' + fmt(bop[c], 3) + ' B/op');
    const notTf = live.filter((e, i) => !tierStart[i] || !tierEnd[i] || tfBad[i] !== 0).map((e) => e.col + '#' + e.copy);
    if (notTf.length > 0) voids.push('NOT-TF ' + notTf.join(','));
    if (!toolTfStart || !toolTfEnd) voids.push('NOT-TF tool timedRounds (TF at window start ' + toolTfStart + ', end ' + toolTfEnd + ')');

    const rounds = {}, warm0 = {};
    for (const c of liveCols) {
        const es = live.filter((e) => e.col === c.id);
        const out = new Array(K);
        for (let x = 0; x < K; x++) out[x] = summarize(es.map((e) => e.ns[x + 1])).med;
        warm0[c.id] = summarize(es.map((e) => e.ns[0])).med;
        rounds[c.id] = out;
        if (out.some((v) => !Number.isFinite(v))) voids.push('NAN ' + c.id);
    }
    const ratio = summarize(ratioVec(rounds.B, rounds.A));
    const delta = summarize(diffVec(rounds.B, rounds.A));
    const aa = summarize(ratioVec(rounds.AA, rounds.A));
    const slow = summarize(ratioVec(rounds.SLOW, rounds.A));
    const hasAB = Object.hasOwn(rounds, 'AB');
    // fix3 (re-review B1): AB's reps are read from the AB entries themselves (never from repsB), so an AB timed at the
    // wrong reps shows on RESULT; copies that disagree print as "r1/r2/.." which the judge rejects (fail closed)
    const abReps = [...new Set(live.filter((e) => e.col === 'AB').map((e) => e.reps))].join('/');
    const ab = hasAB ? summarize(ratioVec(rounds.AB, rounds.A)) : null;
    if (!aaOk(aa)) voids.push('AA-DRIFT ' + fmtS(aa, 3));
    if (!slowOk(slow)) voids.push('SLOW-DEAD ' + fmtS(slow, 3));
    // Q-REPS-2: B is judged against A at its own reps too; the two words must agree (the SAME word()), else REPS-DRIFT
    const bab = hasAB ? summarize(ratioVec(rounds.B, rounds.AB)) : null;
    const wordAB = hasAB ? word(bab) : 'n/a';
    if (hasAB && wordAB !== word(ratio)) voids.push('REPS-DRIFT B/AB ' + fmtS(bab, 3) + ' reads ' + wordAB + ' but B/A ' + fmtS(ratio, 3) + ' reads ' + word(ratio) + ' (AB = A at B\'s reps ' + repsB + ' vs A\'s ' + reps + ')');
    const ns = {};
    for (const c of liveCols) ns[c.id] = summarize(rounds[c.id]);
    const row = { lane: L.id, gated: isGated(ctx, L.id), ratio, delta, aa, slow, ab, bab, wordAB, ns, bop, win: n, reps, repsB, voids, word: word(ratio) };
    say(ctx, 'RESULT lane=' + L.id + gateTag(ctx, L.id) + ' A=' + fmtS(ns.A, 2) + ' B=' + fmtS(ns.B, 2) + ' ns/op' +
        ' B/A=' + fmtS(ratio, 3) + ' word=' + row.word + ' B-A=' + fmtS(delta, 2) + 'ns' +
        ' aa=' + fmtS(aa, 3) + ' slow=' + fmtS(slow, 3) + ' ab=' + (hasAB ? fmtS(ab, 3) : 'n/a') + ' B/AB=' + (hasAB ? fmtS(bab, 3) : 'n/a') + ' wordAB=' + wordAB +
        ' bop=' + Object.keys(bop).map((c) => c + ':' + fmt(bop[c], 4)).join(',') +
        ' win=' + n + ' reps=A:' + reps + ',B:' + repsB + (hasAB ? ',AB:' + abReps : '') + ' spin=' + L.spin + ' warm=' + (KR - K) +
        (voids.length > 0 ? ' VOID=[' + voids.join('; ') + ']' : ''));
    const raw = (num) => ratioVec(rounds[num], rounds.A).map((v) => fmt(v, 4)).join(',');
    say(ctx, 'RAW lane=' + L.id + ' B/A=' + raw('B') + ' AA=' + raw('AA') + ' SLOW=' + raw('SLOW') + (hasAB ? ' AB=' + raw('AB') : ''));
    say(ctx, 'WARM lane=' + L.id + ' round 0 (discarded, not in any median) ' + liveCols.map((c) => c.id + '/A=' + fmt(warm0[c.id] / warm0.A, 4)).join(' '));
    for (const v of voids) say(ctx, 'VOID ' + v.split(' ')[0] + ' lane=' + L.id + ': ' + v);
    return row;
}

// ---------------------------------------------------------------- the judge (rung J1: r0-verdict-parity.mjs makeSpec /
// wordG / laneStateG / verdictOfG = ab-gate :893-1021 with lane ids, GATED and the HEADER shape as spec data).
// Exported (C-26) as judgeSpec (validated, frozen; C-13 / C-14 / C-4 / C-19 / C-27 / C-33) and verdictOf(spec, lines)
// (pure: reads only its arguments and module constants). Two dialects (C-27):
//   TOOL (dialect omitted): every check below, incl. the tool-only ones: the HEADER spec line (laneSha required, C-33),
//     reps / AB / n-a (C-11), warm (RESULT warm=1, one WARM line per lane, RAW columns of exactly K values: C-12 / C-28;
//     RAW AB / WARM AB/A exactly when reps differ and every RAW value a finite number: C-34; RESULT reps parsed once on
//     every lane, gated or reported, else run shape: C-42; RESULT ab / B/AB / wordAB not n/a plus one bop AB entry exactly
//     when reps differ, all three n/a and no bop AB entry when equal, on every lane, else run shape: C-47; the RESULT reps
//     AB part present with n = B reps exactly when reps differ, on every lane, else run shape: C-50; WARM columns exactly
//     A/A B/A AA/A SLOW/A [AB/A] in that order, each value finite: C-40; RAW columns exactly B/A AA SLOW [AB], each once:
//     C-41; RESULT ab / B/AB finite where not n/a, wordAB = the word its B/AB reads, one bop field of known keys and numeric
//     values, on every lane, else run shape: C-51; the rest of the RESULT line (A, B, B/A, B-A, aa, slow grammar with NaN only
//     beside its VOID NAN item, word = its B/A word, win / spin integers, the tag as the spec gates the lane): C-54; a negative
//     bop value: C-55; exactly the producer's RESULT fields in its order, C-54 numbers finite: C-56)
//     and the provenance grammar (HEADER arch, PROV start / end as provenance() prints them).
//   'ab-gate@7e0f9262' (API only): ab-gate 7e0f9262's verdictOf byte for byte (C-9): it skips exactly those four.
// The judge recomputes every word with its OWN wordG and its own band comparisons (never the producer's word / aaOk /
// slowOk), so a producer bug in those cannot agree with itself (LEDGER law 4).
const DIALECT_7E = 'ab-gate@7e0f9262';
const JUDGE_KEYS = ['laneIds', 'gated', 'shape', 'K', 'C', 'run', 'laneSha', 'dialect'];
const HEX64_RE = /^[0-9a-f]{64}$/;
const SHAPE_KEY_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const ALLOC_TXT = '1/64';
const BOP_COLS = Object.freeze(['A', 'B', 'AA', 'SLOW']);
// provenance() (below) prints: PROV <tag> <ISO time> load <1m> <5m> <15m> busy-node [<ps rows>] quiet-lock <host>
const PROV_RE = /^PROV (start|end) (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) load \d+\.\d{2} \d+\.\d{2} \d+\.\d{2} busy-node \[.*\] quiet-lock \S+$/;
const WARM_HEAD = ' round 0 (discarded, not in any median) ';
// C-40: the WARM columns, exactly A/A B/A AA/A SLOW/A in that order, then AB/A (how many AB/A is C-34's count, so a
// twice-printed AB/A keeps its C-34 reason); each value NUM_RE / finite is a separate check in warmShape
const WARM_COLS_RE = /^A\/A=\S+ B\/A=\S+ AA\/A=\S+ SLOW\/A=\S+( AB\/A=\S+)*$/;
const RAW_COLS = Object.freeze(['B/A', 'AA', 'SLOW', 'AB']);   // C-41: the RAW column set (AB exactly when reps differ: C-34)
const BOP_KEYS = Object.freeze([...BOP_COLS, 'AB']);           // C-51: the bop key set (the AB entry's count is C-47's)
// C-54: the RESULT number fields as runLane prints them (fmtS + unit suffix), each with the columns whose VOID NAN item
// (runLane: 'NAN <col>' when a column's rounds are not finite) is the only way that field may print NaN[NaN..NaN]
const STAT_RE = /^-?\d+(\.\d+)?\[-?\d+(\.\d+)?\.\.-?\d+(\.\d+)?\]$/;
// C-56: the RESULT fields after 'RESULT lane=<id> <tag>', exactly these, each once, in this order (a literal, written from
// runLane's RESULT print and checked against the real logs; never derived from that print); then optionally ' VOID=[..]' last
const RESULT_FIELDS = Object.freeze(['A', 'B', 'ns/op', 'B/A', 'word', 'B-A', 'aa', 'slow', 'ab', 'B/AB', 'wordAB', 'bop', 'win', 'reps', 'spin', 'warm']);
const RESULT_NUMS = Object.freeze([['A', '', ['A']], ['B', '', ['B']], ['B/A', '', ['A', 'B']], ['B-A', 'ns', ['A', 'B']], ['aa', '', ['A', 'AA']], ['slow', '', ['A', 'SLOW']]]);
function judgeFail(msg) { throw new Error('judgeSpec: ' + msg); }
const isPlain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null) && Object.getOwnPropertySymbols(o).length === 0;
/** judgeSpec({ laneIds, gated, shape?, K?, C?, run?, laneSha, dialect? }) -> a frozen judging spec. Throws an Error naming
 *  the first bad input: a non-plain object or an unknown key (did-you-mean; the A/A band, SLOW and ALLOC limits are module
 *  constants AA_LO .. ALLOC_MAX, never keys), an unknown dialect, bad / duplicated lane ids, an empty gated map, a gated id
 *  not in laneIds, a gated word not FASTER / SLOWER / WITHIN, K / C outside C-19, a shape that is not [string, string]
 *  pairs, a bad run, and (TOOL dialect only, C-33) a laneSha that is not 64 lowercase hex. The legacy dialect ignores
 *  laneSha (its spec stores null). */
export function judgeSpec(o) {
    if (!isPlain(o)) judgeFail('the argument must be a plain object (own keys, no prototype or Symbol keys)');
    for (const k of Object.keys(o)) if (!JUDGE_KEYS.includes(k)) judgeFail('unknown key ' + k + didYouMean(k, JUDGE_KEYS) + ' (allowed: ' + JUDGE_KEYS.join(', ') + ')');
    // own keys only (r2: a key inherited through the prototype chain, e.g. a polluted Object.prototype.dialect, is never read)
    const own = (k) => (Object.hasOwn(o, k) ? o[k] : undefined);
    const dialect = own('dialect'), laneIds = own('laneIds'), gatedIn = own('gated'), Kin = own('K'), Cin = own('C'), shapeOwn = own('shape'), runIn = own('run'), shaIn = own('laneSha');
    if (dialect !== undefined && dialect !== DIALECT_7E) judgeFail('unknown dialect ' + JSON.stringify(dialect) + ' (omit it for the tool dialect, or ' + JSON.stringify(DIALECT_7E) + ')');
    if (!Array.isArray(laneIds) || laneIds.length === 0) judgeFail('laneIds must be a non-empty array of lane ids');
    const ids = [];
    for (const id of laneIds) {
        if (typeof id !== 'string' || !LANE_ID_RE.test(id) || ids.includes(id)) judgeFail('lane id ' + JSON.stringify(id) + ' bad or duplicated');
        ids.push(id);
    }
    if (!isPlain(gatedIn)) judgeFail('gated must be a plain object { laneId: word }');
    const gk = Object.keys(gatedIn);
    if (gk.length === 0) judgeFail('gated must name at least one lane (C-14)');
    const gated = {};
    for (const id of gk) {
        if (!ids.includes(id)) judgeFail('gated lane ' + id + ' not in laneIds');
        if (!WORDS.includes(gatedIn[id])) judgeFail('gated ' + id + ' word ' + String(gatedIn[id]) + ' (want ' + WORDS.join(', ') + ')');
        gated[id] = gatedIn[id];
    }
    const K = Kin === undefined ? K_ROUNDS : Kin, C = Cin === undefined ? C_COPIES : Cin;
    if (!isInt(K) || K < K_ROUNDS || K > K_MAX) judgeFail('K ' + String(Kin) + ' must be an integer in [' + K_ROUNDS + ', ' + K_MAX + '] (C-4: never lower than the tool K)');
    if (!isInt(C) || C < C_COPIES || C > C_MAX) judgeFail('C ' + String(Cin) + ' must be an integer in [' + C_COPIES + ', ' + C_MAX + '] (C-4: never lower than the tool C)');
    const shapeIn = shapeOwn === undefined ? [] : shapeOwn;
    if (!Array.isArray(shapeIn)) judgeFail('shape must be an array of [key, value] string pairs');
    const shape = [], keys = [];
    for (const kv of shapeIn) {
        if (!Array.isArray(kv) || kv.length !== 2 || typeof kv[0] !== 'string' || typeof kv[1] !== 'string' || !SHAPE_KEY_RE.test(kv[0]) || !/^\S+$/.test(kv[1]) || keys.includes(kv[0])) {
            judgeFail('bad shape entry ' + JSON.stringify(kv) + ' (want [key, value]: key letters / digits, value a string with no whitespace, keys unique)');
        }
        keys.push(kv[0]);
        shape.push(Object.freeze([kv[0], kv[1]]));
    }
    const run = runIn === undefined ? 'ALL' : runIn;
    if (typeof run !== 'string' || !/^\S+$/.test(run)) judgeFail('run must be a string with no whitespace (default ALL)');
    let laneSha = null;
    if (dialect === undefined) {
        if (typeof shaIn !== 'string' || !HEX64_RE.test(shaIn)) judgeFail('laneSha ' + (shaIn === undefined ? 'missing' : JSON.stringify(shaIn)) + ': the tool dialect requires the gate file sha256, 64 lowercase hex (C-33)');
        laneSha = shaIn;
    }
    return Object.freeze({ laneIds: Object.freeze(ids), gated: Object.freeze(gated), shape: Object.freeze(shape), K, C, run, laneSha, dialect });
}
/** The belt (C-14 / C-33): a spec object built WITHOUT judgeSpec is checked for the fail-open states; -> reason | null. */
const ownDialect = (sp) => (Object.hasOwn(sp, 'dialect') ? sp.dialect : undefined);   // r2: own keys only (never the prototype chain)
const ownLaneSha = (sp) => (Object.hasOwn(sp, 'laneSha') ? sp.laneSha : undefined);
function judgeBelt(sp) {
    const dialect = ownDialect(sp), laneSha = ownLaneSha(sp);
    if (dialect !== undefined && dialect !== DIALECT_7E) return 'unknown dialect ' + JSON.stringify(dialect);
    if (!Array.isArray(sp.laneIds) || !Array.isArray(sp.shape)) return 'laneIds / shape not arrays';
    if (sp.gated === null || typeof sp.gated !== 'object' || Object.keys(sp.gated).length === 0) return 'gated is empty (C-14: never a PASS)';
    if (dialect === undefined && (typeof laneSha !== 'string' || !HEX64_RE.test(laneSha))) return 'laneSha is not 64 lowercase hex in the tool dialect (C-33)';
    return null;
}
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headReOf = (shape) => new RegExp('^HEADER rung=(\\S+) (TIMED|ORACLE-ONLY \\(no clock\\)) node (\\S+)(?: arch (\\S+))? v8 (\\S+) cpu (.+) K=(\\S+) C=(\\S+)' +
    shape.map(([k]) => ' ' + escRe(k) + '=(\\S+)').join('') + ' inject=(\\S+)$');
/** TOOL dialect: which HEADER rung= fields an unparsed line lacks (the legacy text stays ab-gate's bare "unparsed"). */
function headMissing(line, shape) {
    const want = [' node ', ' v8 ', ' cpu ', ' K=', ' C=', ...shape.map(([k]) => ' ' + k + '='), ' inject='];
    const miss = want.filter((t) => !line.includes(t)).map((t) => t.trim().replace(/=$/, ''));
    return miss.length > 0 ? ' (no ' + miss.join(', ') + ' field)' : ' (fields out of order or malformed)';
}
const NUM_RE = /^-?\d+(\.\d+)?$/;
const num = (t) => (typeof t === 'string' && NUM_RE.test(t) ? Number(t) : NaN);
const fin3 = (s) => Number.isFinite(s.med) && Number.isFinite(s.q1) && Number.isFinite(s.q3);
function field(line, key) {
    const k = ' ' + key + '=';
    const i = line.indexOf(k);
    if (i < 0 || line.indexOf(k, i + 1) >= 0) return null;
    const rest = line.slice(i + k.length), sp = rest.indexOf(' ');
    return sp < 0 ? rest : rest.slice(0, sp);
}
function stat3(t) {
    const m = t === null ? null : /^([^[\]]*)\[([^[\]]*)\.\.([^[\]]*)\]$/.exec(t);
    return m === null ? { med: NaN, q1: NaN, q3: NaN } : { med: num(m[1]), q1: num(m[2]), q3: num(m[3]) };
}
// C-5: the word band IS the A/A band (the judge's own copy of the rule; see above)
function wordG(s) {
    if (!Number.isFinite(s.med)) return 'NONE';
    if (s.med > AA_HI && s.q1 > 1) return 'SLOWER';
    if (s.med < AA_LO && s.q3 < 1) return 'FASTER';
    return 'WITHIN';
}
function laneStateG(tool, id, line, voidKinds) {
    const why = [];
    const vt = line.indexOf(' VOID=[');
    if (vt >= 0) why.push('VOID(' + line.slice(vt + 7).split('; ').map((v) => v.split(/[\s\]]/)[0]).join(',') + ')');
    if (voidKinds.has(id)) why.push('VOID-line(' + voidKinds.get(id).join(',') + ')');
    const ratio = stat3(field(line, 'B/A'));
    const printed = field(line, 'word');
    const aa = stat3(field(line, 'aa')), slow = stat3(field(line, 'slow'));
    if (!fin3(ratio)) why.push('B/A not finite');
    if (!fin3(aa)) why.push('aa ' + fmtS(aa, 3) + ' not finite');
    else if (!(aa.med >= AA_LO && aa.med <= AA_HI)) why.push('aa ' + fmtS(aa, 3) + ' not in [' + AA_LO + ', ' + AA_HI + ']');
    if (!fin3(slow)) why.push('slow ' + fmtS(slow, 3) + ' not finite');
    else if (!(slow.med > SLOW_MED && slow.q1 > SLOW_Q1)) why.push('slow ' + fmtS(slow, 3) + ' not med > ' + SLOW_MED.toFixed(2) + ' and q1 > ' + SLOW_Q1.toFixed(2));
    const w = wordG(ratio);
    let cols = BOP_COLS;
    if (tool) {
        // TOOL only (C-11, Q-REPS-2 "judge both ratios"): reps A != B needs a finite B/AB (B against A at B's reps) whose
        // word, recomputed here by the same wordG, equals the printed wordAB and the B/A word (else REPS-DRIFT), plus an
        // AB B/op entry. ab (AB / A) is REPORTED only (no band). Equal reps print ab, B/AB and wordAB as n/a. An unparsed
        // reps field is not clean (fail closed).
        const repsTxt = field(line, 'reps'), babTxt = field(line, 'B/AB'), pAB = field(line, 'wordAB');
        const rm = repsTxt === null ? null : /^A:(\d+),B:(\d+)(?:,AB:(\d+))?$/.exec(repsTxt);
        if (rm === null) why.push('reps ' + repsTxt + ' unparsed (want A:<n>,B:<n>[,AB:<n>])');
        else if (Number(rm[1]) !== Number(rm[2])) {
            cols = [...BOP_COLS, 'AB'];
            if (rm[3] === undefined || Number(rm[3]) !== Number(rm[2])) why.push('AB reps ' + rm[3] + ' (want B:' + rm[2] + ')');
            const bab = stat3(babTxt);
            if (!fin3(bab)) why.push('B/AB ' + babTxt + ' not finite with reps A:' + rm[1] + ' != B:' + rm[2]);
            else {
                const wab = wordG(bab);
                if (pAB !== wab) why.push('printed wordAB=' + pAB + ' but B/AB ' + fmtS(bab, 3) + ' reads ' + wab);
                else if (wab !== w) why.push('REPS-DRIFT B/AB ' + fmtS(bab, 3) + ' reads ' + wab + ' but B/A ' + fmtS(ratio, 3) + ' reads ' + w);
            }
        } else if (rm[3] !== undefined) why.push('AB reps ' + rm[3] + ' with equal reps (want no AB)');
        if (rm !== null && Number(rm[1]) === Number(rm[2])) for (const k of ['ab', 'B/AB', 'wordAB']) if (field(line, k) !== 'n/a') why.push(k + '=' + field(line, k) + ' with equal reps (want n/a)');
    }
    const bopTxt = field(line, 'bop');
    const bops = bopTxt === null ? [] : bopTxt.split(',');
    const seen = new Set(), neg = [];
    let bopOk = bops.length === cols.length;
    for (const b of bops) {
        const kv = b.split(':');
        const v = kv.length === 2 ? num(kv[1]) : NaN;
        if (kv.length !== 2 || !cols.includes(kv[0]) || seen.has(kv[0]) || !(v < ALLOC_MAX)) bopOk = false;
        else if (!(v >= 0)) neg.push(b);
        seen.add(kv[0]);
    }
    if (!bopOk) why.push('bop ' + bopTxt + ' not ' + cols.join(', ') + ' each < ' + ALLOC_TXT);
    if (neg.length > 0) why.push('bop ' + neg.join(',') + ' negative (want >= 0)');
    if (printed !== w) why.push('printed word=' + printed + ' but B/A ' + fmtS(ratio, 3) + ' reads ' + w);
    return { id, word: printed, ratio, clean: why.length === 0, why };
}
/** TOOL only (C-12 / C-28 / C-34 / C-42): RESULT warm=1, exactly one WARM line and one RAW line per lane, every RAW column
 *  (B/A, AA, SLOW, and AB when printed) holding exactly K values, each a finite number (NUM_RE); RAW AB and WARM AB/A
 *  present exactly when that lane's RESULT reps differ (C-11 on every line family); a RESULT reps field unparsed or
 *  printed twice on any lane (C-42); RESULT ab / B/AB / wordAB and the bop AB entry against that lane's reps (C-47); the
 *  RESULT reps AB part against that lane's reps (C-50); the WARM column grammar and finite values (C-40); the RAW column
 *  set (C-41); the RESULT ab / B/AB / wordAB / bop grammar on every lane (C-51); the rest of the RESULT line (C-54); a
 *  negative bop value (C-55); the RESULT field set / order and finite C-54 numbers (C-56).
 *  Appends run-shape reasons to `shape`. */
function warmShape(sp, lines, res, shape) {
    const ids = sp.laneIds;
    const warmBad = [];
    for (const id of ids) {
        if (!res.has(id) || res.get(id).length !== 1) continue;
        const wv = field(res.get(id)[0], 'warm');
        if (wv !== '1') warmBad.push(id + (wv === null ? ' (no warm field)' : ' (warm=' + wv + ')'));
    }
    if (warmBad.length > 0) shape.push('RESULT warm=1 missing for ' + warmBad.length + ' lane(s) ' + warmBad.join(','));
    const warm = new Map(), raw = new Map(), unknown = [];
    for (const l of lines) {
        const m = /^(WARM|RAW) lane=(\S+) /.exec(l);
        if (m === null) continue;
        if (!ids.includes(m[2])) { unknown.push(m[1] + ' ' + m[2]); continue; }
        const by = m[1] === 'WARM' ? warm : raw;
        if (by.has(m[2])) by.get(m[2]).push(l); else by.set(m[2], [l]);
    }
    if (unknown.length > 0) shape.push('WARM / RAW for unknown lane(s) ' + unknown.join(','));
    const wantOne = (by, what) => {
        const off = ids.filter((id) => !by.has(id) || by.get(id).length !== 1);
        if (off.length > 0) shape.push(what + ' lines per lane not 1 for ' + off.map((id) => id + ':' + (by.has(id) ? by.get(id).length : 0)).join(','));
    };
    wantOne(warm, 'WARM');
    wantOne(raw, 'RAW');
    for (const id of ids) {
        // C-34: whether this lane's reps differ, read from its one RESULT line's reps field (the grammar laneStateG
        // checks). C-42: a lane with one RESULT whose reps field is missing, printed twice (field() reads null) or off
        // that grammar leaves the AB rule unverifiable -> run shape on ANY lane, gated or reported (a reported lane's
        // NOT-CLEAN label never reaches the verdict; C-14, null is not zero). No / several RESULT lines are run shape
        // above, so rl === null adds no reason here. differ === null skips the AB checks below (already NO VERDICT).
        const rl = res.has(id) && res.get(id).length === 1 ? res.get(id)[0] : null, rt = rl === null ? null : field(rl, 'reps');
        const rr = rt === null ? null : /^A:(\d+),B:(\d+)(?:,AB:(\d+))?$/.exec(rt);
        if (rl !== null && rr === null) {
            const nReps = rl.split(' reps=').length - 1;
            shape.push('RESULT lane=' + id + ' reps ' + (nReps >= 2 ? 'printed ' + nReps + ' times' : rt + ' unparsed (want A:<n>,B:<n>[,AB:<n>])') + ' (C-42: the C-34 AB rule is unverifiable)');
        }
        const differ = rr === null ? null : Number(rr[1]) !== Number(rr[2]);
        // C-47: the same AB rule on the RESULT line of ANY lane, gated or reported (a reported lane's NOT-CLEAN label never
        // reaches the verdict): reps differ -> ab, B/AB and wordAB each present once (field() null = absent or printed
        // twice) and not n/a, and exactly one AB: entry over the line's bop fields; equal reps -> all three exactly n/a and
        // no bop AB entry. The values are C-51 below (run shape); REPS-DRIFT stays a C-11 lane label (laneStateG, C-15).
        if (rl !== null && differ !== null) {
            for (const k of ['ab', 'B/AB', 'wordAB']) {
                const v = field(rl, k);
                if (differ === true && (v === null || v === 'n/a')) shape.push('RESULT lane=' + id + ' ' + k + (v === null ? ' missing or printed twice' : '=n/a') + ' with reps ' + rt + ' (C-47: reps differ -> ab, B/AB, wordAB once each, not n/a)');
                if (differ === false && v !== 'n/a') shape.push('RESULT lane=' + id + ' ' + k + (v === null ? ' missing or printed twice' : '=' + v) + ' with equal reps ' + rt + ' (C-47: want n/a)');
            }
            const nBab = rl.split(' ').filter((t) => t.startsWith('bop=')).reduce((s, t) => s + t.slice(4).split(',').filter((e) => e.startsWith('AB:')).length, 0);
            if (differ === true && nBab !== 1) shape.push('RESULT lane=' + id + ' bop holds ' + nBab + ' AB: entries with reps ' + rt + ' (C-47: reps differ -> exactly one)');
            if (differ === false && nBab !== 0) shape.push('RESULT lane=' + id + ' bop holds ' + nBab + ' AB: entries with equal reps ' + rt + ' (C-47: want none)');
        }
        // C-50: the RESULT reps AB part follows C-11 on ANY lane, gated or reported: reps differ -> AB:<n> present with
        // n = B reps; equal reps -> no AB part. Run shape (same reasoning as C-42 / C-47); laneStateG keeps its C-11 label.
        if (rr !== null) {
            if (differ === true && (rr[3] === undefined || Number(rr[3]) !== Number(rr[2]))) shape.push('RESULT lane=' + id + ' reps ' + rt + ' AB part ' + (rr[3] === undefined ? 'missing' : rr[3] + ' != B reps ' + rr[2]) + ' (C-50: reps differ -> AB:<B reps>)');
            if (differ === false && rr[3] !== undefined) shape.push('RESULT lane=' + id + ' reps ' + rt + ' AB part with equal reps (C-50: want none)');
        }
        // C-51: the RESULT values' grammar on ANY lane, gated or reported: ab and B/AB finite where not n/a (when n/a is right
        // is C-47's); the printed wordAB = the word its finite B/AB reads (the judge's own wordG); bop printed exactly once,
        // each entry <KEY>:<NUM_RE finite> or <KEY>:Infinity (allocBop's disturbed-window value, an ALLOC outcome), keys A, B,
        // AA, SLOW once each plus AB (its count against reps is C-47's). Run shape. The outcomes stay laneStateG labels
        // (C-15): REPS-DRIFT, ALLOC bop >= 1/64 (Infinity included, C-55); a negative bop is grammar (C-55).
        if (rl !== null) {
            for (const k of ['ab', 'B/AB']) {
                const v = field(rl, k);
                if (v !== null && v !== 'n/a' && !fin3(stat3(v))) shape.push('RESULT lane=' + id + ' ' + k + '=' + v + ' not finite (C-51)');
            }
            const bab = stat3(field(rl, 'B/AB')), pAB = field(rl, 'wordAB');
            if (fin3(bab) && pAB !== wordG(bab)) shape.push('RESULT lane=' + id + ' printed wordAB=' + pAB + ' but B/AB ' + fmtS(bab, 3) + ' reads ' + wordG(bab) + ' (C-51)');
            const bopF = rl.split(' ').filter((t) => t.slice(0, 4) === 'bop=');
            if (bopF.length !== 1) shape.push('RESULT lane=' + id + ' bop ' + (bopF.length === 0 ? 'missing' : 'printed ' + bopF.length + ' times') + ' (C-51: one bop field)');
            const seen = [], badKey = [], badNum = [], badNeg = [];
            for (const e of (bopF.length === 1 ? bopF[0].slice(4).split(',') : [])) {
                const c = e.indexOf(':'), k = c < 0 ? e : e.slice(0, c), v = e.slice(c + 1);
                if (c < 0 || !BOP_KEYS.includes(k) || seen.includes(k)) badKey.push(e);
                else if (!(Number.isFinite(num(v)) || v === 'Infinity')) badNum.push(e);
                else if (num(v) < 0) badNeg.push(e);
                seen.push(k);
            }
            const miss = bopF.length === 1 ? BOP_COLS.filter((k) => !seen.includes(k)) : [];
            if (badKey.length > 0) shape.push('RESULT lane=' + id + ' bop entry ' + badKey.join(',') + ' unknown or repeated key (C-51: keys ' + BOP_KEYS.join(', ') + ' once each)');
            if (miss.length > 0) shape.push('RESULT lane=' + id + ' bop has no ' + miss.join(',') + ' entry (C-51)');
            if (badNum.length > 0) shape.push('RESULT lane=' + id + ' bop entry ' + badNum.join(',') + ' not a number (C-51)');
            if (badNeg.length > 0) shape.push('RESULT lane=' + id + ' bop entry ' + badNeg.join(',') + ' negative (C-55: allocBop prints >= 0 or Infinity)');
            // C-54: the rest of the RESULT line, any lane: A, B, B/A, B-A, aa, slow in fmtS grammar (NUM_RE[NUM_RE..NUM_RE] + unit),
            // NaN[NaN..NaN] only beside the VOID NAN item of a column that field is computed from; the printed word = the word its
            // B/A reads (wordG; NaN reads NONE, as runLane's word() prints); win and spin integers; the tag as the spec gates the lane.
            const vt = rl.indexOf(' VOID=['), nanV = vt < 0 ? [] : rl.slice(vt + 7).replace(/\]$/, '').split('; ').filter((v) => /^NAN [A-Z]+$/.test(v)).map((v) => v.slice(4));
            for (const [k, sfx, deps] of RESULT_NUMS) {
                const t = field(rl, k), x = t !== null && t.endsWith(sfx) ? t.slice(0, t.length - sfx.length) : null;
                const ok = x !== null && ((STAT_RE.test(x) && fin3(stat3(x))) || (x === 'NaN[NaN..NaN]' && deps.some((c) => nanV.includes(c))));
                if (!ok) shape.push('RESULT lane=' + id + ' ' + k + '=' + t + ' off grammar (C-54 / C-56: finite <num>[<num>..<num>]' + sfx + ', NaN only with VOID NAN ' + deps.join(' or ') + ')');
            }
            const pw = field(rl, 'word'), ww = wordG(stat3(field(rl, 'B/A')));
            if (pw !== ww) shape.push('RESULT lane=' + id + ' printed word=' + pw + ' but B/A reads ' + ww + ' (C-54)');
            for (const k of ['win', 'spin']) {
                const t = field(rl, k);
                if (t === null || !/^\d+$/.test(t)) shape.push('RESULT lane=' + id + ' ' + k + '=' + t + ' not an integer (C-54)');
            }
            // C-56: exactly the producer's fields, each once, in its order; a VOID=[..] tail only once and at the end
            const tk = (vt < 0 ? rl : rl.slice(0, vt)).split(' ').slice(3).map((t) => (t.includes('=') ? t.slice(0, t.indexOf('=')) : t));
            if (tk.join(' ') !== RESULT_FIELDS.join(' ')) shape.push('RESULT lane=' + id + ' fields ' + tk.join(',') + ' (C-56: want exactly ' + RESULT_FIELDS.join(',') + ', each once, in that order)');
            const t5 = (vt < 0 ? rl : rl.slice(0, vt)).split(' ')[5];   // review r1: ns/op is a bare token, never a keyed field
            if (tk.join(' ') === RESULT_FIELDS.join(' ') && t5 !== 'ns/op') shape.push('RESULT lane=' + id + ' ns/op token ' + t5 + ' (C-56: the bare unit token ns/op)');
            if (vt >= 0 && !(rl.endsWith(']') && rl.indexOf(' VOID=[', vt + 1) < 0)) shape.push('RESULT lane=' + id + ' VOID tail unparsed (C-56: one VOID=[..] at the end of the line)');
            const tag = Object.hasOwn(sp.gated, id) ? ' (gated) ' : ' (reported) ';
            if (!rl.startsWith('RESULT lane=' + id + tag)) shape.push('RESULT lane=' + id + ' tag is not' + tag.slice(0, -1) + ' (C-54: the tag matches the spec)');
        }
        if (warm.has(id) && warm.get(id).length === 1) {
            const l = warm.get(id)[0], head = 'WARM lane=' + id + WARM_HEAD;
            if (!l.startsWith(head) || !WARM_COLS_RE.test(l.slice(head.length))) shape.push('WARM lane=' + id + ' line unparsed (C-40: want A/A B/A AA/A SLOW/A [AB/A] in that order)');
            else {
                // C-40: every <COL>/A= value NUM_RE and finite, any lane (read per token, apart from the column grammar above)
                const wnf = l.slice(head.length).split(' ').filter((t) => /^[A-Z]+\/A=/.test(t) && !Number.isFinite(num(t.slice(t.indexOf('=') + 1))));
                if (wnf.length > 0) shape.push('WARM lane=' + id + ' value ' + wnf.join(' ') + ' not a finite number (C-40)');
                if (differ !== null) {
                    const nWab = l.slice(head.length).split(' ').filter((t) => t.startsWith('AB/A=')).length;
                    if (differ === true && nWab !== 1) shape.push('WARM lane=' + id + ' AB/A column ' + (nWab === 0 ? 'missing' : 'printed ' + nWab + ' times') + ' with reps ' + rt + ' (C-34: reps differ -> one AB/A)');
                    if (differ === false && nWab !== 0) shape.push('WARM lane=' + id + ' AB/A column with equal reps ' + rt + ' (C-34: want none)');
                }
            }
        }
        if (raw.has(id) && raw.get(id).length === 1) {
            const l = raw.get(id)[0];
            // C-41: the RAW columns are exactly B/A AA SLOW [AB], each once, any lane (a token with no '=' is its own name)
            const rn = l.slice(('RAW lane=' + id + ' ').length).split(' ').map((t) => (t.includes('=') ? t.slice(0, t.indexOf('=')) : t));
            const unk = rn.filter((c) => !RAW_COLS.includes(c));
            if (unk.length > 0) shape.push('RAW lane=' + id + ' column ' + unk.map((c) => JSON.stringify(c)).join(',') + ' unknown (C-41: want exactly B/A AA SLOW [AB])');
            const twice = RAW_COLS.filter((c) => rn.indexOf(c) !== rn.lastIndexOf(c));
            if (twice.length > 0) shape.push('RAW lane=' + id + ' column ' + twice.join(',') + ' printed more than once (C-41)');
            if (differ === true && field(l, 'AB') === null) shape.push('RAW lane=' + id + ' AB column missing with reps ' + rt + ' (C-34: reps differ -> AB of K values)');
            if (differ === false && l.includes(' AB=')) shape.push('RAW lane=' + id + ' AB column with equal reps ' + rt + ' (C-34: want none)');
            for (const c of ['B/A', 'AA', 'SLOW', 'AB']) {
                const t = field(l, c);
                if (t === null) { if (c !== 'AB') shape.push('RAW lane=' + id + ' ' + c + ' column missing'); continue; }
                const vs = t.split(',');
                if (vs.length !== sp.K || vs.some((v) => v === '')) shape.push('RAW lane=' + id + ' ' + c + ' holds ' + vs.length + ' values (want K=' + sp.K + ')');
                const nf = vs.find((v) => !Number.isFinite(num(v)));
                if (nf !== undefined) shape.push('RAW lane=' + id + ' ' + c + ' value ' + JSON.stringify(nf) + ' not a finite number (C-34 / C-14)');
            }
        }
    }
}
const laneTxt = (s) => s.id + ' ' + s.word + ' ' + fmtS(s.ratio, 3);
/** verdictOf(spec, lines) -> { code: 0 PASS | 2 NO VERDICT | 3 FINDING, reported, text } (pure). spec: a judgeSpec
 *  result; a spec object that is not (empty gated, a tool-dialect laneSha that is not 64 hex, an unknown dialect) reads
 *  code 2 (the belt, C-14 / C-33). A non-object spec or a non-array lines throws a TypeError. */
export function verdictOf(sp, lines) {
    if (sp === null || typeof sp !== 'object') throw new TypeError('verdictOf: spec must be a judgeSpec() result');
    if (!Array.isArray(lines)) throw new TypeError('verdictOf: lines must be an array of strings');
    const belt = judgeBelt(sp);
    if (belt !== null) return { code: 2, reported: 'REPORTED (never read by the verdict) none: the judging spec was refused', text: 'VERDICT NO VERDICT (judge spec) ' + belt };
    const tool = ownDialect(sp) === undefined, laneSha = ownLaneSha(sp);
    const ids = sp.laneIds;
    const shape = [];
    let cpu = '?', arch = 'not printed', nodeV = '?';
    const heads = lines.filter((l) => l.startsWith('HEADER rung='));
    if (heads.length !== 1) shape.push(heads.length + ' HEADER rung= lines (want 1)');
    else {
        const m = headReOf(sp.shape).exec(heads[0]);
        if (m === null) shape.push('HEADER rung= line unparsed' + (tool ? headMissing(heads[0], sp.shape) : ''));
        else {
            nodeV = m[3]; if (m[4] !== undefined) arch = m[4]; cpu = m[6];
            if (m[1] !== sp.run) shape.push('rung=' + m[1] + ' (want ' + sp.run + ')');
            if (m[2] !== 'TIMED') shape.push('not TIMED');
            if (m[7] !== String(sp.K)) shape.push('K=' + m[7] + ' (want ' + sp.K + ')');
            if (m[8] !== String(sp.C)) shape.push('C=' + m[8] + ' (want ' + sp.C + ')');
            sp.shape.forEach(([k, want], i) => { if (m[9 + i] !== want) shape.push(k + '=' + m[9 + i] + ' (want ' + want + ')'); });
            const inj = m[9 + sp.shape.length];
            if (inj !== 'null') shape.push('inject=' + inj + ' (want null)');
            if (tool && m[4] === undefined) shape.push('HEADER arch missing (the tool prints arch <process.arch>)');
        }
    }
    if (tool) {
        // R1 fix (nit) + C-33: the HEADER spec line names the lane file by its sha256 (= the judging spec's laneSha) and
        // whether spec.transform edited each frozen text; absent or malformed = run shape.
        const specs = lines.filter((l) => l.startsWith('HEADER spec '));
        if (specs.length !== 1) shape.push(specs.length + ' HEADER spec lines (want 1)');
        else {
            const lsha = field(specs[0], 'lane-sha256'), tr = field(specs[0], 'transform');
            if (lsha === null || !HEX64_RE.test(lsha)) shape.push('HEADER spec lane-sha256 missing');
            else if (lsha !== laneSha) shape.push('lane-sha256=' + lsha.slice(0, 8) + ' (want ' + laneSha.slice(0, 8) + ')');
            if (tr === null || !TR_RE.test(tr)) shape.push('HEADER spec transform missing');
        }
    }
    const stops = lines.filter((l) => l.startsWith('STOP ') || l.startsWith('CRASH '));
    for (const l of stops) shape.push(l.startsWith('CRASH ') ? 'CRASH' : 'STOP ' + l.slice(5).split(':')[0]);
    for (const tag of ['start', 'end']) {
        const pl = lines.filter((l) => l.startsWith('PROV ' + tag + ' '));
        if (pl.length !== 1) shape.push(pl.length + ' PROV ' + tag + ' lines (want 1)');
        else if (tool) {
            const pm = PROV_RE.exec(pl[0]);
            if (pm === null || pm[1] !== tag || Number.isNaN(Date.parse(pm[2])) || new Date(pm[2]).toISOString() !== pm[2]) shape.push('PROV ' + tag + ' line unparsed (want PROV ' + tag + ' <ISO time> load <3 values> busy-node [..] quiet-lock <host>)');
        }
    }
    const res = new Map(), unknown = [], voidKinds = new Map();
    for (const l of lines) {
        const r = /^RESULT lane=(\S+) /.exec(l);
        if (r !== null) {
            if (!ids.includes(r[1])) unknown.push(r[1]);
            else if (res.has(r[1])) res.get(r[1]).push(l);
            else res.set(r[1], [l]);
        }
        const v = /^VOID (\S+) lane=(\S+): /.exec(l);
        if (v !== null) { if (!voidKinds.has(v[2])) voidKinds.set(v[2], []); voidKinds.get(v[2]).push(v[1]); }
    }
    if (unknown.length > 0) shape.push('RESULT for unknown lane(s) ' + unknown.join(','));
    const missing = ids.filter((id) => !res.has(id)), dup = ids.filter((id) => res.has(id) && res.get(id).length !== 1);
    if (missing.length > 0) shape.push('no RESULT for ' + missing.length + ' lane(s) ' + missing.join(','));
    if (dup.length > 0) shape.push('several RESULT lines for ' + dup.join(','));
    if (tool) warmShape(sp, lines, res, shape);
    const st = new Map();
    for (const id of ids) if (res.has(id) && res.get(id).length === 1) st.set(id, laneStateG(tool, id, res.get(id)[0], voidKinds));
    const gatedIds = Object.keys(sp.gated);
    const isG = (id) => Object.hasOwn(sp.gated, id);
    const wrong = gatedIds.filter((id) => st.has(id) && st.get(id).clean && st.get(id).word !== sp.gated[id]);
    const notClean = gatedIds.filter((id) => !st.has(id) || !st.get(id).clean);
    const wrongTxt = wrong.map((id) => laneTxt(st.get(id)) + ' expected ' + sp.gated[id]).join(', ');
    const ncTxt = notClean.map((id) => (st.has(id) ? id + ' ' + st.get(id).why.join(' + ') : id + ' missing')).join(', ');
    const tail = ' | cpu ' + cpu + ' | arch ' + arch + ' | node ' + nodeV;
    const reported = 'REPORTED (never read by the verdict) ' + ids.filter((id) => !isG(id)).map((id) => (!st.has(id) ? id + ' missing'
        : st.get(id).clean ? laneTxt(st.get(id)) : laneTxt(st.get(id)) + ' NOT-CLEAN ' + st.get(id).why.join(' + '))).join(', ');
    const clean = gatedIds.length - notClean.length;
    if (shape.length > 0) {
        const head = stops.length > 0 ? shape.find((s) => s === 'CRASH' || s.startsWith('STOP ')) : 'run shape';
        return { code: 2, reported, text: 'VERDICT NO VERDICT (' + head + ') shape=[' + shape.join('; ') + ']' +
            (wrong.length > 0 ? ' wrong-gated=[' + wrongTxt + ']' : '') + ' gated-clean=' + clean + '/' + gatedIds.length + tail };
    }
    if (wrong.length > 0) {
        return { code: 3, reported, text: 'VERDICT FINDING wrong-gated=[' + wrongTxt + ']' + (notClean.length > 0 ? ' not-clean=[' + ncTxt + ']' : '') +
            ' gated-clean=' + clean + '/' + gatedIds.length + tail };
    }
    if (notClean.length > 0) {
        return { code: 2, reported, text: 'VERDICT NO VERDICT (gated lane not clean) not-clean=[' + ncTxt + '] gated-clean=' + clean + '/' + gatedIds.length + tail };
    }
    return { code: 0, reported, text: 'VERDICT PASS gated=' + gatedIds.length + '/' + gatedIds.length + ' clean, every word as expected' + tail };
}

// ---------------------------------------------------------------- provenance, CLI (ab-gate :1024-1068)
function provenance(ctx, tag) {
    const la = os.loadavg().map((x) => x.toFixed(2)).join(' ');
    let busy = '';
    try {
        const out = execFileSync('ps', ['-Ao', 'pcpu=,pid=,comm='], { encoding: 'utf8' });
        busy = out.split('\n').map((l) => l.trim()).filter((l) => l && /(^|\/)node( |$)/.test(l.split(/\s+/).slice(2).join(' ')) && Number(l.split(/\s+/)[0]) >= 10 && Number(l.split(/\s+/)[1]) !== process.pid).join(' | ');
    } catch (e) { busy = 'ps failed: ' + e.message; }
    say(ctx, 'PROV ' + tag + ' ' + new Date().toISOString() + ' load ' + la + ' busy-node [' + busy + '] quiet-lock ' + (process.env.QUIET_LOCK_HOST || 'none'));
}
function parseCli(argv) {
    // K: null = not given (the gate's declared K is used, resolved after the spec loads)
    const o = { laneFile: null, run: null, K: null, kGiven: false, selftest: false, selftestUntimed: false, oracleOnly: false, verdictFile: null };
    if (argv.length === 0 || argv[0].startsWith('--')) stop('CLI', 'usage: ABGate.js <lane-file.mjs> --run ALL|<ids> [--K k] | --oracle-only | --selftest | --verdict-file <log|->');
    o.laneFile = argv[0];
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--selftest') { o.selftest = true; continue; }
        if (a === '--selftest-untimed') { o.selftestUntimed = true; continue; }   // J2: the untimed selftest rows only (no clock)
        if (a === '--oracle-only') { o.oracleOnly = true; continue; }
        const v = argv[++i];
        if (v === undefined) stop('CLI', a + ' needs a value');
        if (a === '--run') o.run = v;
        else if (a === '--K') { o.K = Number(v); o.kGiven = true; }
        else if (a === '--verdict-file') o.verdictFile = v;
        else stop('CLI', 'unknown flag ' + a + didYouMean(a, ['--run', '--K', '--oracle-only', '--selftest', '--selftest-untimed', '--verdict-file']));
    }
    return finishOpts(o);
}
/** The cross-flag checks shared by the CLI and runGate (ab-proto parseCli :867-871, verbatim). */
function finishOpts(o) {
    if (o.verdictFile !== null && (o.selftest || o.selftestUntimed === true || o.oracleOnly || o.run !== null || o.kGiven)) stop('CLI', '--verdict-file takes no other flag');
    if (o.selftest && (o.oracleOnly || o.run !== null || o.kGiven)) stop('CLI', '--selftest takes no other flag');
    if (o.selftestUntimed === true && (o.selftest || o.oracleOnly || o.run !== null || o.kGiven)) stop('CLI', '--selftest-untimed takes no other flag');
    if (o.oracleOnly && o.run === null) o.run = 'ALL';
    if (!o.selftest && o.selftestUntimed !== true && o.verdictFile === null && o.run === null) stop('CLI', 'give --run ALL|<ids> [--K k], --oracle-only, --selftest, --selftest-untimed or --verdict-file <log|->');
    if (o.kGiven && (!Number.isInteger(o.K) || !(o.K >= 1 && o.K <= K_MAX))) stop('CLI', '--K 1..51');
    return o;
}
function laneSelection(ctx, run) {
    const ids = ctx.spec.lanes.map((l) => l.id);
    if (run === 'ALL') return ids;
    const want = run.split(',');
    for (const id of want) if (!ids.includes(id)) stop('CLI', 'unknown lane ' + id + ' (lanes: ' + ids.join(',') + ')');
    return ids.filter((id) => want.includes(id));
}
function verdictFile(ctx, path) {
    let buf;
    try { buf = readFileSync(path === '-' ? 0 : path); } catch (e) { return stop('CLI', '--verdict-file ' + path + ' unreadable (' + (e.code || e.message) + ')'); }
    const lines = buf.toString('utf8').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    say(ctx, 'VERDICT-FILE ' + (path === '-' ? '(stdin)' : path) + ' sha256 ' + createHash('sha256').update(buf).digest('hex').slice(0, 8) + ' lines=' + lines.length);
    const v = verdictOf(ctx.jspec, lines);
    say(ctx, v.reported);
    say(ctx, v.text);
    return v.code;
}

// ---------------------------------------------------------------- selftest (ab-gate :1143-1216)
function child(ctx, args, env, input) {
    const r = spawnSync(process.execPath, [...process.execArgv, ME, ctx.laneFile, ...args],
        { encoding: 'utf8', env, input, maxBuffer: 1 << 24, timeout: SELFTEST_CASE_MS });
    const out = (r.stdout || '') + (r.stderr || '');
    const vs = out.split('\n').filter((l) => l.startsWith('VERDICT '));
    return { status: r.status, out, vline: vs.length === 1 ? vs[0] : null, nV: vs.length };
}
const REPLAY_RE = /^(RESULT|RAW|VOID|ORACLE|STOP|CRASH) /;
function failReplay(out) {
    const lines = out.split('\n');
    const keep = lines.slice(0, -8).filter((l) => REPLAY_RE.test(l));
    keep.push(lines.slice(-8).join('\n'));
    return keep;
}
function envWith(inject) {
    const env = { ...process.env };
    delete env[INJECT_ENV];
    if (inject !== null) env[INJECT_ENV] = inject;
    return env;
}
/** J2: the clean synthetic TOOL-dialect log over the judging spec `sp` (one HEADER rung= and one HEADER spec line, PROV
 *  start / end in provenance()'s grammar, per lane a RESULT with warm=1, one RAW of K values and one WARM line), as a
 *  function of per-lane patches: lines(patch) -> string[] (patch[id] overrides that lane's RESULT / RAW / WARM fields). */
function synthLog(sp, name, frozenNames) {
    const ids = sp.laneIds;
    const RAT = { FASTER: '0.500[0.490..0.510]', SLOWER: '1.500[1.490..1.510]', WITHIN: '1.000[0.990..1.010]' };
    const BOP4 = 'A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000';
    const isG = (id) => Object.hasOwn(sp.gated, id);
    const want = (id) => (isG(id) ? sp.gated[id] : 'WITHIN');
    const head = 'HEADER rung=ALL TIMED node v0.0.0 arch synthetic v8 0.0 cpu Synthetic CPU K=' + sp.K + ' C=' + sp.C +
        sp.shape.map(([k, v]) => ' ' + k + '=' + v).join('') + ' inject=null';
    const specLine = 'HEADER spec ' + name + ' lane-file synthetic lane-sha256=' + sp.laneSha + ' transform=' + frozenNames.map((n) => n + ':edited').join(',') + ' | tool synthetic';
    const prov = (tag) => 'PROV ' + tag + ' 2026-01-01T00:00:00.000Z load 0.00 0.00 0.00 busy-node [] quiet-lock synthetic';
    const provS = prov('start'), provE = prov('end');
    const res = (id, o) => 'RESULT lane=' + id + (isG(id) ? ' (gated)' : ' (reported)') + ' A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=' + (o.ba ?? RAT[o.w]) + ' word=' + (o.word ?? o.w) +
        ' B-A=0.00[0.00..0.00]ns aa=' + (o.aa ?? '1.000[0.990..1.010]') + ' slow=' + (o.slow ?? '2.000[1.900..2.100]') + ' ab=' + (o.ab ?? 'n/a') + ' B/AB=' + (o.bab ?? 'n/a') + ' wordAB=' + (o.wab ?? 'n/a') +
        ' bop=' + (o.bop ?? BOP4) + ' win=1 reps=' + (o.reps ?? 'A:1,B:1') + ' spin=1' + (o.warm ?? ' warm=1') + (o.tail ?? '');
    const rawOf = (n) => new Array(n).fill('1.0000').join(',');
    // C-34: a patch whose reps differ (A:a,B:b, a != b) also prints the RAW AB column (K values) and the WARM AB/A column
    const repsDiffer = (o) => { const m = /^A:(\d+),B:(\d+)(?:,AB:(\d+))?$/.exec(o.reps ?? ''); return m !== null && Number(m[1]) !== Number(m[2]); };
    const laneLines = (id, o) => {
        const r = rawOf(o.rawN ?? sp.K), ab = repsDiffer(o);
        return [res(id, o), 'RAW lane=' + id + ' B/A=' + r + ' AA=' + r + ' SLOW=' + r + (ab ? ' AB=' + r : ''),
            'WARM lane=' + id + ' round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0000 AA/A=1.0000 SLOW/A=2.0000' + (ab ? ' AB/A=1.0000' : '')];
    };
    const lines = (patch = {}) => [head, specLine, provS, ...ids.flatMap((id) => laneLines(id, { w: want(id), ...(patch[id] || {}) })), provE];
    return { RAT, BOP4, want, head, specLine, provS, provE, res, lines };
}
/** J2 (TASK 3): the TOOL-OWNED judging spec of the untimed judge rows: x:f gated FASTER, x:s gated SLOWER, x:w gated
 *  WITHIN, x:r REPORTED, built by judgeSpec in the tool dialect (laneSha required, C-33). K / C are the consumer's
 *  declared K / C, so the rows check the K / C its gate is judged with (M31). */
function selftestSpec(ctx) {
    return judgeSpec({ laneIds: ['x:f', 'x:s', 'x:w', 'x:r'], gated: { 'x:f': 'FASTER', 'x:s': 'SLOWER', 'x:w': 'WITHIN' },
        shape: [['ops', '64,64,64,64'], ['minWindow', '8,8,8,8']], K: ctx.jspec.K, C: ctx.jspec.C, run: 'ALL',
        laneSha: createHash('sha256').update('lite-ab-gate selftest judge spec').digest('hex') });
}
/** Untimed judge rows (plan-GB A2: 59) on the tool-owned spec, judged in-process by verdictOf: [name, lines, code,
 *  VERDICT prefix, substring the VERDICT line must contain (or null)]. Each row is an edit of the clean synthetic log;
 *  the R1 fix rows (a)-(j), the run-shape rows, the C-11 / C-12 / PROV rows and R0's boundary rows B1-B11 each sit on
 *  the check they name. The empty-gated belt row is run by selftest() (it needs a spec judgeSpec refuses). */
function judgeRows(sp) {
    const S = synthLog(sp, 'selftest', ['k.js']);
    const { RAT, BOP4, want, head, specLine, provS, provE, res, lines } = S;
    const gatedIds = Object.keys(sp.gated), K = sp.K, C = sp.C;
    const BOP5 = BOP4 + ',AB:0.0000';
    const g0 = gatedIds[0], gN = gatedIds[gatedIds.length - 1];
    const flip = sp.gated[g0] === 'SLOWER' ? 'WITHIN' : 'SLOWER';
    const NVS = 'VERDICT NO VERDICT (run shape)', NVG = 'VERDICT NO VERDICT (gated lane not clean)';
    const voidLine = (ls) => { const c = ls.slice(); c.splice(c.length - 1, 0, 'VOID NOT-TF lane=' + gN + ': NOT-TF A#1'); return c; };
    const edit = (ls, from, to) => ls.map((l) => (l === head ? l.replace(from, to) : l));
    const swap = (ls, line, from, to) => ls.map((l) => (l === line ? l.replace(from, to) : l));
    const wN = want(gN);
    const wordExit = wN === 'WITHIN' ? 0 : 3, wordPre = wN === 'WITHIN' ? 'VERDICT PASS' : 'VERDICT FINDING';
    const other = wN === 'WITHIN' ? 'SLOWER' : 'WITHIN';
    const P = (o) => ({ [gN]: o });
    const dupRes = (ls) => { const c = ls.slice(); c.splice(c.length - 1, 0, res(gN, { w: wN })); return c; };
    const AB_OK = { reps: 'A:4,B:1,AB:1', ab: '1.818[1.806..1.850]', bab: RAT[wN], wab: wN, bop: BOP5 };
    const wAlt = wN === 'FASTER' ? 'SLOWER' : 'FASTER';
    return [
        // core 3
        ['judge PASS (every gated lane its GATED word)', lines(), 0, 'VERDICT PASS gated=' + gatedIds.length + '/' + gatedIds.length, null],
        ['judge FINDING (' + g0 + ' clean ' + flip + ')', lines({ [g0]: { w: flip } }), 3, 'VERDICT FINDING wrong-gated=[' + g0 + ' ' + flip, null],
        ['judge NO VERDICT (' + gN + ' A/A 1.080)', lines(P({ aa: '1.080[1.070..1.090]' })), 2, NVG + ' not-clean=[' + gN + ' aa 1.080', null],
        // (a)-(h): one gated lane not clean, each through the check it names; (j) FINDING wins over VOID (AB-G1)
        ['judge (a) VOID NOT-TF line on ' + gN, voidLine(lines()), 2, NVG, gN + ' VOID-line(NOT-TF)'],
        ['judge (b) VOID=[GC-WINDOW] tag on ' + gN, lines(P({ tail: ' VOID=[GC-WINDOW major 1]' })), 2, NVG, gN + ' VOID(GC-WINDOW)'],
        ['judge (c) PROV end dropped', lines().slice(0, -1), 2, NVS, '0 PROV end lines (want 1)'],
        ['judge (d) ' + gN + ' slow 1.200[1.150..1.250]', lines(P({ slow: '1.200[1.150..1.250]' })), 2, NVG, gN + ' slow 1.200[1.150..1.250] not med'],
        ['judge (e) ' + gN + ' bop B:0.0200', lines(P({ bop: 'A:0.0000,B:0.0200,AA:0.0000,SLOW:0.0000' })), 2, NVG, gN + ' bop A:0.0000,B:0.0200'],
        ['judge (f) ' + gN + ' slow q1 1.050', lines(P({ slow: '2.000[1.050..2.100]' })), 2, NVG, gN + ' slow 2.000[1.050..2.100] not med'],
        ['judge (g) ' + gN + ' B/A q3 NaN', lines(P({ ba: RAT[wN].replace(/\.\.[^\]]*\]$/, '..NaN]') })), 2, NVS, 'RESULT lane=' + gN + ' B/A=' + RAT[wN].replace(/\.\.[^\]]*\]$/, '..NaN]') + ' off grammar (C-54'],
        ['judge (h) ' + gN + ' printed word ' + other + ', numbers kept', lines(P({ word: other })), 2, NVS, 'RESULT lane=' + gN + ' printed word=' + other + ' but B/A reads ' + wN + ' (C-54'],
        ['judge (j) FINDING ' + g0 + ' + VOID NOT-TF line on ' + gN, voidLine(lines({ [g0]: { w: flip } })), 3, 'VERDICT FINDING wrong-gated=[' + g0 + ' ' + flip, gN + ' VOID-line(NOT-TF)'],
        // (i) run shape 12, each naming itself
        ['judge (i) K=7', edit(lines(), ' K=' + K + ' ', ' K=7 '), 2, NVS, 'K=7 (want ' + K + ')'],
        ['judge (i) K=' + (K + 1) + ' against the declared ' + K, edit(lines(), ' K=' + K + ' ', ' K=' + (K + 1) + ' '), 2, NVS, 'K=' + (K + 1) + ' (want ' + K + ')'],
        ['judge (i) C=2', edit(lines(), ' C=' + C + ' ', ' C=2 '), 2, NVS, 'C=2 (want ' + C + ')'],
        ['judge (i) inject=aa-drift', edit(lines(), ' inject=null', ' inject=aa-drift'), 2, NVS, 'inject=aa-drift (want null)'],
        ['judge (i) rung=x', edit(lines(), 'HEADER rung=ALL ', 'HEADER rung=x '), 2, NVS, 'rung=x (want ALL)'],
        ['judge (i) HEADER twice', [head, ...lines()], 2, NVS, '2 HEADER rung= lines (want 1)'],
        ['judge (i) ' + gN + ' RESULT twice', dupRes(lines()), 2, NVS, 'several RESULT lines for ' + gN],
        ['judge (i) STOP appended', [...lines(), 'STOP ORACLE: synthetic'], 2, 'VERDICT NO VERDICT (STOP ORACLE)', 'STOP ORACLE'],
        ['judge (i) CRASH appended', [...lines(), 'CRASH Error: synthetic'], 2, 'VERDICT NO VERDICT (CRASH)', 'CRASH'],
        ['judge (i) HEADER spec line dropped', lines().filter((l) => l !== specLine), 2, NVS, '0 HEADER spec lines (want 1)'],
        ['judge (i) HEADER spec lane-sha256 of another lane file', swap(lines(), specLine, sp.laneSha, '0'.repeat(64)), 2, NVS, 'lane-sha256=00000000 (want ' + sp.laneSha.slice(0, 8) + ')'],
        ['judge (i) HEADER spec transform= dropped', swap(lines(), specLine, / transform=\S+/, ''), 2, NVS, 'HEADER spec transform missing'],
        // C-11 (Q-REPS-2) 14: rows (i)-(v), AB bop, equal reps, AB reps, B/AB NaN, B above A, unparsed, forged
        ['judge Q-REPS (i) ' + gN + ' ab 1.818 (REPORTED) + B/AB agreeing', lines(P(AB_OK)), 0, 'VERDICT PASS', null],
        ['judge Q-REPS (ii) ' + gN + ' B/AB reads ' + wAlt + ' vs B/A ' + wN, lines(P({ ...AB_OK, bab: RAT[wAlt], wab: wAlt })), 2, NVG, gN + ' REPS-DRIFT B/AB ' + RAT[wAlt] + ' reads ' + wAlt],
        ['judge Q-REPS (iii) ' + gN + ' reps differ, B/AB missing', lines(P({ ...AB_OK, bab: 'n/a', wab: 'n/a' })), 2, NVS, 'RESULT lane=' + gN + ' B/AB=n/a with reps A:4,B:1,AB:1 (C-47'],
        ['judge Q-REPS (iv) ' + gN + ' printed wordAB=' + wN + ' but B/AB numbers read ' + wAlt, lines(P({ ...AB_OK, bab: RAT[wAlt], wab: wN })), 2, NVS, 'RESULT lane=' + gN + ' printed wordAB=' + wN + ' but B/AB ' + RAT[wAlt] + ' reads ' + wAlt + ' (C-51'],
        ['judge Q-REPS (v) ' + gN + ' B/AB median exactly 1.050 (WITHIN) vs B/A clearly SLOWER', lines(P({ ...AB_OK, ba: RAT.SLOWER, word: 'SLOWER', bab: '1.050[1.040..1.060]', wab: 'WITHIN' })), 2, NVG, gN + ' REPS-DRIFT B/AB 1.050[1.040..1.060] reads WITHIN but B/A 1.500[1.490..1.510] reads SLOWER'],
        ['judge Q-REPS ' + gN + ' reps differ, no AB bop', lines(P({ ...AB_OK, bop: BOP4 })), 2, NVS, 'RESULT lane=' + gN + ' bop holds 0 AB: entries with reps A:4,B:1,AB:1 (C-47'],
        ['judge Q-REPS ' + gN + ' equal reps with a finite B/AB', lines(P({ bab: '1.000[0.990..1.010]' })), 2, NVS, 'RESULT lane=' + gN + ' B/AB=1.000[0.990..1.010] with equal reps A:1,B:1 (C-47'],
        ['judge Q-REPS ' + gN + ' AB timed at A\'s reps (A:4,B:1,AB:4)', lines(P({ ...AB_OK, reps: 'A:4,B:1,AB:4' })), 2, NVS, 'RESULT lane=' + gN + ' reps A:4,B:1,AB:4 AB part 4 != B reps 1 (C-50'],
        ['judge Q-REPS ' + gN + ' reps differ, AB reps not printed', lines(P({ ...AB_OK, reps: 'A:4,B:1' })), 2, NVS, 'RESULT lane=' + gN + ' reps A:4,B:1 AB part missing (C-50'],
        ['judge Q-REPS ' + gN + ' equal reps with an AB reps field', lines(P({ reps: 'A:1,B:1,AB:1' })), 2, NVS, 'RESULT lane=' + gN + ' reps A:1,B:1,AB:1 AB part with equal reps (C-50'],
        ['judge Q-REPS ' + gN + ' B/AB q3 NaN', lines(P({ ...AB_OK, bab: '1.000[0.990..NaN]' })), 2, NVS, 'RESULT lane=' + gN + ' B/AB=1.000[0.990..NaN] not finite (C-51'],
        ['judge Q-REPS ' + gN + ' B\'s reps above A\'s (A:1,B:4,AB:4)', lines(P({ ...AB_OK, reps: 'A:1,B:4,AB:4' })), 0, 'VERDICT PASS', null],
        ['judge Q-REPS ' + gN + ' reps unparsed', lines(P({ reps: 'A:1' })), 2, NVS, gN + ' reps A:1 unparsed'],
        ['judge Q-REPS ' + gN + ' forged AB:1/4', lines(P({ ...AB_OK, reps: 'A:4,B:1,AB:1/4' })), 2, NVS, gN + ' reps A:4,B:1,AB:1/4 unparsed'],
        // C-12 / C-28 (warm) 4
        ['judge warm ' + gN + ' RESULT warm=0', lines(P({ warm: ' warm=0' })), 2, NVS, 'RESULT warm=1 missing for 1 lane(s) ' + gN + ' (warm=0)'],
        ['judge warm ' + gN + ' RESULT warm field missing', lines(P({ warm: '' })), 2, NVS, 'RESULT warm=1 missing for 1 lane(s) ' + gN + ' (no warm field)'],
        ['judge warm ' + gN + ' RAW with K+1 values', lines(P({ rawN: K + 1 })), 2, NVS, 'RAW lane=' + gN + ' B/A holds ' + (K + 1) + ' values (want K=' + K + ')'],
        ['judge warm ' + gN + ' WARM line dropped', lines().filter((l) => !l.startsWith('WARM lane=' + gN + ' ')), 2, NVS, 'WARM lines per lane not 1 for ' + gN + ':0'],
        // PROV / HEADER provenance grammar 4 (tool dialect)
        ['judge prov PROV start load dropped', swap(lines(), provS, ' load 0.00 0.00 0.00', ''), 2, NVS, 'PROV start line unparsed'],
        ['judge prov PROV end timestamp altered', swap(lines(), provE, '2026-01-01T00:00:00.000Z', 'yesterday'), 2, NVS, 'PROV end line unparsed'],
        ['judge prov HEADER arch dropped', edit(lines(), ' arch synthetic', ''), 2, NVS, 'HEADER arch missing'],
        ['judge prov HEADER node dropped', edit(lines(), ' node v0.0.0', ''), 2, NVS, 'HEADER rung= line unparsed (no node field)'],
        // R0 P5 boundary rows 12: one value ON each comparator boundary (or one step past), so a > / >= flip changes the verdict
        ['judge B1 ' + gN + ' aa median exactly 0.950', lines(P({ aa: '0.950[0.940..0.960]' })), 0, 'VERDICT PASS', null],
        ['judge B2 ' + gN + ' aa median exactly 1.050', lines(P({ aa: '1.050[1.040..1.060]' })), 0, 'VERDICT PASS', null],
        ['judge B3 ' + gN + ' slow median exactly 1.250', lines(P({ slow: '1.250[1.200..1.300]' })), 2, NVG, gN + ' slow 1.250[1.200..1.300] not med'],
        ['judge B4 ' + gN + ' slow q1 exactly 1.100', lines(P({ slow: '2.000[1.100..2.100]' })), 2, NVG, gN + ' slow 2.000[1.100..2.100] not med'],
        ['judge B5 ' + gN + ' bop B exactly 1/64', lines(P({ bop: 'A:0.0000,B:0.015625,AA:0.0000,SLOW:0.0000' })), 2, NVG, gN + ' bop A:0.0000,B:0.015625'],
        ['judge B6 ' + gN + ' B/A median exactly 1.050, WITHIN', lines(P({ ba: '1.050[1.040..1.060]', word: 'WITHIN' })), wordExit, wordPre, null],
        ['judge B7 ' + gN + ' B/A q1 exactly 1.000, WITHIN', lines(P({ ba: '1.100[1.000..1.200]', word: 'WITHIN' })), wordExit, wordPre, null],
        ['judge B8 ' + gN + ' B/A median exactly 0.950, WITHIN', lines(P({ ba: '0.950[0.940..0.960]', word: 'WITHIN' })), wordExit, wordPre, null],
        ['judge B9 ' + gN + ' B/A q3 exactly 1.000, WITHIN', lines(P({ ba: '0.900[0.800..1.000]', word: 'WITHIN' })), wordExit, wordPre, null],
        ['judge B10 ' + gN + ' aa q1 literal Infinity', lines(P({ aa: '1.001[Infinity..1.003]' })), 2, NVS, 'RESULT lane=' + gN + ' aa=1.001[Infinity..1.003] off grammar (C-54'],
        ['judge B10b ' + gN + ' slow median 1e309 digits (overflows to Infinity)', lines(P({ slow: '1' + '0'.repeat(309) + '[1.900..2.100]' })), 2, NVS, 'RESULT lane=' + gN + ' slow=1' + '0'.repeat(309) + '[1.900..2.100] off grammar (C-54 / C-56'],
        ['judge B11 ' + gN + ' bop A exactly -0 (>= 0 boundary)', lines(P({ bop: 'A:-0.0000,B:0.0000,AA:0.0000,SLOW:0.0000' })), 0, 'VERDICT PASS', null],
    ];
}
/** J2 (TASK 3): 3 rows on the CONSUMER's own judging spec (its lane ids, GATED, HEADER shape, declared K / C and its
 *  lane-sha256), through a child --verdict-file - (the real exit mapping): [name, log text, exit, prefix, substring]. */
function consumerRows(ctx) {
    const sp = ctx.jspec, gatedIds = Object.keys(sp.gated);
    const { lines } = synthLog(sp, ctx.spec.name, ctx.spec.frozen.map((f) => f.name));
    const txt = (ls) => ls.join('\n') + '\n';
    const g0 = gatedIds[0], gN = gatedIds[gatedIds.length - 1];
    const flip = sp.gated[g0] === 'SLOWER' ? 'WITHIN' : 'SLOWER';
    return [
        ['consumer PASS (every gated lane its GATED word)', txt(lines()), 0, 'VERDICT PASS gated=' + gatedIds.length + '/' + gatedIds.length, null],
        ['consumer FINDING (' + g0 + ' clean ' + flip + ')', txt(lines({ [g0]: { w: flip } })), 3, 'VERDICT FINDING wrong-gated=[' + g0 + ' ' + flip, null],
        ['consumer NO VERDICT (' + gN + ' A/A 1.080)', txt(lines({ [gN]: { aa: '1.080[1.070..1.090]' } })), 2, 'VERDICT NO VERDICT (gated lane not clean) not-clean=[' + gN + ' aa 1.080', null],
    ];
}
/** Untimed allocBop row (review r1 blocker 3): a window that scavenges must read Infinity (the null-window path); a
 *  non-allocating twin must read a finite 0 <= x < 1/64 (so the Infinity is the path, not a constant). */
function allocRow() {
    const mk = (body) => new Function('"use strict"; return function run(st, s, n, reps) { let a = 0; for (let p = 0; p < reps; p++) for (let i = 0; i < n; i++) { ' + body + ' } return a; };')();
    const sink = new Array(256).fill(null);
    const scav = { run: mk('const o = new Array(64); o[0] = i; st.sink[i & 255] = o; a = (a + o.length) | 0;'), state: { sink }, reps: 1 };
    const clean = { run: mk('a = (a + i) | 0;'), state: { sink }, reps: 1 };
    const bS = allocBop(scav, 1 << 16), bC = allocBop(clean, 1 << 12);
    return { ok: bS === Infinity && bC >= 0 && bC < ALLOC_MAX, txt: 'allocBop: scavenging window ' + bS + ' (want Infinity), clean window ' + fmt(bC, 4) + ' (want [0, 1/64))' };
}
/** The run's frozen HEADER line, as main prints it (C-30: a selftest run prints its own, so the frozen-only live-drift
 *  row can prove 'live not bound (frozen only)' in the same run). */
const frozenHeader = (f) => 'HEADER frozen ' + f.name + ' ' + f.frozen + ' sha256 ' + f.sha256.slice(0, 8) + ' ok; ' + (f.live === undefined ? 'live not bound (frozen only)' : 'live ' + f.live + ' byte-identical -- ok (AB-G2)');
const FROZEN_ONLY_TAIL = ' ok; live not bound (frozen only)';
/** A child that stopped before the clock printed no HEADER rung= / PROV start / CONTROL / WINDOW line. */
const preClock = (out) => !/^(HEADER rung=|PROV start |CONTROL gc-window|WINDOW lane=)/m.test(out);
const JUDGE_ROWS = 59;         // plan-GB A2: 58 verdictOf rows on the tool-owned spec + the empty-gated belt row
const SELFTEST_UNTIMED = 5 + JUDGE_ROWS + 3;   // plan-GB A4 = 67: replay, allocRow, empty-gated, live-drift, frozen-drift, 59 judge, 3 consumer
/** U8 (C-37, extends C-21 to real output): pure, cold path. Every line of a child's output `out` is tested ALONE against
 *  every INJECTIONS marker (a line holds no '\n', so the /m flag cannot widen ^ / $ past it; the markers are non-global,
 *  so no lastIndex state). Returns '' when no line is matched by >= 2 markers, else one 'marker clash ...' clause per
 *  such line, naming the markers and the line (cut at 460 chars). The timed loop folds it into the row's `extra`. */
function markerClash(out) {
    const names = Object.keys(INJECTIONS);
    let desc = '';
    for (const l of String(out).split('\n')) {
        const hit = names.filter((n) => INJECTIONS[n].marker.test(l));
        if (hit.length >= 2) desc += (desc === '' ? '' : ';') + ' marker clash: ' + hit.length + ' markers (' + hit.join(', ') + ') match one line ' + JSON.stringify(l.slice(0, 460));
    }
    return desc;
}
/** --selftest (untimed rows, then the timed children) and --selftest-untimed (the untimed rows only): 0 all ok | 1 FAIL.
 *  Every row runs (a row that cannot run is a FAIL, never a skip) and ran === total is checked. */
function selftest(ctx, untimedOnly) {
    let bad = 0, ran = 0;
    const row = (ok, txt, out) => { ran++; say(ctx, 'SELFTEST ' + txt + ' -> ' + (ok ? 'ok' : 'FAIL')); if (!ok) { bad++; if (out) for (const t of failReplay(out)) say(ctx, t); } };
    // J2 (C-30): the same pre-clock source check a timed run makes (frozen sha256 pins, live byte identity), then this
    // run's own frozen HEADER lines
    loadSources(ctx, null);
    for (const f of ctx.spec.frozen) say(ctx, frozenHeader(f));
    const lanes = ctx.spec.lanes, l0 = lanes.find((l) => isGated(ctx, l.id));
    const runId = (l0 === undefined ? lanes[0] : l0).id;
    let TS = null;
    try { TS = selftestSpec(ctx); } catch (e) { say(ctx, 'SELFTEST tool-owned judge spec refused: ' + e.message + ' -> FAIL'); bad++; }
    const jr = TS === null ? [] : judgeRows(TS), cr = consumerRows(ctx);
    // the timed slot (G-B2 / U8): the timed children on the FIRST gated lane (K = 3; warm-skew K = 1), + bent-oracle on
    // every lane whose B entry differs; never built under --selftest-untimed
    const cases = [];
    if (!untimedOnly && l0 !== undefined) {
        for (const name of ['bent-oracle', 'boxed', 'slow-dead', 'aa-drift', 'late-bend', 'post-bend', 'ab-drift', 'warm-skew', 'arr-bend', null]) cases.push([name, l0.id]);
        const bkey = (l) => l.B.source + '\n' + l.B.anchor + '\n' + l.bend[0] + '\n' + l.bend[1];
        const seen = new Set([bkey(l0)]);
        for (const l of lanes) if (!seen.has(bkey(l))) { seen.add(bkey(l)); cases.push(['bent-oracle', l.id]); }
    }
    // planned BEFORE any row runs (A4): a row that is never built or never runs makes ran !== total (a FAIL, never a skip)
    const untimed = SELFTEST_UNTIMED;
    const total = untimed + cases.length;
    // ---- untimed rows, FIRST
    // (1) ABOBS replay proof row (ab-gate :1171-1180)
    const stub = ['HEADER rung=x TIMED (stub)', 'ORACLE lane=x:1 (stub)', 'RESULT lane=x:1 (gated) B/A=1.249[1.247..1.250] word=SLOWER (stub)',
        'RAW lane=x:1 B/A=1.2201,1.2472,1.2491 (stub)', 'VOID AA-DRIFT lane=x:1: AA-DRIFT 1.080[1.070..1.090] (stub)', 'PROV end, a mid-line RESULT is not replayed (stub)',
        'CRASH Error: stub (stub)', 'STOP STUB: the last line before the tail (stub)', 'RESULT lane=x:2 the first tail line (stub)'];
    for (let i = 0; i < 5; i++) stub.push('filler ' + i + ' (stub)');
    stub.push('VERDICT NO VERDICT (stub)', '');
    const stubOut = stub.join('\n'), got = failReplay(stubOut), stubTail = stub.slice(-8).join('\n');
    const wantPre = [stub[1], stub[2], stub[3], stub[4], stub[6], stub[7]];
    const okReplay = stub.length - 3 > 8 && got.length === wantPre.length + 1 && wantPre.every((l, i) => got[i] === l) && got[got.length - 1] === stubTail && String(row).includes('if (out) for (const t of failReplay(out)) say(ctx, t);');
    row(okReplay, 'replay: a failing timed child\'s RESULT / RAW lines ' + (stub.length - 2) + ' / ' + (stub.length - 3) + ' lines from the end (and its ORACLE / VOID lines) are replayed, then its last-8 tail unchanged', stubOut);
    // (2) allocBop's null-window path reads Infinity (blocker 3)
    const ar = allocRow();
    row(ar.ok, ar.txt, null);
    // (3) a spec whose gated map is {} STOPs HARNESS, exit 1 (blocker 1)
    const eg = child(ctx, ['--verdict-file', '-'], envWith(SPEC_INJECT), '');
    const egOk = eg.status === 1 && eg.out.includes('STOP HARNESS: spec: gated must name at least one lane') && eg.vline !== null && eg.vline.startsWith('VERDICT NO VERDICT (STOP HARNESS)');
    row(egOk, 'empty-gated: exit ' + eg.status + ' (want 1) verdict ' + (eg.vline === null ? '(' + eg.nV + ' VERDICT lines)' : JSON.stringify(eg.vline.slice(0, 120))) + ' (want STOP HARNESS: spec: gated must name at least one lane)', egOk ? null : eg.out);
    // (4) live-drift, pre-clock. C-30: with no live binding the row is n/a, and passes ONLY with this run's frozen-only
    // HEADER line for every frozen entry (printed above); a gate with a live binding runs the injected child
    if (ctx.spec.frozen.some((f) => f.live !== undefined)) {
        const sp = INJECTIONS['live-drift'];
        const r = child(ctx, ['--run', runId, '--K', '3'], envWith('live-drift'), undefined);
        const has = sp.marker.test(r.out), pre = preClock(r.out);
        const ok = r.status === sp.want && has && pre && r.vline !== null && r.vline.startsWith(sp.verdict);
        row(ok, 'live-drift ' + runId + ': exit ' + r.status + ' (want ' + sp.want + ') marker ' + String(sp.marker) + ' ' + (has ? 'present' : 'ABSENT') +
            (pre ? ', stopped before the clock' : ', REACHED THE CLOCK') + ' verdict ' + (r.vline === null ? '(' + r.nV + ' VERDICT lines)' : JSON.stringify(r.vline.slice(0, 160))) +
            ' (want ' + JSON.stringify(sp.verdict) + ')', ok ? null : r.out);
    } else {
        const n = ctx.log.filter((l) => l.startsWith('HEADER frozen ') && l.endsWith(FROZEN_ONLY_TAIL)).length, want = ctx.spec.frozen.length;
        row(n === want, 'live-drift: n/a (frozen only): HEADER frozen lines ending "' + FROZEN_ONLY_TAIL.slice(5) + '" in this run ' + n + ' (want ' + want + ', C-30)', null);
    }
    // (5) frozen-drift, pre-clock: one byte of the first frozen file flipped as read -> the frozen-sha ANCHOR STOP
    const fdSp = INJECTIONS['frozen-drift'], f0 = ctx.spec.frozen[0];
    const fd = child(ctx, ['--run', runId, '--K', '3'], envWith('frozen-drift'), undefined);
    const fdHas = fdSp.marker.test(fd.out), fdPre = preClock(fd.out);
    const fdNames = fd.out.includes('STOP ANCHOR: frozen-sha ' + f0.frozen + ' sha256 ') && fd.out.includes(' (want ' + f0.sha256.slice(0, 8) + ')');
    const fdOk = fd.status === fdSp.want && fdHas && fdNames && fdPre && fd.vline !== null && fd.vline.startsWith(fdSp.verdict);
    row(fdOk, 'frozen-drift ' + f0.frozen + ': exit ' + fd.status + ' (want ' + fdSp.want + ') marker ' + String(fdSp.marker) + ' ' + (fdHas ? 'present' : 'ABSENT') +
        (fdNames ? '' : ', the STOP does not name ' + f0.frozen + ' (want ' + f0.sha256.slice(0, 8) + ')') + (fdPre ? ', stopped before the clock' : ', REACHED THE CLOCK') +
        ' verdict ' + (fd.vline === null ? '(' + fd.nV + ' VERDICT lines)' : JSON.stringify(fd.vline.slice(0, 160))) + ' (want ' + JSON.stringify(fdSp.verdict) + ')', fdOk ? null : fd.out);
    // (6) the judge rows on the tool-owned spec, in-process (verdictOf is pure)
    for (const [name, ls, want, prefix, inc] of jr) {
        let v;
        try { v = verdictOf(TS, ls); } catch (e) { v = { code: null, reported: '', text: 'verdictOf threw: ' + (e && e.message) }; }
        const ok = v.code === want && v.text.startsWith(prefix) && (inc === null || v.text.includes(inc));
        row(ok, name + ': code ' + v.code + ' (want ' + want + ') verdict ' + JSON.stringify(v.text.slice(0, 160)) + ' (want ' + JSON.stringify(prefix) + (inc === null ? '' : ' with ' + JSON.stringify(inc)) + ')', ok ? null : v.reported + '\n' + v.text);
    }
    // (7) the empty-gated belt (C-14): a spec object built without judgeSpec, gated {} -> code 2 in both dialects, never 0
    if (TS !== null) {
        const cleanLs = synthLog(TS, 'selftest', ['k.js']).lines();
        const bt = verdictOf({ ...TS, gated: {} }, cleanLs), bl = verdictOf({ ...TS, gated: {}, dialect: DIALECT_7E }, cleanLs);
        const ok = bt.code === 2 && bl.code === 2 && bt.text.startsWith('VERDICT NO VERDICT (judge spec) gated is empty') && bl.text.startsWith('VERDICT NO VERDICT (judge spec) gated is empty');
        row(ok, 'judge belt empty gated: code ' + bt.code + ' (tool) / ' + bl.code + ' (' + DIALECT_7E + ') (want 2 / 2) verdict ' + JSON.stringify(bt.text.slice(0, 120)), ok ? null : bt.text + '\n' + bl.text);
    }
    // (8) the consumer's own spec: synthetic logs through a child --verdict-file - (the real exit mapping)
    for (const [name, text, want, prefix, inc] of cr) {
        const r = child(ctx, ['--verdict-file', '-'], envWith(null), text);
        const ok = r.status === want && r.vline !== null && r.vline.startsWith(prefix) && (inc === null || r.vline.includes(inc));
        row(ok, name + ': exit ' + r.status + ' (want ' + want + ') verdict ' + (r.vline === null ? '(' + r.nV + ' VERDICT lines)' : JSON.stringify(r.vline.slice(0, 160))) + ' (want ' + JSON.stringify(prefix) + (inc === null ? '' : ' with ' + JSON.stringify(inc)) + ')', ok ? null : r.out);
    }
    // ---- the timed slot: children on the FIRST gated lane
    for (const [name, lane] of cases) {
        const others = lanes.length - 1;
        const spec = name === null ? { want: 2, marker: null, verdict: 'VERDICT NO VERDICT (run shape)', names: ['rung=' + lane + ' (want ALL)', 'K=3 (want ' + ctx.jspec.K + ')', ...(others > 0 ? ['no RESULT for ' + others + ' lane(s)'] : [])] } : INJECTIONS[name];
        const k = spec.K ?? 3;
        const r = child(ctx, ['--run', lane, '--K', String(k)], envWith(name), undefined);
        const has = spec.marker === null ? !/^(STOP|CRASH) /m.test(r.out) : spec.marker.test(r.out);
        let extra = '';
        if (spec.absent !== undefined && r.out.includes(spec.absent)) extra += ' ' + JSON.stringify(spec.absent) + ' PRESENT;';
        if (name === null) {
            // fix3 (re-review B1): the clean child's AB really ran at B's reps (RESULT reps=A:a,B:b,AB:b when a != b)
            const rl = r.out.split('\n').find((l) => l.startsWith('RESULT lane=' + lane + ' '));
            const rm = rl === undefined ? null : /^A:(\d+),B:(\d+)(?:,AB:(\d+))?$/.exec(field(rl, 'reps') || '');
            if (rm === null) extra += ' RESULT reps field absent or unparsed;';
            else if (rm[1] !== rm[2] ? rm[3] !== rm[2] : rm[3] !== undefined) extra += ' RESULT reps=' + field(rl, 'reps') + ' (want ' + (rm[1] !== rm[2] ? ',AB:' + rm[2] + ' at the end' : 'no AB') + ');';
        }
        if (name === 'warm-skew') {
            // round 0 really was skewed (WARM AA/A > the band), and the counted AA (K = 1 round) holds 1 value, in band
            const wl = r.out.split('\n').find((l) => l.startsWith('WARM lane=' + lane + ' ')), rl = r.out.split('\n').find((l) => l.startsWith('RAW lane=' + lane + ' '));
            const w0 = wl === undefined ? NaN : num((/ AA\/A=(\S+)/.exec(wl) || [])[1]);
            const raa = rl === undefined ? null : (/ AA=(\S+)/.exec(rl) || [])[1];
            if (!(w0 > AA_HI)) extra += ' WARM AA/A ' + w0 + ' not > ' + AA_HI + ' (the skew did not land in round 0);';
            if (raa === undefined || raa === null || raa.split(',').length !== k) extra += ' RAW AA ' + raa + ' does not hold exactly ' + k + ' counted round(s);';
        }
        // U8 (C-37): one real child line matched by >= 2 INJECTIONS markers fails this row (no new row: counts unchanged)
        const clash = markerClash(r.out);
        if (clash !== '') extra += clash + ';';
        const ok = r.status === spec.want && has && extra === '' && r.vline !== null && r.vline.startsWith(spec.verdict) && !r.vline.includes('verdictOf crashed') &&
            (spec.names === undefined || spec.names.every((s) => r.vline.includes(s)));
        row(ok, (name === null ? 'clean' : name) + ' ' + lane + ' K=' + k + ': exit ' + r.status + ' (want ' + spec.want + ') ' +
            (spec.marker === null ? 'no STOP / CRASH ' + (has ? 'ok' : 'VIOLATED') : 'marker ' + String(spec.marker) + ' ' + (has ? 'present' : 'ABSENT')) + extra +
            ' verdict ' + (r.vline === null ? '(' + r.nV + ' VERDICT lines)' : JSON.stringify(r.vline.slice(0, 200))) + ' (want ' + JSON.stringify(spec.verdict) + ')', ok ? null : r.out);
        // the replayed RESULT / VOID line of an injection child is printed even on ok, so its numbers stay in the log (B18)
        if (ok) for (const l of r.out.split('\n')) if (/^(RESULT|STOP|WARM|VOID) /.test(l)) say(ctx, 'SELFTEST   ' + l.slice(0, 460));
    }
    if (l0 === undefined) { bad++; say(ctx, 'SELFTEST no gated lane in the spec -> FAIL'); }
    if (jr.length !== JUDGE_ROWS - 1 || cr.length !== 3) { bad++; say(ctx, 'SELFTEST rows built: judge ' + jr.length + ' + the belt (want ' + (JUDGE_ROWS - 1) + ' + 1), consumer ' + cr.length + ' (want 3) -> FAIL'); }
    if (ran !== total) { bad++; say(ctx, 'SELFTEST ran ' + ran + ' of ' + total + ' cases -> FAIL'); }
    say(ctx, 'SELFTEST ran ' + ran + ' of ' + total + ' (untimed ' + untimed + ', timed ' + (untimedOnly ? 'not run: --selftest-untimed' : cases.length) + ')');
    say(ctx, 'SELFTEST ' + (bad === 0 ? 'all ok' : bad + ' FAIL'));
    return bad === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- main (ab-gate :1218-1276)
/** One run (ab-proto main() after parseCli): `o` = the checked options, every line goes through ctx. */
async function main(ctx, o) {
    const inject = process.env[INJECT_ENV] === undefined ? null : process.env[INJECT_ENV];   // read per run
    await loadSpec(ctx, o.laneFile, inject);
    if (o.verdictFile !== null) return verdictFile(ctx, o.verdictFile);
    armNatives();
    if (o.selftest || o.selftestUntimed === true) return selftest(ctx, o.selftestUntimed === true);
    if (inject !== null && !Object.hasOwn(INJECTIONS, inject)) stop('CLI', INJECT_ENV + ' unknown: ' + inject);
    if (inject !== null && o.oracleOnly) stop('CLI', INJECT_ENV + ' is for timed runs only');
    // C-4 / C-19: no --K = the declared K; C is always the declared C (the judge checks both against the declared values)
    const K = o.K === null ? ctx.jspec.K : o.K, C = ctx.jspec.C;
    const sel = laneSelection(ctx, o.run);
    const SRC = loadSources(ctx, inject);
    const runName = sel.length === ctx.spec.lanes.length ? 'ALL' : sel.join(',');
    say(ctx, 'HEADER rung=' + runName + (o.oracleOnly ? ' ORACLE-ONLY (no clock)' : ' TIMED') + ' node ' + process.version + ' arch ' + process.arch + ' v8 ' + process.versions.v8 +
        ' cpu ' + os.cpus()[0].model + ' K=' + K + ' C=' + C + ctx.jspec.shape.map(([k, v]) => ' ' + k + '=' + v).join('') + ' inject=' + inject);
    say(ctx, 'HEADER spec ' + ctx.spec.name + ' lane-file ' + ctx.laneFile + ' lane-sha256=' + ctx.laneSha + ' transform=' + ctx.transformed.join(',') +
        ' | tool ' + ME + ' sha256 ' + createHash('sha256').update(readFileSync(ME)).digest('hex').slice(0, 8));
    for (const f of ctx.spec.frozen) say(ctx, 'HEADER frozen ' + f.name + ' ' + f.frozen + ' sha256 ' + f.sha256.slice(0, 8) + ' ok; ' + (f.live === undefined ? 'live not bound (frozen only)' : 'live ' + f.live + ' byte-identical -- ok (AB-G2)'));
    say(ctx, 'HEADER columns: A = base kernel, B = candidate, AA = A twin (fresh compilation), SLOW = A + spin at the A anchor, AB = A twin (fresh compilation) timed at B\'s reps, present only when B\'s reps differ from A\'s (then B/AB and wordAB are printed; else n/a); K + 1 rounds per window, round 0 a warm round discarded from every column (WARM line); flags ' + REQUIRED_FLAGS.join(' '));
    for (const l of ctx.spec.lanes) say(ctx, 'HEADER lane ' + l.id + ' A=' + l.A.source + ' B=' + l.B.source + ' ops=' + l.ops + ' minWindow=' + l.minWindow + ' spin=' + l.spin + ' recLen=' + l.recLen);
    say(ctx, 'HEADER rule: per OS, PASS = every gated lane reads its GATED word with its controls valid (aa median in [' + AA_LO + ', ' + AA_HI + '], slow median > ' + SLOW_MED +
        ' and q1 > ' + SLOW_Q1 + ', B/AB (B against AB = A at B\'s reps) reading the same word as B/A when B\'s reps differ from A\'s (else REPS-DRIFT; ab = AB / A is REPORTED, no band; equal reps print ab, B/AB, wordAB = n/a), bop A, B, AA, SLOW (+ AB when present) each in [0, 1/64), all finite); FINDING = a clean gated lane reads another word (even with other gated lanes VOID); NO VERDICT = any VOID or missing gated lane, a wrong run shape (one HEADER rung=ALL TIMED with K=' + ctx.jspec.K + ' C=' + ctx.jspec.C + ' and the shape fields, inject=null, one HEADER spec line with this lane file\'s lane-sha256 and transform=, one PROV start / end, one RESULT per lane) or any STOP / CRASH. NO VERDICT is never a PASS.');
    say(ctx, 'HEADER GATED ' + Object.keys(ctx.spec.gated).map((id) => id + '=' + ctx.spec.gated[id]).join(' ') + '; every other lane REPORTED');
    provenance(ctx, 'start');
    if (!o.oracleOnly) await gcControl(ctx);
    if (!o.oracleOnly) armTimed(inject);   // C-23: once per timed run, after the gc-window control, before any lane
    const rows = [];
    for (const l of ctx.spec.lanes) {
        if (!sel.includes(l.id)) continue;
        const L = buildLane(l);
        const cols = makeCols(L, inject, SRC);
        rows.push(o.oracleOnly ? oracleLane(ctx, L, cols, K) : await runLane(ctx, L, cols, K, inject));
    }
    if (rows.length === 0) stop('CLI', 'no lane selected');
    provenance(ctx, 'end');
    if (o.oracleOnly) {
        const code = rows.some((x) => x.gated && x.voids.length > 0) ? 2 : 0;
        let ops = 0;
        for (const x of rows) ops += x.ops;
        say(ctx, 'ORACLE-ONLY ' + runName + ': lanes=' + rows.length + ' records-checked=' + ops + ' -> ' + (code === 0 ? 'clean' : 'VOID on a gated lane'));
        return code;
    }
    // C-20: the gate's cross-lane controls see deep-frozen copies of the rows; stop() -> STOP HARNESS -> NO VERDICT
    if (ctx.spec.harnessControls !== undefined) ctx.spec.harnessControls(freezeDeep(copyDeep(rows, new Map(), false), new Set()), (msg) => stop('HARNESS', msg));
    const v = verdictOf(ctx.jspec, ctx.log.slice());
    say(ctx, v.reported);
    say(ctx, v.text);
    return v.code;
}

/** ab-proto :1132-1139 (the STOP / CRASH handler), per run: the STOP / CRASH line, then the judge's verdict of this run's
 *  log so far (or "no spec loaded"); the run returns 1. Never touches process.exitCode. */
async function guarded(ctx, body) {
    try {
        return await body();
    } catch (e) {
        const head = e instanceof Stop ? 'STOP ' + e.reason : 'CRASH';
        say(ctx, e instanceof Stop ? 'STOP ' + e.reason + ': ' + e.message : 'CRASH ' + (e && e.stack));
        let text;
        if (ctx.jspec === null) text = 'VERDICT NO VERDICT (' + head + ') no spec loaded';
        else { try { text = verdictOf(ctx.jspec, ctx.log.slice()).text; } catch (e2) { text = 'VERDICT NO VERDICT (' + head + ') verdictOf crashed: ' + (e2 && e2.message); } }
        say(ctx, text);
        return EXIT.STOP;
    }
}
const RUN_OPTS = ['run', 'K', 'oracleOnly', 'out'];
/** runGate(gateFile, { run, K, oracleOnly, out }) -> Promise<0|1|2|3> (EXIT). gateFile: a path (relative = against the cwd).
 *  run: 'ALL' or comma-separated lane ids; K: 1..51 (default = the declared K; any other K is a research run, NO VERDICT);
 *  oracleOnly: no clock; out: { write(s) } (default process.stdout), every printed line goes to out.write(line + '\n').
 *  A bad option is STOP CLI (exit 1, printed); only an `out` without write(s) throws (there is nowhere to print). */
export async function runGate(gateFile, opts) {
    const o = opts === undefined ? {} : opts;
    const out = o !== null && typeof o === 'object' && Object.hasOwn(o, 'out') && o.out !== undefined ? o.out : process.stdout;
    if (out === null || (typeof out !== 'object' && typeof out !== 'function') || typeof out.write !== 'function') throw new TypeError('runGate: out must be an object with a write(s) method');
    const ctx = newCtx(out);
    return guarded(ctx, () => {
        if (o === null || typeof o !== 'object' || Array.isArray(o) || (Object.getPrototypeOf(o) !== Object.prototype && Object.getPrototypeOf(o) !== null) || Object.getOwnPropertySymbols(o).length !== 0) stop('CLI', 'runGate: options must be a plain object');
        for (const k of Object.keys(o)) if (!RUN_OPTS.includes(k)) stop('CLI', 'runGate: unknown option ' + k + didYouMean(k, RUN_OPTS));
        if (typeof gateFile !== 'string' || gateFile === '') stop('CLI', 'runGate: gateFile must be a non-empty path string');
        const run = Object.hasOwn(o, 'run') ? o.run : undefined, K = Object.hasOwn(o, 'K') ? o.K : undefined, oracleOnly = Object.hasOwn(o, 'oracleOnly') ? o.oracleOnly : undefined;   // own keys only
        if (run !== undefined && typeof run !== 'string') stop('CLI', 'runGate: run must be a string (ALL or lane ids)');
        if (oracleOnly !== undefined && typeof oracleOnly !== 'boolean') stop('CLI', 'runGate: oracleOnly must be a boolean');
        const opt = finishOpts({ laneFile: gateFile, run: run === undefined ? null : run, K: K === undefined ? null : K, kGiven: K !== undefined,
            selftest: false, selftestUntimed: false, oracleOnly: oracleOnly === true, verdictFile: null });
        return main(ctx, opt);
    });
}
/** The CLI: argv as ab-proto's (incl. --selftest and --verdict-file), printed to process.stdout. */
function cli(argv) {
    const ctx = newCtx(process.stdout);
    return guarded(ctx, () => main(ctx, parseCli(argv)));
}
function isMain() {
    try { return typeof process.argv[1] === 'string' && realpathSync(process.argv[1]) === realpathSync(ME); } catch (e) { return false; }
}
// the ONLY place in this file that sets process.exitCode
if (isMain()) cli(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write('CRASH ' + (e && e.stack) + '\n'); process.exitCode = 1; });
