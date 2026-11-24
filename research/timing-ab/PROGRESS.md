# timing-ab research burst -- PROGRESS

Research burst (suite "Research bursts" rules, ~/.claude/ORCHESTRATOR.md). Maintainer go 2026-11-23 ("Timing A/B gate").
Session started from the orchestrating session local_9e3c12eb. Writes ONLY under LitePerfGate/.handoff/research/timing-ab/
and LitePerfGate/.handoff/PROPOSAL-timing-ab.md. No source edits in any package; LiteBisect read only (absolute paths).

Input pinned for every rung: LiteBisect bench/ab-gate.mjs sha256 7e0f9262 (last touched by 3621f69, 2026-11-23; LiteBisect
HEAD 6fbd406 at reading), fixtures r4-ubuntu-rung-all.log c7bdc7bf, r4-macos-rung-all.log 569b7d18. Line numbers below are
in that file at 7e0f9262.

---

## INTAKE (written before any run)

**Question.** Can ab-gate's method be made package-agnostic without losing its teeth? A consuming package supplies only
its lanes (A / B kernels + oracle); the tool supplies the round scheduling, the A/A and SLOW controls, the words
(FASTER / SLOWER / WITHIN, VOID per lane; PASS / FINDING / NO VERDICT per run), provenance, the selftest and a hosted-CI
workflow template.

**What "teeth" means here** (every one is a present ab-gate behavior; losing any one = teeth lost):
T-a A/A twin per lane, band [0.95, 1.05] on the median, quartiles finite (VOID AA-DRIFT).
T-b must-fail SLOW control per lane, median > 1.25 and q1 > 1.10 (VOID SLOW-DEAD).
T-c oracle before timing, a fold check on EVERY timed call, a fresh-reference sample after timing (STOP ORACLE).
T-d C = 3 independent compilations per column (fresh `new Function` + a nonce in the source text), median per round.
T-e K = 11 interleaved rounds, entries rotated each round; window sized to TARGET_MS; GC window major = VOID.
T-f TurboFan tier checked before, after every round, and after (VOID NOT-TF); B/op lane per column < 1/64 (VOID ALLOC).
T-g run-shape checks (one HEADER with K / C / shape fields / inject=null, one PROV start + end, one RESULT per lane).
T-h FINDING wins over VOID in a complete run (AB-G1), missing lane = NO VERDICT (AB-G1a), NO VERDICT is never PASS.
T-i selftest: injection children (bent-oracle, boxed, slow-dead, aa-drift, live-drift) + one fixture row per verdict
    check (law 9, B13) + failReplay of a failing child (B18).
T-j expected words are a frozen, ruled literal, never derived from a run (law 9).

**Ladder** (stop at the first wall; the maintainer approves each next rung):

| Rung | Capability | Smallest measurable kernel | Kill rule (named before the run) |
|---|---|---|---|
| R0 | inventory: generic vs LiteBisect-specific, file:line; prove the judge separates | ab-gate's own verdictOf on its own F1-F45 fixtures, untimed | KILL if the generic core cannot be separated without changing a verdict path: any fixture row whose VERDICT line, REPORTED line or code differs between ab-gate and a parametrized prototype; or a seam where a verdict depends on a LiteBisect-specific value that cannot become declared data. |
| R1 | one NON-LiteBisect consumer lane through an extracted prototype, controls self-checking | one claimed comparison from another package's README (lead: LiteOhlc `boundsInto` vs the hand-rolled loop, README:341, a class method; alternates in R1 notes) | KILL if the controls cannot be met on a QUIET host in one `quiet-lock run --strict` hold: A/A VOID in > 1 of 5 runs, or SLOW-DEAD with the package's declared spin in > 1 of 5, or any selftest injection (bent-oracle, boxed, slow-dead, aa-drift) not reading its marker, or the lane cannot be stated in the prototype's contract without editing the package's main file. |
| R2 | hosted drift (B19): is a per-run A/A gate + re-pairing enough to use hosted runners, or must the tool require a quiet host? | AMENDED 2026-11-23 before any R2 run (review r1 blocker 1; was one offline rung, which could not test its own hypothesis: a saved log holds ONE K = 11 vector per lane per leg, and an in-job re-pair is a new timed sample no saved log contains). R2a (untimed, offline): the saved hosted logs -- 43145179770 and 45087568692 (ab.yml, ab-gate) and 43127032794 (ab-research.yml, the ab-lab, LEDGER C11) -- per leg: which gated lanes VOID AA-DRIFT, their per-round AA RAW, and the PROV load lines. R2b (timed, hosted, ONLY on the maintainer's go): a research dispatch of the prototype with the re-pair policy below, plus a NULL lane (B = a fresh compilation of A, gated WITHIN); the NULL lane is ALWAYS re-paired (a second attempt on every leg, printed and judged exactly like a VOID lane's re-pair). | R2a has no kill rule: it is descriptive (it tests B19's "noise" mechanism against PROV load; any number REPORTED). R2b policy, fixed before its dispatch: at most M = 1 in-job re-pair of a VOID lane; every attempt printed (RESULT / RAW / VOID of both); the re-pair must pass the SLOW and A/A controls itself. Named bias: a re-pair is a second draw of the A/A control, and "the first clean draw counts" is optional stopping -- noise that should read NO VERDICT can read a verdict. The NULL lane is the control for that bias (its true word is WITHIN; an AA-vs-A word is no control, since a clean A/A median lies inside the WITHIN band by construction under Q-WORDBAND (a)). KILL "hosted is usable" if, over 3 dispatches: the NULL lane's re-pair reads a clean non-WITHIN word on any leg; a leg whose NULL re-pair is not clean is unmeasured, and fewer than 4 of 6 measured legs = R2b NO VERDICT (never 'hosted usable'); or any re-paired gated lane reads a clean word other than its GATED word (ab-gate.mjs:86-92); or fewer than 2 of 3 legs per OS reach a verdict. Then the tool's release verdict requires a quiet host and hosted runs are REPORTED only. R2b's report states its low power: 6 legs cannot bound a small per-leg false-word rate. (The two NULL-lane sentences were applied verbatim from review r2's blocker text and not re-reviewed: the round cap is reached; R2b's prototype gets its own law-11 review before any dispatch.) |

**Laws / entries that bear** (LiteBisect LEDGER, quoted by number; LitePerfGate has no LEDGER):
law 5 (controls + range, never one run: T-a..T-e), law 8 (an alloc gate must see the box; tier checked: T-f), law 9 (a
gate fails open until a control proves it closed; expected never from the thing checked: T-i, T-j), law 10 (kill rule
before the run), law 11 (a harness is reviewed before its numbers count: the R1 prototype gets a reviewer pass before
its strict hold). A8 (K = 11 / band on a contended host: fails CLOSED, no verdict), B13 (a control whose expected outcome
is also the broken path's outcome proves nothing), B18 (a failing control must leave its numbers in the logs), B19
(hosted A/A drift voided gated lanes on both OS; mechanism PRELIMINARY), C11 (hosted x86 / arm64 VM held the 13 words;
low-margin lanes differ per CPU). Suite rules: verification tiers (STATISTICAL gated once per release by a noise-designed
test, never in `verify`; DEFAULT HOST = hosted CI), quiet-lock (`status` first; 75 / 76 / 2 = PENDING, never loop).

**Timing policy for this burst.** R0 is untimed (no lock needed). R1's deciding run and R2's optional dispatches are
timed: `quiet-lock.mjs status` first, `run --strict` for the deciding hold, 75 / 76 / 2 = PENDING.
Lock at INTAKE time (2026-11-23 ~08:35Z): `quiet-lock: held by "LiteBisect release 1.0.0 verify2"` (exit 75, BUSY;
host PRELIMINARY, load1 2.73 vs baseline 2.21, another node at 104.9%). Nothing timed was attempted.

---

## R0 -- inventory + judge separability (2026-11-23, UNTIMED) -- kill rule NOT fired

### R0.1 Probe: verdict-path parity (r0-verdict-parity.mjs 16693c6e, log r0-verdict-parity.log 935bec9f; r3 = review r2 body 3d52d13a + the additive P6
guard; r1 = d34aa61f / fded6dc4, before review)

`verdictOfG(spec, lines)` = ab-gate's verdictOf (:893-1021) + laneState (:916-947) + word (:200-205) with exactly three
LiteBisect inputs moved into `spec` (K, C and the run name are also spec fields, defaulted to 11 / 3 / ALL): the lane id set (was `rungSpecs('ALL')`, :952), the GATED map (:86-92, :995), and the HEADER's
workload shape fields (`NQ2`, `minWindow` in HEAD_RE :893 and :966-967). Band, SLOW thresholds, ALLOC_MAX and the B/op
column names are also spec fields, defaulted to ab-gate's values. ab-gate's FIXTURE_CASES, MUT_F3 / MUT_F4, FIXTURES,
applyMut and GATED are SLICED from its source text and evaluated (never retyped); the lane-id list is regenerated and
guarded against the source's size constants and the fixture's RESULT order.

Result (node v26.8.2, darwin; r1 2026-11-23T08:36:45Z, r2 (with P5) 08:49:46Z; deterministic, no clock -- host load
irrelevant; `uptime` before the runs read load1 5.67 / 6.00, not printed in the log):
- P0 pins: ab-gate 7e0f9262, fixtures c7bdc7bf / 569b7d18, 23 lane ids = the fixture order -- ok.
- P1 / P2: 45 / 45 rows (F1-F45) apply exactly once; the ORIGINAL (child `--verdict-file -`) reads each row's own
  expected exit and VERDICT prefix -- ok.
- **R0 PARITY: VERDICT line + REPORTED line + code byte-identical on 45 / 45 rows.**
- P3 must-fail controls (the comparison has teeth): gated ro:16 flipped -> differs on 43 rows; HEADER field minWindow
  dropped from the spec -> 43 rows; band widened to [0.90, 1.10] -> 45 rows.
- P5 (added after review r1): F1-F45 sit away from every comparator boundary; the reviewer's 5 boundary mutants
  (word `q1 >= 1`, word `med >= hi`, aa `> / <`, slow `>=`, bop `<=`) kept 45 / 45. Ten boundary rows B1-B10 (on the
  ubuntu fixture: aa median 0.950 / 1.050, slow median 1.250, slow q1 1.100, bop 1/64, B/A median 1.050 / 0.950, B/A
  q1 / q3 = 1.000, a literal `Infinity`) read their expected exit on the original and **byte parity 10 / 10**; each of 10
  comparator flips (wordMedHi, wordQ1, wordMedLo, wordQ3, aaBand, slowMed, slowQ1, bopMax, bopZero, numInf) differs on
  >= 1 B-row, while 9 of them differ on 0 F-rows (bopZero: 45) -- the F-rows alone could not see them.
- P4: a synthetic 3-lane spec (no LiteBisect lane or field name) reads PASS / FINDING / NO VERDICT (A/A) as designed.
- P6 (review r2 nit, added after APPROVAL of the P5 rows; additive only): R0 parity re-run on the unflipped spec AFTER
  the flip loop -- guards the flip plumbing against leaking into the default path.
- `R0-PARITY all ok`, exit 0 (r1, r2, r3).

Scope of the claim: the JUDGE (log lines -> verdict) separates with zero verdict change on every check row ab-gate has a
control for, and on one row per comparator boundary (P5). The PRODUCER (the timed loop that prints RESULT lines) was classified by reading, not run: its equivalence
on a non-LiteBisect lane is R1's question.

### R0.2 Inventory (ab-gate.mjs 7e0f9262)

G = generic, moves as is. P = generic with a parameter / contract seam (S-ids below). L = LiteBisect-specific, stays in
the package's lane file.

| Lines | What | Class | Note |
|---|---|---|---|
| 1-68 | header comment (gate rule, rungs, exits, words) | L | text re-derived per package; the tool prints the generic rule |
| 69-75 | node: imports | G | |
| 76-81 | PKG / FROZEN / FROZEN_SHA / LIVE paths | P | S-3: the frozen-vs-live binding (AB-G2) as declared data |
| 86-94 | GATED literal, isGated, gateTag | P | S-1, S-14: per-package frozen literal |
| 96-99 | FIXTURES (hosted R4 logs) | L | S-10 |
| 100-101 | REQUIRED_FLAGS | G | V8 natives + pinned semi-space + single-threaded GC |
| 102-121 | K, C, NQ, NQ2, MIN_N, TARGET_MS, MAX_REPS, TF_*, SETTLE, WARM_*, ALLOC_*, SAMPLE, MIN_BRANCHES, AA band | P | K / C / TARGET / TF / WARM / ALLOC / band generic; NQ / NQ2 / MIN_N / SAMPLE / MIN_BRANCHES are LiteBisect workload constants (S-2, S-7) |
| 122-133 | spins, sizes, KERNEL_NAMES, DEPS | L | S-8 spin per lane is package data |
| 136-139 | BENDS (bent-oracle) | L | S-9: package must declare one bend per B entry |
| 142-163 | INJECTIONS, SELFTEST_CASES, CLEAN_CHILD, VARIANT_N, SELFTEST_CASE_MS | P | slow-dead / aa-drift / boxed / bent-oracle / live-drift generic; fw-delete-end L |
| 164-171 | RULE_* texts | L / P | RULE_GATE (171) generic with spec values; AB1 / AB2 texts L |
| 173-195 | Stop, LOG / say, settle, fmt, quant / summarize | G | |
| 198-217 | aaOk, slowOk, word, ratioVec, diffVec | G | S-13: word's WITHIN band = the A/A band |
| 220-228 | uniqueAt, readOrStop | G | |
| 229-263 | cutBodies, loadFrozen, checkLive | P | S-3: anchor `export function <name>(` .. `\n}\n` fits plain functions only |
| 264-285 | KTEXT, block (DEPS), sub1, atHead, spinned | P | S-8: spin at the head of A's entry; needs a unique `function <entry>(` |
| 286-288 | boxed injection | P | S-9: the injected line names Bisect params `lo`, `x` |
| 290-302 | armNatives, TF_BIT self-check | G | |
| 304-321 | gcWindow, gcControl | G | |
| 322-351 | newSpaceUsed, allocWindow, allocBop | P | S-4: calls the 9-argument Bisect runner |
| 353-362 | rng, fnv | G | |
| 363-427 | refScan, refSweep, assertSorted, compares, hintProbes, branchProxy | L | oracle + branch proxy |
| 429-515 | finishLane, opLen, t2Stream, t2Lane, roLane, fwLane, RUNGS | L | the lanes |
| 517-536 | makeCols (A, B, AA, SLOW + injections) | P | four-column shape generic; S-9 |
| 537-555 | compileColumn (fresh `new Function` + nonce; runner kinds full / hint / fw) | P | S-4: runner text is package data; nonce generic (defeats the eval cache: T-d) |
| 556-563 | buildEntry (per-copy fresh arrays) | P | S-4: generic `makeState(copy)` |
| 564-633 | checkOracle, sampleRefs, checkSample, checkArr, fwVariantCheck | L | S-6: called at fixed points -> generic hook `verify(entry, where)` |
| 634-645 | windowSum, foldWant, h0Of, verifyRun, callRun | P | S-5: fold want from the package's oracle; check generic |
| 646-659 | toTf | P | S-15: reads NQ (:655-656); else given callRun / foldWant |
| 660-673 | sizeWindow, roundStart | P | S-15: read MIN_N / NQ (:661, :666, :673) |
| 674-679 | windowBranches | L | S-7 |
| 680-692 | shuffled, buildEntries | G | |
| 694-725 | oracleLane (--oracle-only) | P | S-6, S-7 |
| 727-815 | runLane: K rounds x entries rotated, timing, per-round tier, GC window, B/op, NOT-TF, medians, AA / SLOW, RESULT / RAW / VOID lines | P | the core; only S-6 / S-7 calls are package hooks |
| 817-888 | marginText, laneLine, ruleAB1 (incl. STOP HARNESS :839), ruleAB2 | L | REPORT output; S-11: the :839 STOP is a package harness control |
| 890-1021 | verdictOf + HEAD_RE, field, stat3, laneState | P | S-1, S-2: **parity-proven, R0.1** |
| 1023-1068 | provenance, parseCli, verdictFile | G | rung names from spec |
| 1070-1126 | FIXTURE_CASES F1-F45 | L data / G rows | S-10 |
| 1127-1165 | applyMut, child, failReplay, envWith | G | |
| 1166-1216 | selftest | G | given spec's injections and fixtures |
| 1218-1266 | main (HEADER lines, rung loop) | P | HEADER kernel / frozen lines from spec |
| 1268-1276 | STOP / CRASH handler (verdictOf over LOG) | G | |

Line count by class (summed from the table's ranges, comment lines included; 1249 of 1276 lines classified, the rest
blank or between ranges; the 164-171 row counted L): G 260 (21%), P 536 (43%), L 453 (36%) (by reading; review r1
moved 646-673 from G to P, S-15).
The L share is lanes, oracles, rule texts, the header comment and the fixture data -- what the INTAKE says a package
supplies.

### R0.3 Seams (where generic code reads something LiteBisect-specific)

| S-id | Seam | Verdict path touched? | Generic form |
|---|---|---|---|
| S-1 | lane id set + GATED map (:86-92, :952, :995) | YES (judge) | `spec.lanes[].id`, `spec.gated` -- parity-proven |
| S-2 | HEADER workload fields NQ2 / minWindow (:893, :966-967, :1230) | YES (run shape) | `spec.shape` ordered key=value list -- parity-proven |
| S-3 | kernel source acquisition by anchor + frozen sha + live byte compare (:76-81, :229-263) | STOP path only | `spec.frozen` {path, sha256, live, entries}; anchors fit `export function` only -- class methods (LiteOhlc, ObjectPool) need whole-file acquisition: **R1's main contract question** |
| S-4 | 9-arg runner `run(a, los, lens, len, qs, start, n, reps, h0)` (:333, :344-345, :540-548, :625, :645, :763) | no (producer) | `run(state, start, n, reps)` from package runner text; `makeState(copy)` |
| S-5 | fold want (:634-641) | no (STOP ORACLE path) | `lane.foldWant(start, n, reps)` from the package's oracle (shares no code with the kernel: law 9) |
| S-6 | oracle checks at fixed points (:565-633, :731-733, :774-782) | STOP ORACLE path | `lane.verify(entry, where)` called at the same points |
| S-7 | STREAM VOID via branch proxy (:392-427, :674-679, :715-717, :744-753) | via VOID transport only | optional `lane.workFloor(start, n)` -> VOID reason or null |
| S-8 | SLOW spin at A's entry head, iterations per lane (:122-125, :277-285) | via VOID SLOW-DEAD | `lane.spin`; anchor `function <entryA>(` unique in the source |
| S-9 | selftest injections: boxed names `lo` / `x` (:288); BENDS (:136-139); fw-delete-end (:149-150, :527-551) | selftest only | boxed with a module counter (no param names); `lane.bend` required (fail closed if absent); extra package injections optional |
| S-10 | F1-F45 bound to LiteBisect's hosted R4 logs (:96-99, :1075-1126) | selftest only | tool-owned synthetic fixture over a synthetic spec, sha-pinned; every F-row re-targeted (P4 shows the shape) |
| S-11 | ruleAB1's uniform-control STOP HARNESS (:839) | YES (STOP -> NO VERDICT) | `spec.harnessControls(rows)` may `stop()`; transport unchanged |
| S-12 | REQUIRED_FLAGS incl. --allow-natives-syntax (:100-101, :293-302) | STOP FLAGS path | generic; makes the tool Node / V8-only |
| S-13 | WITHIN band = A/A band (:200-205) | YES (words) | kept coupled in the prototype; P3 control 3 (band [0.90, 1.10]) changes the exit on 1 row (F8), the VERDICT line on 3, the REPORTED line on 45 -> a Q-id |
| S-14 | GATED is a frozen literal typed from a ruled PROPOSAL (:82-92) | YES | the tool must take it as declared data and never offer "record the words of this run" |
| S-15 | window domain NQ / MIN_N in toTf, sizeWindow, roundStart (:655-656, :661, :666, :673) | no (producer; MIN_N also feeds S-2's minWindow) | `lane.ops` + a declared minWindow |

No seam forces a verdict change: S-1 / S-2 / S-11 / S-13 / S-14 become declared data with the same comparisons, S-3..S-10 /
S-12 / S-15 are producer, STOP or selftest paths (classified by reading; the producer was not run). **R0 kill rule: NOT fired.**

### R0.4 What R0 found that R1 must answer (no verdict here)
1. S-3: the suite's speed claims mostly sit on class methods (scout 2026-11-23: LiteOhlc `boundsInto` at Ohlc.js:455,
   ObjectPool is `export class`). Fresh-compilation independence (T-d) with a class means compiling the whole class
   text per copy. A factory closure per copy would share one SharedFunctionInfo and its feedback (the I4 ~20% A/A bias
   the C = 3 rule exists for) -- refused by reasoning, not measured.
2. S-8: spin calibration is per lane (192 + n/4 for fw, 256 elsewhere). A lane whose op is 10 us vs 10 ns needs a
   different spin; whether the package declares it (as ab-gate) or the tool calibrates it from a clock is open.
3. S-10: the tool's selftest cannot use a consumer's hosted logs; it needs its own synthetic fixtures. R0.1's parity
   gives the F-row list to port.

### R0 candidates for R1 (scout, 2026-11-23, top-level READMEs only, LiteBisect / LitePerfGate excluded)
LiteOhlc README:341 `boundsInto` 44.2x..5873x vs a hand-rolled loop, n >= 1e5 (REPORTED; class method). LiteObjectPool
README:421 v2 ~4x v1 per op (class). LiteArena README:125 / :644 (REPORTED). LiteLogLogN README:753 / :788 / :958 (ns/op
tables). LiteSignal README framework table (library-level, not one kernel: a poor first lane). 43 READMEs match the
pattern set; this list is a lead, not a census.

---

## Review (one pass on the claims; the burst's single reviewer)
- r1 REJECTED: 6 LITERAL + 2 DESIGN. Boundary rows were missing (5 `>` / `>=` mutants kept 45 / 45), R2 could not test
  its own hypothesis and did not name optional stopping, Q-MIGRATE's proof was blind to boundaries, S-15 was missed,
  and there were wording / attribution / size errors. All were fixed; the boundary gap was closed by probe rows (P5),
  not just a scope note.
- r2: all 8 r1 blockers FIXED (verified by 11 default-path mutants, all caught). One new DESIGN blocker: the R2b NULL
  lane is re-paired only when VOID, so it could stay unmeasured. The reviewer's exact text was applied verbatim and is
  NOT re-reviewed (round cap). P6 (an additive guard, a review r2 nit) was added afterwards; probe r3 16693c6e exit 0.
- The reviewer accepted the AA-vs-A objection: under Q-WORDBAND (a), a clean A/A twin cannot read a non-WITHIN word,
  so the NULL lane replaces that control.

## Status at stop (2026-11-23 ~08:55Z)
R0 + INTAKE done; R0 kill rule NOT fired. STOP for the maintainer: R1 needs a go (and Q-R1's lane), R2a can run
untimed at any time on a go, and R2b needs a go plus hosted dispatches. Quiet lock at INTAKE: BUSY (LiteBisect release
verify). Nothing timed ran in this burst. `.handoff/` is NOT gitignored in LitePerfGate (`git check-ignore` empty;
`git status` shows `?? .handoff/`); .gitignore was not edited (maintainer's call). Context: 109K at start of work, 286K
at stop (get_usage).

## R1 -- one non-LiteBisect consumer lane (go: maintainer ruling 2026-11-23, relayed by the orchestrating session:
## "R1: LiteOhlc boundsInto (Recommended)")

### R1.0 INTAKE detail (written before any build or run, 2026-11-23 ~09:05Z)
- Inputs, frozen read-only copies (LiteOhlc commit 7d33a2f): r1/frozen/Ohlc.js a600028c (= LiteOhlc/Ohlc.js; 687 lines,
  no import, `export class OhlcSeries`), r1/frozen/baseline.mjs 9c875a5e (= LiteOhlc/bench/baseline.mjs, `export
  function baseBoundsInto`). LiteOhlc README:341 (REPORTED, M4 Pro 2026-10-21): boundsInto 44.2x (n = 1e5, w = 1e3) and
  5873x (n = 1e5, w = 1e5) faster than the hand-rolled best-form loop; RESULTS.md lite 44.4 / 29.2 ns/op, base 1965 /
  171549 ns/op.
- Lanes (3, all GATED in the R1 spec; words declared here, before any run):
  `bounds:1e5:1e3` A = OhlcSeries.prototype.boundsInto (class method), B = baseBoundsInto: GATED SLOWER (B/A = base/lite);
  `bounds:1e5:1e5` same pair at w = 1e5: GATED SLOWER;
  `null:1e5:1e3` A = boundsInto, B = a fresh compilation of boundsInto (the NULL lane): GATED WITHIN.
  A = the class method on purpose: AA (fresh class copy) and SLOW (spin at the method's head) then exercise S-3 on a
  class, the open contract question from R0.4.
- Contract under test (S-3 / S-4 / S-15): kernels and setup are SOURCE TEXT compiled per copy (`new Function` + nonce),
  so `makeState` must run INSIDE each copy's compiled scope (a copy's OhlcSeries is its own class); input data is
  generated once by the lane, copied per copy. Oracle: an independent reference written in the lane file (no code from
  Ohlc.js or baseline.mjs). In-clock fold: exact (dyadic prices, integer volumes) over minLow, maxHigh, sumVol, n.
- Kill rule (unchanged from INTAKE): KILL if, on a QUIET host in one `quiet-lock run --strict` hold, A/A VOID in > 1
  of 5 runs, or SLOW-DEAD with the lane's declared spin in > 1 of 5, or any selftest injection (bent-oracle, boxed,
  slow-dead, aa-drift) does not read its marker, or a lane cannot be stated without editing LiteOhlc's files. A NULL
  lane reading a clean non-WITHIN word in any run is also recorded as a kill (it is a gated lane whose true word is
  known). Law 11: the prototype gets one reviewer pass before the hold; numbers before that are void.
- Lock at R1.0: `quiet-lock: free | host QUIET (load1 1.56, baseline 2.21)` (~09:00Z).
(R2 section: at the end of this file, after "R1 status: DECIDED".)

### R1.1 Build (coder, 2026-11-23) -- prototype exists; its numbers are VOID (law 11: review REJECTED)
- r1/ab-proto.mjs a95e8931 (918 lines; `grep -inE 'ohlc|bounds|bisect|lowerBound'` = 0: nothing package-specific) and
  r1/ohlc-lane.mjs 2377d193 (139 lines). LiteOhlc stated WITHOUT editing its files: kill clause "cannot be stated"
  NOT hit. A class-method kernel works when each column is source text + a `setup` compiled inside the copy's scope.
- Contract as built vs PROPOSAL 2.2 (coder's list): per-column {source, anchor, setup, run, one}; setup in-scope
  replaces makeState; ref / foldOf replace foldWant / verify (ab-gate's checkArr NOT ported); frozen = whole-file
  identity list + transform; HEADER shape derived (ops=, minWindow= per lane); B gets its OWN reps; B/op window = the
  column's own window; TF window = minWindow; bend on B's whole source; harnessControls(rows, stop); spec keys fail
  closed. Not built: module exports, the F1-F45 port, the workflow template.
- Build runs (quiet-lock run, not strict; QUIET host, load1 0.97-1.78, busy-node none): untimed --oracle-only exit 0
  (110592 records x 9 fields bit-compared); --selftest 11 / 11 ok (bent-oracle on both distinct B entries STOPs ORACLE,
  boxed VOID ALLOC, slow-dead VOID SLOW-DEAD, aa-drift VOID AA-DRIFT, live-drift STOP ANCHOR, clean child NO VERDICT
  naming its shape); one --run ALL read PASS 3 / 3. These are calibration numbers of an UNREVIEWED harness: VOID for R1.
  Spins chosen: 128 (w = 1e3 lanes), 112 (w = 1e5); minWindow 64 / 32 / 64.

### R1.2 Law-11 review r1 -- REJECTED (3 LITERAL + 2 DESIGN); the R1 hold did NOT run
1. LITERAL fail-open: `gated: {}` passes the spec check and reads `VERDICT PASS gated=0/0` (ab-proto :271-272).
2. LITERAL gate teeth: the judge selftest has 3 synthetic rows (ab-gate has F1-F45); 5 judge mutants (VOID line,
   VOID tag, PROV count, slow check, bop check) survive and turn a NO VERDICT into PASS. Fix = the reviewer's row list
   (a)-(j), string edits of the synthetic log, each red on its mutant.
3. LITERAL fail-open path with no tooth: the B/op null-window -> Infinity path (:206) now carries every A-side box
   (change 7); `return 0` there survives the selftest. Fix = an untimed allocBop row that must read Infinity.
4. DESIGN gate teeth: the in-clock fold check (:539) and the fresh-reference check after timing (:548) have no
   must-fail control -- every bent child STOPs before the clock. ab-gate has the SAME gap. Fix proposed: injections
   `late-bend` / `post-bend` behind a flag set just before / after the timed window.
5. DESIGN uncontrolled bias: B's own reps (change 6) -- the cold first rep is 1/reps of a window, about the size of the
   +-5% band at small reps; the NULL lane cannot see it (equal reps). R1's three lanes cannot flip (44x, 5500x, equal
   reps), but a near-threshold lane could. Options -> PROPOSAL Q-REPS.
Nits: round 0 is slow in 3 / 3 logs (null AA 0.90-0.93 in round 0; ab-gate shares it) -> PROPOSAL Q-WARM; checkArr
port (~8 lines); `Math.max(0, bN - b1)` leaves the negative-bop check dead (ab-gate parity); bounds:1e5:1e5's A window
3.7 ms < TARGET_MS (MAX_REPS cap); lane-file sha / transform not checked by --verdict-file.
Verified by the reviewer: the judge equals verdictOfG apart from the flip lines; the printed HEADER parses under its own
judge; nonce per copy, setup in the copy's scope, AA a fresh compile; aa-drift / slow-dead / live-drift / bend-on-A
mutants all caught.

### R1 status at stop: PENDING (kill rule not decided)
RULED (PROPOSAL section 6): Q-REPS = (a) "A-twin at B's reps (Recommended)" (maintainer 2026-11-24, typed: "A-twin at
B's reps"); Q-WARM = (a) "Discard 1 warm round (Recommended)" (orchestrator record, NEXT-timing-ab-R1.md:6). The
fix-round gate in NEXT-timing-ab-R1.md is MET; UNIT 1 has not started.

### R1.3 Fix round (coder, 2026-11-24) + Q-REPS-2
- ab-proto a95e8931 -> 7a7da480 (1110 lines); ohlc-lane 2377d193 unchanged. Before copies: r1-before-fix/. Items 1-7 of
  NEXT-timing-ab-R1.md built; --oracle-only exit 0; --selftest 57 / 57 ok (quiet-lock run, QUIET load1 1.58); coder's
  mutant table: 34 untimed + 5 timed mutants, each red (coder report; the re-review checks it).
- Calibration --run ALL (PRELIMINARY: lock status NOISY, load1 2.73, a 14.1% node at PROV start; VOID for R1):
  bounds:1e5:1e3 B/A 44.251 aa 1.005 ab 1.818[1.806..1.850] reps A:256 B:8; bounds:1e5:1e5 B/A 5635.5 aa 0.995 ab
  1.181[1.173..1.257] reps A:256 B:1; null ab n/a. Both bounds lanes VOID REPS-DRIFT under rule (a): A at few reps costs
  1.18-1.82x per op (A's own per-call cost), so the band test on AB / A cannot pass for a lane where B needs far fewer reps.
- Maintainer ruled Q-REPS-2 = "Judge both ratios (Recommended)" (PROPOSAL section 6): word on B/A and on B/AB must
  agree, else VOID REPS-DRIFT; ab REPORTED. Coder delta round follows.
- Delta (fix2): ab-proto 7a7da480 -> 3b5b5a1e (1123 lines). Selftest 58 / 58 (PRELIMINARY, load1 2.33, a 13.6% node);
  calibration --run ALL (QUIET, load1 1.77; VOID for R1): bounds:1e5:1e3 B/A 45.044 / B/AB 24.641 both SLOWER, ab 1.831;
  bounds:1e5:1e5 B/A 5631.1 / B/AB 4683.9 both SLOWER, ab 1.204; null WITHIN 0.996; VERDICT PASS 3 / 3.

### R1.4 Law-11 re-review r2 -- REJECTED (1 LITERAL, GATE TEETH)
- Blockers 1-4 of r1 CLOSED, each with a tooth (reviewer re-checked the coder's 46 mutant logs + built its own mutants).
  Q-WARM: round 0 is still fold-, tier- and GC-checked, dropped only from the medians; no control weakened.
- LITERAL: nothing checks that AB runs at B's reps. Timed mutant `e.reps = e.col === 'B' ? repsB : reps` (AB = a second
  AA) passes the whole selftest (clean child ab 1.011 vs 1.83); ab-drift's per-op spin fires at any reps. Fix: print
  `,AB:<r>` from the AB entries' own reps; the judge requires AB reps = B reps; rows A:4,B:1,AB:1 ok / AB:4 NO VERDICT.
- Nits: no B/AB row with one NaN quartile; no row with B reps > A reps; warm-skew at K = 1 depends on host noise (fails
  closed); 3 mutants survive on REPORTED-only fields.
- UNVERIFIED (Q4): bounds:1e5:1e5 RAW AB outlier ~121-123x at counted round 3 in both calibration runs. Reviewer's read:
  AB at reps 1 (~18 us per call) shows a ~1.8 ms one-time cost as ~120x; fits a per-copy deopt + synchronous re-opt
  inside one call, which round-boundary tier checks cannot see. It moves a quartile by <= 1 rank and cannot flip R1's
  words. Open item (needs --trace-deopt); a VOID rule for it would be new design.
- Fix3 (LITERAL fix + the two row nits) sent to the coder; one narrow re-review of that diff follows.
No deciding run: a DESIGN reject stops the unit (burst rule), and the session reached its context ceiling. Next =
NEXT-timing-ab-R1.md (a coder fix round for 1-5 after the maintainer rules Q-REPS, one re-review, then the strict hold).
Lead for LiteBisect (not acted on): ab-gate's in-clock fold and post-timing reference checks have no must-fail
control either (blocker 4).

### R1.5 Fix3 + re-review r3 -- APPROVED; the R1 hold is PENDING (lock BUSY)
- Fix3: ab-proto 3b5b5a1e -> 74f1a3d4 (1140 lines; ohlc-lane 2377d193 unchanged). RESULT prints reps=A:a,B:b,AB:r with r
  from the AB entries' own reps; the judge requires AB reps = B reps when reps differ and no AB when equal; new rows
  (AB:4 vs B:1, AB reps missing, AB with equal reps, B/AB one-NaN quartile, A:1,B:4,AB:4 PASS); the clean timed case
  checks `,AB:<B reps>`. Selftest 63 / 63 ok (logs/fix3-selftest.log; lock QUIET load1 1.95, 5 / 15 min 5.38 / 5.41);
  the reviewer's timed mutant (AB at A's reps) -> selftest exit 1 (logs/fix3-mut-abAtAReps.log); 41 untimed mutants red.
- Re-review r3 (narrow, fix3 diff only): APPROVED. Verified: the r1/r2 reps path fails closed; the clean case's reps check
  is independent of the judge; round-2 survivors S4 / S5 now caught. Nit (not fixed, harness frozen for the hold): no
  row for a forged `AB:1/4` reps field (a regex widened to `[\d/]*` survives; live code cannot print it).
- Law 11 is now MET for ab-proto 74f1a3d4 + ohlc-lane 2377d193. Every number before this point stays VOID for R1.
- UNIT 3 hold: `quiet-lock.mjs status` at 2026-11-24 ~00:15Z read `held by "lite-signal sweep b254 0fffc59"` (another
  session's timed bench) = BUSY. Rule: run nothing timed, record PENDING, never retry. The hold did NOT run.

### R1 status at R1.5: PENDING (superseded by R1.6)
Open items carried: Q4 AB outlier (~121-123x at counted round 3 on bounds:1e5:1e5 in both calibration runs; suspected
in-call deopt + synchronous re-opt; needs --trace-deopt); warm-skew at K = 1 is host-noise sensitive (fails closed);
the forged-reps row nit. Next = NEXT-timing-ab-R1.md UNIT 3 only.

### R1.6 The R1 hold -- ran; kill rule NOT fired (R1 DECIDED: the method survives a non-LiteBisect lane)
- Maintainer go in chat: "Run here, lock free". START checks matched: git status ` M .gitignore`, ` M ROADMAP.md`,
  `?? .claude/`; ab-proto 74f1a3d4, ohlc-lane 2377d193 (= the r3-approved files). `quiet-lock status`: `free | host
  QUIET (load1 1.59, baseline 2.21, 12 cores)`.
- ONE `quiet-lock run --strict "LitePerfGate timing-ab R1 hold"` (NEXT UNIT 3 command verbatim), quiet-lock exit 0,
  host QUIET at entry (load1 1.57). Selftest exit 0; runs 1-5 exit 0. Logs r1/logs/hold-selftest.log, hold-1..5.log,
  hold-outer.log. Window 2026-11-24T00:29:33Z (run 1 PROV start) .. 00:32:18Z (run 5 PROV end); load1 1.17-1.44 over
  all runs, busy-node [] in every PROV line; node v26.8.2, arm64, Apple M4 Pro, v8 14.6.202.34-node.28; K = 11 (+1
  warm), C = 3.
- Kill rule (R1.0), clause by clause: A/A VOID 0 / 5 (aa 0.995-1.006 over all lanes and runs); SLOW-DEAD 0 / 5 (slow
  1.980-2.108); every selftest injection read its marker (bent-oracle x2 STOP ORACLE, boxed VOID ALLOC, slow-dead VOID
  SLOW-DEAD, aa-drift VOID AA-DRIFT; 63 / 63 selftest rows ok); NULL lane WITHIN 5 / 5 (B/A 0.997-1.006); the lane was
  stated without editing LiteOhlc (R1.1). No clause fired. Each log re-judged with `--verdict-file`: 5 / 5 VERDICT PASS
  gated=3/3, exit 0 (untimed).
- Numbers (PRELIMINARY -- local QUIET host, one hold, 5 runs; median of the 5 run medians, [min..max] over runs):
  | lane | B/A | B/AB | ab (REPORTED) | aa | slow | word / wordAB |
  | bounds:1e5:1e3 | 44.358 [44.111..45.009] | 24.635 [24.289..25.001] | 1.806 [1.801..1.820] | 1.003-1.006 | 1.980-2.000 | SLOWER / SLOWER 5 / 5 |
  | bounds:1e5:1e5 | 5660.9 [5632.0..5705.6] | 4764.9 [4704.1..4840.2] | 1.186 [1.155..1.197] | 0.995-1.006 | 2.067-2.108 | SLOWER / SLOWER 5 / 5 |
  | null:1e5:1e3 | 1.001 [0.997..1.006] | n/a (equal reps) | n/a | 1.000-1.003 | 1.994-2.012 | WITHIN 5 / 5 |
  For context only (REPORTED, different run): LiteOhlc README:341 says 44.2x and 5873x; this hold's B/A is 44.4x and
  5661x (-3.6% at w = 1e5). Not a claim about LiteOhlc; no number goes to any README.
- Q-REPS measured on the hold: A timed at B's few reps costs ab = 1.81x (reps 8) and 1.19x (reps 1) per op vs A at
  256. Under Q-REPS (a) (band on ab) both bounds lanes would have read VOID 5 / 5; under Q-REPS-2 both ratios agree 5 / 5.
- Q4 (open, REPORTED): bounds:1e5:1e5 RAW AB = 111.4-125.8x at counted round index 2 (the 3rd counted round) in 5 / 5
  hold runs (7 / 7 with calibration); every other AB round 1.09-1.42. A fixed position, not noise: points at a per-copy
  event (C = 3 rotation, one copy's first call at reps 1). One of 11 rounds: it moves q3 by <= 1 rank and flips no word.
  The bounds:1e5:1e3 AB rounds (reps 8) show no outlier (1.75-1.89). Still needs --trace-deopt (FILLER).

### R1 status: DECIDED -- not killed (law 11 met; strict hold 5 / 5 PASS, every control live)
Stop point per the maintainer ("stop after R1"). Carried: Q4 outlier, warm-skew at K = 1, the forged-reps row nit.
R2 (hosted drift) not started; needs the maintainer's go. Remaining Q-ids unruled.

---

## R2 -- hosted drift (go: maintainer 2026-11-24 "start both", relayed by the orchestrating session local_9e3c12eb)

START check (2026-11-24, this session): git status ` M .gitignore`, ` M ROADMAP.md`, `?? .claude/` (= NEXT); ab-proto
74f1a3d4, ohlc-lane 2377d193 (= the r3-approved files). LiteBisect read at HEAD b5c2988, bench/ab-gate.mjs 7e0f9262
(= the R0 pin). get_usage at start: 88K context.

### R2a.0 INTAKE (written 2026-11-24 BEFORE any number was computed from the logs; amends the INTAKE R2 row, which gave
### R2a "no kill rule: descriptive" -- the R2 brief adds a counterfactual question, so it gets one)

**Question.** On the saved hosted logs, (i) DESCRIPTIVE: what does hosted A/A drift look like per round and per lane,
and does it track PROV load? (ii) COUNTERFACTUAL: would a mechanism fixed below have turned the voided legs into
verdicts WITHOUT weakening the PASS legs?

**Inputs (LiteBisect, READ ONLY, saved logs; each RESULT lane has a RAW line = the K = 11 per-round B/A, AA/A, SLOW/A
ratios at 4 dp, round order, ab-gate.mjs:810-812):**
| id | run | legs | role |
| P1 | 43145179770 (ab.yml, 679dcad, 11-12) | ubuntu + macOS | PASS 13/13 both (AB-G3 re-judge): REFERENCE |
| P2 | 45079558712 (ab.yml) | ubuntu (PASS 13/13); macOS gate skipped (selftest FAIL, B18) | ubuntu = REFERENCE; macOS has no gate lines |
| V1 | 45087568692 (ab.yml, 3621f69) | ubuntu (12/13 clean), macOS (9/13 clean) | VOIDED: TARGET |
| L1 | 43127032794 (ab-research.yml lab, C11) | ubuntu + macOS | REFERENCE for the 13 gated lanes (both read their words) |
Paths: rejudge/run-43145179770/ab-gate-*/gate.log, rejudge/run-45087568692.joblog, audit-neon/ab/run-45079558712.log,
research/ab/logs/r4-43127032794/ab-r4-*/rung-all.log (all under LiteBisect/.handoff/). Job logs carry gh prefixes; the
probe strips them per leg (job name) and fails closed on a leg with != 1 HEADER / PROV start / PROV end.

**Self-check (oracle before analysis; the probe's numbers are VOID if it fails):** for every lane on every leg, the
med / q1 / q3 recomputed from RAW with ab-gate's quant / summarize (lines 183-195, copied verbatim) must equal the printed
RESULT B/A, aa and slow within 0.0011 (RAW is rounded to 4 dp, RESULT to 3 dp), and M0 below must reproduce the printed
clean / VOID state and word of every lane and the VERDICT line of every leg. A must-fail control: the same check on a
RAW vector with one round bent by +0.05 must fail on >= 1 lane.

**Mechanisms (fixed now; nothing added after the numbers are seen -- a later idea is reported as UNTESTED):**
- M0 ab-gate as is (aa med in [0.95, 1.05]; slow med > 1.25 and q1 > 1.10; word on B/A). Baseline + self-check.
- M1 in-job re-pair (at most one fresh attempt of a VOID lane). NOT testable offline (a log holds one K-vector per lane
  per leg; a re-pair is a new sample). Carried to R2b; R2a says only how many lanes M1 would have had to rescue.
- MW Q-WARM (a) as ruled for the tool: drop round 0, judge the remaining 10 rounds (an approximation of K + 1 - 1: the
  saved logs have K = 11 counted rounds, so K becomes 10).
- MT round trim: drop every round whose AA/A lies outside [0.95, 1.05] from all three vectors together; the lane is
  judged on the rest by M0's rules if >= 8 of 11 rounds remain, else VOID (TRIM-SHORT). Named bias: selection on the
  control; it cannot see a drift that is a level shift (every round shifted), which stays VOID.
- MJ judge-both (the Q-REPS-2 principle applied to A/A): no aa band VOID; instead the word is computed on B/A and on
  B/AA (per round (B/A) / (AA/A)); both must read the same word (no GATED word is consulted), else VOID AA-DISAGREE; aa stays printed
  (REPORTED). slow unchanged.

**What "weakening" means (fixed now; any one = the mechanism weakens the gate):**
- W1 on any REFERENCE leg (P1 both, P2 ubuntu, L1 both, gated lanes only) a lane's clean state, word or the leg's
  verdict differs from M0.
- W2 a lane M0 VOIDs for SLOW-DEAD (on any leg) is clean under the mechanism (no mechanism here touches SLOW; this is a
  check that the probe did not break it).
- W3 synthetic A/A drift injection on every REFERENCE leg: AA/A x f for f in {0.90, 0.94, 1.06, 1.10} in every round,
  B/A and SLOW unchanged. Any lane that M0 VOIDs under an injection but the mechanism leaves clean = weakened. (The
  injection models "A was mis-measured by f"; under M0 it is the aa-drift selftest family, ab-gate.mjs:142-156.)

**Kill rule (named before the numbers): KILL "an offline mechanism rescues hosted runs" if no mechanism in {MW, MT, MJ}
both (a) makes BOTH V1 legs PASS (every gated lane clean and reading its GATED word, ab-gate.mjs:86-92) and (b) shows
none of W1-W3.** A mechanism with (a) and W3 only is reported as a DESIGN question (a margin-aware A/A rule is a
re-ruling of LiteBisect law 5 / A8 "the band is not widened to get a verdict", never adopted inside this burst).
If killed: the hosted question rests on R2b (M1 re-pair + NULL lane) or on Q-HOST (b) quiet host.

**Descriptive hypotheses (fixed now; each reported HOLDS / FAILS / UNDECIDED):**
- H1 level shift: a V1 VOID lane whose AA/A q1..q3 lies entirely outside [0.95, 1.05] (a per-lane systematic bias,
  not a time-local spike; MT and MW cannot fix it, only a fresh draw or more copies could).
- H2 boot decay (macOS, PROV load1 58.98 -> 11.32): V1 macOS VOID lanes sit in the first half of the lane order.
- H3 hosted spread: per-lane AA/A IQR width on hosted legs exceeds the R1 local QUIET hold's (aa 0.995-1.006 over runs;
  per-round widths from r1/logs/hold-*.log RAW) by >= 3x in median over lanes.
All R2a numbers are REPORTED (hosted, saved logs, no quiet lock; one run per OS per dispatch). R2a is UNTIMED (no lock).

### R2a.1 Probe r2/r2a-hosted.mjs -- results (UNTIMED; numbers REPORTED; law 11: see R2a.2)
Final probe 96ab889f, output r2/logs/r2a.log ec01d566 (node v26.8.2, darwin, 2026-11-24; pre-review 2ebc05a6 /
f5e56c7f and fix-1 0555462c / fb5dc75f kept, frozen copies in r2/frozen/). Inputs (sha256/8):
P1 ubuntu 6035afb2 / macOS d6cc3927 (= the AB-G3 re-judge pins), P2 5ee455d5, V1 98d19326, L1 c7bdc7bf / 569b7d18
(= ab-gate's FIXTURES pins).
- Self-check: 161 lanes (7 legs x 23); every RESULT B/A / aa / slow reproduced from RAW within 0.0011; M0 reproduced
  every printed AA-DRIFT / SLOW-DEAD set and word and all 5 printed VERDICT lines (P1 x2 PASS, P2 ubuntu PASS, V1
  ubuntu 12/13 + macOS 9/13 NO VERDICT); L1 has no VERDICT line, M0 reads PASS on both (= C11's 13 words). Bent-RAW
  control (AA round 5 + 0.05) broke reproduction on 89 / 161 lanes.
- Per leg (AA/A; per-lane IQR width median; rounds outside [0.95, 1.05]; PROV load1 start; CPU):
  | leg | IQR w med | rounds out | load1 start | CPU |
  | P1 ubuntu | 0.0034 | 1 / 253 | 1.02 | EPYC 9V74 |
  | P2 ubuntu | 0.0033 | 0 / 253 | 1.02 | EPYC 7763 |
  | V1 ubuntu | 0.0037 | 8 / 253 | 1.85 | EPYC 7763 |
  | L1 ubuntu | 0.0028 | 1 / 253 | 0.60 | EPYC 9V45 |
  | P1 macOS | 0.0139 | 28 / 253 | 24.11 | M1 (Virtual) |
  | V1 macOS | 0.1734 | 161 / 253 | 58.98 | M1 (Virtual) |
  | L1 macOS | 0.0562 | 97 / 253 | 9.10 | M1 (Virtual) |
  R1 local QUIET hold (M4 Pro, 15 lanes): 0.0081.
- H1 level shift: FAILS by its letter (0 / 8 V1 VOID lanes, gated + reported; 0 / 5 gated have q1..q3 wholly outside the band). But V1 ubuntu
  uni:65536 misses by 0.001: AA 11 / 11 rounds in 0.917-0.953, aa 0.941[0.926..0.951] -- a tight offset, not spikes.
  The 4 gated macOS VOIDs are wide spreads (IQR 0.10-0.37), per-round AA 0.39-1.64; the 3 reported ones too.
- H2 boot decay: FAILS (V1 macOS VOID lanes at order 0, 3, 4, 11, 12, 13, 18 of 23; 4 / 7 in the first half).
- H3 hosted spread >= 3x: FAILS pooled (0.72x), because the OS split: ubuntu 0.35-0.46x R1 (as tight as the local
  QUIET host), macOS 1.7x / 6.9x / 21.4x in 3 / 3 dispatches (passing P1 included). Spread does not order by load1
  start (L1 9.10 -> 6.9x; P1 24.11 -> 1.7x).
- Counterfactual (kill rule R2a.0):
  | mech | V1 ubuntu | V1 macOS | W1 | W2 | W3 (of 365 M0-VOID injections) |
  | MW drop round 0 | 12/13 | 10/13 (rescues uni:256 + walk:65536:1, loses walk:256:4: aa 0.933) | 0 | n/a | 2 (L1 macOS uni:256, fw:16 x0.94) |
  | MT trim rounds | 12/13 | 1/13 | 9 (L1 macOS lanes TRIM-SHORT) | n/a | 0 |
  | MJ judge-both | PASS | PASS | 0 | n/a | 345 |
  W2 is untestable on these logs (no lane is SLOW-DEAD under M0 on any leg). W3 scope: every lane of P1 / P2, the 13
  gated lanes of L1 (INTAKE inputs table), x f in {0.90, 0.94, 1.06, 1.10}.
  M1 (re-pair) would have to rescue 1 ubuntu + 4 macOS lanes; untestable offline.
  **KILL RULE R2a FIRED: no offline mechanism makes both V1 legs PASS without weakening (W2 untestable).** MJ meets (a) with W3 only:
  a DESIGN question (a margin-aware A/A rule re-rules LiteBisect law 5 / A8), listed as Q-AAJUDGE, not adopted.
- POST-HOC (seen after the numbers; UNTESTED, no conclusion drawn): uni:65536 ubuntu aa per CPU: 9V74 1.004, 9V45 0.998,
  7763 0.976 (P2) and 0.941 (V1); V1 ubuntu also reads tight offsets on ro:65536 0.980 and fw:1024 0.963. A 65536-F64
  array is 512 KB, the EPYC 7763's per-core L2 size. A per-copy placement effect would fit; nothing here tests it.
  If it is one, B's copies can carry the same offset unseen, and a re-pair redraws it: that is what R2b's NULL lanes
  control.

### R2b.1 R2b design (r2/R2B-DESIGN.md 0543b542 + r2/ab-r2b.yml.draft 5ebfcfa1) -- review r1 REJECTED (6 DESIGN + 7 LITERAL); unit STOPPED
Design only; nothing built or dispatched. The v2 rule is NOT adopted; the INTAKE R2 row stays the rule of record (still
unreviewed). Under the burst rules a DESIGN blocker stops the unit: no fix round in this burst. Blockers (reviewer's
numbering, file:line in the frozen copies r2/frozen/):
DESIGN
- D1 (#1) The NULL control does not measure the named bias: the risk is attempt 2 GIVEN an attempt-1 VOID; N1 (those
  draws) is reported but no K-clause uses it, so "USABLE with re-pair" is reachable with N1 = 0 (likely on ubuntu: R2a
  saw 1 VOID gated lane in 4 legs). Needs a pre-stated N1 floor met with zero false words, else the best outcome is
  "hosted usable WITHOUT re-pair" / NO VERDICT on re-pair.
- D2 (#2) K2 cannot fire on R2b's lanes (44x / 5661x margins); only the ratio-1 NULL lanes can catch a false word, yet
  USABLE maps to a tool-wide Q-HOST (a) that covers low-margin lanes (LiteBisect A8: margin 0.044). Limit the outcome
  scope, or add a near-band gated lane with a ruled word.
- D3 (#3) Outcome map has holes: "(d)" exists nowhere; K4 NO VERDICT maps to nothing; no precedence K1-K3 vs K4.
- D4 (#4) Optional stopping at the dispatch level: leg count / dispatch count / matrix chosen during the study; STOP /
  timeout / selftest-FAIL legs neither counted nor excluded. Fix the count and matrix before dispatch 1; every
  dispatched job counts; no replacement dispatch.
- D5 (#5) Every hosted leg would STOP: r1/ohlc-lane.mjs:17 LIVE_PKG is an absolute local path; ab-proto :320 reads the
  live file or STOPs ANCHOR, and the dispatch plan copies no live file. Under K3 a STOP leg is "not PASS" -> a harness
  defect read as a host verdict (and the home path would be pushed). Also the selftest live-drift marker
  'STOP ANCHOR: live ' matches the "unreadable" message too (B13: ok on the broken path). Needs a design for the live
  check on a runner (or dropping it + its row) and a K0: STOP / CRASH / selftest-FAIL leg -> NO VERDICT (harness).
- D6 (#6) Re-pair fires on every VOID kind (ALLOC, NOT-TF, SLOW-DEAD, ...): best-of-two on a JIT-decision check is a
  retry with no control (law 8). Proposed: re-pair only a lane whose SOLE VOID kind is AA-DRIFT.
LITERAL (exact text in the review; applied with the v3 rewrite, not before)
- #7 selftest rows with must-fail controls (a)-(h); #8 the judge's expected `repair=` comes from its own `--repair`
  argument, never the log; #9 `--repair 0` parity in three parts (judge bytes, R1's 63 rows, masked timed line kinds);
  #10 power statement: N = CLEAN NULL draws, N1 = clean attempt-2 after a VOID, ~3/N and ~3/N1 (N1 < 3 = unmeasured),
  per-leg correlation means the effective sample can be ~3 legs; #11 K4 back to a fraction (2 / 3 of legs, >= 2);
  #12 section 1 states R2a numbers before their law-11 approval; #13 the offline judge checks the dispatched files'
  shas against the approved pins.
Nits: the change list omits "over 3 dispatches" dropped / NULL lanes 1 -> 4 / final-state rule; shasum missing file
cannot fail its step; offline judge must key legs by (run id, os, leg); no outcome named for a non-PASS pre-dispatch hold.
Verified by the reviewer: the draft workflow matches ab.yml's shape (dispatch-only, contents: read, PIPESTATUS / tee,
pin and identity checks); nothing in it pushes or writes outside the job; no dispatch-plan step has Claude send anything
off the machine; the cost figure is labelled nominal.

### R2a.2 Law-11 review of r2/r2a-hosted.mjs -- r1 REJECTED (5 LITERAL), r2 REJECTED (1 LITERAL), literal round applied
- r1 (2ebc05a6): 5 LITERAL blockers, none changing a number or conclusion: VERDICT reproduction skipped when a job leg
  had no VERDICT line; lane set never checked (dropped / duplicated RESULT passed); an empty RAW token became 0; H2 / H3
  verdicts on vacuous or NaN input; W2 could never fire and was printed as a measured 0. Nits: W3 / H1 / H2 scope
  narrower than the INTAKE; no leg-identity check; judge copy not sha-pinned. All applied (0555462c). Mutants caught
  after the fix: VERDICT dropped, lanes dropped, duplicate RESULT, job swap, blank RAW token, ab-gate pin bent; hold-3
  missing / NaN width / empty macVoid now UNDECIDED; W2 printed n/a.
- r2 (0555462c): 1 LITERAL blocker (FIDELITY): the widened W3 also counted L1's 10 reported lanes, which the INTAKE
  names REFERENCE only for its 13 gated lanes. The reviewer gave the exact 2-line fix and ran it: MW 2 / MT 0 / MJ 345
  of 365. Applied as the one allowed literal-only round (96ab889f); the output reproduces those three lines exactly and
  every other line of fix-1's log is unchanged. No third review (round cap); the numbers stand on that basis.
- Carried nits (FILLERS): H3's UNDECIDED reason prints "missing: " when the cause is a NaN ratio; the W3 print label
  still says "(all lanes, REF legs)"; the lane-set check compares legs to legs[0], so a uniform drop on every leg
  passes (cross-check against the gate's own REPORTED line).

### R2 status: R2a DECIDED (kill rule fired); R2b design STOPPED at review r1 (DESIGN). Waiting on the maintainer.
