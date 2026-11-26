# 0001 -- The hoisted timed loop (Q-HOTLOOP)

Status: accepted (C-23); the statistical re-proof is PENDING (see the last section).

## Context

The proven prototype (ab-proto 74f1a3d4) timed with a loop inside the lane runner. This package needs a timed loop it
can verify: that it is in TurboFan across the window, and that the tool itself allocates nothing inside the window,
so that any bytes the window reads belong to the kernel under test.

## Decision

- The timed loop is a TF-forced `timedRounds` with a `Float64Array(2)` time slot (t0 / t1), armed once per timed run
  on 5 tool-owned non-allocating dummy entries plus a forced optimization. If it is not TF after a window the lane is
  VOID NOT-TF (tool) (C-23).
- Each timed lane prints `WINDOW lane=<id> tool-bytes=<n> scavenges=<k>`; `npm run torture` gates zero tool bytes in
  the window (C-23).
- Zero tool bytes is scoped to node >= 26 (C-31). On Node 22 `performance.now()` boxes 16 B per read, so the WINDOW
  row cannot hold there. CI runs `npm test` on node 22 / 24 / 26 and `npm run torture` on the node 26 legs only;
  `test/torture.mjs` exits 1 on node < 26 rather than skipping. `engines` stays >= 22.

## Consequence: the first window bytes were kernel bytes (C-43, C-48)

A first torture calibration on the R1 lane printed a non-zero `tool-bytes` on a PASS lane. The KILL rule on a
non-zero tool-bytes stood (C-43), and a diagnosis unit found that those bytes were lane-kernel JIT bytes (synchronous
TurboFan compiles of the kernel callee inside the window), not tool bytes; the tool owned only a Maglev compile of the
`performance` getter. The fix (C-48): after sizing and before the GC window each lane runs up to 3 untimed settle
passes at the timed shape, until one pass reads exactly 0 bytes (NaN, negative, positive or non-number never settles;
-0 counts as 0). `performance` is hoisted to a module `const PERF`, and `armTimed` pre-tiers `newSpaceUsed` and
`windowProbe`. None 0 after 3 passes is VOID TIER-SETTLE, never PASS; the lane's single window still runs and no lane
is re-run (C-7). Torture row T-SETTLE, with a must-fail control (`AB_GATE_INJECT=no-settle`) and a `settle-void` row,
carries it (C-49).

## Alternatives rejected

- Raising the warm-round count instead of settling: every round is inside the GC window.
- Keeping the prototype's loop: its tier state across the window cannot be checked.

## Re-proof

REQUIRED before 1.0 (C-23); PENDING, not yet run on this build. Method: 5 local `quiet-lock run --strict` holds of bench/reproof.mjs, the hoisted timedRounds interleaved against frozen ab-proto 74f1a3d4; pre-registered PASS = median r in [0.98, 1.02] on every gated lane and every per-hold r in [0.95, 1.05]; must-fail mutant B x1.04 (C-35, C-36). Local holds are PRELIMINARY unless QUIET. No number is quoted without a run log.
