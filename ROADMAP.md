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

## 2. SETTLED (binding for every agent; C-1..C-62)

C-3, C-13, C-14 and C-16 rest on suite law or R1 findings, and C-18..C-21 and C-29 are orchestrator / planner
reconciliations, C-46 records E1 behaviour (U3 review r1, A3), and C-60 records the U8 B1 review r1 gaps (orchestrator, A21); the other rows are maintainer rulings (the Q-id, where one exists, and the option label are in the SPEC).

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
  until the engine exists, so npm test fails closed); the U10 docs test asserts a test-file floor. LEDGER B1. Owner rule (C-32 merged here): after the G-A B3 helper's import-adds-0-globalThis-keys check, the U10 docs batch is the file's only editor.
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
- C-32 -- merged into C-29 (SPEC A11)
- C-33 LANESHA (Q-LANESHA (a) "Require in tool dialect", maintainer 2026-11-25): in the tool dialect (dialect omitted)
  judgeSpec THROWS when laneSha is missing / undefined / null or not 64 lowercase hex; verdictOf returns code 2 (NO VERDICT) for a
  tool-dialect spec with a bad laneSha; the legacy 'ab-gate@7e0f9262' dialect ignores laneSha (C-27); the d.ts keeps
  `laneSha?` optional at type level; its doc says 'required in the tool dialect (C-33); judgeSpec throws if omitted'.
- C-34 RAW / WARM AB (Q-WARMAB (a) "WARM mirrors AB", maintainer 2026-11-25; SPEC A7): tool dialect only (legacy
  unchanged). The AB rule of C-11 holds on RESULT, RAW and WARM: reps differ -> all three carry AB (RAW AB exactly K
  values, C-28); reps equal -> none does; every RAW value must parse as a finite number; any violation -> NO VERDICT
  (code 2). Implementing unit: U5b retry 2 (with C-42, C-47, C-50).
- C-35 U9 HOST (Q-U9-HOST (a) "Local strict holds only"): the C-23 re-proof runs as 5 LOCAL `quiet-lock run --strict`
  holds (one hold per call; the R1 lane binds absolute LiteOhlc paths, C-17 forbids that hosted); the hosted path is
  proven separately by the C-24 dogfood dispatch at U11; U9 is PRELIMINARY unless QUIET.
- C-36 U9 BAND (Q-U9-BAND (a) "Tight band, M x1.04"): pre-registered PASS = median over the 5 holds of r = (G1+G2)/(P1+P2)
  (RESULT B/A medians, ABGate RC vs frozen ab-proto 74f1a3d4) in [0.98, 1.02] on every gated lane AND every per-hold r
  in [0.95, 1.05]; the must-fail mutant scales B by 1.04 and must be flagged; INVALID twin band: t = P2/P1 outside
  [0.95, 1.05] (C-44); every other INVALID condition as plan-U9-v1.md SPEC and C-45; KILL / STOP rules and the hold
  budget (<= 8 attempts, never 2 in one burst) as plan-U9-v1.md SPEC.
- C-37 CLASH (Q-CLASH (a) "Tool checks clash"): the tool's own --selftest fails a row when one real child line matches
  >= 2 INJECTIONS markers (pure markerClash in ABGate.js selftest; extends C-21 to real output).
- C-38 REALLINES (Q-REALLINES (a) "Commit real lines"): captured real timed-child lines are an npm test fixture
  (test/fixtures/timed-real/lines.json); npm test checks the markers on them and goes red when the marker surface sha
  changes ("re-capture via quiet-lock").
- C-39 TIMEDHOME (Q-TIMEDHOME (a) "Local harness + script"): test/selftest.timed.mjs + an npm script, run under
  `quiet-lock run --strict` before each dogfood dispatch; never inside npm test / verify (C-3).
- C-40 WARMCOLS (Q-WARMCOLS (a) "Yes, exact WARM grammar"): TOOL dialect: WARM columns are exactly A/A B/A AA/A SLOW/A
  [AB/A] in that order, each value NUM_RE / finite; else NO VERDICT (code 2). Engine unit U5c (not U5b), with C-41 and C-51.
- C-41 RAWEXTRA (Q-RAWEXTRA (a) "Yes, unknown RAW column fails"): TOOL dialect: RAW columns are exactly B/A AA SLOW
  [AB]; any other column -> NO VERDICT (code 2). Engine unit U5c, with C-40 and C-51.
- C-42 REPSUNP (Q-REPSUNP (a) "Run shape, any lane"): TOOL dialect: a lane (gated OR reported) whose RESULT reps field
  is unparsed or duplicated -> run shape NO VERDICT (code 2), because the C-34 AB rule cannot be verified (C-14);
  gated lanes' heading moves from "(gated lane not clean)" to "(run shape)"; the judge.rows / selftest expectations it moves are
  re-pinned in the same engine unit (oracle edit, reviewed). Implementing unit: U5b retry 2 (with C-47, C-50).
- C-43 U9 BYTES (Q-U9-BYTES (a) "Keep KILL, diagnose first"): G (ABGate.js 311761f / d4991c39) prints `WINDOW lane=bounds:1e5:1e5 tool-bytes=4320`
  in 3/3 calibration G-family runs (tool verdict PASS); the C-36 KILL on G tool-bytes > 0 STANDS; diagnosis unit U9D runs BEFORE U9 B2; tool
  bytes -> engine fix + a torture row on the R1 lane, otherwise the maintainer rules the rescoping.
- C-44 U9 TWIN (Q-U9-TWIN (a) "Twin band = A/A band"): a hold is INVALID only when the twin t = P2/P1 is outside
  [0.95, 1.05] (the C-4 A/A band); r bands (C-36) unchanged.
- C-45 U9 READINGS (Q-U9-READ (a) "Confirm all three"): (1) a KILL from G inside an otherwise INVALID hold counts as
  KILL; (2) "M fails to fire" is judged on M's median r' over the 5 holds; (3) a P FINDING makes the hold INVALID.
- C-46 E1 PLAIN-OBJECT / HASH IMPORT (A3): the gate file is imported by content hash '?sha256=<laneSha>', so lane-sha256 names the spec that ran; runGate
  options and every gate-spec object must be plain objects (own keys only; a prototype key or Symbol key -> STOP CLI / STOP HARNESS).
  E1 behaviour, not a spec change (A3).
- C-47 RESULTAB (Q-RESULTAB (a) "Run shape, any lane"): TOOL dialect: on EVERY lane (gated OR reported), when reps
  differ the RESULT line carries ab, B/AB and wordAB, each present and not n/a, and exactly one AB: entry in bop; when
  reps are equal, ab, B/AB and wordAB are all n/a and bop has no AB entry. Any violation -> run shape NO VERDICT (code
  2). Implementing unit: U5b retry 2 (with C-50).
- C-48 SETTLE (Q-U9-BYTES-2 (a) "Settle before window"): the C-43 bytes are lane-kernel JIT bytes (8 synchronous TF compiles of
  the R1 callee boundsInto inside the window). runLane runs untimed dry timedRounds passes at the timed shape before
  gcWindow until one reads exactly 0 B (NaN / negative = not settled; cap 3; else VOID TIER-SETTLE, never PASS; no VOID
  lane re-run, C-7); `performance` hoisted to a module const; the C-36 / C-43 KILL on G tool-bytes > 0 stands.
  Pre-tier newSpaceUsed / windowProbe in armTimed; a 0 B pass proves bytes only. New frozen G (commit + sha); U9
  calibration restarts on it before U9 B2. Torture T-SETTLE on a frozen-only R1-shaped lane (bounds:1e5:1e5, K=3,
  tool-bytes 0 in 3/3), must-fail AB_GATE_INJECT=no-settle; settle-void = must-fail for VOID TIER-SETTLE; after a
  TIER-SETTLE the single window still runs (C-7); -0 counts as 0; SETTLE / TIER-SETTLE grammar in SPEC C-48 (A14).
  Implementing unit: U9E (plan-U9E-v1.md).
- C-49 SETTLE SELFTEST (Q-SETTLE-SELFTEST (a) "Torture-only, like tool-deopt"): the injections no-settle and settle-void
  stay out of the timed --selftest list; the npm test marker gate and torture carry them; selftest counts (untimed 67,
  timed 11), the U8 workflow and the doc counts do not change for U9E. Implementing unit: U9E.
- C-50 REPSAB (Q-REPSAB (a) "Run shape, any lane"): TOOL dialect: on every lane the RESULT reps AB part follows C-11
  (reps differ -> AB:<n> with n = B reps; equal -> none); any violation -> run shape NO VERDICT (code 2). Implementing
  unit: U5b retry 2 (with C-42, C-47).
- C-51 RESULTGRAM (Q-RESULTGRAM (a) "Grammar=shape, in U5c"): TOOL dialect, every lane: unparseable or inconsistent RESULT
  values (ab / B/AB not finite when not n/a by C-47, wordAB not matching B/AB, bop printed twice, a non-numeric bop entry) -> run shape NO
  VERDICT (code 2); REPS-DRIFT and ALLOC bop >= 1/64 stay lane VOID labels on reported lanes (C-15). Implementing unit: U5c (with C-40 / C-41).
- C-52 IMAGEOS-ENV (Q-IMAGEOS-ENV (a) "Pin env now, in FILL5"): test/docs.template.test.mjs pins the job env's exact key
  set (values free) and fails any top-level `env:` in every workflow file it checks, so nothing outside the
  runner-identity step can set ImageOS ahead of the guard. Implementing unit: FILL5 retry.
- C-53 JOBKEYS (Q-JOBKEYS (a) "Pin the job key set"): the same test pins the ab job's exact key set (name, runs-on,
  timeout-minutes, strategy, env, steps) and runs-on exactly `${{ matrix.os }}` in every workflow file it checks; top-level keys are an allowlist (name, on,
  permissions, defaults, jobs) and a
  comment line never ends an env scan. Implementing unit: FILL5 retry (parked .handoff/rejected/FILL5).
- C-54 RESULTREST (Q-RESULTREST (a) "Run shape, in U5c now"): TOOL dialect, every lane: the printed word equals the
  word its B/A reads; B/A, aa, slow, A, B, B-A are NUM_RE grammar (NaN only as the VOID NAN outcome); win / spin
  integers; the (gated) / (reported) tag matches the spec; else run shape NO VERDICT (code 2). Implementing unit: U5c.
- C-55 BOPVAL (Q-BOPVAL (a) "Infinity ok, negative = shape"): a bop value Infinity stays valid (the ALLOC VOID
  outcome, a lane label); a negative bop value -> run shape NO VERDICT on every lane. Implementing unit: U5c.
- C-56 RESULTSET (Q-RESULTSET (a) "Exact set + finite, U5c now"): TOOL dialect, every lane: RESULT holds exactly the
  producer's fields, each once, in the producer's order, and every C-54 numeric is finite (NaN only beside its VOID
  NAN item); else run shape NO VERDICT (code 2). Implementing unit: U5c.
- C-57 STEPKEYS (Q-STEPKEYS (a) "Pin every step's key set", A20; FILL5 retry r3 finding P99): test/docs.template.test.mjs pins,
  in every workflow file it checks, the exact key set of EVERY ab-job step as a literal constant per step (quoted or
  unquoted, any extra key fails closed; one mutant per step class), replacing reliance on the unquoted
  continue-on-error / shell / if regex rows. Implementing unit: FILL7 (test-only).
- C-58 CLASH-SCOPE (Q-CLASH-SCOPE (a) "Fold untimed too", A21; amends C-37): markerClash also runs on the untimed child
  rows (live-drift, frozen-drift), folded into each row the same way; no new row, counts unchanged, --selftest-untimed
  goldens stay byte-identical. Implementing unit: U9E B1.
- C-59 WORKFLOOR-KINDS (Q-WORKFLOOR-KINDS (a) "Reserve tool kinds", A21): the lane-spec contract reserves the tool's VOID
  kinds; a workFloor reason that starts with one (ALLOC, SLOW-DEAD, AA-DRIFT, any other tool VOID kind) is STOP SPEC,
  pre-clock (fail closed). Implementing unit: WF1 (plan-C59-v1, A26: STOP HARNESS 'spec: ', prefix match, pre-clock
  floorSweep over every (start, n) pair, kinds + format) (+ LEDGER entry); README / d.ts note in U10.
- C-60 U8B2-GAPS (A21; binding for U8 B2): (G1) the timed-loop fold and the VOID replay get a permanent npm-test gate in
  test/selftest.untimed.test.mjs (must-fail on a no-fold copy); (G2) markerClash cases: all 14 own lines (A26; was 12) joined in one
  output -> '', 2 clashing lines -> 2 clauses; (G3) the timed harness step (i) asserts >= 4 `SELFTEST   VOID ` lines.
- C-61 REPROOF-ANCHOR (Q-REPROOF-ANCHOR (a) "Accept both forms", A22): bench/reproof.mjs buildMutant accepts exactly one match
  of /T\[1\] = (?:PERF|performance)\.now\(\);/ (0 or >= 2 -> throws); test/reproof.judge.test.mjs keeps its verbatim-311761f
  TR and pins both forms plus a 2-hit must-fail. The U9 restart planner re-checks reproof on the new G (C-48).
- C-62 SELFTEST-INJECT (Q-ABDRIFT-LANE (a) "Force B reps", Q-WARMSKEW-ROUND (a) "Prime + tighten", Q-WARMSKEW-GUARD (a)
  "Symmetric guard", Q-WARMSKEW-K (a) "K=3 for warm-skew"; A23, A24, A25): (1) the ab-drift child sets repsB = reps > 1 ? reps >>> 1 : 2 when sizing gave B A's reps, so
  the C-11 AB column and REPS-DRIFT run on any lane; (2) the warm-skew child runs each AA entry once with __labWarm[0] = 1
  before TF, then resets it, and its selftest row requires both VOID AA-DRIFT and VOID NOT-TF absent; (3) in that child every
  column carries one guard of the same shape (only AA's reads __labWarm); (4) the row runs K = 3. Cold-path, injection-only: timedRounds /
  windowProbe / tierSettle and the --selftest-untimed output stay byte-identical. A3 kill (with (3) applied; counted AA > 1.05 without
  NOT-TF) -> the maintainer, Q-WARMSKEW-ROUND (b). Implementing unit: B15 (LEDGER B15).
- C-63 CIJOBKEYS (Q-CIJOBKEYS (a) "Pin ci.yml jobs", A28): ci.yml jobs exactly `test`, a literal JOB_KEYS_CI key set
  (quoted keys normalized), exact runs-on, mutants for quoted job-level continue-on-error / if: false. Implementing unit: FILL8.
- C-64 CITOPKEYS (Q-CITOPKEYS (a) "Allowlist + exact defaults", A29): ci.yml top-level keys exactly name, on, permissions,
  concurrency, defaults, jobs (quoted keys normalized, no top-level env), defaults block byte-exact. IMPLEMENTED burst 12 (FILL9); LEDGER B2 remainder closed.

Open maintainer questions: Q-U9-COLDMIN (LEDGER B18): (a) minimum dwell, (b) exempt the PIDS outer + parent from child PROV busy lists, (c) both, (d) leave U9 PENDING; no ruling.

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
- Warm-skew at K = 1 (amended by C-62: the injection's deopt of AA (fixed) and single-sample host noise (the row runs K = 3, C-62 (4))).
- Forged `AB:1/4` reps row nit.

## 5. AFTER 1.0

- LiteUtils "lite-perf-gate's job" amendment: a LiteUtils burst after this package's first release (C-1).
- LiteBisect migration to this package: after both 1.0s, parity first (C-9).
- LiteSignal adoption (maintainer, 2026-11-25: "signal will consume abgate imm after 1.6.0 release"):
  `@zakkster/lite-signal` (1.5.2 today; roadmap equivalent its LEDGER.md; no ab.yml yet) adopts this package as a
  devDependency (C-1) right after LiteSignal 1.6.0 is released. Orchestrator note (not part of the quote): this
  makes lite-ab-gate 1.0 published on npm a prerequisite. A LiteSignal burst, not this program; nothing here edits
  LiteSignal.
- Post-1.0 research burst (NOT 1.0 scope): benchmark prior art (noop-floor guard, B/B twin, compilation agreement,
  changepoint steady state, env jitter; counters wait on a zero-deps ruling). Seed:
  .handoff/research/post-1.0-prior-art/SEED.md (UNVERIFIED, not a PROPOSAL). Maintainer go 2026-11-25.
