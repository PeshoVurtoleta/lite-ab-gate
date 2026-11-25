// test/types/consumer.ts -- the type-level consumer of @zakkster/lite-ab-gate (G-A B3). consumer.test.mjs stages it beside
// a temp node_modules/@zakkster/lite-ab-gate and runs tsc (strict, noEmit). Every `@ts-expect-error` marks a call that
// MUST be a type error (an unused one is TS2578 = FAIL). The FIRST `@ts-expect-error` is control (b)'s: stripped, it
// must give exactly one diagnostic, TS2353 (an unknown spec key). Keep it first.
import { defineGate, runGate, verdictOf, judgeSpec, K_ROUNDS, C_COPIES, AA_LO, AA_HI, SLOW_MED, SLOW_Q1, ALLOC_MAX, REQUIRED_FLAGS, EXIT } from "@zakkster/lite-ab-gate";
import type { GateSpec, Lane, Col, Frozen, LaneRow, Stat, Judgement, JudgeSpecInput } from "@zakkster/lite-ab-gate";

const col: Col = { source: "k.js", anchor: "function f(x) {", setup: "function setup(d) { return d; }", run: "function run(st, s, n, r) { return 0; }", one: "function one(st, op) { return st; }" };
const lane: Lane = { id: "a:b", ops: 1024, minWindow: 64, spin: 16, recLen: 2, A: col, B: col, bend: ["x", "y"],
    make: () => ({ data: { x: new Int32Array(4), n: 4 }, ref: (op, out, off) => { out[off] = op; }, foldOf: (rec, off) => rec[off] | 0 }),
    workFloor: (start, n) => (n > 0 ? null : "empty") };
const fz: Frozen = { name: "k.js", frozen: "frozen/k.js", sha256: "0".repeat(64) };            // live is optional
const fzLive: Frozen = { ...fz, live: "live/k.js" };
const spec: GateSpec = { name: "g", frozen: [fz, fzLive], transform: (name, text) => text, gated: { "a:b": "WITHIN" }, lanes: [lane],
    K: 13, C: 4, shape: [["k", "v"]], harnessControls: (rows, stop) => { const r: LaneRow = rows[0]; const s: Stat = r.ratio; if (!(s.med < 2)) stop("x"); } };

// @ts-expect-error an unknown key is a type error (and a runtime HARNESS stop)
const bad1: GateSpec = { ...spec, kk: 1 };
// @ts-expect-error a word outside FASTER / SLOWER / WITHIN
const bad2: GateSpec = { ...spec, gated: { "a:b": "BIGGER" } };
// @ts-expect-error gated is required
const bad3: GateSpec = { name: "g", frozen: [fz], transform: (n: string, t: string) => t, lanes: [lane] };
// @ts-expect-error runGate options: K is a number
runGate("g.mjs", { K: "13" });
// @ts-expect-error runGate options: out needs write(s)
runGate("g.mjs", { out: {} });
// @ts-expect-error runGate options: unknown key
runGate("g.mjs", { oracle: true });
// @ts-expect-error the only dialect is 'ab-gate@7e0f9262'
const bad4: JudgeSpecInput = { laneIds: ["a"], gated: { a: "WITHIN" }, dialect: "other" };
// @ts-expect-error constants are literal types, not assignable
const bad5: 12 = K_ROUNDS;
// @ts-expect-error a Judgement is not a bare string
const bad6: string = verdictOf(judgeSpec({ laneIds: ["a"], gated: { a: "WITHIN" } }), []);

const g = defineGate(spec);
const p: Promise<0 | 1 | 2 | 3> = runGate("g.mjs", { run: "ALL", K: 13, oracleOnly: true, out: { write: (s: string) => s.length } });
const j: Judgement = verdictOf(judgeSpec({ laneIds: ["a:b"], gated: { "a:b": "WITHIN" }, shape: [["k", "v"]], K: 13, C: 4, run: "ALL", laneSha: "ab", dialect: "ab-gate@7e0f9262" }), ["x"]);
const code: 0 | 2 | 3 = j.code;
const k: 11 = K_ROUNDS, c: 3 = C_COPIES, lo: 0.95 = AA_LO, hi: 1.05 = AA_HI, sm: 1.25 = SLOW_MED, sq: 1.1 = SLOW_Q1, am: 0.015625 = ALLOC_MAX;
const flag: string = REQUIRED_FLAGS[0];
const ex: 3 = EXIT.FINDING;
export { g, p, code, k, c, lo, hi, sm, sq, am, flag, ex, bad1, bad2, bad3, bad4, bad5, bad6 };
