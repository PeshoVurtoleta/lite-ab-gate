# 0003 -- One named legacy dialect (Q-DIALECT)

Status: accepted (C-27); amended by C-33 (laneSha).

## Context

LiteBisect's `bench/ab-gate.mjs` (7e0f9262) logs have no AB column, no warm-round field, no HEADER spec line and no
PROV grammar. The later migration of LiteBisect onto this package starts by re-judging its existing logs, so the
judge must reproduce that gate's VERDICT / REPORTED / exit bytes for an ab-gate-shaped log given LiteBisect's lanes,
gated words and shape as declared data (C-9). Nothing in this package edits LiteBisect (C-9).

## Decision

- One judge-only dialect, `'ab-gate@7e0f9262'`, skips exactly the 4 tool-only checks: the HEADER spec line, reps /
  AB / n-a, warm (RESULT warm=1, WARM line, RAW of K values), and the PROV grammar (PROV start / end, HEADER arch)
  (C-27).
- It is reachable only through the API (`judgeSpec({ dialect })`), never from a gate file or the CLI (C-27).
- The tool dialect (dialect omitted) is strict: it requires warm=1, one WARM line per lane and RAW columns of exactly
  K values (C-28), and `laneSha` (64 lowercase hex) so the HEADER spec line names the gate file that ran. `judgeSpec`
  throws on a missing laneSha; `verdictOf` returns code 2 for a spec built without `judgeSpec` whose laneSha is not
  64 lowercase hex. The legacy dialect ignores laneSha; `ABGate.d.ts` keeps `laneSha?` optional for that reason (C-33).
- The later tool-dialect rules (C-34, C-40..C-42, C-47, C-50, C-51, C-54..C-56) apply to the tool dialect only; the
  legacy dialect skips them.

## Consequences

- Legacy parity is a DETERMINISTIC test (`test/parity.abgate.test.mjs`) over a golden ab-gate log fixture.
- A log that merely resembles the legacy shape cannot be judged leniently by accident: leniency needs an explicit
  API option.

## Alternatives rejected

- A tool-wide lenient mode: it would turn every malformed line into a possible PASS (C-14).
- A dialect flag in the gate file or on the CLI: a gate must not choose how strictly it is judged.
