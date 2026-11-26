# @zakkster/lite-ab-gate

> The STATISTICAL timing A/B gate for zero-GC kernels. Freshly compiled A and B copies, a per-run A/A noise twin, a SLOW control, fail-closed verdict words (FASTER / SLOWER / WITHIN / VOID) and one exit code. Run once per release candidate, never inside `npm test`.

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-ab-gate.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-ab-gate)
[![sponsor](https://img.shields.io/badge/sponsor-PeshoVurtoleta-ea4aaa.svg?logo=github)](https://github.com/sponsors/PeshoVurtoleta)
![Zero-GC](https://img.shields.io/badge/Zero--GC-Engine-00C853?style=for-the-badge&logo=leaf&logoColor=white)
[![npm downloads](https://img.shields.io/npm/dm/@zakkster/lite-ab-gate?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-ab-gate)
![TypeScript](https://img.shields.io/badge/TypeScript-Types-informational)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE.txt)

## The timing gate the ecosystem was missing

Every `@zakkster` kernel claims "zero allocation" and "not slower than before". The first half is a count and `npm test` can gate it. The second half is a ratio of two noisy timings, and a fixed threshold inside `npm test` is a flake waiting to happen. `lite-ab-gate` is the piece in between: a gate that compiles your frozen kernel (A) and your candidate (B) fresh, times them interleaved with a noise twin of A beside them, and prints one verdict that fails closed.

```bash
npm install --save-dev @zakkster/lite-ab-gate
```

Zero runtime dependencies. Node >= 22 (the zero-tool-bytes claim below is scoped to node >= 26).

```js
// bench/ab.gate.mjs -- the default export is the gate spec (see examples/ab.gate.mjs for a complete file)
import { defineGate } from '@zakkster/lite-ab-gate';

export default defineGate({
    name: 'my-kernel',
    frozen: [{ name: 'kernel.js', frozen: 'kernel.frozen.js', sha256: '<64 hex of the frozen file>' }],
    transform: (name, text) => text,
    gated: { 'lane-1': 'WITHIN' },          // declared BEFORE any run, never derived from one
    lanes: [/* { id, ops, minWindow, spin, recLen, A, B, bend, make } */],
});
```

```bash
FLAGS="--expose-gc --allow-natives-syntax --no-concurrent-recompilation --min-semi-space-size=4 --max-semi-space-size=4 --single-threaded-gc"
node $FLAGS node_modules/@zakkster/lite-ab-gate/ABGate.js bench/ab.gate.mjs --run ALL
```

The last printed line is `VERDICT PASS`, `VERDICT FINDING ...` or `VERDICT NO VERDICT ...`, and the process exit code says the same (0 / 3 / 2; 1 is a STOP or a crash).

## Table of contents

- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [The gate file and the lane contract](#the-gate-file-and-the-lane-contract)
- [Verdicts, words and VOID kinds](#verdicts-words-and-void-kinds)
- [API reference](#api-reference)
- [Composability](#composability)
- [Zero-GC design notes](#zero-gc-design-notes)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Testing](#testing)
- [What this is not](#what-this-is-not)
- [Ecosystem](#ecosystem)
- [License](#license)

## Why this exists

A timing claim is STATISTICAL, and the suite tiers claims by how they may be gated. Allocation counts, parity and types are DETERMINISTIC and run in `npm test` on every push. A speed ratio is gated once per release candidate by a procedure built for noise, never by a fixed threshold in `verify`. The method here was extracted from LiteBisect's `bench/ab-gate.mjs` (7e0f9262) and proven on a second package's lane (prototype `ab-proto` 74f1a3d4) before it became a package of its own (C-1).

## What you get

- **Fresh compilation per copy.** Kernels are per-column SOURCE TEXT. Each column is compiled C = 3 times (a gate may raise C) through a nonce'd `new Function`, so no copy shares a closure, a feedback vector or an inline cache with another (C-13).
- **A per-run noise twin.** Column AA is A again. Its ratio to A must sit in the A/A band [0.95, 1.05], else the lane is VOID AA-DRIFT: the host was too noisy to read a word (C-8).
- **A SLOW control.** Column SLOW is A plus a declared spin. If the spin does not read slower, the gate cannot see slowdowns on this host and the lane is VOID SLOW-DEAD (C-6).
- **K = 11 interleaved rounds** (a gate may raise K), entries shuffled once and rotated every round, plus a discarded warm round 0 that is still fold-, tier- and GC-checked (C-12).
- **Words on a ratio, not a threshold.** FASTER = median < 0.95 and q3 < 1; SLOWER = median > 1.05 and q1 > 1; else WITHIN (C-5).
- **Correctness inside the clock.** An independent oracle (`ref`) checks every column before and after timing, and an int32 fold (`foldOf`) is verified on every timed call.
- **Fail closed.** An empty `gated` map, an unknown spec key, a missing flag, a missing lane, a malformed log line: never PASS (C-14).
- **One judge.** `verdictOf` is pure; the live run and `--verdict-file` use the same function (C-26).
- **A workflow template** with two parameters, and a runnable example gate (`examples/ab.gate.mjs`).

## The gate file and the lane contract

A gate file's default export is the spec. The tool names no package; everything package-specific comes from this file.

```
spec = { name, frozen: [{ name, frozen, sha256, live? }], transform(name, text) -> kernel text,
         gated: { laneId: 'FASTER' | 'SLOWER' | 'WITHIN' }, shape?: [[key, value]], lanes: [lane],
         harnessControls?(rows, stop), K? (11..51), C? (3..9) }
lane = { id, ops (power of two >= 4), minWindow (1..ops/2), spin, recLen, A: col, B: col, bend: [from, to],
         make() -> { data, ref(op, out, off), foldOf(rec, off) -> int32 }, workFloor?(start, n) -> reason | null }
col  = { source, anchor, setup: 'function setup(d) {...}', run: 'function run(st, start, n, reps) {...}',
         one: 'function one(st, op) {...}' }
```

<details>
<summary><b>Deep-dive: how a lane runs</b></summary>

- `frozen` is a whole-file identity list: each file is pinned by sha256 and an optional `live` twin must be byte-identical (else STOP ANCHOR). No live path means frozen only, and the HEADER says so. A relative path resolves against the gate file's directory; an absolute path is allowed locally but is STOP HARNESS when `GITHUB_ACTIONS=true` (C-25, C-17).
- `col.anchor` is unique text in the transformed source ending in `{`: the opening of the entry body. The column's `setup`, `run` and `one` are compiled inside each copy's own scope, so class kernels work.
- `run(st, start, n, reps)` returns an int32 fold over ops `[start, start + n)` x `reps`. `one(st, op)` returns a Float64Array whose first `recLen` slots are that op's record, which the oracle `ref` must reproduce.
- `bend` is two different strings: the bent-oracle selftest edits B's text with it, to prove the oracle catches a wrong kernel.
- When B's reps differ from A's, a fifth column AB (A compiled fresh, timed at B's reps) is added. The word is computed on B/A and on B/AB and the two must agree, else VOID REPS-DRIFT; `ab = AB/A` is REPORTED only (C-11).
- A gate may raise K (11..51) and C (3..9), never lower them; HEADER prints the K and C used and the judge checks them (C-4, C-19).

</details>

### The workFloor hook and the reserved VOID kinds

`workFloor(start, n)` is optional. It returns a reason text when the window `[start, start + n)` holds too little work to time, else `null`. The reason is `"<KIND> <text>"`, and it becomes that lane's VOID item.

- **Reserved kinds.** The 8 tool VOID kinds are SLOW-DEAD, AA-DRIFT, REPS-DRIFT, NOT-TF, ALLOC, GC-WINDOW, NAN, TIER-SETTLE. A `workFloor` reason may not START WITH one of them. The check is a prefix match, so `NANO x` is refused too, and a malformed reason (not `"<KIND> <text>"`) is refused (C-59). A malformed reason prints `STOP HARNESS: <lane>: workFloor reason must be "<KIND> <text>", got ...`.
- **A refusal is a STOP.** The run prints `STOP HARNESS: spec: <lane>.workFloor(<start>, <n>) reason "..." starts with the tool VOID kind <K> (reserved, C-59)`, the verdict is NO VERDICT (STOP HARNESS), and the exit code is 1.
- **Pre-clock, when it can be.** Before the sources load and before any clock read, the tool calls `workFloor` at every `(start, n)` pair a timed run with this K can ask (also on `--oracle-only`) and applies both checks. That STOP is pre-clock only for a `workFloor` whose answer depends on `(start, n)` alone. For any other `workFloor`, the per-lane check stays as a backstop, and in a timed run it runs after sizing, so its STOP can come after clock reads (C-59).

## Verdicts, words and VOID kinds

Per lane, one word: FASTER, SLOWER, WITHIN, or VOID with a marker. Per run, one verdict, one exit code (C-15):

| Verdict | Exit | Meaning |
|---|---|---|
| PASS | 0 | every gated lane read its declared word |
| STOP / CRASH | 1 | a harness problem (ORACLE, ANCHOR, CLI, FLAGS, CLASSIFIER, HARNESS) or a crash; also reads NO VERDICT |
| NO VERDICT | 2 | a VOID lane, a missing lane, a `--run <ids>` subset, a log of the wrong shape |
| FINDING | 3 | a gated lane read a word other than its declared one |

A FINDING wins over a VOID in a complete run. A NO VERDICT run may be re-dispatched once (C-7); a FINDING is never re-run to get the word back. There is no in-job re-run: no code path, flag, option or doc re-runs a VOID lane inside a run.

VOID kinds a lane can print: SLOW-DEAD (the spin control reads no slower), AA-DRIFT (the A/A twin left its band), REPS-DRIFT (B/AB and B/A disagree), NOT-TF (a timed function was not in TurboFan), ALLOC (a column allocates at or above the bytes-per-op limit), GC-WINDOW (a GC disturbed the window), NAN (a non-finite median), TIER-SETTLE (no settle pass read exactly 0 bytes; the lane's single window still runs and nothing is re-run), plus the lane's own `workFloor` reason.

## API reference

The package has 13 exports: 4 functions and 9 constants. Types are in `ABGate.d.ts`.

### `defineGate(spec)`

Validates a gate spec and returns a deep-frozen copy. Plain objects only. Throws an Error with `.reason === 'HARNESS'` on the first violation: an unknown key, an empty `gated` map, a K below 11 or a C below 3, a non-plain object.

### `judgeSpec(input)`

Builds the validated, frozen judging spec for `verdictOf`: `{ laneIds, gated, shape?, K?, C?, run?, laneSha?, dialect? }`. In the tool dialect `laneSha` (64 lowercase hex) is required and `judgeSpec` throws if it is missing (C-33). The one legacy dialect `'ab-gate@7e0f9262'` skips exactly the 4 tool-only checks (HEADER spec line, reps / AB / n-a, warm, PROV grammar); it is reachable only through this API, never from a gate file or the CLI (C-27).

### `runGate(gateFile, opts?)`

Runs a gate file in-process and resolves to the exit code (0 / 1 / 2 / 3). Options: `{ run, K, oracleOnly, out }`, a plain object only. Every printed line goes to `opts.out` (default `process.stdout`); it never sets `process.exitCode`. The process needs the REQUIRED_FLAGS. The gate file is imported by content hash, so `lane-sha256` names the spec that ran; it covers the top gate file only (C-46).

### `verdictOf(spec, lines)`

The pure verdict of a saved log: `{ code, reported, text }`. No module state. A spec whose gated map is empty, whose tool-dialect `laneSha` is not 64 lowercase hex, or whose dialect is unknown reads code 2, never 0. In the tool dialect any malformed RESULT, RAW or WARM line reads NO VERDICT (C-34, C-40..C-42, C-47, C-50, C-51, C-54..C-56).

### Constants

| Name | Value | Meaning |
|---|---|---|
| `AA_HI` | 1.05 | A/A band, high edge; also the SLOWER edge |
| `AA_LO` | 0.95 | A/A band, low edge; also the FASTER edge |
| `ALLOC_MAX` | 0.015625 | bytes-per-op limit (1/64) |
| `C_COPIES` | 3 | fresh compilations per column (a gate may raise it to 9) |
| `K_ROUNDS` | 11 | counted rounds per window (a gate may raise it to 51) |
| `SLOW_MED` | 1.25 | SLOW control: median must exceed this |
| `SLOW_Q1` | 1.1 | SLOW control: q1 must exceed this |
| `EXIT.PASS` | 0 | every gated lane read its declared word |
| `EXIT.STOP` | 1 | STOP or crash |
| `EXIT.NO_VERDICT` | 2 | no verdict |
| `EXIT.FINDING` | 3 | a gated word differs |
| `REQUIRED_FLAGS` | see below | the node flags a gate run needs |

REQUIRED_FLAGS, joined with spaces (the CLI and `runGate` STOP FLAGS when one is missing):

```
--expose-gc --allow-natives-syntax --no-concurrent-recompilation --min-semi-space-size=4 --max-semi-space-size=4 --single-threaded-gc
```

### CLI modes

```
node $FLAGS ABGate.js <gate-file.mjs> --run ALL          the gate run: every lane, the declared K and C
node $FLAGS ABGate.js <gate-file.mjs> --run <ids>        a subset / research run (always NO VERDICT: wrong shape)
node $FLAGS ABGate.js <gate-file.mjs> --oracle-only      oracle + fold + TF + workFloor, no clock
node $FLAGS ABGate.js <gate-file.mjs> --selftest         `SELFTEST all ok` (0) or FAIL (1); timed, run under the lock
node $FLAGS ABGate.js <gate-file.mjs> --selftest-untimed the untimed rows only (no clock; run by npm test)
node        ABGate.js <gate-file.mjs> --verdict-file <log|->  the verdict of a saved log (untimed, no flags)
```

## Composability

The release path, end to end: a gate file beside your frozen kernel, the hosted workflow for the verdict, the local selftest before you dispatch.

```bash
# 1. install the tool next to your kernel package
npm install --save-dev @zakkster/lite-ab-gate

# 2. copy the example and replace the kernel, the lanes and the oracle
cp node_modules/@zakkster/lite-ab-gate/examples/ab.gate.mjs bench/ab.gate.mjs

# 3. copy the workflow template; edit ONLY the two lines tagged PARAM (AB_GATE, AB_NODE)
cp node_modules/@zakkster/lite-ab-gate/templates/ab.yml .github/workflows/ab.yml

# 4. before dispatching: build every lane, no clock (oracle, fold, tier, workFloor)
node $FLAGS node_modules/@zakkster/lite-ab-gate/ABGate.js bench/ab.gate.mjs --oracle-only

# 5. dispatch once per release candidate; the gate passes only when BOTH OS read PASS in the same dispatch
gh workflow run ab.yml
```

In-process, from a script or a test (the process must already carry REQUIRED_FLAGS):

```js
import { runGate, verdictOf, judgeSpec, EXIT } from '@zakkster/lite-ab-gate';

const lines = [];
const code = await runGate('bench/ab.gate.mjs', { run: 'ALL', out: { write: (s) => lines.push(s.replace(/\n$/, '')) } });
if (code === EXIT.NO_VERDICT) console.log('NO VERDICT: one re-dispatch is allowed (C-7)');
```

`verdictOf(judgeSpec({ laneIds, gated, laneSha }), lines)` reads the same lines back later, untimed, which is how the package's own `npm test` exercises the judge on fixture logs.

The template (`templates/ab.yml`) is dispatch-only, pins the runner identity and the node version (a verdict is valid only on the node the method was proven on, 26.8.2), installs with `npm ci --ignore-scripts`, runs the selftest and then `--run ALL`, and uploads one log artifact per OS (`ab-gate-<os>`). A harness failure on a runner (a failed step before the gate, a red selftest, a STOP, a crash) is NO VERDICT, never host evidence (C-17). Nothing it runs depends on a local absolute path. The package dogfoods the same file as `.github/workflows/ab.yml` against `examples/ab.gate.mjs` (lane `null` gated WITHIN, lane `double` gated SLOWER; C-24).

The one re-dispatch rule (C-7): a NO VERDICT run gets ONE re-dispatch. A FINDING is never re-dispatched to get the word back.

## Zero-GC design notes

<details>
<summary><b>What the tool itself allocates, and where the claim stops</b></summary>

The timed loop is a TF-forced `timedRounds` with a `Float64Array(2)` time slot, armed once per run on 5 tool-owned non-allocating dummy entries (C-23). Before each lane's window the tool runs up to 3 untimed settle passes at the timed shape until one reads exactly 0 bytes (C-48).

| Where | Allocation | Tier |
|---|---|---|
| in-window loop (`timedRounds`) | 0 tool bytes, printed as `WINDOW lane=<id> tool-bytes=<n>` | DETERMINISTIC, `npm run torture`, node >= 26 only |
| settle passes | untimed, before the window; `SETTLE lane=<id> passes=<n> ... settled=yes` | DETERMINISTIC, torture row T-SETTLE |
| per-column bytes per op | gated against `ALLOC_MAX` (1/64), else VOID ALLOC | DETERMINISTIC, torture (bop / tool-bytes per-window gate) |
| import | no stdout, no `process.exitCode`, no new globals | DETERMINISTIC, `test/import.test.mjs` |

The zero-tool-bytes claim is scoped to node >= 26 (C-31): on Node 22 `performance.now()` boxes 16 B per read, so the WINDOW row cannot hold there. `npm run torture` exits 1 on node < 26 by design; CI runs it on the node 26 legs only. `engines` stays >= 22 because the judge, the CLI and `npm test` do not depend on it.

</details>

Retention: after 20 in-process oracle-only runGate runs (T2) and 5 timed ones (T2b), the leak tracker reads size 0, each with a must-fail kept-outs control (DETERMINISTIC, torture).

## Design decisions worth knowing

- **Fixed constants.** K, C, the A/A band, the SLOW control and the bytes limit are tool constants. A gate may raise K or C, never lower; the band, SLOW and ALLOC change only in a tool major (C-4).
- **The word band IS the A/A band.** A lane outside the band is VOID, not a verdict (C-5, C-8).
- **The tool never calibrates the spin.** Each lane declares it; too small reads VOID SLOW-DEAD (C-6).
- **Hosted by default.** The release verdict comes from the hosted workflow on both OS; a local run is PRELIMINARY unless the host is QUIET (C-7, C-3).
- **A hoisted timed loop.** It changes the timing path relative to the proven prototype, so a statistical re-proof is required before 1.0. See `decisions/0001-hotloop.md` (C-23).
- **Live binding is optional and enforced.** No live path means frozen only; an absolute path is STOP HARNESS on a runner (`decisions/0002-live.md`, C-25, C-17).
- **One named legacy dialect.** It exists so LiteBisect's ab-gate logs can be reproduced byte for byte; nothing in this package edits LiteBisect (`decisions/0003-dialect.md`, C-9, C-27).

Hoisted-loop re-proof (C-23, STATISTICAL): REQUIRED before 1.0 (C-23); PENDING, not yet run on this build. Method: 5 local `quiet-lock run --strict` holds of bench/reproof.mjs, the hoisted timedRounds interleaved against frozen ab-proto 74f1a3d4; pre-registered PASS = median r in [0.98, 1.02] on every gated lane and every per-hold r in [0.95, 1.05]; must-fail mutant B x1.04 (C-35, C-36). Local holds are PRELIMINARY unless QUIET. No number is quoted without a run log.

## Testing

```bash
npm test            # DETERMINISTIC only: spec validation, the judge on fixture lines, parity, untimed selftest rows, docs
npm run torture     # zero tool bytes in the window + retention; node >= 26 only
npm run verify      # npm test && npm run torture
```

REPORTED: 632 tests at 4ef420d (node v26.8.2), + docs.test.

The selftest injection table holds markers: 14 (10 timed). Every marker is an anchored regular expression over the one line the tool prints for that failure, so it matches only its own message, and a real child line that matches two markers fails the selftest (C-21, C-37). Captured real timed-child lines are an `npm test` fixture, and `npm test` goes red when the marker surface changes (C-38).

The two timed scripts never run inside `npm test`, `npm run verify` or `prepublishOnly` (C-3, C-39). Run them under the quiet-host lock; BUSY (75) or NOISY (76) means no verdict, so record it as PENDING and do not retry in a loop:

```bash
node ~/.claude/hooks/quiet-lock.mjs run --strict "lite-ab-gate selftest:timed" -- npm run selftest:timed
node ~/.claude/hooks/quiet-lock.mjs run --strict "lite-ab-gate reproof" -- npm run reproof -- --hold <n> --tool <path> --tool-sha <64 hex> --out <dir>
```

`selftest:timed` runs the timed `--selftest` children and re-checks the marker gate on real lines. `reproof` is the C-23 re-proof harness behind the PENDING line above; it takes its own arguments (`--hold <n> --tool <path> --tool-sha <64 hex> --out <dir>`, one hold per call, see the header of `bench/reproof.mjs`) and binds absolute local paths, so it never runs on a hosted runner (C-35, C-17). CI (`.github/workflows/ci.yml`) runs `npm test` on node 22 / 24 / 26 (and the 26.8.2 pin) on both OS, and `npm run torture` on the node 26 legs only (C-31).

## What this is not

- Not a benchmark runner. It prints no throughput table and gates no absolute time; it answers one question, "is B slower or faster than A on this host, with the host's own noise measured beside it".
- Not an `npm test` gate. A timing verdict inside `verify` is a flake by design (C-3).
- Not a way to re-run a lane until it passes. There is no in-job re-run and a FINDING is never re-dispatched (C-7).
- Not a CPU-transferable number. Words do not transfer across CPUs or node versions; the template pins both.
- Not a profiler or a deopt tracer. It checks that each timed function is in TurboFan and tells you when it is not.

## Ecosystem

- `@zakkster/lite-gc-profiler` and `@zakkster/lite-leak` are the devDependencies behind the torture zero-GC and retention rows.
- LiteBisect's `bench/ab-gate.mjs` (7e0f9262) is the origin of the method; its migration onto this package is a later, separate step (C-9).
- Every `@zakkster` kernel package can gate its release candidate with this tool, consumed as a devDependency (C-1).

## License

MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. See [LICENSE.txt](./LICENSE.txt).
