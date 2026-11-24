# R2b design review r1 (2026-11-24) -- REJECTED. Reviewer report, saved by the orchestrator (copied from the hand-back)

Reviewed: r2/R2B-DESIGN.md 0543b542 (frozen: r2/frozen/R2B-DESIGN-0543b542.md), r2/ab-r2b.yml.draft 5ebfcfa1 (frozen:
r2/frozen/ab-r2b-5ebfcfa1.yml.draft), PROGRESS.md ac5c359b, PROPOSAL-timing-ab.md f52bf7f5; context r1/ab-proto.mjs
74f1a3d4, r1/ohlc-lane.mjs 2377d193. Line numbers are in the frozen copies.

## BLOCKERS
1. `R2B-DESIGN.md:25-26,36-39` -- The NULL control does not measure the bias it names. The risk is the second draw given
   that attempt 1 VOIDed. A NULL attempt 2 taken after a clean attempt 1 is a near-copy of attempt 1, so it only adds
   draws to the overall false-word count. N1 (the draws that follow a VOID) is reported but no K-clause uses it. So
   "USABLE -> (a) with re-pair" can be reached with N1 = 0 (likely on ubuntu). Fix: adopt re-pair on an OS only if,
   before dispatch, a floor for clean NULL draws after an attempt-1 VOID is stated and met with zero false words.
   Otherwise the best outcome is "hosted usable WITHOUT re-pair", or NO VERDICT on the re-pair question. -- DESIGN
   (FAIL-OPEN: unmeasured state treated as ok)
2. `R2B-DESIGN.md:34` -- K2 is met by default on R2b's lane set: no drift seen in R2a can turn bounds:1e5:1e3 (44x) or
   bounds:1e5:1e5 (5661x) into WITHIN or FASTER, so only the ratio-1 NULL lanes can catch a false word; yet USABLE maps
   to the tool-wide Q-HOST (a), which covers low-margin lanes too (LiteBisect A8: walk:256:1 margin 0.044). Fix: limit
   the outcome text to "ratio-1 NULL lanes + high-margin lanes", or add a near-band gated lane with a ruled word. --
   DESIGN (GATE TEETH: clause can never fire)
3. `R2B-DESIGN.md:39` -- The outcome map has holes: "(d) below" exists neither below nor in PROPOSAL Q-HOST; K4 NO
   VERDICT maps to nothing; no precedence when K1-K3 and K4 fire together. Define (d), map NO VERDICT, state
   precedence. -- DESIGN (DOC TRUTH / pre-registration)
4. `R2B-DESIGN.md:32,71,83-84` + `ab-r2b.yml.draft:35-36` -- Optional stopping at the dispatch level: ">= 3 legs per OS
   from >= 2 dispatches", "2-3 dispatches ... until each OS has >= 3 legs", the leg matrix OPTIONAL: leg count and the
   K3 / K4 thresholds get chosen during the study; nothing says whether a STOP / CRASH / timeout / selftest-FAIL leg
   counts or is replaced. Fix: fix the dispatch count and matrix before dispatch 1, every dispatched job counts, no
   replacement dispatch. -- DESIGN (FAIL-OPEN; the old "over 3 dispatches" guard dropped)
5. `r1/ohlc-lane.mjs:17,128-129` (carried by `R2B-DESIGN.md:63-64` task 5 and `:80-82` step 2) -- Every hosted leg STOPs
   as designed: `LIVE_PKG` is an absolute local home path; ab-proto `:320` reads each `live` file or STOPs ANCHOR
   (`:137`); step 2 copies no live file, so every hosted gate run and the selftest's clean child STOP. Under K3 a STOP
   leg is "not PASS", so both OS would read NOT USABLE -> Q-HOST (b): a harness defect read as a host verdict. Side
   issues: the home path would be pushed; the live-drift marker `'STOP ANCHOR: live '` also matches the "live ...
   unreadable" message, so that row reads ok on the broken path (B13). Fix: design how the live check runs on a runner,
   or drop it and change its selftest row; add K0: any STOP / CRASH / selftest-FAIL leg makes that OS NO VERDICT
   (harness); fix and re-run all legs; never NOT USABLE evidence. -- DESIGN (FAIL-OPEN)
6. `R2B-DESIGN.md:21,51-52` -- Re-pair fires on every VOID kind (SLOW-DEAD, REPS-DRIFT, NOT-TF, ALLOC, GC-WINDOW, NAN,
   workFloor); the named bias and the NULL control only cover the noise redraw; best-of-two on ALLOC / NOT-TF turns a
   JIT-decision check into a retry with no control (law 8); "except STOP / ORACLE" names things that are not VOID
   kinds. Fix: re-pair only a lane whose sole VOID kind is AA-DRIFT; every other VOID is final. -- DESIGN (FAIL-OPEN)
7. `R2B-DESIGN.md:57-60` -- Selftest rows claim a must-fail control each but list none (B13). Row (a) runs on an
   injection child, which reads NO VERDICT by shape whatever happens (ab-proto `:780`); (c) and (f) expect NO VERDICT,
   which any VOID log also gives; rows for a missing attempt 2 are absent. Replacement text: "3. Selftest rows (law 9 /
   B13; `expected | broken path`): (a) timed child, attempt-scoped aa-drift on one lane's attempt 1: an `attempt=2`
   RESULT line for that lane and the judge's per-lane state citing attempt 2, asserted by string (the child's exit is
   NO VERDICT by shape either way) | no attempt=2 line; (b) an `attempt=2` RESULT for every `null:` lane after a clean
   attempt 1 | missing; (c) PASS fixture + an attempt-2 line with no attempt 1: NO VERDICT naming that shape reason |
   PASS; (d) PASS fixture, NULL attempt 1 clean WITHIN + attempt 2 clean FASTER: FINDING | PASS; (e) parity, below; (f)
   PASS fixture + an attempt=3 line: NO VERDICT naming it | PASS; (g) repair=1 PASS fixture minus one `null:` lane's
   attempt 2: NO VERDICT (shape) naming it | PASS; (h) repair=1 fixture, a gated lane VOID on attempt 1 with no attempt
   2: NO VERDICT naming the missing attempt (reason string asserted) | NO VERDICT (gated lane not clean)." -- LITERAL
   (GATE TEETH)
8. `R2B-DESIGN.md:55` + `ab-r2b.yml.draft:130` -- The judge takes `repair=` from the log it checks (K / C are checked
   against constants, ab-proto `:776-777`; repair has no stated expected source; law 9); printing `repair=0` would also
   break (e)'s R1 byte identity. Replace `:55` with: "HEADER `repair=1` is a shape field; the judge's expected value is
   its own `--repair` argument (default 0; `--verdict-file` accepts `--repair`), never the log's; `--repair 0` prints no
   repair field (R1 bytes); a `--repair 1` judge on a log without `repair=1`, or a `--repair 0` judge on a log with one,
   is NO VERDICT (shape)". Replace draft `:130` with `node "$GATE" "$LANES" --verdict-file logs/gate.log --repair 1 >
   logs/rejudge.log 2>&1`. -- LITERAL (FAIL-OPEN / law 9)
9. `R2B-DESIGN.md:59-60,66-67` -- Row (e) cannot see the timed path. Replace (e) with: "(e) parity at `--repair 0` vs
   74f1a3d4: (i) `--verdict-file` on the 5 R1 hold logs and every R1 fixture row: VERDICT / REPORTED lines and codes
   byte-identical; (ii) R1's 63 selftest rows run unchanged (names and expected strings) inside the new selftest; (iii)
   a timed `--run ALL --repair 0` log has the same line kinds, order and non-numeric fields as r1/logs/hold-1.log once
   every numeric field is masked." -- LITERAL (GATE TEETH)
10. `R2B-DESIGN.md:40-43` -- The power statement bounds the wrong rate. Replace with: "Power statement (printed in the
   report): N = CLEAN NULL draws per OS (any attempt); N1 = clean NULL attempt-2 draws that follow a NULL attempt-1
   VOID. With zero false NULL words the one-sided 95% upper bound is ~3 / N per clean draw and ~3 / N1 on the
   conditional rate the re-pair risks (meaningless below N1 = 3: report 'unmeasured'). Draws in one leg share a VM: if
   the false-word cause is per leg (CPU model, placement), the effective sample is the leg count (~3 per OS) and no
   useful bound exists. R2b can refute hosted usability; it cannot certify a small false-word rate." -- LITERAL (DOC
   TRUTH)
11. `R2B-DESIGN.md:36-37` -- K4 weaker than the old wording (old 4 of 6 = 2/3; new "fewer than 2 measured" = 2/6 at 6
   legs). Replace with: "fewer than 2 / 3 of that OS's legs (rounded up, at least 2) measured -> R2b NO VERDICT on that
   OS (never USABLE)." -- LITERAL (FAIL-OPEN)
12. `R2B-DESIGN.md:7` -- Section 1 states R2a numbers as fact while their law-11 review was PENDING. Replace the heading
   with: "## 1. What R2a changes for R2b (REPORTED, saved hosted logs; PROGRESS R2a.1; law-11 review PENDING -- these
   numbers do not count until APPROVED. Per-OS judging stands on its own: ab.yml judges each OS, LEDGER law 7)". (Since
   superseded: R2a's law-11 status is now PROGRESS R2a.2; cite that.) -- LITERAL (DOC TRUTH, law 11)
13. `R2B-DESIGN.md:87` -- The offline judge never checks that the dispatched files are the approved ones. Append: "It
   first checks each leg's provenance `files:` sha256 against the law-11-approved pins of ab-proto-r2b.mjs,
   ohlc-lane-r2b.mjs and the two frozen files; a mismatch makes that leg NO VERDICT (harness)." -- LITERAL (FAIL-OPEN,
   law 11)

## NITS
- `:45-47` the change list omits: "over 3 dispatches" dropped, NULL lanes 1 -> 4 per leg, K4 from a fraction to a
  count, the final-state rule is new. PROPOSAL Q-HOST (a)'s UNREVIEWED note must be edited in the same edit that adopts
  section 2.
- Draft: a missing file inside `shasum` at `:85` cannot fail the step (the gate STOPs later, so it stays closed); at
  `:132-136` two 'none' lines compare equal (the job is already red). The offline judge must key legs by (run id, os,
  leg).
- `:65-67` the pre-dispatch hold names no outcome for a non-PASS hold (law 10: say stop + review).

## VERIFIED (by the reviewer)
- Draft vs LiteBisect ab.yml: dispatch-only, `contents: read`, persist-credentials false, set +e / PIPESTATUS / tee,
  include-only matrix, pin and identity checks the same; the re-judge step under `if: always()` after a skipped gate
  step fails at `test -f` (closed); nothing pushes or writes outside the job.
- ohlc-lane 2377d193 `:17` absolute LIVE_PKG; ab-proto `:320` -> readOrStop `:137` -> STOP ANCHOR "live ... unreadable";
  the selftest marker `'STOP ANCHOR: live '` matches it. ab-proto `:780` inject != null -> shape NO VERDICT; `:776-777`
  K / C against constants. PROPOSAL Q-HOST had only (a)/(b)/(c) at review time.
- Section 5: no step has Claude send anything off the machine; cost labelled "expected, nominal"; ~33 s matches R1.6.
  Pins match: 74f1a3d4, 2377d193, a600028c, 9c875a5e. No mutants (design-only review).
UNVERIFIED: whether `--oracle-only` stdout is deterministic (left out of #9).
