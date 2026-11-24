# RESEARCH -- @zakkster/lite-ab-gate

> Status (2026-11-24): R0 done; R1 strict hold 5/5 PASS; R2a kill rule fired; R2b CLOSED unrun per C-7;
> planner pass 1 done, SPEC C-1..C-28. Research artifacts live in `research/timing-ab/` (originals:
> `LitePerfGate/.handoff/research/timing-ab/`).

## 1. A reusable STATISTICAL timing A/B gate (research burst 2026-11-23; R0 done, R1 / R2 pending)

### 1.1 Prior art read (all in the suite; nothing external was fetched)
- **LiteBisect bench/ab-gate.mjs** (7e0f9262, 1276 lines): the suite's only noise-designed timing gate. K = 11
  interleaved rounds, C = 3 compilations per column, A/A twin band [0.95, 1.05], must-fail SLOW (median > 1.25 and
  q1 > 1.10), B/op < 1/64 per column, TurboFan tier checked every round, run-shape checks, verdicts PASS / FINDING /
  NO VERDICT with exits 0 / 3 / 2 (1 = STOP / CRASH), `--verdict-file` for offline judging, selftest F1-F45 + 13 timed
  children + failReplay. Gated PASS in LiteBisect's 1.0 program (P3-R1 MET via AB-G3): ab.yml run 43145179770 read
  PASS gated=13/13 on ubuntu and macOS (re-judged offline under AB-G3, ROADMAP 5f).
- **LiteBisect LEDGER**: A8 (the gate shape fails CLOSED under 10 synthetic spinners on the M4 Pro: A/A VOID in 4 of
  5 runs), B13 (8 verdict checks had no control; a control whose expected outcome is the default outcome proves
  nothing), B18 (a failing selftest control left no numbers; fixed by failReplay), B19 (hosted A/A drift voided gated
  lanes on both OS in run 45087568692; macOS PROV load1 58.98 at start, ubuntu 1.85 -- noise shown on macOS only),
  C11 (hosted x86 + arm64 VM held all 13 gated words; low-margin lanes moved per CPU).
- **LitePerfGate 1.4.4** README / package.json: a DETERMINISTIC scavenge-count allocation gate for `node:test`, flags
  `--expose-gc --max-semi-space-size=4`, run inside `npm test`. README "What this is not": "Not a throughput
  benchmarker. It gates allocation, not speed." (README:312). Its package.json description nevertheless says
  "Zero-GC and performance regression gate" and lists the keyword "benchmark".
- **LiteUtils ROADMAP**: S-1 dropped warmup-cost "as a timing script"; section 3 "No timing-based tool here (that is
  lite-perf-gate's job)" (ROADMAP:239); section 5 "warmup-cost as ms timing: dropped (STATISTICAL ...; lite-perf-gate's
  job)" (ROADMAP:277). These lines assign timing AWAY from LiteUtils; they predate any timing surface in LitePerfGate.
- **Suite rules** (~/.claude/CLAUDE.md): STATISTICAL claims are gated once per release by a test designed for noise
  (interleaved A/B, a stated statistic, K rounds, a must-fail control), never a fixed threshold inside `verify`;
  DEFAULT HOST = hosted CI; local statistical runs are PRELIMINARY unless QUIET; every timed run through quiet-lock.

### 1.2 Finding R0 (untimed, deterministic; PROGRESS R0)
The judge separates from LiteBisect with no verdict change: a prototype `verdictOfG(spec, lines)` whose only
LiteBisect inputs are declared data (lane ids, GATED words, HEADER shape fields) reproduced ab-gate's VERDICT line,
REPORTED line and exit byte for byte on all 45 fixture rows (F1-F45, one per verdict check; no F-row pins a comparator
boundary) and on 10 added boundary rows B1-B10 (one per comparator boundary); three bent specs each differed (43 / 43 /
45 F-rows) and each of 10 comparator flips differed on >= 1 B-row, so the comparison has teeth. By line count (by
reading) ab-gate is 21% generic as is, 43% generic behind a contract seam, 36% LiteBisect lanes / oracles / rule text /
fixtures. Fifteen seams are listed (S-1..S-15); none forces a verdict change. The producer (timed loop) was classified,
not run.

### 1.3 What R0 could not settle (carried to R1 / R2)
- Kernel acquisition for class methods (S-3): most README speed claims in the suite are on class methods; T-d (C = 3
  independent compilations) then needs whole-class source per copy.
- SLOW spin calibration per lane (S-8).
- A tool-owned synthetic fixture set for the selftest (S-10).
- Hosted-runner usability (B19): per-run A/A + bounded re-pairing vs a quiet-host requirement (R2). A re-pair is a
  second draw (optional stopping); R2b controls it with a NULL lane (B = fresh A, true word WITHIN), and saved logs
  cannot test it (one K-vector per lane per leg), so R2b needs hosted dispatches on the maintainer's go.

### 1.4 Numbers
No timed number was produced in R0. Every number quoted above from LiteBisect is that package's (REPORTED or
PRELIMINARY as its LEDGER labels it) and is not re-measured here.
