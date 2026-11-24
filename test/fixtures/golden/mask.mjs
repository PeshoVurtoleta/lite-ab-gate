// mask.mjs -- lite-ab-gate test fixture: the deterministic masks the goldens in this folder were cut with.
// Reused by later parity tests: compare maskLog(actual, opts) with the golden file text, never raw output.
//
// HOW EACH GOLDEN WAS PRODUCED (U2 / G-A B0, 2026-11-24, node v26.8.2 darwin arm64, Apple M4 Pro):
//   tool  = test/fixtures/r1/ab-proto.mjs (frozen, sha256 74f1a3d4), run as
//   FLAGS = --expose-gc --allow-natives-syntax --no-concurrent-recompilation --min-semi-space-size=4
//           --max-semi-space-size=4 --single-threaded-gc   (its REQUIRED_FLAGS, ab-proto :47-48)
//   r1-oracle-only.log   cwd test/fixtures/r1:  node FLAGS ab-proto.mjs ohlc-lane.mjs --oracle-only
//                        exit 0; maskLog(raw, { timing: false }). LOCAL ONLY: ohlc-lane.mjs binds the live LiteOhlc
//                        files by an absolute path (X5), so the HEADER frozen lines hold absolute local paths.
//   toy-oracle-only.log  cwd test/fixtures/toy: node FLAGS ../r1/ab-proto.mjs toy-lane.mjs --oracle-only
//                        exit 0; maskLog(raw, { timing: false }).
//   toy-timed-shape.log  cwd test/fixtures/toy: node FLAGS ../r1/ab-proto.mjs toy-lane.mjs --run toy:clean --K 3
//                        exit 2 (a subset run is always NO VERDICT (run shape)); maskLog(raw, { timing: true });
//                        run under `quiet-lock.mjs run` (shape only, no verdict). Cut twice: masked bytes identical.
//   cli.log              cwd test/fixtures/toy: node FLAGS ../r1/ab-proto.mjs <argv>, three CLI STOPs, each block
//                        headed `# case <name> argv=<json> exit=<code>`: no args, a bad flag (--rnu ALL), --K 0.
//                        Each exits 1 before the lane file is loaded; maskLog(raw, { timing: false }) per block.
// Before a golden was written its raw output was self-checked (exit as above; every ORACLE line "fold ok" and " ok"
// at its end; no STOP / CRASH line outside cli.log). The raw outputs are in .handoff/evidence/U2-GA-*.log.
//
// HOST MASK (always on): the fields that name the host, the moment or the checkout location.
//   HEADER rung=   node <node> arch <arch> v8 <v8> cpu <cpu>
//   HEADER spec    lane-file <lane-file> ... | tool <tool>         (the lane-sha256= and transform= fields are KEPT)
//   PROV           PROV <tag> <time> load <load> busy-node [<busy>] quiet-lock <quiet-lock>
//   VERDICT tail   | cpu <cpu> | arch <arch> | node <node>
//   HEADER frozen paths are kept (relative for the toy lane; absolute + LOCAL ONLY for r1).
// TIMING MASK ({ timing: true }; for SUBSET timed runs, whose verdict head is fixed at NO VERDICT (run shape)):
//   RESULT / RAW / WARM: in every key=value token except lane= and spin=, each finite number (with a sign or an
//     exponent) -> '#'; word= / wordAB= FASTER|SLOWER|WITHIN|NONE -> '<W>' (n/a kept). Field set, order, the
//     column list (bop A:#,B:#,...), the reps shape (A:#,B:# vs A:#,B:#,AB:#) and the per-round value count stay.
//   VOID items / VOID lines of a TIMING kind (AA-DRIFT, SLOW-DEAD, REPS-DRIFT) are dropped (their presence is a
//     timing outcome); other kinds (NAN, ALLOC, GC-WINDOW, NOT-TF, workFloor reasons) are kept with decimals -> '#'.
//     A non-finite value (NaN, Infinity) is never masked: a non-finite median is a harness defect, never noise.
//   PROV lines are masked only when they match the full field grammar; any other PROV line stays raw (fails closed).
//   VERDICT: ` wrong-gated=[...]` and ` not-clean=[...]` dropped, `gated-clean=<n>/` -> `gated-clean=#/`.
//   REPORTED: per lane item, ' NOT-CLEAN ...' dropped, words -> '<W>', decimals -> '#'.
// Both masks are line-local and idempotent: maskLog(maskLog(x)) === maskLog(x).
//
// CLI: node mask.mjs [--timing] <file|->   prints the masked text. ASCII only, zero deps, node: builtins only.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const TIMING_VOID_KINDS = Object.freeze(['AA-DRIFT', 'SLOW-DEAD', 'REPS-DRIFT']);
const NUM_G = /-?(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g;
const DEC_G = /-?\d+\.\d+(?:e[+-]?\d+)?/g;
const WORD_RE = /^(FASTER|SLOWER|WITHIN|NONE)$/;
const WORD_G = /\b(FASTER|SLOWER|WITHIN)\b/g;

/** Split `s` at `sep` occurrences at bracket depth 0. */
function splitTop(s, sep) {
    const out = [];
    let depth = 0, from = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (depth === 0 && s.startsWith(sep, i)) { out.push(s.slice(from, i)); from = i + sep.length; i += sep.length - 1; }
    }
    out.push(s.slice(from));
    return out;
}
/** Remove ` <key>=[...]` (bracket-depth aware) from s. */
function dropBracketField(s, key) {
    const k = ' ' + key + '=[';
    const i = s.indexOf(k);
    if (i < 0) return s;
    let depth = 0, j = i + k.length - 1;
    for (; j < s.length; j++) {
        if (s[j] === '[') depth++;
        else if (s[j] === ']') { depth--; if (depth === 0) break; }
    }
    return s.slice(0, i) + s.slice(j + 1);
}

export function maskHost(line) {
    if (line.startsWith('HEADER rung=')) {
        return line.replace(/ node \S+(?: arch \S+)? v8 \S+ cpu .+? K=/, ' node <node> arch <arch> v8 <v8> cpu <cpu> K=');
    }
    if (line.startsWith('HEADER spec ')) {
        return line.replace(/ lane-file \S+ /, ' lane-file <lane-file> ').replace(/ \| tool .*$/, ' | tool <tool>');
    }
    if (/^PROV \S+ /.test(line)) {
        return line.replace(/^PROV (\S+) \S+ load \S+ \S+ \S+ busy-node \[[^\]]*\] quiet-lock \S+$/, 'PROV $1 <time> load <load> busy-node [<busy>] quiet-lock <quiet-lock>');
    }
    if (line.startsWith('VERDICT ')) {
        return line.replace(/ \| cpu .* \| arch \S+ \| node \S+$/, ' | cpu <cpu> | arch <arch> | node <node>');
    }
    return line;
}

function maskTokens(rest) {
    return rest.split(' ').map((t) => {
        const eq = t.indexOf('=');
        if (eq < 0) return t;
        const k = t.slice(0, eq), v = t.slice(eq + 1);
        if (k === 'lane' || k === 'spin') return t;
        if (k === 'word' || k === 'wordAB') return WORD_RE.test(v) ? k + '=<W>' : t;
        return k + '=' + v.replace(NUM_G, '#');
    }).join(' ');
}
function voidItemsKept(inner) {
    return splitTop(inner, '; ').filter((it) => !TIMING_VOID_KINDS.includes(it.split(' ')[0])).map((it) => it.replace(DEC_G, '#'));
}

export function maskTiming(line) {
    let m = /^(RESULT lane=\S+(?: \((?:gated|reported)\))?)(.*)$/.exec(line);
    if (m !== null) {
        let rest = m[2];
        let tail = '';
        const vi = rest.indexOf(' VOID=[');
        if (vi >= 0) {
            const inner = rest.slice(vi + 7, rest.endsWith(']') ? rest.length - 1 : rest.length);
            rest = rest.slice(0, vi);
            const kept = voidItemsKept(inner);
            if (kept.length > 0) tail = ' VOID=[' + kept.join('; ') + ']';
        }
        return m[1] + maskTokens(rest) + tail;
    }
    m = /^((?:RAW|WARM) lane=\S+)(.*)$/.exec(line);
    if (m !== null) return m[1] + maskTokens(m[2]);
    m = /^VOID (\S+) lane=(\S+): (.*)$/.exec(line);
    if (m !== null) return TIMING_VOID_KINDS.includes(m[1]) ? null : 'VOID ' + m[1] + ' lane=' + m[2] + ': ' + m[3].replace(DEC_G, '#');
    if (line.startsWith('VERDICT ')) {
        return dropBracketField(dropBracketField(line, 'wrong-gated'), 'not-clean').replace(/ gated-clean=\d+\//, ' gated-clean=#/');
    }
    const rp = 'REPORTED (never read by the verdict) ';
    if (line.startsWith(rp)) {
        return rp + splitTop(line.slice(rp.length), ', ').map((it) => {
            const nc = it.indexOf(' NOT-CLEAN ');
            return (nc >= 0 ? it.slice(0, nc) : it).replace(WORD_G, '<W>').replace(DEC_G, '#');
        }).join(', ');
    }
    return line;
}

/** Mask a whole log (text with '\n' line ends). A trailing newline is kept; dropped lines vanish. */
export function maskLog(text, opts = {}) {
    const timing = opts.timing === true;
    const lines = text.split('\n');
    const end = lines.length > 0 && lines[lines.length - 1] === '' ? lines.pop() : null;
    const out = [];
    for (const l of lines) {
        let x = maskHost(l);
        if (timing) x = maskTiming(x);
        if (x !== null) out.push(x);
    }
    return out.join('\n') + (end === null ? '' : '\n');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const timing = args[0] === '--timing';
    const file = timing ? args[1] : args[0];
    if (file === undefined) { process.stderr.write('usage: node mask.mjs [--timing] <file|->\n'); process.exitCode = 1; }
    else process.stdout.write(maskLog(readFileSync(file === '-' ? 0 : file, 'utf8'), { timing }));
}
