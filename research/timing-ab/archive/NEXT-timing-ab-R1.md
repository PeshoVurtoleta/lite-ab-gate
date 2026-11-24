# NEXT -- timing-ab after R1 (rewritten 2026-11-24 after the hold; replaces the UNIT 3 brief)

STATE: R1 DECIDED -- not killed. Law-11 review APPROVED (r3) for r1/ab-proto.mjs 74f1a3d4 + r1/ohlc-lane.mjs 2377d193;
one `quiet-lock run --strict` hold on a QUIET host (2026-11-24T00:29-00:32Z, load1 1.17-1.44) read selftest 63 / 63 and
VERDICT PASS gated=3/3 in 5 / 5 runs; every kill clause clear. Details: PROGRESS.md R1.6; PROPOSAL section 4; DRAFT-LEDGER
X2 (Q-REPS measured) + X3 (R1 result). Numbers are PRELIMINARY (local host). Stop point: the maintainer said "stop
after R1". Nothing committed; .gitignore / ROADMAP.md untouched.
RULINGS in force (PROPOSAL section 6): Q-REPS-2 "Judge both ratios" (amends Q-REPS (a)); Q-WARM (a). Still open:
Q-HOME, Q-DEFAULTS, Q-WORDBAND, Q-SPIN, Q-HOST, Q-MIGRATE, Q-LEDGER.

START: `git status --porcelain` in LitePerfGate (expect ` M .gitignore`, ` M ROADMAP.md`, `?? .claude/`); shasum
r1/ab-proto.mjs 74f1a3d4, r1/ohlc-lane.mjs 2377d193.

WAITING ON THE MAINTAINER:
- Go for R2 (hosted drift study: the same lane on hosted CI dispatches; needs Q-HOST and the workflow template; the R2b
  NULL-lane wording in PROPOSAL Q-HOST is still UNREVIEWED).
- The open Q-ids above (one sitting via AskUserQuestion). GATE: no planner pass until the PROPOSAL is ruled.

FILLERS (small; each harness edit needs one narrow law-11 review before its numbers count):
- Q4: --trace-deopt look at the bounds:1e5:1e5 AB outlier -- 111-126x at counted round index 2 in 7 / 7 runs (5 hold
  + 2 calibration), every other AB round 1.09-1.42; fixed position suggests a per-copy event (C = 3 rotation, a copy's
  first call at reps 1). Timed: through quiet-lock. Decide whether a VOID rule is needed (new design -> a Q-id).
- forged-reps judge row `reps: 'A:4,B:1,AB:1/4'` -> NO VERDICT "unparsed" (r3 nit).
- warm-skew selftest at K = 3 instead of 1 (host-noise sensitive at K = 1; fails closed).
LiteBisect leads (not acted on): ab-gate F1-F45 pin no comparator boundary; no must-fail control on its in-clock fold /
post-timing checks (R1 built both: late-bend / post-bend); no AB / reps check; the same slow round 0.
