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

## C. Measurements (this package's own runs on ABGate.js)

(none yet)

## D. Process lessons

(none yet)
