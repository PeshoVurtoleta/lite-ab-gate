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
- `test/settle.test.mjs` (tierSettle rows), 5 C-48 mutants (127 in `test/mutants.json`), judge.extra TIER-SETTLE rows, and `test/parity.proto.test.mjs` now declares SETTLE lines (C-48).
- `test/hotbody.parity.test.mjs` pins 5 hot-body slices against d4991c39; only the two clock reads of timedRounds may differ.

### Changed

- runLane runs up to 3 untimed settle passes at the timed shape after sizing and before the GC window, until one pass reads exactly 0 bytes; none 0 -> VOID TIER-SETTLE, never PASS. A NaN, negative, positive or non-number read never settles; -0 counts as 0 (C-48).
- timedRounds reads the clock through a module `const PERF = performance` (the only hot-body change); armTimed pre-tiers `newSpaceUsed` and `windowProbe` (forced to TF; either not TF -> STOP CLASSIFIER) (C-48).
- `markerClash` also folds into the untimed live-drift and frozen-drift child rows; no new row, counts unchanged (C-58).
- `bench/reproof.mjs` buildMutant accepts exactly one `T[1] = (PERF|performance).now();` read (C-61).

### Fixed

- Selftest row `ab-drift`: the child forces B's reps (`reps >>> 1`, 1 -> 2) when sizing gave A's, so the AB column and REPS-DRIFT run on any lane and host (C-62 (1)).
- Selftest row `warm-skew`: the child primes AA's spin arm before TF (the injection had deopted AA inside the window), every column in that child carries one same-shape guard (only AA's flag is ever set), and the row also requires VOID NOT-TF absent (C-62 (2), (3)).
- Selftest row `warm-skew` runs K = 3 (median of 3 counted rounds; round 0 is still discarded and checked) (C-62 (4)).
  Measured: the local timed `--selftest` (under `quiet-lock run --strict`) reads `SELFTEST ran 78 of 78` /
  `SELFTEST all ok`, exit 0 (2026-11-26, host QUIET load1 2.07, node v26.8.2, Darwin arm64, 1 run, ABGate.js
  1a280a18).
