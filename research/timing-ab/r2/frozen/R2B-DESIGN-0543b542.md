# R2b -- hosted re-pair study: design (DRAFT, nothing built, nothing dispatched)

Status: DESIGN ONLY (2026-11-24). Nothing here has left this machine. The workflow needs a pushed repo and a dispatch,
both the MAINTAINER's (section 5). The prototype edits in section 3 are a coder unit + one law-11 review, not done.
Inputs: R2a (PROGRESS R2a.1, r2/r2a-hosted.mjs), the INTAKE R2 row (PROGRESS INTAKE), PROPOSAL Q-HOST.

## 1. What R2a changes for R2b (REPORTED, saved hosted logs; PROGRESS R2a.1)
- The two hosted OS behave differently. Ubuntu legs (4 legs, 3 EPYC models) are as tight as the local QUIET M4 Pro
  hold (per-lane AA IQR width 0.35-0.46x R1's); the macOS VM legs are 1.7x / 6.9x / 21x R1's in 3 / 3 dispatches,
  passing ones included. So R2b's outcome is judged PER OS (K-rules below), not jointly.
- The one ubuntu VOID (V1 uni:65536, EPYC 7763) is a near level shift: 11 / 11 AA rounds in 0.917-0.953, IQR 0.025.
  Not a time-local spike: round trimming cannot fix it, and a re-pair (fresh copies) is a fresh draw of whatever
  per-copy effect caused it. If B's copies carry the same kind of offset unseen, a re-pair can hand back a clean but
  biased word -- the NULL lanes below are the only control for that.
- No offline mechanism rescued V1 without weakening (R2a kill rule fired). Judge-both on A/A (MJ) rescued every lane
  but removed the A/A band's teeth on 245 / 248 injected drifts: it is a re-ruling of LiteBisect law 5 / A8, listed as
  an option text only (PROPOSAL Q-AAJUDGE), never adopted in R2b.

## 2. The R2b rule (v2 wording -- FOR REVIEW; replaces the INTAKE R2 row's R2b sentences once approved)

Policy (fixed before any dispatch). A lane VOID on its first attempt gets at most M = 1 in-job re-pair: every column of
that lane compiled fresh (new nonce, new data copies), K + 1 rounds with round 0 dropped, judged by the unchanged rules.
Both attempts print in full (RESULT / RAW / VOID lines tagged `attempt=1` / `attempt=2`). The lane's final state is
attempt 1 if it is clean, else attempt 2 (clean or VOID). Every NULL lane (B = a fresh compilation of A, true word
WITHIN, GATED WITHIN) runs attempt 2 on EVERY leg whatever attempt 1 read, and both attempts are judged as words, so
the second draw is seen unconditionally and also on the legs where attempt 1 VOIDed.

Named bias. A re-pair is a second draw of the controls; taking the first clean draw is optional stopping: on a noisy
leg a word can come from the draw that happened to pass. The NULL lanes are the control: their true word is known.
(An AA-vs-A word is no control: a clean A/A median sits inside the WITHIN band by construction, Q-WORDBAND (a).)

Kill rule (per OS, over its legs; a leg = one job; >= 3 legs per OS from >= 2 dispatches >= 6 h apart):
- K1 FALSE NULL: any NULL-lane attempt (1 or 2) on any leg reads clean and not WITHIN -> that OS NOT USABLE.
- K2 FALSE WORD: any gated lane's final state is clean with a word other than its GATED word -> NOT USABLE.
- K3 NO VERDICTS: fewer than 2 of 3 legs (2 / 3 of the legs, rounded up) read PASS after re-pairs -> NOT USABLE.
- K4 UNMEASURED: a leg on which no NULL-lane attempt 2 is clean measures no second draw; fewer than 2 measured legs on
  an OS -> R2b NO VERDICT on that OS (never USABLE).
- USABLE on an OS only if none of K1-K4 fires there.
Outcome -> Q-HOST: USABLE on both -> (a) with re-pair; USABLE on one -> (d) below; neither -> (b).
Power statement (printed in the report): N = NULL draws per OS (lanes x attempts x legs), of which N1 follow an
attempt-1 VOID; with zero false NULL words the one-sided 95% upper bound on the per-draw false-word rate is ~3 / N
(rule of three; draws in one leg are correlated, so the bound is optimistic). R2b can refute hosted usability; it
cannot certify a small false-word rate.

Changes vs the unreviewed INTAKE wording (the review should check each): judged per OS, not over 6 pooled legs; NULL
attempt 1 also counts (it was only the re-pair); K4's "measured" is per OS (was "4 of 6 measured legs"); the
conditional-on-VOID draws are reported separately; the power bound is stated as a number.

## 3. Prototype edits R2b needs (a coder unit + one law-11 review; NOT done)
TASKS (r1/ab-proto.mjs -> r2/ab-proto-r2b.mjs; the R1 file stays frozen at 74f1a3d4):
1. `--repair 1` (CLI; default 0 = R1 behaviour byte for byte): after a lane's attempt 1, a VOID lane (any VOID kind
   except STOP / ORACLE, which stay STOP) is rebuilt and re-timed once; lanes whose id starts `null:` always get
   attempt 2. RESULT / RAW / VOID lines gain ` attempt=<n>`; attempt-less lines are refused by the judge when
   `repair=1` is in HEADER.
2. Judge: final state per lane as section 2; HEADER `repair=0|1` is a shape field checked like K / C; a NULL-lane
   attempt reading a clean non-WITHIN word is a FINDING (same as a gated lane, GATED WITHIN).
3. Selftest rows (law 9, each with its must-fail control): (a) forced attempt-1 VOID -> attempt 2 printed and judged;
   (b) NULL lane prints attempt 2 when attempt 1 is clean; (c) an attempt-2 line without attempt 1 -> NO VERDICT
   (shape); (d) a NULL attempt-2 FASTER clean row -> FINDING; (e) `--repair 0` output byte-identical to R1 on a
   fixture; (f) a third attempt line -> NO VERDICT (shape).
4. Provenance (R2a: PROV load1 cannot see hypervisor steal, B19): on Linux print /proc/stat `steal` jiffies at PROV
   start / end and per lane; on macOS print `sysctl -n vm.loadavg` (no steal counter exists there -- say so in HEADER).
5. Lane file r2/ohlc-lane-r2b.mjs = ohlc-lane 2377d193's three lanes + NULL lanes `null:1e5:1e5`, `null:1e4:1e3`,
   `null:1e3:1e2` (more NULL draws per leg for K1 / K4 power; each costs ~1 lane of A-speed rounds).
Gate before any dispatch: law-11 review APPROVED; one local `quiet-lock run --strict` hold (5 runs, `--repair 1`)
reads PASS 5 / 5 with NULL WITHIN on every attempt (the R1 hold is the reference); `--repair 0` re-judges the R1
hold logs byte-identically.

## 4. Workflow template (draft file r2/ab-r2b.yml.draft; a copy of LiteBisect ab.yml's shape)
Differences from LiteBisect ab.yml: the gate file and lane file are inputs of the copy (no `bench/` paths); a matrix
`leg: [1, 2, 3]` per OS is OPTIONAL (Q-R2B-LEGS); the gate step runs `--run ALL --repair 1`; a re-judge step runs the
untimed `--verdict-file logs/gate.log` and fails if its VERDICT line differs from the live one; provenance adds
/proc/stat steal (Linux) and `vm_stat` (macOS); artifacts named `r2b-<os>-leg<n>`. Unchanged: dispatch-only,
`permissions: contents: read`, include-only matrix, runner identity fail closed, exact node pin 26.8.2, selftest as
the STOP gate, the gate step's status = the verdict code, summary + upload `if: always()`.

## 5. Dispatch plan (every step is the MAINTAINER's; Claude stops before each)
0. Section 3 built, reviewed and its local hold PASS (a later burst; no dispatch before it).
1. Q-R2B-HOME: where the workflow lives (a pushed repo whose default branch holds the workflow file).
2. Copy into that repo: `research/timing-ab/ab-proto-r2b.mjs`, `ohlc-lane-r2b.mjs`, `frozen/Ohlc.js` (a600028c),
   `frozen/baseline.mjs` (9c875a5e), `.github/workflows/ab-r2b.yml` (from the draft). Nothing from any package's
   `.github/` is edited.
3. Dispatch: `gh workflow run ab-r2b.yml --ref main`, 2-3 dispatches >= 6 h apart until each OS has >= 3 legs
   (or one dispatch with the leg matrix + one later dispatch).
4. Bring the logs back: `gh run download <id> -D LitePerfGate/.handoff/research/timing-ab/r2/hosted/<id>/` and
   `gh run view <id> --log > .../<id>.joblog`.
5. Offline: an R2b judge script applies section 2 (to be written with section 3; untimed) and PROGRESS gets R2b.
Cost (expected, nominal): R1's local run ~33 s per gate run; hosted 2-3x slower plus 3 NULL lanes and re-pairs ->
~4-6 min per job, 6 jobs ~30 min. On a private repo macOS minutes bill at a multiple of Linux minutes.
