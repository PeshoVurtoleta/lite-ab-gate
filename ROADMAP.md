# lite-ab-gate -- ROADMAP

> **Status: pre-1.0, version 0.0.0 (2026-11-24).** `@zakkster/lite-ab-gate`: the reusable STATISTICAL
> timing A/B gate, extracted from LiteBisect `bench/ab-gate.mjs` 7e0f9262 and proven on the prototype
> ab-proto 74f1a3d4. The program spec lives in `.handoff/lite-ab-gate/SPEC.md` (gitignored), so its
> binding rules are restated below. **LEDGER.md** holds the laws and research entries X1-X6;
> **RESEARCH.md** holds the research section.

## 1. Verification tier and host

- The verdict is STATISTICAL (C-3): run once per release candidate, never inside `npm test` /
  `npm run verify`. `npm test` holds only DETERMINISTIC checks (spec validation, the judge on fixture
  lines, parity, untimed selftest rows, provenance / HEADER parsing).
- DEFAULT HOST = hosted CI; workflow `.github/workflows/ab.yml` (C-24: the package's own ab.yml,
  dispatched by the maintainer once per release candidate; the first dispatch before 1.0 proves the
  hosted path).
- Local statistical runs are PRELIMINARY unless QUIET, and go through quiet-lock
  (`node ~/.claude/hooks/quiet-lock.mjs run "<what>" -- <cmd>`; `--strict` for a release-gating timing).
- U9 statistical re-proof of the hoisted timed loop vs frozen ab-proto 74f1a3d4 is REQUIRED before 1.0 (C-23).

## 2. SETTLED (binding for every agent; C-1..C-34)

C-3, C-13, C-14 and C-16 rest on suite law or R1 findings, and C-18..C-21 and C-29 are orchestrator / planner
reconciliations; the other rows are maintainer rulings (the Q-id, where one exists, and the option label are in the SPEC).

- C-1 HOME (Q-HOME (a)): a NEW single-file package, main ABGate.js, zero runtime deps, consumed as a
  devDependency; never a LitePerfGate mode or second file.
- C-2 NAME: SUPERSEDED by C-22 (was open).
- C-3 TIER (suite law): STATISTICAL, once per release candidate, never in `npm test` / `verify`.
- C-4 DEFAULTS (Q-DEFAULTS (a)): K = 11, C = 3, A/A band [0.95, 1.05], SLOW median > 1.25 and q1 > 1.10,
  B/op < 1/64 are tool constants; a gate may RAISE K or C, never lower; HEADER prints K / C and the judge checks them.
- C-5 WORDBAND (Q-WORDBAND (a)): FASTER = median < band lo AND q3 < 1; SLOWER = median > band hi AND
  q1 > 1; else WITHIN; the word band IS the A/A band.
- C-6 SPIN (Q-SPIN (a)): each lane declares its SLOW spin; the tool never calibrates; too small = VOID SLOW-DEAD.
- C-7 HOST (Q-HOST (a) + Q-HOST-REPAIR "Drop re-pairing, plan it"): hosted verdict; the per-run A/A twin
  is the noise gate; one re-dispatch of a NO VERDICT run is allowed. In-job re-pairing was dropped: no
  code path, flag, option or doc re-runs a VOID lane inside a run. R2b is CLOSED unrun.
- C-8 AAJUDGE (Q-AAJUDGE (a)): the A/A band is a validity gate (VOID AA-DRIFT); "judge both B/A and B/AA" is not a
  tool rule.
- C-9 MIGRATE (Q-MIGRATE (a)): nothing in this program edits LiteBisect; the judge must reproduce
  ab-gate 7e0f9262's VERDICT / REPORTED / exit bytes for an ab-gate-shaped log given LiteBisect's lanes /
  gated / shape as declared data.
- C-10 LEDGER (Q-LEDGER (a)): LEDGER.md in this package with X1-X5 and a "How to add an entry" section.
- C-11 REPS (Q-REPS (a) + Q-REPS-2): when B's reps differ from A's, a fifth column AB (A timed at B's
  reps); the word is computed on B/A AND B/AB and must agree, else VOID REPS-DRIFT; ab = AB/A is
  REPORTED only; RESULT prints `reps=A:a,B:b,AB:r`.
- C-12 WARM (Q-WARM (a)): K + 1 rotated rounds; round 0 is checked like every round but dropped from the medians.
- C-13 CONTRACT (R1 finding): kernels are per-column source text {source, anchor, setup, run, one}; `ref` /
  `foldOf` replace foldWant / verify; `frozen` is a whole-file identity list (+ transform); unknown spec
  keys fail closed; fresh compilation per copy via nonce'd `new Function`.
- C-14 FAIL CLOSED (suite law; R1.2): empty `gated`, a gated id with no lane, a missing lane in a complete
  run, an unknown spec key, a missing REQUIRED flag -> never PASS.
- C-15 VERDICTS: words FASTER / SLOWER / WITHIN / VOID(marker); run PASS / FINDING / NO VERDICT, exits 0 / 3 / 2,
  1 = STOP / CRASH; FINDING wins over VOID in a complete run; a missing lane = NO VERDICT; a `--run <ids>`
  subset is always NO VERDICT.
- C-16 SUITE LAW: zero deps, node:test only, ASCII-only source, single PascalCase main file, sideEffects
  false, llms.txt + CHANGELOG.md, MIT (c) Zahary Shinikchiev, README on the LiteSepforge blueprint spine.
- C-17 HOSTED SAFETY (X5): nothing the workflow template runs depends on a local absolute path; a harness
  failure on a runner is STOP -> NO VERDICT, never host evidence.
- C-18 OWNERSHIP RECONCILIATION (orchestrator): no stub ABGate.js (E1 ports the proven judge region);
  torture.mjs owned by G-A E2 then G-B; parity tests renamed; fixture dirs split by group; d.ts by G-A
  then G-B delta then G-C prose; decisions/ by the docs batch; scripts via TASK 0 then the docs batch.
- C-19 K / C BOUNDS (G-A planner): a gate may declare K in 11..51 and C in 3..9 (integers); lower throws
  citing C-4; `--K` stays 1..51 for research runs, which the judge reads as a shape mismatch (NO VERDICT).
- C-20 harnessControls (G-A planner): kept, called on timed runs before verdictOf with deep-frozen rows;
  may stop('HARNESS') -> NO VERDICT.
- C-21 DISTINCT MARKERS (X5; orchestrator / planner): every selftest marker matches only its own rendered
  message; four distinct ANCHOR STOPs (frozen-unreadable, frozen-sha, live-unreadable, live-drift).
- C-22 NAME (Q-NAME (a), maintainer 2026-11-24): `@zakkster/lite-ab-gate`, folder LiteABGate, main
  ABGate.js, repo PeshoVurtoleta/lite-ab-gate. Supersedes C-2.
- C-23 HOTLOOP (Q-HOTLOOP (a) "Hoist + re-prove"): the timed loop is a TF-forced `timedRounds` with a
  Float64Array(2) time slot; not TF after a window -> VOID NOT-TF tool; torture gates zero tool bytes in
  the window; the U9 statistical re-proof is REQUIRED before 1.0.
- C-24 DOGFOOD (Q-DOGFOOD (a) "Own ab.yml"): `.github/workflows/ab.yml` = templates/ab.yml byte for byte
  except AB_TOOL: ABGate.js and AB_GATE: examples/ab.gate.mjs (lanes null gated WITHIN, double gated
  SLOWER); dispatched by the maintainer once per release candidate; it is the STATISTICAL host.
- C-25 LIVE (Q-LIVE (a) "Tool enforces"): live optional; relative paths resolve against the gate file's
  directory; an absolute path is STOP HARNESS when GITHUB_ACTIONS=true.
- C-26 EXPORT (Q-EXPORT (a)): ABGate.js exports the pure verdictOf and judgeSpec.
- C-27 DIALECT (Q-DIALECT (a)): one judge-only dialect 'ab-gate@7e0f9262' skips exactly the 4 tool-only
  checks (HEADER spec line, reps/AB/n-a, warm, PROV grammar); reachable only through the API (judgeSpec),
  never from a lane file or the CLI.
- C-28 WARMFIELD (Q-WARMFIELD (a)): the tool dialect requires RESULT warm=1, one WARM line per lane, RAW
  columns of exactly K values; else NO VERDICT.
- C-29 TEST FLOOR (orchestrator reconciliation, U1 2026-11-24): `node --test` with no matching file exits 0, so
  test/import.test.mjs imports ../ABGate.js and asserts a side-effect-free import (fails with ERR_MODULE_NOT_FOUND
  until the engine exists, so npm test fails closed); the U10 docs test asserts a test-file floor. LEDGER B1.
- C-30 SELFTEST FROZEN-ONLY (Q-SELFTEST-LIVE (a) "Proven n/a row", maintainer 2026-11-24): when no frozen entry
  binds live, the --selftest live-drift row prints 'n/a (frozen only)' and does not fail, but ONLY if the frozen-only
  HEADER line ('live not bound (frozen only)') is present in the same run (else the row fails); a gate with a live
  binding runs the row as today (must-fail: n/a without the HEADER line = red). examples/ab.gate.mjs stays frozen-only
  (C-24 unchanged).
- C-31 TORTURE NODE (Q-TORTURE-NODE (a) "Torture on node >= 26 only", maintainer 2026-11-24): on Node 22
  performance.now() boxes 16 B per read, so the zero-tool-bytes WINDOW row cannot hold there. ci.yml runs npm test on
  node 22 / 24 / 26 but `npm run torture` only on the node 26 legs; test/torture.mjs exits 1 (never skips) on node < 26;
  the zero-tool-bytes claim is scoped to node >= 26; engines stays >= 22; the verdict host pin (AB_NODE 26.8.2) is
  unchanged.
- C-32 IMPORT-TEST OWNER (maintainer 2026-11-25, burst 3 "Helper adds it now"): the G-A B3 helper adds the
  import-adds-0-globalThis-keys check (+ its must-fail) to test/import.test.mjs; amends C-29 (afterwards the U10 docs
  batch is again the file's only editor).
- C-33 LANESHA (Q-LANESHA (a) "Require in tool dialect", maintainer 2026-11-25): in the tool dialect (dialect omitted)
  judgeSpec THROWS when laneSha is missing / undefined / null or not 64 lowercase hex; verdictOf returns code 2 (NO
  VERDICT) for a
  tool-dialect spec with a bad laneSha; the legacy 'ab-gate@7e0f9262' dialect ignores laneSha (C-27); the d.ts keeps
  `laneSha?` optional at type level; its doc says 'required in the tool dialect (C-33); judgeSpec throws if omitted'
  (supersedes 'Omit = not checked').
- C-34 RAW / WARM AB (Q-WARMAB (a) "WARM mirrors AB", maintainer 2026-11-25; SPEC A7): tool dialect only (legacy
  unchanged). The AB rule of C-11 holds on RESULT, RAW and WARM: reps differ -> all three carry AB (RAW AB exactly K
  values, C-28); reps equal -> none does; every RAW value must parse as a finite number; any violation -> NO VERDICT
  (code 2). To be implemented by unit U5b (burst 5).

Open maintainer questions: none.

## 3. Program units (from the SPEC program-order table)

Main-file rungs E1 -> E2 -> J1 -> J2 are sequential; each unit = coder batch + review.

- U1: G-C B0 TASK 0 scaffold (coder: package.json, lockfile, .gitignore, LICENSE.txt, CHANGELOG skeleton, research/,
  .handoff/golden/); G-C B1 ledger / roadmap / research (helper, parallel).
- U2: G-A B0 fixtures + goldens + census (coder); G-B B0 ab-gate golden cut (coder, parallel).
- U3: G-A B1 = rung E1 port-base (coder; ABGate.js).
- U4: G-A B2 = rung E2 timedRounds + torture (coder); G-A B3 d.ts + spec / parity tests (helper); G-C B2 template +
  workflows + example (coder); G-B B3 judge rows test (helper).
- U5: G-B B1 = rung J1 judge (coder; judge region, parity.abgate test, d.ts delta).
- U6: G-B B2 = rung J2 selftest, untimed (coder).
- U7: G-B B4 mutants + full npm test (coder; torture row).
- U8: planner G-B2: timed --selftest children + workflow STOP-gate wiring.
- U9: planner G-P: STATISTICAL re-proof of the hoisted loop vs ab-proto 74f1a3d4 (REQUIRED by C-23).
- U10: G-C B3 docs batch (README / llms / CHANGELOG / d.ts prose / decisions / docs test; helper).
- U11: qa; then the hosted dogfood dispatch (maintainer, C-24); then /release.

## 4. FILLERS (carried open items; REPORTED, no design change without a new mechanism)

- Q4: fixed-position AB outlier on the reps-1 lane (needs --trace-deopt).
- Warm-skew at K = 1 is host-noise sensitive (fails closed).
- Forged `AB:1/4` reps row nit.

## 5. AFTER 1.0

- LiteUtils "lite-perf-gate's job" amendment: a LiteUtils burst after this package's first release (C-1).
- LiteBisect migration to this package: after both 1.0s, parity first (C-9).
- LiteSignal adoption (maintainer, 2026-11-25: "signal will consume abgate imm after 1.6.0 release"):
  `@zakkster/lite-signal` (1.5.2 today; roadmap equivalent its LEDGER.md; no ab.yml yet) adopts this package as a
  devDependency (C-1) right after LiteSignal 1.6.0 is released. Orchestrator note (not part of the quote): this
  makes lite-ab-gate 1.0 published on npm a prerequisite. A LiteSignal burst, not this program; nothing here edits
  LiteSignal.
