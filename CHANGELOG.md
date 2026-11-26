# Changelog

All notable changes to `@zakkster/lite-ab-gate` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- SETTLE line `SETTLE lane=<id> passes=<n> pass-bytes=<v,..> settled=yes|no` (passes 1-3), printed per lane before the WINDOW line; under `AB_GATE_INJECT=no-settle` it reads `SETTLE lane=<id> skipped (AB_GATE_INJECT=no-settle)` (C-48).
- VOID kind `TIER-SETTLE pass-bytes b1,b2,b3 (cap 3, none read exactly 0)`: no settle pass read exactly 0 bytes; the lane's single window still runs and nothing is re-run (C-48, C-7).
- Injections `no-settle` and `settle-void`, torture-only like `tool-deopt`: the timed `--selftest` list and counts (untimed 67, timed 11) are unchanged (C-49).
- Torture row T-SETTLE on the frozen-only R1-shaped lane `bounds:1e5:1e5` (fixture `test/fixtures/settle/r1-frozen.gate.mjs`, K=3): `settled=yes`, only the last pass reads 0, WINDOW tool-bytes 0; with a must-fail `no-settle` control, a `settle-void` row and T2b (C-48). The zero-tool-bytes claim is scoped to node >= 26 (C-31).
- `test/settle.test.mjs` (tierSettle rows), 5 C-48 mutants (127 at U9E), judge.extra TIER-SETTLE rows, and `test/parity.proto.test.mjs` now declares SETTLE lines (C-48).
- `test/hotbody.parity.test.mjs` pins 5 hot-body slices against d4991c39; only the two clock reads of timedRounds may differ.
- `test/workfloor.test.mjs` (15 rows, DETERMINISTIC: `--oracle-only` or a clock trap, `test/fixtures/workfloor/clock-trap.mjs`, that throws at the first `performance.now`), and 6 C-59 mutants (133 in `test/mutants.json`): `W1-noFloorSweep`, `W2-reservedNever`, `W3-noTierSettleKind`, `W4-uncappedLadder`, `W5-sweepSkipsNonString`, `W6-noFormatRegex` (C-59).
- `test/docs.template.test.mjs` pins the exact key set of every ab-job step (`templates/ab.yml`, `.github/workflows/ab.yml`) and of every ci.yml `test` job step, quoted keys included; 71 docs.template mutants after FILL7 (C-57).
- `test/docs.template.test.mjs` pins ci.yml's jobs to exactly `test`, that job's key set and its `runs-on` (`${{ matrix.os }}`), quoted keys included; 86 docs.template mutants after FILL8 (C-63).
- `test/selftest.timed.mjs` (timed harness, outside `npm test`, run under `quiet-lock --strict`) and `test/fixtures/timed-real/lines.json` + `surface.mjs`; `test/selftest.untimed.test.mjs` gains 6 rows: 3 gate the fixture (schema + lock provenance, marker gate on real lines, staleness), 3 slice ABGate.js (markerClash on all 14 own lines, the C-60 G1 timed-loop fold + VOID replay, the C-58 untimed fold) in `npm test` (C-38, C-60).

### Changed

- runLane runs up to 3 untimed settle passes at the timed shape after sizing and before the GC window, until one pass reads exactly 0 bytes; none 0 -> VOID TIER-SETTLE, never PASS. A NaN, negative, positive or non-number read never settles; -0 counts as 0 (C-48).
- timedRounds reads the clock through a module `const PERF = performance` (the only hot-body change); armTimed pre-tiers `newSpaceUsed` and `windowProbe` (forced to TF; either not TF -> STOP CLASSIFIER) (C-48).
- `markerClash` also folds into the untimed live-drift and frozen-drift child rows; no new row, counts unchanged (C-58).
- `bench/reproof.mjs` buildMutant accepts exactly one `T[1] = (PERF|performance).now();` read (C-61).
- A lane's `workFloor` reason may not START WITH a tool VOID kind (SLOW-DEAD, AA-DRIFT, REPS-DRIFT, NOT-TF, ALLOC, GC-WINDOW, NAN, TIER-SETTLE; prefix match, so `NANO x` is refused): `STOP HARNESS: spec: <lane>.workFloor(<start>, <n>) reason "..." starts with the tool VOID kind <K> (reserved, C-59)`, VERDICT NO VERDICT (STOP HARNESS), exit 1 (C-59).
- A pre-clock sweep (after lane selection, before the sources load and before any clock read, also on `--oracle-only`) calls `workFloor` at every (start, n) pair a timed run with this K can ask (n = minWindow doubling, capped at ops / 2; starts = the K + 1 round starts), the same pairs on `--oracle-only` (more than that run itself asks: it uses only n = minWindow) and applies both the reserved-kind check and the "<KIND> <text>" format check, so a malformed reason at any of those pairs now STOPs pre-clock too (stricter). Because the sweep runs before the sources load, a gate with both an anchor problem and a reserved or malformed `workFloor` now STOPs HARNESS where it used to STOP ANCHOR (still exit 1 / NO VERDICT). A `workFloor` that throws during the sweep reads CRASH before any clock read. The pre-clock STOP holds for a `workFloor` whose answer depends only on (start, n); for any other, the per-lane check stays as a backstop, and in a timed run that check runs after sizing, so its STOP can come after clock reads. Hot body byte-identical (C-59).

### Fixed

- Selftest row `ab-drift`: the child forces B's reps (`reps >>> 1`, 1 -> 2) when sizing gave A's, so the AB column and REPS-DRIFT run on any lane and host (C-62 (1)).
- Selftest row `warm-skew`: the child primes AA's spin arm before TF (the injection had deopted AA inside the window), every column in that child carries one same-shape guard (only AA's flag is ever set), and the row also requires VOID NOT-TF absent (C-62 (2), (3)).
- Selftest row `warm-skew` runs K = 3 (median of 3 counted rounds; round 0 is still discarded and checked) (C-62 (4)).
  Measured: the local timed `--selftest` (under `quiet-lock run --strict`) reads `SELFTEST ran 78 of 78` /
  `SELFTEST all ok`, exit 0 (2026-11-26, host QUIET load1 2.07, node v26.8.2, Darwin arm64, 1 run, ABGate.js
  1a280a18).
