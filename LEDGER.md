# lite-ab-gate -- the ledger

*Every design refused, every defect caught, every measurement trap, and the laws they produced,
for the reusable STATISTICAL timing A/B gate. Each entry names the file, path or source ledger
entry it rests on; nothing here comes from memory. Nothing here is re-litigated without a new
mechanism that clears every gate the original decision cleared.*

Scope: `@zakkster/lite-ab-gate` (pre-1.0, version 0.0.0, 2026-11-24; see ROADMAP.md). Repository
`github.com/PeshoVurtoleta/lite-ab-gate`. The method was extracted from LiteBisect
`bench/ab-gate.mjs` 7e0f9262 and proven on a prototype (ab-proto 74f1a3d4) before this package's
code existed. Entries written before this package's first commit name files and dates only. Most
of what the package knows today it INHERITED (section I) or MEASURED on the prototype (section X).
Inherited and X entries are evidence measured on other code; they bind the design here, but a
number from them is never quoted as this package's number.

## How to read this file

- Section 0 (the laws) first. Each law names the LiteBisect law it restates and the entries
  that prove it.
- Entry ids, never renumbered:
  - `I<n>` inherited from another ledger (source named);
  - `X<n>` research entries measured on the prototype before this package's code existed;
  - `A<n>` designs refused or parked;
  - `B<n>` defects found and fixed;
  - `C<n>` measurement lessons from this package's own runs on ABGate.js;
  - `D<n>` process lessons.
- Sources: `git log`, ROADMAP.md, RESEARCH.md, `research/timing-ab/`, `.handoff/` (gitignored), and
  the LiteBisect ledger under `LiteBisect/LEDGER.md`.
- Tiers: DETERMINISTIC gates run in `npm test` / `npm run verify` every time; STATISTICAL
  gates run once per release candidate, interleaved A/B on hosted CI (workflow
  `.github/workflows/ab.yml`); REPORTED numbers gate nothing.

## How to add an entry

1. Take the next free id in the section (never renumber). Place it at the end of its section.
   Classes: I (inherited), X (research, measured on the prototype), A (refused or parked),
   B (defect fixed), C (measurement on this package's code), D (process lesson).
2. Title in one line with its status and date, e.g. *(RULED 2026-11-24)*. Then: **What
   happened**, **Root cause** (or **Reason**), **Evidence** (path, and the commit once the
   package is a repo), **Law** (number in section 0, or "none new"), **Gate** (file + test /
   tier name, or "none yet").
3. A measurement enters only from a run log of that cycle, with date, host (or CI run id),
   load, Node / V8 and run count as the log states them. An estimate is labelled "nominal".
4. An entry names what would reopen it: a new engine behaviour, a new consumer, a new gate
   result. The reopening change must clear every gate the entry lists.
5. Inherited entries (`I<n>`) quote the source ledger id and path. When this package re-measures
   one, the result becomes a `C<n>` entry and the `I<n>` entry points to it. The same holds for
   `X<n>`: an X entry was measured on the prototype, and stays the prototype's number until a
   `C<n>` entry re-measures it on ABGate.js.

---

## 0. The laws (read this first)

Laws 1-6 are LiteBisect's laws 5, 7, 8, 9, 10 and 11 restated for this package; laws 7 and 8
are new here (X5, X1). Each becomes this package's own law once a `C<n>` entry confirms it.

1. **A timing verdict needs its controls and a range, never one run.** Several independent
   compilations per column, an A/A twin, a must-fail SLOW control, each lane on its own instance,
   the median of K interleaved rounds plus IQR, ranges quoted across runs. A PRELIMINARY host is
   recorded, not argued. *(LiteBisect law 5; LiteBisect I4, I5, I7)*
2. **Branch prediction and memory ordering do not transfer across CPUs.** A timing measured on
   one CPU is that CPU's; a "faster" claim needs x86 too, so a release verdict needs both OS
   families in one hosted dispatch (C-24 workflow, U4). *(LiteBisect law 7; LiteBisect I1, I6)*
3. **A zero-box entry is not a zero-box path, and an allocation gate must be able to see the
   box.** A double crossing a call V8 does not inline boxes; a gate whose control flips only on a
   JIT decision checks the tier or reports no verdict. *(LiteBisect law 8; LiteBisect I2, I8)*
4. **A gate fails open until a control proves it closed, and the expected value never comes from
   the thing it checks.** Every checker row has a control that fails on that row alone; a crashed
   or never-run mutant is a FAIL; the oracle shares no code with the code under test.
   *(LiteBisect law 9; LiteBisect I5, B1)*
5. **Every refusal and every rung names its kill rule before the run.** Every outcome of a
   pre-registered rule is defined, including a harness failure. *(LiteBisect law 10; LiteBisect I8; X5)*
6. **A probe harness is reviewed before its numbers count.** *(LiteBisect law 11; LiteBisect I7)*
7. **A harness failure on a runner is STOP -> NO VERDICT, never host evidence, and nothing the
   workflow runs depends on a local absolute path.** A hosted run that cannot read its own inputs
   has measured the harness, not the host. *(X5; SPEC C-17, C-25)*
8. **One boundary row per comparator.** A control row far from its comparator boundary cannot see
   a `>` / `>=` flip; the judge carries a row on each boundary. *(X1; SPEC C-9)*

Gate consequence: no X number is this package's number until a `C<n>` entry re-measures it on
ABGate.js. No single green gate authorises a release.

---

## I. Inherited entries (measured on other packages; not re-run here)

Source: `LiteBisect/LEDGER.md` (all ids below
verified to exist there on 2026-11-24).

### I1. The K = 11 / A/A 0.95..1.05 gate shape fails CLOSED on a contended host *(LiteBisect A8, REFUSED 2026-11-12)*
- **Quoted title:** "A8. The K = 11 / A/A 0.95..1.05 gate shape on a contended host".
- **Evidence:** LiteBisect/LEDGER.md A8.
- **Here:** the A/A band is a validity gate (SPEC C-8); the band is not widened to get a verdict.

### I2. The ab gate's live-path control could not see the seam, and 8 verdict checks had no control *(LiteBisect B13, FOUND 2026-11-12)*
- **Quoted title:** "B13. The ab gate's live-path control could not see the seam, and 8 verdict checks had no control".
- **Evidence:** LiteBisect/LEDGER.md B13.
- **Here:** a control whose expected outcome is also the broken path's proves nothing (laws 4, 7).

### I3. A red ab.yml selftest row could not be diagnosed: the child's RESULT line was discarded *(LiteBisect B18, FOUND 2026-11-23)*
- **Quoted title:** "B18. A red ab.yml selftest row could not be diagnosed: the child's RESULT line was discarded".
- **Evidence:** LiteBisect/LEDGER.md B18 (fixed there by failReplay).
- **Here:** a failing selftest control must leave its numbers.

### I4. Hosted A/A drift voided gated lanes on both OS in the ab.yml re-dispatch *(LiteBisect B19, FOUND 2026-11-23)*
- **Quoted title:** "B19. Hosted A/A drift voided gated lanes on both OS in the ab.yml re-dispatch".
- **Evidence:** LiteBisect/LEDGER.md B19; ab.yml run 45087568692.
- **Here:** the per-run A/A twin is the noise gate (SPEC C-7); a NO VERDICT run may be re-dispatched once.

### I5. On hosted x86 and an arm64 VM the 13 gated words hold; low-margin lanes move per CPU *(LiteBisect C11, MEASURED 2026-11-12)*
- **Quoted title:** "C11. On hosted x86 and an arm64 VM the 13 gated words hold; x86 differs at the low-margin walk:256:1 and fw:2048 and in the feeds-write size".
- **Evidence:** LiteBisect/LEDGER.md C11; ab-research.yml run 43127032794 (REPORTED).
- **Here:** law 2; a hosted policy is per OS.

---

## X. Research entries (measured on the prototype before this package's code existed)

X numbers belong to the ab-proto prototype (74f1a3d4) until a `C<n>` entry re-measures them on
ABGate.js. Evidence paths point into `research/timing-ab/` in this package; the original
LitePerfGate path (`LitePerfGate/.handoff/research/timing-ab/<same relative path>`), and sha where the draft gave one, are kept in parentheses.

### X1. ab-gate's judge parametrizes behind declared data: 45 / 45 verdict rows + 10 / 10 boundary rows byte-identical *(MEASURED 2026-11-23, timing-ab research burst R0; UNTIMED, deterministic)*
- **What happened:** LiteBisect bench/ab-gate.mjs 7e0f9262 was inventoried for a reusable timing A/B gate. A prototype
  judge `verdictOfG(spec, lines)` took ab-gate's verdictOf / laneState / word with three LiteBisect inputs moved into
  declared data (lane ids, the GATED word map, the HEADER shape fields NQ2 / minWindow). On ab-gate's own fixture rows
  F1-F45 (sliced from its source, not retyped) the prototype's VERDICT line, REPORTED line and exit equal the original
  child `--verdict-file` byte for byte on 45 / 45. Three bent specs (one gated word flipped, one shape field dropped,
  band [0.90, 1.10]) differ on 43 / 43 / 45 rows. Review r1 found that no F-row sits on a comparator boundary (5 `>` /
  `>=` mutants kept 45 / 45); 10 boundary rows B1-B10 were added: parity 10 / 10, and each of 10 comparator flips
  differs on >= 1 B-row.
- **Reason:** the judge reads only printed lines and constants; every LiteBisect dependence is a value, not a code path.
  PROGRESS R0.3 lists 15 seams; the 5 on the verdict path (S-1, S-2, S-11, S-13, S-14) become declared data; the
  producer seams were classified by reading, not run (R1).
- **Evidence:** research/timing-ab/r0-verdict-parity.mjs 16693c6e, log research/timing-ab/r0-verdict-parity.log
  935bec9f (original: LitePerfGate/.handoff/research/timing-ab/r0-verdict-parity.mjs, .../r0-verdict-parity.log)
  (node v26.8.2, darwin, 2026-11-23T08:54:02Z; review r2 body 3d52d13a + the additive P6 guard; r1 before review d34aa61f / fded6dc4),
  research/timing-ab/PROGRESS.md R0 (original: LitePerfGate/.handoff/research/timing-ab/PROGRESS.md). Not a
  timing number: no tier label needed.
- **Law:** LiteBisect law 9 (a control per check row; the bent specs and comparator flips are the probe's own
  must-fail controls). Candidate new lesson: a control row far from its comparator boundary cannot see a `>` / `>=`
  flip -- one boundary row per comparator.
- **Reopens with:** a verdictOf check row added to ab-gate after 7e0f9262 without its F-row; a seam found that makes a
  verdict depend on a package value that cannot be declared data; R1 finding a producer path whose extraction changes
  a RESULT line on the same lane.

### X2. A twin timed at the candidate's few reps is not A: per-op cost 1.81x at reps 8, 1.19x at reps 1 -- judge both ratios, never band the twin *(MEASURED 2026-11-24, timing-ab R1; PRELIMINARY, local QUIET host, 5-run strict hold + 2 calibration runs)*
- **What happened:** R1's candidate (LiteOhlc's hand-rolled baseline) is ~45x / ~5600x slower than A, so it runs at its
  own reps (8 / 1) while A runs at 256. Review flagged that as an uncontrolled bias; the first ruling (Q-REPS (a)) added
  AB = A compiled fresh and timed at B's reps, banded at [0.95, 1.05] against A. Measured ab = AB / A was 1.81x (reps 8)
  and 1.19x (reps 1) in every run: rule (a) would void both lanes 5 / 5. The maintainer re-ruled Q-REPS-2: the word is
  computed on B/A and on B/AB and must agree (else VOID REPS-DRIFT); ab is REPORTED only.
- **Reason:** at few reps a call's fixed cost (call, setup, loop entry) is not amortized; that cost is A's own, not
  noise, so a band on it measures the reps choice, not drift.
- **Evidence:** research/timing-ab/r1/ab-proto.mjs 74f1a3d4, research/timing-ab/r1/logs/hold-1..5.log (ab 1.801-1.820 / 1.155-1.197; B/A and B/AB both
  SLOWER 5 / 5), research/timing-ab/r1/logs/fix2-run-all.log (originals: LitePerfGate/.handoff/research/timing-ab/r1/...);
  PROGRESS R1.3, R1.6. Node v26.8.2, Apple M4 Pro, load1 1.17-1.44.
- **Law:** STATISTICAL tier (a stated statistic, a must-fail control). Candidate lesson: a control column that changes
  the work per call (reps) is a second comparison, not a twin -- judge it as a ratio, do not band it.
- **Reopens with:** a lane where B/A and B/AB disagree on a quiet host (REPS-DRIFT with no other cause); a reps policy
  that equalizes reps without making the slow side's window impractically long.

### X3. The ab-gate method survives a non-LiteBisect lane: R1 strict hold 5 / 5 PASS with every control live *(MEASURED 2026-11-24, timing-ab R1; PRELIMINARY, local QUIET host, one quiet-lock run --strict hold, 5 runs)*
- **What happened:** the extracted prototype (ab-proto 74f1a3d4, zero package names) gated LiteOhlc boundsInto (a class
  method, frozen copies, no edit to LiteOhlc) on 3 lanes after a law-11 review (r1 REJECTED, r2 REJECTED, r3
  APPROVED). The hold read VERDICT PASS gated=3/3 in 5 / 5 runs; kill rule clauses all clear: A/A VOID 0 / 5, SLOW-DEAD
  0 / 5, every selftest injection read its marker (63 / 63), NULL lane (B = a fresh compilation of A) WITHIN 5 / 5
  (B/A 0.997-1.006).
- **Reason:** kernels as whole source text compiled per copy with setup in the copy's scope make a class method a
  valid A / AA / SLOW column; the judge reads printed lines only (X1).
- **Evidence:** research/timing-ab/r1/logs/hold-selftest.log, hold-1..5.log (originals: LitePerfGate/.handoff/research/timing-ab/r1/logs/...)
  (2026-11-24T00:29:33Z-00:32:18Z, load1 1.17-1.44,
  busy-node none, node v26.8.2, Apple M4 Pro, K = 11 + 1 warm, C = 3); each log re-judged by `--verdict-file` 5 / 5
  PASS; PROGRESS R1.6. Medians of run medians: B/A 44.36 (w = 1e3), 5661 (w = 1e5), 1.001 (NULL).
- **Law:** LiteBisect law 9 (a control per check), law 11 (review before numbers count). Hosted behavior untested (R2).
- **Reopens with:** a hosted run (R2) reading A/A VOID or SLOW-DEAD in > 1 of 5; the Q4 fixed-position AB outlier
  (~111-126x at counted round 3, reps-1 lane, 7 / 7 runs) explained as a defect that can flip a word.

### X4. Saved hosted logs: ubuntu A/A is as tight as a quiet M4 Pro, the macOS VM is not, and no offline rule rescues the voided dispatch without weakening *(MEASURED 2026-11-24, timing-ab R2a; UNTIMED re-analysis of saved hosted logs, numbers REPORTED)*
- **Note (2026-11-24):** R2b CLOSED unrun 2026-11-24 (C-7). The "Reopens with" item naming R2b's re-pair
  dispatches is closed with it: no in-job re-pairing exists in this package.
- **What happened:** r2/r2a-hosted.mjs re-judged LiteBisect's saved ab.yml / ab-research.yml logs (43145179770,
  45079558712 ubuntu, 45087568692, 43127032794; 7 legs x 23 lanes) from their RAW per-round ratios after reproducing
  every printed RESULT, VOID set and VERDICT. Per-lane A/A IQR width: ubuntu legs 0.0028-0.0037 (0.35-0.46x the R1
  local QUIET hold's 0.0081); macOS VM legs 0.0139 / 0.0562 / 0.1734 (1.7x / 6.9x / 21x) in 3 / 3 dispatches. Three
  rules fixed before the numbers: drop round 0 (MW) rescued 2 of 4 macOS VOIDs and lost one clean lane; trimming
  out-of-band rounds (MT) rescued none and voided 9 lanes of a passing leg; judging the word on both B/A and B/AA (MJ)
  rescued all 5 VOIDs but left 345 of 365 injected A/A drifts clean. Kill rule fired (W2 untestable:
  no SLOW-DEAD lane in the inputs).
- **Reason:** the macOS VM's drift is wide per-round spread (AA 0.39-1.64 per round), which trimming and dropping a
  round cannot repair; the ubuntu VOID was a tight offset (11 / 11 rounds 0.917-0.953), which a round rule cannot see
  as noise at all. MJ "works" only by ignoring the A/A band wherever the word has margin.
- **Evidence:** research/timing-ab/r2/r2a-hosted.mjs, research/timing-ab/r2/logs/r2a-*.log (originals:
  LitePerfGate/.handoff/research/timing-ab/r2/..., shas in PROGRESS R2a.1); input shas there. Not a timing run:
  REPORTED re-analysis of hosted numbers.
- **Law:** LiteBisect law 5 / A8 (the band is not widened to get a verdict -- MJ would amount to that); law 10 (kill rule
  before the numbers). Candidate lesson: a hosted-runner policy is per OS -- one dispatch can hold a quiet x64 leg and
  a noisy arm64 VM leg.
- **Reopens with:** R2b's re-pair dispatches (the only mechanism left that saved logs cannot test); a macOS hosted leg
  whose A/A IQR width stays under 2x the quiet host's in 3 dispatches; a measured mechanism for the ubuntu offset.

### X5. The R2b design would have read a harness STOP as "hosted unusable", and its NULL control measured the wrong draw *(FOUND 2026-11-24, timing-ab R2b design review r1; DESIGN, nothing built or dispatched)*
- **What happened:** the R2b v2 rule (r2/frozen/R2B-DESIGN-0543b542.md) planned hosted dispatches of the R1 lane file.
  Review found (a) r1/ohlc-lane.mjs:17 points its live-file check at an absolute local path, so every hosted leg would
  STOP ANCHOR, and the v2 K3 clause counted a STOP leg as "not PASS" -> NOT USABLE: a harness defect would have been
  recorded as a host verdict; (b) the selftest's live-drift marker 'STOP ANCHOR: live ' also matches the "live ...
  unreadable" STOP, so that row reads ok on the broken path; (c) the always-re-paired NULL lane estimates the second
  draw unconditionally, while the optional-stopping risk is the second draw GIVEN a first VOID, which no clause used.
- **Reason:** the design reused a locally validated lane file without checking what it reads from the host; and the
  control was chosen for the bias's name, not its conditional form.
- **Evidence:** research/timing-ab/PROGRESS.md R2b.1 (blockers D1-D6, #7-#13); research/timing-ab/r1/ab-proto.mjs 74f1a3d4 :137 / :320;
  research/timing-ab/r1/ohlc-lane.mjs 2377d193 :17, :128-129 (originals: LitePerfGate/.handoff/research/timing-ab/...).
- **Law:** LiteBisect law 9 (a control whose expected outcome is also the broken path's proves nothing: B13); law 10
  (every outcome of a pre-registered rule defined, incl. harness failure). Candidate lesson: a hosted study needs a K0
  "harness failed -> NO VERDICT, never host evidence" clause, and a control for optional stopping must sample the
  conditional draw.
- **Reopens with:** an R2b v3 rule whose review finds no outcome without a mapping and no clause that cannot fire.

### X6. ab-proto's old gcWindow closure allocates 2688 x (K + 1) B (the window reads 3000 + 2688 x (K + 1) B): 224 B per live entry per round *(MEASURED 2026-11-24, U2 G-A B0 census (b); REPORTED allocation COUNTS on the PROTOTYPE, not on ABGate.js; local, QUIET per the census, not --strict)*
- **What happened:** an instrumented copy of the frozen ab-proto (74f1a3d4 -> scratch copy fcf9688b; 3-line patch)
  read new-space used size around `fn()` inside gcWindow on `toy:clean` (12 live entries per round, K + 1 rounds). The
  K = 1, 3, 7, 11 points fit `bytes = 3000 + 2688 x (K + 1)` exactly: slope 2688 B per round = 224 B per live entry
  per round (the entry's timed call AND its per-round optStatus tier poll; the census does not split the two),
  intercept 3000 B = the measurement's own cost. K = 3 read 13752 B in 3 of 3 runs, 0 scavenges; K = 11 reads 35256 B.
  The closure runs unoptimized, so its doubles box. Companion count (census (a)): `performance.now()` into a
  Float64Array slot in a TurboFan loop reads 0 B per 1e5 calls on node v26.8.2; the boxed control (PACKED array) reads
  15.9996 B per call, so the window sees a box.
- **Reason:** this is the must-fail baseline for C-23: the hoisted timed loop must read 0 tool bytes against it.
- **Evidence:** .handoff/evidence/U2-GA-census.md, U2-GA-census-b-1.log, -2, -3, -K1, -K7, -K11 (6 runs), census-a.log
  (gitignored run logs). Provenance as the census states it: darwin arm64, Apple M4 Pro, node v26.8.2 (v8
  14.6.202.34-node.28), 2026-11-24 05:59-06:00 UTC, quiet-lock run (no --strict), host verdict QUIET, load1 per run:
  b-1/-2/-3 1.44, K1 1.82, K7 1.76, K11 1.76, census-a 1.44, baseline 2.21, busy-node none. Provenance: incomplete -- missing:
  the hosted / x86 result, and any run on ABGate.js.
- **Law:** law 3 (an allocation gate must be able to see the box); law 4 (the baseline is a must-fail control).
- **Reopens with:** a C entry re-measuring the window on ABGate.js; a node / V8 where census (a) reads > 0 B
  (e.g. node 22, C-31) or the per-entry bytes change.

---

## A. Designs refused or parked

(none yet)

## B. Defects found and fixed

### B1. `npm test` passed on a tree with no tests *(FOUND 2026-11-24, U1 TASK 0 coder; FIXED U1, C-29)*
- **What happened:** the scaffold's test script `node --test "test/*.test.mjs"` exited 0 with "tests 0" on node
  v26.8.2 when no test file existed. The plan assumed npm test fails until the engine lands (C-18 (a)).
- **Reason:** node --test treats an empty match as a passing run.
- **Evidence:** .handoff/evidence/U1-task0.log (gitignored; the run log).
- **Law:** law 4 (a gate fails open until a control proves it closed); suite law "Fail closed on every unverified state".
- **Gate:** test/import.test.mjs imports ../ABGate.js, so npm test fails until the engine exists. The U10 docs test
  asserts a test-file floor.
- **Reopens with:** a test glob or runner change that again lets an empty run pass.

### B2. Fail-closed workflow steps were checked by presence only, so `continue-on-error` / `|| true` / `set +e` / `|| echo` slipped through *(FOUND 2026-11-25, G-C B2 review r1 / r2; FIXED r3; REOPENED 2026-11-26 by FILL5 retry r3 probe P99, ruled C-57, open until FILL7 APPROVED)*
- **What happened:** the docs.template test for templates/ab.yml and the ci.yml check asserted that the fail-closed
  steps were present. Review r1 REJECTED 2 LITERAL findings (presence-only fail-closed checks; ci concurrency on
  main); r2 REJECTED 1 LITERAL (`|| echo` and `set +eo` still slipped); r3 APPROVED. The suite is now 13 checks / 60 mutants (M1..M60; was 37 at FILL3: U8 B3 added stopgate + M30..M33, FILL3 added M34..M37, the FILL5 retry added M38..M60; .handoff/COMMIT_MSG-U8B3.txt, COMMIT_MSG-FILL3.txt, B13).
- **Root cause:** a check that a step exists does not see a neutralizer attached to it (`continue-on-error`, `|| true`,
  `set +e`, `|| echo`); the check passed on a workflow whose failure could not fail the job.
- **Evidence:** .handoff/HISTORY.md (burst 3, G-C B2); .handoff/evidence/U4-GCB2-docs-template.log,
  U4-GCB2r2-docs-template.log, U4-GCB2r3-docs-template.log (gitignored run logs).
- **Law:** law 4 (a gate fails open until a control proves it closed).
- **Gate:** test/docs.template.test.mjs (a mutant per neutralizer form).
- **Reopens with:** a new way to neutralize a step's exit status that no mutant covers.

### B3. A d.ts gate outside the `npm test` glob and a test that skips when tsc is absent were vacuous passes *(FOUND 2026-11-25, G-A B3 review r1; FIXED r2)*
- **What happened:** review r1 REJECTED 3 LITERAL findings: the types test sat outside the `test/*.test.mjs` glob, so
  `npm test` never ran it; the consumer test skipped when tsc was absent, so a tree without tsc passed; and mutant M04b
  survived. r2 APPROVED.
- **Root cause:** a gate that is not run, or that turns itself off when its tool is missing, reports green on a tree it
  never checked (the same class as B1).
- **Evidence:** .handoff/HISTORY.md (burst 3, G-A B3); .handoff/evidence/U4-GAB3-teeth.log, U4-GAB3r2-teeth.log
  (gitignored run logs).
- **Law:** law 4; suite law "Fail closed on every unverified state".
- **Gate:** test/types.exports.test.mjs, test/types/consumer.local.mjs (tsc; LOCAL ONLY, outside the npm test glob,
  fails without tsc -- not a CI gate), test/spec.test.mjs (teeth M04..M32), and the
  import globals check (C-32) in test/import.test.mjs.
- **Reopens with:** a type gate moved outside the glob, or a test that can pass without running its tool.

### B4. U3 E1: three fail-open input paths in the engine port *(FOUND 2026-11-24, U3 review r1; FIXED r2)*
- **What happened:** review r1 REJECTED 3 LITERAL fail-opens in ABGate.js (rung E1): a stale gate-file module cache
  against a fresh lane-sha256, and runGate options and gate-spec keys read through the prototype. Fixed in r2 with no
  spec change (SPEC addendum A3): the gate file is imported by content hash (`?sha256=<laneSha>`) so lane-sha256 names
  the spec that ran; runGate options and every gate-spec object must be plain objects (own keys only; prototype /
  Symbol keys -> STOP CLI / STOP HARNESS).
- **Root cause:** an import cache keyed by path let the lane sha and the code that ran differ; own-key reads were not
  enforced on caller-supplied objects.
- **Evidence:** .handoff/HISTORY.md (burst 2, U3); .handoff/lite-ab-gate/SPEC.md addendum A3; .handoff/evidence/
  U3-*.log and U3r2-*.log (gitignored run logs).
- **Law:** law 4; suite law "Options: a PLAIN object only".
- **Gate:** test/spec.test.mjs ('defineGate: every object must be plain ...' and 'runGate: non-plain options ...') for
  the two prototype paths; the content-hash import has no standing test yet (one-off check (1) plus its must-fail on
  step copy ed6c1190 in .handoff/evidence/U3r2-targets.log).
- **Reopens with:** a new input path that reads through the prototype, or an import that the content hash does not cover.

### B5. U4-E2: the torture check lacked an isolating control, an independent baseline floor and a measured window *(FOUND 2026-11-24, U4-E2 review r1; FIXED r2)*
- **What happened:** review r1 REJECTED 3 LITERAL findings in the rung E2 torture: the end TF check had no isolating
  control; the baseline floor `> 0` was not independent; and a -1 sentinel was read as 0 B. r2 APPROVED. Only these
  three findings are recorded in HISTORY; the fix detail is in the r2 logs.
- **Root cause:** each check could pass without the thing it names being measured (a sentinel read as a clean 0).
- **Evidence:** .handoff/HISTORY.md (burst 2, U4-E2); .handoff/evidence/U4E2r2-*.log (gitignored run logs).
- **Law:** law 3 and law 4.
- **Gate:** test/torture.mjs (T1 controls: boxed, tool-deopt, frozen-loop must read red).
- **Reopens with:** a new torture row without a control that fails on that row alone.

### B6. U2 r1: mask.mjs masked an all-NaN run equal and over-masked the PROV grammar *(FOUND 2026-11-24, U2 review r1; FIXED in the literal fix round, re-review APPROVED)*
- **What happened:** review r1 REJECTED the golden mask (test/fixtures/golden/mask.mjs): an all-NaN run and three PROV
  mutants masked equal to the golden. Fixed: mask.mjs masks values only, non-finite values and PROV grammar stay
  visible; mask teeth 18 / 18 per U2-GA-fix1.log.
- **Root cause:** a mask that hides too much turns a comparison into one that cannot see NaN or a broken PROV line
  (null is not zero).
- **Evidence:** .handoff/HISTORY.md (burst 1, U2); .handoff/COMMIT_MSG-U2.txt; .handoff/evidence/
  U2-GA-mask-teeth.log (r1 run, 14 cases), U2-GA-fix1.log (fix round, 18 / 18 incl. all-NaN + 3 PROV rows; mask.mjs
  3bce8fbe -> dadc6cfc) (gitignored). Details of the r1 findings beyond these two are not recorded in HISTORY.
- **Law:** law 4; suite law "Fail closed on every unverified state".
- **Gate:** none yet as a standing test: the 18-row mask teeth run is one-off (U2-GA-fix1.log);
  test/parity.proto.test.mjs has no NaN / PROV row.
- **Reopens with:** a new value kind or line the mask hides without a mutant that differs.

### B7. U5 r1: judgeSpec / verdictOf read options through the prototype chain, so Object.prototype.dialect flipped the CLI judge to legacy *(FOUND 2026-11-25, U5 review r1; FIXED r2)*
- **What happened:** review r1 REJECTED 1 LITERAL fail-open in the J1 judge: the dialect key was read through the
  prototype, so `Object.prototype.dialect` made the CLI judge run the legacy dialect (which skips the 4 tool-only
  checks, C-27). r2 APPROVED (937a15a5).
- **Root cause:** own-key reads were not enforced on the judge's options (the same class as B4).
- **Evidence:** .handoff/HISTORY.md (burst 4, U5); .handoff/evidence/U5r2-diff.log,
  U5r2-parity-abgate.log, U5r2-teeth-preFix.log (gitignored).
- **Law:** law 4; suite law "Options: a PLAIN object only".
- **Gate:** test/parity.abgate.test.mjs 'r2 own keys only: a polluted Object.prototype.dialect never flips the tool
  dialect to legacy (C-27 / C-33)' (must-fail: U5r2-teeth-preFix.log).
- **Reopens with:** another judge input read through the prototype.

### B8. U6 r1: `ran === total` in the untimed selftest had no must-fail control *(FOUND 2026-11-25, U6 review r1; FIXED r2)*
- **What happened:** review r1 REJECTED 1 LITERAL: the --selftest-untimed check that every row ran (`ran === total`)
  had no control that fails on that check alone. r2 APPROVED (d4991c39).
- **Root cause:** a completeness check with no must-fail control could pass without counting anything.
- **Evidence:** .handoff/HISTORY.md (burst 4, U6); .handoff/evidence/U6r2-teeth.log,
  U6r2-test.log (gitignored).
- **Law:** law 4 (every checker row has a control that fails on that row alone).
- **Gate:** test/selftest.untimed.test.mjs 'ran === total must-fail: a build that drops one untimed row (allocBop)
  reads "ran 66 of 67 cases -> FAIL", exit 1' (must-fail: U6r2-teeth.log; it is the killer of the test/mutants.json
  ran === total mutant).
- **Reopens with:** a selftest count or completeness check added without its own must-fail.

### B9. U7: 4 RAW / WARM AB gaps in the J1 judge, 3 confirmed fail-opens plus the WARM AB / A rule *(FOUND 2026-11-25, U7; ruled C-34 / A7; status: FIXED by U5b retry 2, burst 7, review r1 APPROVED, commit f6ac483; retry r1 had been REJECTED DESIGN (C-47), diff parked .handoff/rejected/U5b2)*
- **What happened:** the U7 coder found, and the U7 reviewer confirmed, 4 gaps in the J1 judge: RAW AB missing with
  reps differing; a non-numeric RAW value; RAW AB present with equal reps (3 confirmed fail-opens); and the WARM AB / A
  rule, which the maintainer ruled in Q-WARMAB (a) "WARM mirrors AB". C-34: in the tool dialect the AB column rule
  of C-11 holds on RESULT, RAW and WARM, RAW AB has exactly K values, every RAW value parses as a finite number; a
  violation -> NO VERDICT (code 2).
- **Root cause:** the AB rule was checked on the RESULT line only, and there only as C-11 lane cleanliness (a reported lane got a NOT-CLEAN label that never reaches the verdict, B11 / C-47); RAW and WARM were not held to it, and RAW values
  were not required to be numeric.
- **Evidence:** .handoff/HISTORY.md (burst 4, U7); .handoff/lite-ab-gate/SPEC.md C-34, addendum A7.
- **Law:** law 4; suite law "null is not zero".
- **Gate:** test/judge.extra.test.mjs: 14 C-34 rows (49 rows in all: 8 U7 + 14 C-34 + 6 C-42 + 16 C-47 + 5 C-50, plus 4 C-11
  REPORTED-label API tests, per .handoff/COMMIT_MSG-U5b3.txt); test/mutants.json C-34 (8 mutants; 63 / 63 killed per the
  same message). Review r1 (.handoff/overlay-U5b3/REVIEW-r1.md) reran the head judge.extra against base d4991c39: 43 of 56
  tests red = 39 rows (all 14 C-34, the 5 C-42 and 15 C-47 violation rows, all 5 C-50) + the 4 REPORTED-label tests; the 8
  U7 rows and the C-42 / C-47 controls green (FILL6 review re-run; r1's split "6 C-42 + 13 C-34" mis-partitions the same 43). Commit f6ac483.
- **Reopens with:** a RAW / WARM shape the C-34 rule does not reject reopens it.

### B10. U5b r1: a REPORTED lane with unparsed or duplicated RESULT reps skipped the C-34 AB rule and read PASS *(FOUND 2026-11-25 burst 5, U5b review r1 DESIGN; ruled C-42 / SPEC A9; FIXED by U5b retry 2, burst 7, review r1 APPROVED, commit f6ac483)*
- **What happened:** review r1 REJECTED the U5b diff (head ABGate.js 2205b4e3). A lane with exactly one RESULT whose reps
  cannot be parsed (`reps=A:4,B:1,AB:1x`, or reps printed twice) got differ = null, so the RAW / WARM AB rule was never
  checked; the verdict read PASS (code 0) even with RAW AB= and WARM AB/A= on that lane (reviewer probes P1, P1b, P1c).
  The coder's comment "already NO VERDICT / NOT-CLEAN there" held only for GATED lanes. Also 1 LITERAL: no row printed
  AB twice, so 2 mutants survived (test-only). The maintainer ruled C-42: run shape NO VERDICT on ANY lane.
- **Root cause:** a REPORTED lane's NOT-CLEAN label never reaches the verdict; a check that only labels a reported lane
  is fail-open (C-14, null is not zero).
- **Evidence:** .handoff/rejected/U5b.restored-1795635615114/REVIEW-r1.md (the parked U5b diff, also named .handoff/rejected/U5b in HISTORY);
  .handoff/lite-ab-gate/SPEC.md C-42, addendum A9; .handoff/HISTORY.md (burst 5).
- **Law:** law 4; suite law "null is not zero".
- **Gate:** test/judge.extra.test.mjs: 6 C-42 rows (incl. the no-reps-field row the r1 LITERAL asked for); test/mutants.json
  C-42 (5 mutants, incl. C42e; 63 / 63 killed per .handoff/COMMIT_MSG-U5b3.txt). The 2 C-42 judge.rows / selftest expectations
  moved from "(gated lane not clean)" to "(run shape)" are re-pinned oracle edits (reviewed). Review r1
  (.handoff/overlay-U5b3/REVIEW-r1.md): the 5 C-42 violation rows red on d4991c39, the C-42 control green. Commit f6ac483.
- **Reopens with:** a reps shape the C-42 rule does not reject reopens it.

### B11. U5b retry r1: RESULT ab / B/AB / wordAB / bop AB columns unchecked on REPORTED lanes (two PASS probes) *(FOUND 2026-11-25 burst 6, U5b retry review r1 DESIGN; ruled C-47 / SPEC A12; FIXED by U5b retry 2, burst 7, review r1 APPROVED, commit f6ac483)*
- **What happened:** review r1 of the retry (head ABGate.js 9156bd9a) REJECTED DESIGN. The C-34 AB rule was enforced on a
  REPORTED lane for RAW and WARM but not for RESULT. Probe (a): y:r reps=A:4,B:1,AB:1 with RESULT ab / B/AB / wordAB =
  n/a and no AB entry in bop; probe (b): y:r equal reps but RESULT carrying ab / B/AB / wordAB values. Both read
  `VERDICT PASS gated=1/1` code 0; only the `reported` label said NOT-CLEAN. The same RESULT on the gated lane read NO
  VERDICT. B9's wording ("checked on the RESULT line only") read the other way, so the reviewer asked for a ruling;
  the maintainer ruled C-47: run shape NO VERDICT on any lane. Also 1 LITERAL (no row with a RESULT lacking a reps
  field; reviewer mutant R1 survived 100 / 100) and nits (mutant R2; Number() reps compare; d.ts / CHANGELOG omit C-34 / C-42).
- **Root cause:** same mechanism as B10: a reported lane's NOT-CLEAN label never reaches the verdict. Lesson: the retry fixed the instance (unparsed reps, C-42) but not the class: any reported-lane line-family check
  that only labels is fail-open. When a check is added for one line family, sweep every other family the same rule names
  (RESULT, RAW, WARM, bop) on reported lanes before submitting.
  In retry 2 the coder's own B11 sweep found two more such gaps: the RESULT reps AB part (ruled C-50, fixed in the same
  unit) and RESULT grammar (ab / B/AB not finite, wordAB, bop printed twice; ruled C-51, unit U5c), both still
  label-only on reported lanes.
- **Evidence:** .handoff/rejected/U5b2/REVIEW-r1.md (diff parked in .handoff/rejected/U5b2); .handoff/lite-ab-gate/SPEC.md
  C-47, addendum A12.
- **Law:** law 4; suite law "null is not zero".
- **Gate:** test/judge.extra.test.mjs: 16 C-47 rows and 5 C-50 rows (law-8 boundaries on the AB-entry count and AB:n = B +- 1),
  plus the 4 C-11 REPORTED-label API tests; test/mutants.json C-47 (11 mutants, C47a..k) and C-50 (3, C50a..c); 63 / 63
  killed, per .handoff/COMMIT_MSG-U5b3.txt; re-pins: 3 C-47 + 3 C-50 judge.rows / selftest judgeRows rows, (gated lane not
  clean) -> (run shape). Review r1 (.handoff/overlay-U5b3/REVIEW-r1.md): the 15 C-47 violation rows, all 5 C-50 rows and the 4
  REPORTED-label tests red on d4991c39 (the C-47 control green); 60 fail-open probes ({y:r, y:g} x 30 conditions) all in scope fail closed. Open there: the C-51
  leads (y:r PASS with a label only) go to U5c.
  U5c (burst 7; review r1 REJECTED 2 LITERAL, r2 APPROVED ae062f12; commit f6ac483) closed the C-51 leads with C-40 / C-41 / C-51 / C-54 / C-55 / C-56:
  test/judge.extra.test.mjs 115 rows (asserted at :340) + 7 label tests (:359-:427) + the real-log row (:440); test/mutants.json 122 mutants, all killed (122 entries counted in the file; kill log
  .handoff/evidence/U5c4-mutants.log); 16 gated re-pins with U5b3.
- **Reopens with:** a line family on a reported lane that still only labels reopens it (C-51 grammar is U5c's).

### B12. U9 B1: review findings on bench/reproof.mjs (r1: 3 fail-opens + 2 gate-teeth LITERAL; r2: 1 fail-open; r3: 2-line round) *(FOUND 2026-11-25 burst 5, U9 B1 review r1 / r2; FIXED r3, commit 224bf19)*
- **What happened:** the U9 B1 coder delivered the C-23 re-proof probe (91 deterministic rows, mutation harness 62 / 62).
  Review r1 REJECTED 5 LITERAL: three fail-opens (mixed Node versions, a missing harness line excluded silently, an
  unenforced attempt budget), fixture symmetry (asymmetric G1-only / P1-only rows were missing), and 16 judge guards
  without rows (gate teeth). r2 REJECTED 1 LITERAL fail-open: a cross-hold B/AB check had been removed as "dead code".
  r3 APPROVED after a 2-line round. The per-finding review text is NOT on disk (overlay-U9B1 holds head-r1 / head-r2
  code only, no review notes); the above is what HISTORY.md and COMMIT_MSG-U9B1.txt state, plus the overlay-U9B1 head-r1 / head-r2 test diff for the asymmetric rows.
- **Root cause:** not recorded beyond the finding names above.
- **Evidence:** .handoff/HISTORY.md (burst 5, U9 B1); .handoff/COMMIT_MSG-U9B1.txt; .handoff/evidence/U9-B1/ (gitignored run logs); .handoff/overlay-U9B1 head-r1 vs head-r2 test/reproof.judge.test.mjs (G1-only / P1-only rows first appear in head-r2).
- **Law:** law 4 (a guard needs a row that fails on it alone).
- **Gate:** test/reproof.judge.test.mjs (91 deterministic rows on judgeHolds in bench/reproof.mjs; npm test); the judge mutation harness (62 / 62 per COMMIT_MSG-U9B1.txt) is a one-off run (.handoff/evidence/U9-B1/task4-judge-mutants*.log), not a standing test.
- **Reopens with:** a judge guard in bench/reproof.mjs with no row that fails on it alone.

### B13. FILL5: the runner-identity guard `: "${ImageOS:?unset}"` could be satisfied ahead of itself by five routes; the docs.template test pinned only the guard line *(FOUND 2026-11-25 burst 7, FILL5 review r1 + r2, both REJECTED; ruled C-52 / C-53; parked .handoff/rejected/FILL5; status: FIXED by the FILL5 retry, burst 8 (r3 REJECTED 5 LITERAL, fix round APPROVED))*
- **What happened:** the guard in templates/ab.yml and the dogfood .github/workflows/ab.yml (`: "${ImageOS:?unset}"`) is the
  runner-identity check. FILL3 review r1 (nit 3, FILL5's goal) found route (1) and review of the FILL5 test-only diff
  (test/docs.template.test.mjs) found routes (2)-(5): five routes that set
  ImageOS before the guard reads it while the pinned guard line stays intact: (1) another line before the guard in the
  run block (e.g. `ImageOS="${ImageOS:-unknown}"`); (2) an `ImageOS:` key in the step env after a blank or comment line
  (the env scan stopped there; a YAML comment does not end a mapping); (3) an earlier step writing `ImageOS=x` to
  $GITHUB_ENV; (4) a job-level or top-level `env:`; (5) job `container:` (its own env or image ENV) or `runs-on:
  self-hosted`. r1 and r2 each REJECTED (2 LITERAL + 1 DESIGN each). The maintainer ruled C-52 (pin the job env key set,
  fail any top-level env) and C-53 (pin the ab job key set and `runs-on: ${{ matrix.os }}`).
- **Root cause:** the test pinned the single guard line, not what can reach that line's value; an identity guard is only
  as strong as everything that can set the variable it reads.
- **Evidence:** .handoff/rejected/FILL5/REVIEW.md (r1 + r2; r2 verified 66 / 66, each mutant killed by its own check alone;
  unverified there: GitHub's parser on escaped / explicit-key YAML forms, and container env reaching run: steps);
  .handoff/lite-ab-gate/SPEC.md C-52, C-53, addenda A15, A16.
- **Law:** law 4 (a guard needs a control that fails on it alone); law 7 (a runner whose identity is not proven is STOP, not host evidence).
- **Fix (FILL5 retry, burst 8, 2026-11-26):** r3 REJECTED 5 LITERAL: 12 of 16 PyYAML probes passed (quoted step keys, a
  column-0 comment ending a step scan, an unnamed first step, bare CR / NEL line breaks, a quoted defaults.run.shell; plus a jobs-list row with no control (r3 blocker 5)). The fix round was APPROVED: 14 of 16 probes fail closed, 2 inert (max-parallel, a P16 matrix
  container). Outside B13 (B2's class; B2 reopened): P99, a quoted "continue-on-error": true on the selftest step (the old failclosed regex
  rows match unquoted keys only); ruled C-57 (A20, Q-STEPKEYS (a): pin every step's key set), implementing unit FILL7.
  Lesson (r3): a YAML line model fails open wherever YAML's grammar is wider than the model (quoted keys, CR / NEL,
  comments); pin exact key sets and bytes rather than deny-listing forms.
- **Gate:** test/docs.template.test.mjs 6edd3c6f: 13 checks, 60 mutants (M1..M60), 80 tests in the file, 5 controls (3 from FILL5: :624, :634, :643); npm test
  542 / 542 on HEAD + that file (.handoff/overlay-FILL5b/npm-test-head-r2.log). M55..M60 each fail exactly the failclosed
  check (REVIEW-r3b.md). The "13 checks / 37 mutants" count in B2 above is updated to 60.
- **Evidence (fix):** .handoff/overlay-FILL5b/REVIEW-r3.md, REVIEW-r3b.md (r1 / r2 text: REVIEW-r1r2.md).
- **Reopens with:** a sixth route to ImageOS ahead of the guard reopens it.

### B14. U5c sweep: the RESULT grammar class (unknown, out-of-order or duplicated RESULT fields, 310-digit and non-finite numerics) *(FOUND 2026-11-25 burst 7, U5c coder sweeps; ruled C-54 / C-55 / C-56 (C-51 came from the U5b retry 2 sweep, A15); FIXED by U5c, review r1 REJECTED 2 LITERAL, r2 APPROVED, commit f6ac483)*
- **What happened:** after B11 the coder ran two sweep loops over the RESULT line before review: sweep 1 found the
  gaps behind C-54 (printed word vs the word B/A reads; B/A, aa, slow, A, B, B-A in NUM_RE grammar; win / spin integers; the (gated) / (reported) tag) and C-55 (negative bop value is grammar,
  Infinity stays the ALLOC label); sweep 2 found unknown / out-of-order fields and 310-digit numerics still passing, the last edge, C-56 (RESULT holds exactly the producer's fields, each
  once, in the producer's order; every numeric finite). Each was a reported-lane label-only path: PASS with a NOT-CLEAN
  label. Review r1 REJECTED 2 LITERAL (a forged `ns/op=` token read PASS; 5 reviewer mutants survived: -0.0001 bop,
  word over NaN B/A, partial NaN, two VOID tails, -Infinity bop); r2 APPROVED (ae062f12).
- **Root cause:** same mechanism as B10 / B11 (a reported lane's label never reaches the verdict); the fix was to
  sweep every field of the family, not the instance (B11 lesson applied: two sweep loops before review).
- **Evidence:** .handoff/HISTORY.md (burst 7, U5c); .handoff/evidence/U5c*-*.log (U5c4-killers.log, U5c4-npm-test.log);
  SPEC C-51, C-54, C-55, C-56, addenda A18, A19.
- **Law:** law 4; suite law "null is not zero".
- **Gate:** test/judge.extra.test.mjs (115 rows at :340, 7 label tests :359-:427, the real-log row :440);
  test/mutants.json 122 mutants, all killed by test/mutants.test.mjs (DETERMINISTIC, npm test; U5c4-npm-test.log 516 / 516), incl. 6 u5c-review mutants (the 5 r1 survivors + B1-nsopKeyed), each with its own row (U5c4-killers.log).
- **Reopens with:** a RESULT field or value shape the C-51 / C-54..C-56 grammar accepts that the producer cannot print.

## C. Measurements (this package's own runs on ABGate.js)

Placement: the U9D numbers below were measured on ABGate.js d4991c39 (frozen copy of HEAD 224bf19), so they are section C,
not X.

### C1. U9D: the C-43 `tool-bytes=4320` on `bounds:1e5:1e5` is lane-kernel JIT bytes, and AB copies tier `boundsInto` up at their 4th call *(FOUND 2026-11-25 burst 6, U9D probe; RULED C-48 / C-49; status: RULED, unit U9E pending)*
- **What happened:** G (ABGate.js d4991c39) printed `WINDOW lane=bounds:1e5:1e5 tool-bytes=4320` in the calibration run
  (toy lanes 0). The probe split it: 4320 B = 8 synchronous TurboFan compiles of 8 distinct `boundsInto` SFIs (LiteOhlc
  Ohlc.js, the lane's non-inlined callee; 8 of the 12 A-family copies) inside the window, mean 540 B each; tool 0 B. The
  lane alone reads 7968 (the same 8 plus one Maglev compile of Node's lazy `globalThis.performance` getter, which is on
  the timedRounds clock path and so tool-owned, <= 144 B). K=21 also read 7968 (one-time, not per round). Side finding:
  AB copies (reps 1) compile `boundsInto` in their 4th call: RAW AB rounds 1-2 read 1.31-1.47 against about 1.15
  settled, and round 3 reads 107-128x (a 1.2-1.8 ms synchronous compile inside AB's clock span) in b-g2 / b-k21 /
  b-trace / b-all-trace and in the calibration hold-0 G, M, P runs; flat after the DRY / PRECENSUS passes.
  Provenance (FINDING.md): darwin arm64 Apple M4 Pro, node v26.8.2 (v8 14.6.202.34-node.28), 2026-11-25 19:43-19:53 UTC,
  G's REQUIRED_FLAGS, runs through quiet-lock (not --strict): p1 / batch1 / batch2 started QUIET (load1 2.53 / 2.12 /
  1.65, baseline 2.21); p0 QUIET (load1 2.64); empty.mjs ran without the lock at load1 3.2-4.4 (PRELIMINARY, byte counts
  only). Byte counts are host-independent. The probe timed nothing on purpose; the RAW AB round ratios are incidental
  RAW lines of non-strict runs (PRELIMINARY), read from the logs the FINDING names, not re-run here: b-g2 / b-k21 /
  b-trace / b-all-trace (window above) and the U9 calibration hold-0 G, M, P runs (.handoff/evidence/U9-cal/hold-0/, from
  2026-11-25 06:47 UTC; 1-G.log PROV load1 2.90, busy-node [11.4 75921 node]).
- **Root cause:** G brings each entry's `run` to TurboFan and checks `run`'s tier at the window edges, but not its
  non-inlined callees; the NOT-TF check cannot see a callee tier-up inside the window.
- **Evidence:** .handoff/research/U9D/FINDING.md and its logs/ (harness review r1 REJECTED LITERAL, r2 APPROVED at
  40309b36); .handoff/lite-ab-gate/plan-U9E-v1.md; SPEC C-43, C-48, C-49, addenda A13, A14.
- **Law:** law 3 (a TF entry is not a TF path; an allocation gate must be able to see the box). Ruled mechanism: C-48
  (untimed settle passes before the window until one reads exactly 0 B, cap 3, else VOID TIER-SETTLE; the C-36 / C-43 KILL
  on tool-bytes > 0 stands; the `performance` read hoisted to a module const); C-49 (the injections no-settle and
  settle-void are torture-only, out of the timed --selftest list).
- **Gate:** none yet (U9E adds T-SETTLE on a frozen-only R1-shaped lane with AB_GATE_INJECT=no-settle as its must-fail,
  and the settle-void control for VOID TIER-SETTLE; plan-U9E-v1.md).
- **Reopens with:** a new frozen G calibration re-run (after U9E review APPROVED) closes the U9E part; a callee tier-up inside the window on a settled lane reopens it.

## D. Process lessons

### D1. A6 "no row changes" was asserted without grepping the oracle's API test *(FOUND 2026-11-25, U5 pre-coder / review r1; CORRECTED in SPEC A6; process)*
- **What happened:** SPEC addendum A6 (C-33, laneSha required in the tool dialect) said no oracle row changes. That was
  false: the oracle row 'judgeSpec throws on bad input' built its ok spec without laneSha, so under C-33 it would
  throw. The U5 reviewer ruled the row wrong and approved the one-line fix (ok gains laneSha: SHA); oracle d17e8ea6 ->
  3296ca10.
- **Root cause:** a contract change was declared to leave the oracle untouched without grepping the oracle's API test
  for every spec it builds.
- **Evidence:** .handoff/lite-ab-gate/SPEC.md addendum A6 (CORRECTION); .handoff/HISTORY.md (burst 4).
- **Law:** none new (law 4: the oracle is read, not assumed).
- **Gate:** none (process): a spec change that tightens an input names the oracle rows that build that input, by grep.
- **Reopens with:** a second spec change found to break an oracle row it said it left alone.
