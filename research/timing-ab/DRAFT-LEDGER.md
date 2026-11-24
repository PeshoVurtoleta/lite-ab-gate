# DRAFT ledger entries (timing-ab research burst, R0 + R1)

Where it lands depends on Q-HOME and Q-LEDGER (PROPOSAL-timing-ab.md): LitePerfGate has no LEDGER.md today. Draft text,
in LiteBisect's entry format (What happened / Reason / Evidence / Law / Reopens with):

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
- **Evidence:** LitePerfGate/.handoff/research/timing-ab/r0-verdict-parity.mjs 16693c6e, log r0-verdict-parity.log
  935bec9f (node v26.8.2, darwin, 2026-11-23T08:54:02Z; review r2 body 3d52d13a + the additive P6 guard; r1 before review d34aa61f / fded6dc4), PROGRESS.md R0. Not a
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
- **Evidence:** r1/ab-proto.mjs 74f1a3d4, r1/logs/hold-1..5.log (ab 1.801-1.820 / 1.155-1.197; B/A and B/AB both
  SLOWER 5 / 5), r1/logs/fix2-run-all.log; PROGRESS R1.3, R1.6. Node v26.8.2, Apple M4 Pro, load1 1.17-1.44.
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
- **Evidence:** r1/logs/hold-selftest.log, hold-1..5.log (2026-11-24T00:29:33Z-00:32:18Z, load1 1.17-1.44,
  busy-node none, node v26.8.2, Apple M4 Pro, K = 11 + 1 warm, C = 3); each log re-judged by `--verdict-file` 5 / 5
  PASS; PROGRESS R1.6. Medians of run medians: B/A 44.36 (w = 1e3), 5661 (w = 1e5), 1.001 (NULL).
- **Law:** LiteBisect law 9 (a control per check), law 11 (review before numbers count). Hosted behavior untested (R2).
- **Reopens with:** a hosted run (R2) reading A/A VOID or SLOW-DEAD in > 1 of 5; the Q4 fixed-position AB outlier
  (~111-126x at counted round 3, reps-1 lane, 7 / 7 runs) explained as a defect that can flip a word.

### X4. Saved hosted logs: ubuntu A/A is as tight as a quiet M4 Pro, the macOS VM is not, and no offline rule rescues the voided dispatch without weakening *(MEASURED 2026-11-24, timing-ab R2a; UNTIMED re-analysis of saved hosted logs, numbers REPORTED)*
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
- **Evidence:** LitePerfGate/.handoff/research/timing-ab/r2/r2a-hosted.mjs, r2/logs/r2a-*.log (shas in PROGRESS
  R2a.1); input shas there. Not a timing run: REPORTED re-analysis of hosted numbers.
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
- **Evidence:** PROGRESS R2b.1 (blockers D1-D6, #7-#13); r1/ab-proto.mjs 74f1a3d4 :137 / :320; r1/ohlc-lane.mjs
  2377d193 :17, :128-129.
- **Law:** LiteBisect law 9 (a control whose expected outcome is also the broken path's proves nothing: B13); law 10
  (every outcome of a pre-registered rule defined, incl. harness failure). Candidate lesson: a hosted study needs a K0
  "harness failed -> NO VERDICT, never host evidence" clause, and a control for optional stopping must sample the
  conditional draw.
- **Reopens with:** an R2b v3 rule whose review finds no outcome without a mapping and no clause that cannot fire.
