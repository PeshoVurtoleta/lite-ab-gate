// ABGate.d.ts -- @zakkster/lite-ab-gate: types for the STATISTICAL timing A/B gate.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
// ASCII only. Matches ABGate.js export for export (names, optionality, readonly, literal types).
// judgeSpec is declared in its RULED J1 shape (C-27); the J1 coder unit makes the code match and may adjust this delta.

/** A verdict word printed per lane: B/A against the A/A band (C-5). (LaneRow.word and wordAB also admit 'NONE' = a non-finite median.) */
export type Word = 'FASTER' | 'SLOWER' | 'WITHIN';

/** Median and quartiles of a per-round ratio / time vector. Any field can be NaN when the vector holds a non-finite value. */
export interface Stat {
    readonly med: number;
    readonly q1: number;
    readonly q3: number;
}

/** One column of a lane: kernel SOURCE TEXT bound to a frozen file (C-13). All text, compiled fresh per copy. */
export interface Col {
    /** The `frozen[].name` this column's kernel comes from. */
    readonly source: string;
    /** Unique text in the (transformed) source, ending in `{`: the opening of the entry body. */
    readonly anchor: string;
    /** Text starting `function setup(`: builds the copy state; runs inside the copy's own scope. */
    readonly setup: string;
    /** Text starting `function run(`: `run(st, start, n, reps)` returns an int32 fold over ops [start, start + n) x reps. */
    readonly run: string;
    /** Text starting `function one(`: `one(st, op)` returns a Float64Array whose first recLen slots are op's record. */
    readonly one: string;
}

/** What `lane.make()` returns: the lane data, the independent oracle and the per-op int32 fold. */
export interface LaneMade {
    /** Typed arrays (copied per copy) and scalars only; anything else is a HARNESS stop. */
    readonly data: { readonly [key: string]: ArrayBufferView | number | string | boolean };
    /** The reference: writes op's record into out[off .. off + recLen). */
    readonly ref: (op: number, out: Float64Array, off: number) => void;
    /** The in-clock fold of one op's record, an int32. */
    readonly foldOf: (rec: Float64Array, off: number) => number;
}

/** One lane: an A column against a B column over `ops` operations. */
export interface Lane {
    /** Letters, digits and `: . _ -` only. Unique. */
    readonly id: string;
    /** Power of two, 4 .. 2^24. */
    readonly ops: number;
    /** 1 .. ops / 2. */
    readonly minWindow: number;
    /** Positive integer: the SLOW column's spin per kernel entry (the tool never calibrates it, C-6). */
    readonly spin: number;
    /** Positive integer: record length in Float64 slots. */
    readonly recLen: number;
    readonly A: Col;
    readonly B: Col;
    /** `[from, to]`, two different strings: the bent-oracle selftest edit of B's text. */
    readonly bend: readonly [string, string];
    readonly make: () => LaneMade;
    /** Optional: a reason text when the window [start, start + n) holds too little work, else null. */
    readonly workFloor?: (start: number, n: number) => string | null;
}

/** A frozen kernel file, pinned by sha256 (whole-file identity), optionally bound to its live twin. */
export interface Frozen {
    /** No `:`, `,` or whitespace (it is printed in the HEADER transform= field). */
    readonly name: string;
    /** Path to the frozen file. Relative = against the gate file's directory; absolute = local only (STOP HARNESS when GITHUB_ACTIONS=true). */
    readonly frozen: string;
    /** Full 64-hex sha256 of the frozen file. */
    readonly sha256: string;
    /** Optional path to the live file, which must be byte-identical to the frozen one (else STOP ANCHOR). Same path rules. No live = frozen only. */
    readonly live?: string;
}

/**
 * The per-lane row handed (deep-frozen) to `harnessControls` on a timed run, before the verdict (C-20).
 * Rows are plain data: every object and array in them is frozen.
 */
export interface LaneRow {
    readonly lane: string;
    readonly gated: boolean;
    /** B / A per round. */
    readonly ratio: Stat;
    /** B - A in ns per round. */
    readonly delta: Stat;
    /** AA / A (the A/A noise twin). */
    readonly aa: Stat;
    /** SLOW / A (the spin control). */
    readonly slow: Stat;
    /** AB / A (REPORTED only) or null when B's reps equal A's. */
    readonly ab: Stat | null;
    /** B / AB or null when B's reps equal A's. */
    readonly bab: Stat | null;
    readonly wordAB: Word | 'NONE' | 'n/a';
    /** Per column (A, B, AA, SLOW, and AB when present): ns per op. */
    readonly ns: { readonly [col: string]: Stat };
    /** Per column: bytes per op. */
    readonly bop: { readonly [col: string]: number };
    /** The window length in ops. */
    readonly win: number;
    readonly reps: number;
    readonly repsB: number;
    /** VOID reasons, each starting with its kind (SLOW-DEAD, AA-DRIFT, ...). */
    readonly voids: readonly string[];
    readonly word: Word | 'NONE';
}

/** The gate spec: the default export of a gate file, or the argument of `defineGate`. Plain objects only. Unknown keys fail closed. */
export interface GateSpec {
    /** Letters, digits and `: . _ -` only. */
    readonly name: string;
    /** Non-empty. */
    readonly frozen: readonly Frozen[];
    /** Turns a frozen file's text into the kernel text the columns anchor in. */
    readonly transform: (name: string, text: string) => string;
    /** Lane id -> expected word. Non-empty (C-14: an empty map throws). Every key must be a lane id. */
    readonly gated: { readonly [laneId: string]: Word };
    /** Extra HEADER shape fields, `[key, value]` (key letters / digits; value no whitespace; not ops, minWindow, K, C, inject). */
    readonly shape?: ReadonlyArray<readonly [string, string]>;
    /** Non-empty. */
    readonly lanes: readonly Lane[];
    /** Optional cross-lane controls on a timed run: `stop(msg)` throws STOP HARNESS -> NO VERDICT. */
    readonly harnessControls?: (rows: readonly LaneRow[], stop: (msg: string) => never) => void;
    /** Rounds per window: an integer in 11 .. 51 (C-4 / C-19: a gate may raise K, never lower it). Default K_ROUNDS. */
    readonly K?: number;
    /** Fresh compilations per column: an integer in 3 .. 9 (C-4 / C-19). Default C_COPIES. */
    readonly C?: number;
}

/** judgeSpec input (C-27). Band, SLOW and ALLOC limits are constants (AA_LO ...), not keys. */
export interface JudgeSpecInput {
    /** Every lane id of the gate. */
    readonly laneIds: readonly string[];
    /** Lane id -> expected word; every key must be in laneIds. */
    readonly gated: { readonly [laneId: string]: Word };
    /** The extra HEADER shape pairs, as `[key, value]` in HEADER order. Default []. */
    readonly shape?: ReadonlyArray<readonly [string, string]>;
    /** Declared K the log must print. Default K_ROUNDS. */
    readonly K?: number;
    /** Declared C the log must print. Default C_COPIES. */
    readonly C?: number;
    /** The rung the log must name. Default 'ALL'. */
    readonly run?: string;
    /** The gate file's sha256 the HEADER spec line must carry. Omit = not checked. NOTE: it covers the top gate file only. */
    readonly laneSha?: string;
    /** The one judge-only dialect: skips the 4 tool-only checks (HEADER spec line, reps / AB / n-a, warm, PROV grammar). API only, never from a gate file or the CLI. */
    readonly dialect?: 'ab-gate@7e0f9262';
}

/** The validated judging spec (frozen). Build it with `judgeSpec`. */
export interface JudgeSpec {
    readonly laneIds: readonly string[];
    readonly gated: { readonly [laneId: string]: Word };
    readonly shape: ReadonlyArray<readonly [string, string]>;
    readonly K: number;
    readonly C: number;
    readonly run: string;
    readonly laneSha: string | null;
    readonly dialect?: 'ab-gate@7e0f9262';
}

/** What `verdictOf` returns. */
export interface Judgement {
    /** 0 PASS | 2 NO VERDICT | 3 FINDING (1 is STOP / CRASH, never returned by the judge). */
    readonly code: 0 | 2 | 3;
    /** The `VERDICT ...` line. */
    readonly text: string;
    /** The `REPORTED (never read by the verdict) ...` line. */
    readonly reported: string;
}

/** `runGate(gateFile, opts)` options. A PLAIN object only (own keys; a prototype or Symbol key is STOP CLI). */
export interface RunOptions {
    /** 'ALL' (default for oracleOnly) or comma-separated lane ids. A subset is always NO VERDICT. */
    readonly run?: string;
    /** 1 .. 51. Default = the gate's declared K; any other K is a research run (NO VERDICT, shape mismatch). */
    readonly K?: number;
    /** No clock: oracle + fold + TF + workFloor only. */
    readonly oracleOnly?: boolean;
    /** Where every printed line goes, `write(line + '\n')`. Default process.stdout. */
    readonly out?: { write(s: string): unknown };
}

/** The exit code table: 0 PASS | 1 STOP / CRASH | 2 NO VERDICT | 3 FINDING. */
export declare const EXIT: Readonly<{ PASS: 0; STOP: 1; NO_VERDICT: 2; FINDING: 3 }>;
/** The tool's K (C-4): a gate may declare 11 .. 51. */
export declare const K_ROUNDS: 11;
/** The tool's C (C-4): a gate may declare 3 .. 9. */
export declare const C_COPIES: 3;
/** The A/A band, low edge: aa median must be >= this. */
export declare const AA_LO: 0.95;
/** The A/A band, high edge: aa median must be <= this. */
export declare const AA_HI: 1.05;
/** SLOW control: median must be > this. */
export declare const SLOW_MED: 1.25;
/** SLOW control: q1 must be > this. */
export declare const SLOW_Q1: 1.1;
/** Bytes per op limit (1/64): each column's bop must be in [0, this). */
export declare const ALLOC_MAX: 0.015625;
/** The node flags a gate run needs (the CLI / runGate stop with STOP FLAGS when one is missing). */
export declare const REQUIRED_FLAGS: readonly [
    '--expose-gc',
    '--allow-natives-syntax',
    '--no-concurrent-recompilation',
    '--min-semi-space-size=4',
    '--max-semi-space-size=4',
    '--single-threaded-gc',
];

/**
 * Validate a gate spec and return a deep-frozen copy (plain objects and arrays copied and frozen; functions kept by
 * reference). Throws an Error whose `.reason === 'HARNESS'` on the first violation: an unknown key, an empty `gated`
 * map ("spec: gated must name at least one lane"), a K below 11 or a C below 3 (cites C-4), a non-plain object.
 */
export declare function defineGate(spec: GateSpec): Readonly<GateSpec>;

/**
 * Build a judging spec. Throws when a gated id is not in laneIds. Note: lane-sha256 covers the top gate file only (its
 * imports stay module-cached).
 */
export declare function judgeSpec(o: JudgeSpecInput): JudgeSpec;

/** The pure verdict of a saved log (the live run and `--verdict-file` use the same function). No module state. */
export declare function verdictOf(spec: JudgeSpec, lines: readonly string[]): Judgement;

/**
 * Run a gate file in-process: import it (by content hash: lane-sha256 covers the top gate file only, its imports stay
 * module-cached), validate it, run it, print every line to `opts.out` (default process.stdout). Resolves to the exit
 * code (EXIT) and never sets process.exitCode. A bad option or gate is STOP (1, printed); only an `out` without
 * `write(s)` rejects. `opts` must be a plain object (own keys only). The process needs REQUIRED_FLAGS.
 */
export declare function runGate(gateFile: string, opts?: RunOptions): Promise<0 | 1 | 2 | 3>;
