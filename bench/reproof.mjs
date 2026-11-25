// bench/reproof.mjs -- U9 (C-23 / C-35 / C-36): the STATISTICAL re-proof probe of ABGate's hoisted timed loop against
// the frozen ab-proto 74f1a3d4 on the R1 (LiteOhlc) lane. Cold path only; never run by npm test (C-3).
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
//
// Modes:
//   node bench/reproof.mjs --hold <n> --tool <G path> --tool-sha <64hex> --out <dir>
//       one hold = 5 children (odd n: P G M G P, even n: G P M P G; M = G with B's ns x 1.04, buildMutant), each run
//       `--run ALL` with the 6 REQUIRED_FLAGS, cwd test/fixtures/r1, then re-judged by its own tool's --verdict-file.
//       Writes <dir>/hold-<n>/{1..5}-{P,G,M}.log, M-ABGate.js and outer.log. Exit 0 VALID | 2 INVALID | 3 KILL | 1 STOP.
//       Run it ONLY under `node ~/.claude/hooks/quiet-lock.mjs run --strict "<label>" -- ...` (one hold per call).
//   node bench/reproof.mjs --judge <dir> --tool-sha <64hex>
//       pure and untimed: re-reads every hold-<n>/ of <dir> and prints the pre-registered decision.
//       Exit 0 PASS | 2 PENDING / NO VERDICT | 3 KILL | 1 STOP.
//
// The statistic (C-36, plan-U9-v1 SPEC, pre-registered, law 5): per gated lane and valid hold
//   r = (G1 + G2) / (P1 + P2) on the RESULT B/A medians (and the same on B/AB where both tools print it);
//   twin t = P2 / P1 (B/A); mutant r' = 2 M / (G1 + G2), judged on its 5-hold median only (C-45).
//   A G KILL fact in an INVALID hold still KILLs (C-45); G tool-bytes > 0 on any gated lane = KILL (C-43).
//   PASS    = 5 valid holds AND median-over-holds r in [0.98, 1.02] on every gated lane (B/A and B/AB) AND every
//             per-hold r in [0.95, 1.05] AND the mutant fires (median r' > 1.02 on every gated lane).
//   KILL    = a FINDING from G; a NOT-TF tool line from G; G tool-bytes != 0; GC-WINDOW major > 0 in G; > 1 VOID in
//             the 10 G runs whose paired P run was clean; any r outside its interval.
//   INVALID = (hold, exit 2, PENDING) a P VOID or P FINDING (C-45); t outside the A/A band [0.95, 1.05] (C-44); an M VOID; a non-empty busy-node
//             or a quiet-lock state other than `quiet` in any PROV line.
//   STOP    = any child exit 1; any input sha differs (P / lane / Ohlc / baseline pins, G across holds, log bytes vs
//             outer.log); M == G; Node < 26 (C-31); a truncated / malformed log; a --verdict-file re-judge that
//             disagrees with its child; the mutant fails to fire.
//   Holds run on a harness (this file) whose sha differs from the current one are EXCLUDED (do not count).
//   Precedence: STOP > KILL > NO VERDICT / PENDING > PASS. Fewer than 5 valid holds after >= 8 attempts, or more than 8
//   attempts at all (even with 5 valid), = NO VERDICT; fewer than 5 valid after < 8 attempts = PENDING. A Node version
//   that differs across counted holds is STOP.
//
// Law 4: this parser is independent of ABGate.js -- it never imports it; it reads the log text with its own grammar
// and re-derives aa / slow / the word from the RAW rounds with the C-4 constants.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const ME = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R1 = join(ROOT, 'test', 'fixtures', 'r1');

export const PIN = Object.freeze({
    P: '74f1a3d41e72e83fd5690bdae9005ce5dbf200ab05b906ca4249cb427d1068c4',
    lane: '2377d1937815b1d22d527a1ce2f9eeb4f0f496cf14065873d466657aea17c7e2',
    ohlc: 'a600028c4cbba39086f93b21be34c57305e4d4acaec35d9faded8ac46dc275b2',
    baseline: '9c875a5ecb9bf8ef26436254d72b8d9c2ba9345167bd4c4b7d93d6a567bbe89e',
});
export const GATED = Object.freeze({ 'bounds:1e5:1e3': 'SLOWER', 'bounds:1e5:1e5': 'SLOWER', 'null:1e5:1e3': 'WITHIN' });
const LANES = Object.freeze(Object.keys(GATED));
export const K = 11, C = 3;
// C-4 tool constants (re-checked here, never read from the tool)
const AA_LO = 0.95, AA_HI = 1.05, SLOW_MED = 1.25, SLOW_Q1 = 1.10, ALLOC_MAX = 1 / 64;
// C-36 band (pre-registered)
export const BAND = Object.freeze({ medLo: 0.98, medHi: 1.02, holdLo: 0.95, holdHi: 1.05, twinLo: 0.95, twinHi: 1.05, fire: 1.02 });
export const HOLDS = 5, MAX_ATTEMPTS = 8, MUT = 1.04, G_VOID_MAX = 1;
export const REQUIRED_FLAGS = Object.freeze(['--expose-gc', '--allow-natives-syntax', '--no-concurrent-recompilation',
    '--min-semi-space-size=4', '--max-semi-space-size=4', '--single-threaded-gc']);
export const ORDER = (n) => ((n & 1) === 1 ? ['P', 'G', 'M', 'G', 'P'] : ['G', 'P', 'M', 'P', 'G']);
const RAW_TOL = 0.0006;   // RESULT prints 3 dp, RAW 4 dp: |med(RAW) - RESULT med| <= 0.0005 + 0.00005
const HEX64 = /^[0-9a-f]{64}$/;

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const inBand = (x, lo, hi) => x >= lo && x <= hi;   // NaN -> false (fail closed)
const fx = (v) => (typeof v === 'number' ? v.toFixed(4) : 'n/a');

// ---------------------------------------------------------------- statistics (C-4 definitions, own code)
function quant(sorted, p) {
    const n = sorted.length;
    if (n === 0) return NaN;
    if (n === 1) return sorted[0];
    const h = (n - 1) * p, i = Math.floor(h);
    return i + 1 < n ? sorted[i] + (h - i) * (sorted[i + 1] - sorted[i]) : sorted[i];
}
export function summary(arr) {
    for (const v of arr) if (!Number.isFinite(v)) return { med: NaN, q1: NaN, q3: NaN };
    const s = arr.slice().sort((a, b) => a - b);
    return { med: quant(s, 0.5), q1: quant(s, 0.25), q3: quant(s, 0.75) };
}
export function wordOf(s) {
    if (!Number.isFinite(s.med)) return 'NONE';
    if (s.med > AA_HI && s.q1 > 1) return 'SLOWER';
    if (s.med < AA_LO && s.q3 < 1) return 'FASTER';
    return 'WITHIN';
}
export function median(xs) { return summary(xs).med; }

// ---------------------------------------------------------------- log parser (both tools' formats; law 4)
const NUM = (t) => (t === 'NaN' ? NaN : /^-?(\d+(\.\d+)?|Infinity)$/.test(t) ? Number(t) : undefined);
function stat(t) {
    const m = /^(\S+?)\[(\S+?)\.\.(\S+)\]$/.exec(t);
    if (m === null) return null;
    const med = NUM(m[1]), q1 = NUM(m[2]), q3 = NUM(m[3]);
    return med === undefined || q1 === undefined || q3 === undefined ? null : { med, q1, q3 };
}
/** parseLog(text, role) -> { errors[], ... }. errors = the log is malformed / truncated (STOP). */
export function parseLog(text, role) {
    const errors = [];
    const lines = String(text).split('\n');
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const o = { role, errors, node: null, K: NaN, C: NaN, inject: null, laneSha: null, toolSha8: null, frozen: {}, gated: null,
        prov: [], control: 0, controlOk: false, windows: {}, results: {}, raw: {}, voidLines: [], verdict: null };
    const count = { rung: 0, spec: 0, gated: 0, verdict: 0 };
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        let m;
        if (l.startsWith('HEADER rung=')) {
            count.rung++;
            m = /^HEADER rung=ALL TIMED node (v\d+\.\d+\.\d+) .* K=(\d+) C=(\d+) .*inject=(\S+)$/.exec(l);
            if (m === null) { errors.push('HEADER rung line malformed'); continue; }
            o.node = m[1]; o.K = Number(m[2]); o.C = Number(m[3]); o.inject = m[4];
        } else if (l.startsWith('HEADER spec ')) {
            count.spec++;
            m = / lane-sha256=(\S+) .*\| tool \S+ sha256 (\S+)$/.exec(l);
            if (m === null) { errors.push('HEADER spec line malformed'); continue; }
            o.laneSha = m[1]; o.toolSha8 = m[2];
        } else if (l.startsWith('HEADER frozen ')) {
            m = /^HEADER frozen (\S+) \S+ sha256 (\S+) (\S+);/.exec(l);
            if (m === null) { errors.push('HEADER frozen line malformed'); continue; }
            if (Object.hasOwn(o.frozen, m[1])) errors.push('HEADER frozen ' + m[1] + ' twice');
            o.frozen[m[1]] = { sha8: m[2], ok: m[3] === 'ok' };
        } else if (l.startsWith('HEADER GATED ')) {
            count.gated++;
            m = /^HEADER GATED (.+?); every other lane REPORTED$/.exec(l);
            if (m === null) { errors.push('HEADER GATED line malformed'); continue; }
            o.gated = {};
            for (const kv of m[1].split(' ')) {
                const e = /^(\S+)=(FASTER|SLOWER|WITHIN)$/.exec(kv);
                if (e === null || Object.hasOwn(o.gated, e[1])) { errors.push('HEADER GATED entry malformed: ' + kv); continue; }
                o.gated[e[1]] = e[2];
            }
        } else if (l.startsWith('PROV ')) {
            m = /^PROV (start|end) (\S+) load (\S+) (\S+) (\S+) busy-node \[(.*)\] quiet-lock (\S+)$/.exec(l);
            if (m === null) { errors.push('PROV line malformed'); continue; }
            o.prov.push({ tag: m[1], date: m[2], load1: Number(m[3]), busy: m[6], quiet: m[7] });
        } else if (l.startsWith('CONTROL gc-window')) {
            o.control++;
            o.controlOk = / -- ok$/.test(l);
        } else if (l.startsWith('WINDOW ')) {
            m = /^WINDOW lane=(\S+) tool-bytes=(\S+) scavenges=(\S+)$/.exec(l);
            if (m === null) { errors.push('WINDOW line malformed'); continue; }
            if (Object.hasOwn(o.windows, m[1])) errors.push('WINDOW lane=' + m[1] + ' twice');
            const b = NUM(m[2]);
            o.windows[m[1]] = { bytes: b === undefined ? NaN : b, scavenges: Number(m[3]) };
        } else if (l.startsWith('RESULT ')) {
            const r = parseResult(l);
            if (typeof r === 'string') { errors.push(r); continue; }
            if (Object.hasOwn(o.results, r.lane)) errors.push('RESULT lane=' + r.lane + ' twice');
            o.results[r.lane] = r;
        } else if (l.startsWith('RAW ')) {
            const r = parseRaw(l);
            if (typeof r === 'string') { errors.push(r); continue; }
            if (Object.hasOwn(o.raw, r.lane)) errors.push('RAW lane=' + r.lane + ' twice');
            o.raw[r.lane] = r;
        } else if (l.startsWith('VOID ')) {
            m = /^VOID (\S+) lane=(\S+?): (.*)$/.exec(l);
            if (m === null) { errors.push('VOID line malformed'); continue; }
            o.voidLines.push({ kind: m[1], lane: m[2], text: m[3] });
        } else if (l.startsWith('VERDICT ')) {
            count.verdict++;
            m = /^VERDICT (PASS|FINDING|NO VERDICT)\b/.exec(l);
            if (m === null) { errors.push('VERDICT line malformed'); continue; }
            o.verdict = m[1];
            if (i !== lines.length - 1) errors.push('VERDICT is not the last line (truncated / appended log)');
        } else if (/^(STOP|CRASH) /.test(l)) {
            errors.push('child printed ' + l.slice(0, 80));
        }
    }
    if (count.rung !== 1) errors.push('HEADER rung= lines: ' + count.rung + ' (want 1)');
    if (count.spec !== 1) errors.push('HEADER spec lines: ' + count.spec + ' (want 1)');
    if (count.gated !== 1) errors.push('HEADER GATED lines: ' + count.gated + ' (want 1)');
    if (count.verdict !== 1) errors.push('VERDICT lines: ' + count.verdict + ' (want 1; truncated log?)');
    if (o.control !== 1) errors.push('CONTROL gc-window lines: ' + o.control + ' (want 1)');
    const tags = o.prov.map((p) => p.tag).join(',');
    if (tags !== 'start,end') errors.push('PROV lines ' + (tags || 'none') + ' (want start,end)');
    if (o.gated !== null) {
        const want = LANES.map((id) => id + '=' + GATED[id]).join(' ');
        const got = Object.keys(o.gated).map((id) => id + '=' + o.gated[id]).join(' ');
        if (got !== want) errors.push('HEADER GATED ' + got + ' (pinned ' + want + ')');
    }
    const rl = Object.keys(o.results).sort().join(','), want = LANES.slice().sort().join(',');
    if (rl !== want) errors.push('RESULT lanes ' + (rl || 'none') + ' (want ' + want + ')');
    if (Object.keys(o.raw).sort().join(',') !== want) errors.push('RAW lanes ' + Object.keys(o.raw).sort().join(',') + ' (want ' + want + ')');
    if (role !== 'P' && Object.keys(o.windows).sort().join(',') !== want) errors.push('WINDOW lanes ' + Object.keys(o.windows).sort().join(',') + ' (want ' + want + ')');
    if (o.K !== K || o.C !== C) errors.push('K=' + o.K + ' C=' + o.C + ' (want K=' + K + ' C=' + C + ')');
    if (o.inject !== null && o.inject !== 'null') errors.push('inject=' + o.inject + ' (want null)');
    for (const id of LANES) {
        const r = o.results[id], w = o.raw[id];
        if (r === undefined || w === undefined) continue;
        if (!r.gated) errors.push('RESULT lane=' + id + ' not tagged (gated)');
        if (w.BA.length !== K || w.AA.length !== K || w.SLOW.length !== K || (w.AB !== null && w.AB.length !== K)) errors.push('RAW lane=' + id + ' column length != K');
        const rm = summary(w.BA).med;
        if (Number.isFinite(rm) && Number.isFinite(r.BA.med) && !(Math.abs(rm - r.BA.med) <= RAW_TOL + 1e-9 * Math.abs(rm))) {
            errors.push('RESULT lane=' + id + ' B/A median ' + r.BA.med + ' disagrees with its RAW rounds (' + rm.toFixed(4) + ')');
        }
    }
    return o;
}
const RESULT_KEYS = ['lane', 'A', 'B', 'B/A', 'word', 'aa', 'slow', 'ab', 'B/AB', 'wordAB', 'bop', 'win', 'reps', 'spin'];
function parseResult(l) {
    let body = l.slice('RESULT '.length), voids = [];
    const vm = / VOID=\[(.*)\]$/.exec(body);
    if (vm !== null) { voids = vm[1].split('; '); body = body.slice(0, vm.index); }
    const kv = {};
    let gated = false;
    for (const t of body.split(' ')) {
        if (t === '(gated)') { gated = true; continue; }
        if (t === 'ns/op') continue;
        const e = t.indexOf('=');
        if (e <= 0) return 'RESULT token malformed: ' + t;
        const k = t.slice(0, e);
        if (Object.hasOwn(kv, k)) return 'RESULT key ' + k + ' twice';
        kv[k] = t.slice(e + 1);
    }
    for (const k of RESULT_KEYS) if (!Object.hasOwn(kv, k)) return 'RESULT lane=' + kv.lane + ' has no ' + k + '=';
    const BA = stat(kv['B/A']), aa = stat(kv.aa), slow = stat(kv.slow);
    if (BA === null || aa === null || slow === null) return 'RESULT lane=' + kv.lane + ' B/A / aa / slow unparseable';
    const BAB = kv['B/AB'] === 'n/a' ? null : stat(kv['B/AB']);
    if (kv['B/AB'] !== 'n/a' && BAB === null) return 'RESULT lane=' + kv.lane + ' B/AB unparseable';
    const bop = {};
    for (const p of kv.bop.split(',')) {
        const e = /^([A-Z]+):(\S+)$/.exec(p);
        if (e === null) return 'RESULT lane=' + kv.lane + ' bop entry malformed: ' + p;
        const v = NUM(e[2]);
        bop[e[1]] = v === undefined ? NaN : v;
    }
    const reps = {};
    for (const p of kv.reps.split(',')) {
        const e = /^([A-Z]+):(\d+)$/.exec(p);
        if (e === null) return 'RESULT lane=' + kv.lane + ' reps entry malformed: ' + p;
        reps[e[1]] = Number(e[2]);
    }
    return { lane: kv.lane, gated, BA, BAB, word: kv.word, wordAB: kv.wordAB, aa, slow, bop, reps, voids };
}
function parseRaw(l) {
    const toks = l.split(' ');
    const m = /^lane=(\S+)$/.exec(toks[1] || '');
    if (toks[0] !== 'RAW' || m === null) return 'RAW line malformed';
    const cols = {};
    for (const t of toks.slice(2)) {
        const e = /^(B\/A|AA|SLOW|AB)=(\S+)$/.exec(t);
        if (e === null) return 'RAW lane=' + m[1] + ' column malformed: ' + t.slice(0, 40);
        if (Object.hasOwn(cols, e[1])) return 'RAW lane=' + m[1] + ' column ' + e[1] + ' twice';
        const vs = e[2].split(',').map((x) => { const v = NUM(x); return v === undefined ? NaN : v; });
        cols[e[1]] = vs;
    }
    if (!cols['B/A'] || !cols.AA || !cols.SLOW) return 'RAW lane=' + m[1] + ' lacks B/A, AA or SLOW';
    return { lane: m[1], BA: cols['B/A'], AA: cols.AA, SLOW: cols.SLOW, AB: cols.AB || null };
}

/** Per-log facts the judge uses: per gated lane VOID reasons (tool-printed + re-derived), FINDING reasons, KILL facts. */
export function assessLog(o) {
    const voids = [], finding = [], kill = [];
    if (o.verdict === 'NO VERDICT') voids.push('VERDICT NO VERDICT');
    if (o.verdict === 'FINDING') finding.push('VERDICT FINDING');
    if (!o.controlOk) voids.push('CONTROL gc-window not ok');
    let gcMajor = 0, notTfTool = false;
    const laneVoid = {};
    for (const id of LANES) laneVoid[id] = [];
    for (const v of o.voidLines) (laneVoid[v.lane] || voids).push(v.kind + ' ' + v.text);
    for (const id of LANES) {
        const r = o.results[id], w = o.raw[id];
        if (r === undefined || w === undefined) { voids.push(id + ' missing'); continue; }
        const lv = laneVoid[id];
        for (const t of r.voids) lv.push(t);
        const aa = summary(w.AA), slow = summary(w.SLOW), ba = summary(w.BA);
        if (!inBand(aa.med, AA_LO, AA_HI)) lv.push('AA-DRIFT (re-derived ' + aa.med + ')');
        if (!(slow.med > SLOW_MED && slow.q1 > SLOW_Q1)) lv.push('SLOW-DEAD (re-derived ' + slow.med + ')');
        if (!Number.isFinite(ba.med) || !Number.isFinite(r.BA.med)) lv.push('NAN B/A');
        for (const c of ['A', 'B', 'AA', 'SLOW']) if (!Object.hasOwn(r.bop, c)) lv.push('ALLOC ' + c + ' missing');
        for (const c in r.bop) if (!(r.bop[c] >= 0 && r.bop[c] < ALLOC_MAX)) lv.push('ALLOC ' + c + ' ' + r.bop[c]);
        const hasAB = r.BAB !== null;
        if (hasAB !== (r.reps.B !== r.reps.A) || hasAB !== (w.AB !== null)) lv.push('REPS shape (AB vs reps)');
        if (hasAB && r.wordAB !== r.word) lv.push('REPS-DRIFT wordAB ' + r.wordAB + ' vs ' + r.word);
        if (o.role !== 'P') {
            const win = o.windows[id];
            if (win !== undefined && !(win.bytes === 0)) kill.push(id + ' tool-bytes=' + win.bytes);
        }
        for (const t of lv) {
            if (/NOT-TF tool/.test(t)) notTfTool = true;
            const g = /GC-WINDOW major (\d+)/.exec(t);
            if (g !== null && Number(g[1]) > 0) gcMajor += Number(g[1]);
        }
        const re = wordOf(ba);
        // a printed word its own RAW rounds do not support is a defect of the tool, never a VOID (that would hide it)
        if (r.word !== re) finding.push(id + ' printed word ' + r.word + ' disagrees with its RAW rounds (' + re + ')');
        // clean lane: the word (printed == re-derived, else the line above already fired) must be the GATED word
        if (lv.length === 0 && re !== GATED[id]) finding.push(id + ' word ' + re + ' (gated ' + GATED[id] + ')');
    }
    for (const v of voids) if (/NOT-TF tool/.test(v)) notTfTool = true;
    if (notTfTool) kill.push('NOT-TF tool');
    if (gcMajor > 0) kill.push('GC-WINDOW major ' + gcMajor);
    for (const id of LANES) if (laneVoid[id].length > 0) voids.push(id + ': ' + laneVoid[id].join('; '));
    const busy = o.prov.filter((p) => p.busy !== '' || p.quiet !== 'quiet').map((p) => p.tag + ' busy-node [' + p.busy + '] quiet-lock ' + p.quiet);
    return { voids, finding, kill, busy };
}

// ---------------------------------------------------------------- outer.log
/** parseOuter(text) -> { n, order[], node, sha{P,G,M,lane,ohlc,baseline,harness}, children[5], rejudge[5], errors[] } */
export function parseOuter(text) {
    const o = { n: NaN, order: null, node: null, sha: {}, children: [], rejudge: [], errors: [] };
    for (const l of String(text).split('\n')) {
        let m;
        if ((m = /^OUTER u9-reproof hold=(\d+) order=(\S+)$/.exec(l)) !== null) { o.n = Number(m[1]); o.order = m[2].split(','); }
        else if ((m = /^NODE (v\d+\.\d+\.\d+) /.exec(l)) !== null) o.node = m[1];
        else if ((m = /^SHA (\S+) (\S+)/.exec(l)) !== null) {
            if (Object.hasOwn(o.sha, m[1])) o.errors.push('SHA ' + m[1] + ' twice');
            o.sha[m[1]] = m[2];
        } else if ((m = /^CHILD (\d) ([PGM]) exit (\S+) .*log-sha256 (\S+)$/.exec(l)) !== null) {
            if (o.children.some((c) => c.i === Number(m[1]))) o.errors.push('CHILD ' + m[1] + ' twice');
            o.children.push({ i: Number(m[1]), role: m[2], exit: m[3], logSha: m[4] });
        } else if ((m = /^REJUDGE (\d) ([PGM]) exit (\S+) verdict (.+) match (yes|no)$/.exec(l)) !== null) {
            if (o.rejudge.some((c) => c.i === Number(m[1]))) o.errors.push('REJUDGE ' + m[1] + ' twice');
            o.rejudge.push({ i: Number(m[1]), role: m[2], match: m[5] === 'yes' });
        }
    }
    if (!Number.isInteger(o.n)) o.errors.push('no OUTER line');
    if (o.node === null) o.errors.push('no NODE line');
    for (const k of ['P', 'G', 'M', 'lane', 'ohlc', 'baseline', 'harness']) if (!HEX64.test(o.sha[k] || '')) o.errors.push('SHA ' + k + ' missing / not 64 hex');
    return o;
}
const nodeMajor = (v) => { const m = /^v(\d+)\./.exec(v || ''); return m === null ? NaN : Number(m[1]); };

// ---------------------------------------------------------------- judge (pure)
/** judgeHold({ outer: text, logs: { 1: text, .., 5: text } }, opts) -> per-hold summary. */
export function judgeHold(hold, opts = {}) {
    const stop = [], invalid = [], kill = [];
    const out = parseOuter(hold.outer);
    for (const e of out.errors) stop.push('outer.log: ' + e);
    const n = out.n;
    const order = Number.isInteger(n) ? ORDER(n) : null;
    if (order !== null && (out.order || []).join(',') !== order.join(',')) stop.push('order ' + (out.order || []).join(',') + ' (hold ' + n + ' wants ' + order.join(',') + ')');
    if (!(nodeMajor(out.node) >= 26)) stop.push('Node ' + out.node + ' < 26 (C-31)');
    for (const k of ['P', 'lane', 'ohlc', 'baseline']) if (out.sha[k] !== undefined && out.sha[k] !== PIN[k]) stop.push('SHA ' + k + ' ' + out.sha[k].slice(0, 8) + ' != pinned ' + PIN[k].slice(0, 8));
    if (opts.gSha !== undefined && out.sha.G !== opts.gSha) stop.push('SHA G ' + String(out.sha.G).slice(0, 8) + ' != expected ' + opts.gSha.slice(0, 8));
    if (out.sha.M !== undefined && out.sha.M === out.sha.G) stop.push('M == G (the mutant was not applied)');
    // a missing / malformed SHA harness line never excludes (it falls through to the parseOuter STOP)
    const excluded = opts.harnessSha !== undefined && HEX64.test(out.sha.harness || '') && out.sha.harness !== opts.harnessSha;
    const parsed = {}, facts = {};
    for (let i = 1; i <= 5; i++) {
        const role = order === null ? null : order[i - 1];
        const ch = out.children.find((c) => c.i === i), rj = out.rejudge.find((c) => c.i === i);
        const text = hold.logs[i];
        if (role === null) break;
        if (typeof text !== 'string') { stop.push(i + '-' + role + '.log missing'); continue; }
        if (ch === undefined || ch.role !== role) { stop.push('CHILD ' + i + ' ' + role + ' line missing'); continue; }
        if (ch.exit !== '0' && ch.exit !== '2' && ch.exit !== '3') stop.push('child ' + i + '-' + role + ' exit ' + ch.exit);
        if (ch.logSha !== sha256(text)) stop.push(i + '-' + role + '.log bytes differ from outer.log log-sha256');
        if (rj === undefined || !rj.match) stop.push('child ' + i + '-' + role + ' --verdict-file re-judge ' + (rj === undefined ? 'missing' : 'disagrees'));
        const o = parseLog(text, role);
        for (const e of o.errors) stop.push(i + '-' + role + ': ' + e);
        if (o.laneSha !== PIN.lane) stop.push(i + '-' + role + ': lane-sha256 ' + String(o.laneSha).slice(0, 8) + ' != pinned ' + PIN.lane.slice(0, 8));
        const want8 = String(out.sha[role]).slice(0, 8);
        if (o.toolSha8 !== want8) stop.push(i + '-' + role + ': tool sha256 ' + o.toolSha8 + ' != ' + role + ' ' + want8);
        if (!(nodeMajor(o.node) >= 26)) stop.push(i + '-' + role + ': node ' + o.node + ' < 26 (C-31)');
        const fz = [['Ohlc.js', PIN.ohlc], ['baseline.mjs', PIN.baseline]];
        for (const [f, s] of fz) if (!o.frozen[f] || o.frozen[f].sha8 !== s.slice(0, 8) || !o.frozen[f].ok) stop.push(i + '-' + role + ': frozen ' + f + ' not ' + s.slice(0, 8) + ' ok');
        parsed[i] = o;
        facts[i] = assessLog(o);
    }
    const idx = (role) => (order === null ? [] : order.map((r, j) => (r === role ? j + 1 : 0)).filter((j) => j > 0));
    const [p1, p2] = idx('P'), [g1, g2] = idx('G'), [m1] = idx('M');
    const res = { n, node: out.node, status: null, stop, invalid, kill, excluded, gVoidCleanP: 0, r: {}, rAB: {}, t: {}, rM: {}, sha: out.sha, busy: [] };
    if (stop.length > 0 || Object.keys(parsed).length !== 5) { res.status = 'STOP'; return res; }
    for (const i of [p1, p2, g1, g2, m1]) for (const b of facts[i].busy) { invalid.push(i + '-' + order[i - 1] + ' ' + b); res.busy.push(b); }
    for (const i of [p1, p2]) {
        if (facts[i].voids.length > 0) invalid.push(i + '-P VOID ' + facts[i].voids.join(' | '));
        if (facts[i].finding.length > 0) invalid.push(i + '-P FINDING ' + facts[i].finding.join(' | '));
    }
    if (facts[m1].voids.length > 0) invalid.push(m1 + '-M VOID ' + facts[m1].voids.join(' | '));
    for (const [g, p] of [[g1, p1], [g2, p2]]) {
        for (const f of facts[g].finding) kill.push(g + '-G FINDING ' + f);
        for (const f of facts[g].kill) kill.push(g + '-G ' + f);
        if (facts[g].voids.length > 0 && facts[p].voids.length === 0) res.gVoidCleanP++;
    }
    const BA = (i, id) => parsed[i].results[id].BA.med;
    const BAB = (i, id) => { const s = parsed[i].results[id].BAB; return s === null ? null : s.med; };
    for (const id of LANES) {
        res.t[id] = BA(p2, id) / BA(p1, id);
        res.r[id] = (BA(g1, id) + BA(g2, id)) / (BA(p1, id) + BA(p2, id));
        res.rM[id] = 2 * BA(m1, id) / (BA(g1, id) + BA(g2, id));
        const ab = [BAB(g1, id), BAB(g2, id), BAB(p1, id), BAB(p2, id)];
        if (ab.every((v) => v !== null)) res.rAB[id] = (ab[0] + ab[1]) / (ab[2] + ab[3]);
        else if (ab.some((v) => v !== null)) stop.push(id + ' B/AB printed by some runs only');
        if (!inBand(res.t[id], BAND.twinLo, BAND.twinHi)) invalid.push(id + ' twin t=' + res.t[id].toFixed(4) + ' outside [' + BAND.twinLo + ', ' + BAND.twinHi + ']');
    }
    if (stop.length > 0) { res.status = 'STOP'; return res; }
    res.status = kill.length > 0 ? 'KILL' : invalid.length > 0 ? 'INVALID' : 'VALID';
    return res;
}
/** holdBand(summary) -> KILL reasons: a per-hold r (B/A, B/AB) outside [0.95, 1.05]. Applied to valid holds only. */
export function holdBand(s) {
    const out = [];
    for (const id of LANES) {
        if (!inBand(s.r[id], BAND.holdLo, BAND.holdHi)) out.push(id + ' r(B/A)=' + fx(s.r[id]) + ' outside [' + BAND.holdLo + ', ' + BAND.holdHi + ']');
        if (Object.hasOwn(s.rAB, id) && !inBand(s.rAB[id], BAND.holdLo, BAND.holdHi)) out.push(id + ' r(B/AB)=' + fx(s.rAB[id]) + ' outside [' + BAND.holdLo + ', ' + BAND.holdHi + ']');
    }
    return out;
}
/** decide(summaries, opts) -> { verdict, exit, reasons[], valid, attempts, med: { r, rAB, rM } }. Pure. */
export function decide(sums, opts = {}) {
    const reasons = [];
    const counted = sums.filter((s) => !s.excluded);
    const attempts = sums.length;
    const gs = new Set(counted.filter((s) => s.sha && HEX64.test(s.sha.G || '')).map((s) => s.sha.G));
    if (gs.size > 1) reasons.push('STOP G sha differs across holds: ' + [...gs].map((g) => g.slice(0, 8)).join(','));
    const nv = new Set(counted.map((s) => s.node));
    if (nv.size > 1) reasons.push('STOP Node differs across holds: ' + [...nv].join(','));
    const ns = counted.map((s) => s.n);
    if (new Set(ns).size !== ns.length) reasons.push('STOP hold number repeated: ' + ns.join(','));
    for (const s of counted) if (s.status === 'STOP') reasons.push('STOP hold ' + s.n + ': ' + s.stop.join(' | '));
    for (const s of counted) if (s.status === 'KILL') reasons.push('KILL hold ' + s.n + ': ' + s.kill.join(' | '));
    const valid = counted.filter((s) => s.status === 'VALID' || s.status === 'KILL').filter((s) => s.invalid.length === 0);
    for (const s of valid) for (const k of holdBand(s)) reasons.push('KILL hold ' + s.n + ': ' + k);
    const gVoid = counted.filter((s) => s.status !== 'STOP').reduce((a, s) => a + s.gVoidCleanP, 0);
    if (gVoid > G_VOID_MAX) reasons.push('KILL ' + gVoid + ' G VOIDs with a clean paired P (> ' + G_VOID_MAX + ')');
    const med = { r: {}, rAB: {}, rM: {} };
    if (valid.length > HOLDS) reasons.push('STOP ' + valid.length + ' valid holds (pre-registered ' + HOLDS + '; holds after a decision)');
    if (valid.length === HOLDS) {
        for (const id of LANES) {
            med.r[id] = median(valid.map((s) => s.r[id]));
            med.rM[id] = median(valid.map((s) => s.rM[id]));
            if (!inBand(med.r[id], BAND.medLo, BAND.medHi)) reasons.push('KILL ' + id + ' median r(B/A)=' + med.r[id].toFixed(4) + ' outside [' + BAND.medLo + ', ' + BAND.medHi + ']');
            const abs = valid.map((s) => s.rAB[id]);
            if (abs.every((v) => typeof v === 'number')) {
                med.rAB[id] = median(abs);
                if (!inBand(med.rAB[id], BAND.medLo, BAND.medHi)) reasons.push('KILL ' + id + ' median r(B/AB)=' + med.rAB[id].toFixed(4) + ' outside [' + BAND.medLo + ', ' + BAND.medHi + ']');
            } else if (abs.some((v) => typeof v === 'number')) reasons.push('STOP ' + id + ' B/AB present in some holds only');
            if (!(med.rM[id] > BAND.fire)) reasons.push('STOP mutant did not fire on ' + id + ': median r\'=' + med.rM[id].toFixed(4) + ' (want > ' + BAND.fire + ')');
        }
    }
    let verdict;
    if (reasons.some((r) => r.startsWith('STOP'))) verdict = 'STOP';
    else if (reasons.some((r) => r.startsWith('KILL'))) verdict = 'KILL';
    else if (valid.length < HOLDS || attempts > MAX_ATTEMPTS) {
        verdict = attempts >= MAX_ATTEMPTS ? 'NO VERDICT' : 'PENDING';
        reasons.push(verdict + ' ' + valid.length + '/' + HOLDS + ' valid holds after ' + attempts + ' attempt(s) (budget ' + MAX_ATTEMPTS + ')');
    } else verdict = 'PASS';
    const exit = verdict === 'PASS' ? 0 : verdict === 'KILL' ? 3 : verdict === 'STOP' ? 1 : 2;
    return { verdict, exit, reasons, valid: valid.length, attempts, med, gVoid };
}
/** judgeHolds(holds, opts) -> decide(holds.map(judgeHold)). holds: [{ outer, logs: {1..5} }]. */
export function judgeHolds(holds, opts = {}) {
    const sums = holds.map((h) => judgeHold(h, opts));
    return { ...decide(sums, opts), holds: sums };
}

// ---------------------------------------------------------------- mutant (TASK 3)
const MUT_LINE = /^([ \t]*)e\.ns\[x\] = \(T\[1\] - T\[0\]\) \* 1e6 \/ \(n \* e\.reps\);$/gm;
/** buildMutant(G text) -> M text: the timedRounds ns write (the line after `T[1] = performance.now();`) REPLACED by the
 *  same write x (e.col === 'B' ? MUT : 1) -- one line differs, line count unchanged. Branch-free on purpose: the
 *  calibration hold (U9 B1) showed an inserted `if (e.col === 'B') e.ns[x] *= 1.04;` is never reached while the tool
 *  arms timedRounds on its dummies, so TF compiles it as a deopt point and every M lane read VOID NOT-TF tool.
 *  Throws unless the anchor matches exactly once and `T[1] = performance.now();` is unique. */
export function buildMutant(text) {
    const hits = [...String(text).matchAll(MUT_LINE)];
    if (hits.length !== 1) throw new Error('buildMutant: anchor matched ' + hits.length + ' times (want exactly 1)');
    if (String(text).split('T[1] = performance.now();').length !== 2) throw new Error('buildMutant: T[1] clock read not unique');
    const h = hits[0];
    const line = h[1] + "e.ns[x] = (T[1] - T[0]) * 1e6 / (n * e.reps) * (e.col === 'B' ? " + MUT + ' : 1);   // U9 mutant M (bench/reproof.mjs buildMutant)';
    return text.slice(0, h.index) + line + text.slice(h.index + h[0].length);
}

// ---------------------------------------------------------------- hold runner (TASK 1; cold, spawns children)
function busyNodes() {
    try {
        const out = execFileSync('ps', ['-Ao', 'pcpu=,pid=,comm='], { encoding: 'utf8' });
        return out.split('\n').map((l) => l.trim()).filter((l) => { const f = l.split(/\s+/); return f.length >= 3 && /(^|\/)node$/.test(f.slice(2).join(' ')) && Number(f[0]) >= 10 && Number(f[1]) !== process.pid; }).join(' | ');
    } catch (e) { return 'ps failed: ' + e.message; }
}
function baselineLoad() {
    try { return String(JSON.parse(readFileSync(join(os.homedir(), '.claude', 'quiet-baseline.json'), 'utf8')).load1); } catch (e) { return 'none'; }
}
function stopNow(msg) { process.stderr.write('reproof: STOP ' + msg + '\n'); return 1; }
const ENV_DROP = Object.freeze(['LAB_INJECT', 'AB_GATE_INJECT', 'GITHUB_ACTIONS', 'NODE_OPTIONS']);
function childEnv() {
    const env = { ...process.env };
    for (const k of ENV_DROP) delete env[k];
    return env;
}
function parseArgs(argv, known) {
    const o = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!known.includes(a)) {
            const near = known.find((k) => k.slice(0, 4) === String(a).slice(0, 4));
            throw new Error('unknown flag ' + a + (near ? ' (did you mean ' + near + '?)' : '') + '; flags: ' + known.join(' '));
        }
        if (i + 1 >= argv.length) throw new Error(a + ' needs a value');
        if (Object.hasOwn(o, a)) throw new Error(a + ' given twice');
        o[a] = argv[++i];
    }
    return o;
}
export function holdMain(argv) {
    let a;
    try { a = parseArgs(argv, ['--hold', '--tool', '--tool-sha', '--out']); } catch (e) { return stopNow(e.message); }
    for (const k of ['--hold', '--tool', '--tool-sha', '--out']) if (!Object.hasOwn(a, k)) return stopNow('missing ' + k);
    const n = Number(a['--hold']);
    if (!/^\d+$/.test(a['--hold']) || !(n <= 99)) return stopNow('--hold must be an integer 0..99');
    if (!HEX64.test(a['--tool-sha'])) return stopNow('--tool-sha must be 64 lowercase hex');
    if (!(nodeMajor(process.version) >= 26)) return stopNow('Node ' + process.version + ' < 26 (C-31)');
    if (process.env.GITHUB_ACTIONS === 'true') return stopNow('GITHUB_ACTIONS=true: the R1 lane binds absolute LiteOhlc paths (C-17, C-35 local only)');
    const tool = resolve(a['--tool']);
    if (!existsSync(tool)) return stopNow('tool ' + tool + ' missing');
    if (realpathSync(tool) === realpathSync(join(ROOT, 'ABGate.js'))) return stopNow('the G tool is the LIVE ABGate.js; freeze the RC copy first (never a live main file as a tool under proof)');
    const gText = readFileSync(tool, 'utf8');
    const gSha = sha256(gText);
    if (gSha !== a['--tool-sha']) return stopNow('tool sha256 ' + gSha + ' != --tool-sha ' + a['--tool-sha']);
    const pins = { P: join(R1, 'ab-proto.mjs'), lane: join(R1, 'ohlc-lane.mjs'), ohlc: join(R1, 'frozen', 'Ohlc.js'), baseline: join(R1, 'frozen', 'baseline.mjs') };
    const shas = {};
    for (const k in pins) { shas[k] = sha256(readFileSync(pins[k])); if (shas[k] !== PIN[k]) return stopNow(k + ' ' + pins[k] + ' sha256 ' + shas[k] + ' != pinned ' + PIN[k]); }
    let mText;
    try { mText = buildMutant(gText); } catch (e) { return stopNow(e.message); }
    const gl = gText.split('\n'), ml = mText.split('\n');
    if (ml.length !== gl.length || gl.filter((l, i) => l !== ml[i]).length !== 1) return stopNow('M does not differ from G by exactly 1 line');
    const outDir = resolve(a['--out']);
    mkdirSync(outDir, { recursive: true });
    const prior = readdirSync(outDir).filter((d) => /^hold-\d+$/.test(d));
    if (prior.length >= MAX_ATTEMPTS) return stopNow(prior.length + ' hold attempts already in ' + outDir + ' (budget ' + MAX_ATTEMPTS + ')');
    const dir = join(outDir, 'hold-' + n);
    if (existsSync(dir)) return stopNow(dir + ' exists: a hold attempt is never overwritten');
    mkdirSync(dir);
    const mPath = join(dir, 'M-ABGate.js');
    writeFileSync(mPath, mText);
    const mSha = sha256(mText);
    if (mSha === gSha) return stopNow('M == G');
    const tools = { P: pins.P, G: tool, M: mPath };
    shas.G = gSha; shas.M = mSha; shas.harness = sha256(readFileSync(ME));
    const order = ORDER(n);
    const lines = [];
    const put = (s) => { lines.push(s); writeFileSync(join(dir, 'outer.log'), lines.join('\n') + '\n'); process.stdout.write(s + '\n'); };
    const la = () => os.loadavg().map((x) => x.toFixed(2)).join(' ');
    put('OUTER u9-reproof hold=' + n + ' order=' + order.join(','));
    put('DATE ' + new Date().toISOString());
    put('HOST platform=' + process.platform + ' arch=' + process.arch + ' cores=' + os.cpus().length + ' cpu=' + (os.cpus()[0] ? os.cpus()[0].model : 'unknown'));
    put('NODE ' + process.version + ' v8 ' + process.versions.v8);
    put('LOAD start ' + la() + ' baseline ' + baselineLoad() + ' quiet-lock ' + (process.env.QUIET_LOCK_HOST || 'none'));
    put('WHY ' + (process.env.QUIET_LOCK_WHY || 'none'));
    put('BUSY start [' + busyNodes() + ']');
    put('SHA P ' + shas.P + ' ' + tools.P);
    put('SHA G ' + shas.G + ' ' + tools.G);
    put('SHA M ' + shas.M + ' ' + tools.M);
    for (const k of ['lane', 'ohlc', 'baseline', 'harness']) put('SHA ' + k + ' ' + shas[k]);
    put('RUNS 5 flags ' + REQUIRED_FLAGS.join(' ') + ' cwd ' + R1);
    put('ENV deleted for every child: ' + ENV_DROP.map((k) => k + (Object.hasOwn(process.env, k) ? '(was set)' : '(unset)')).join(' '));
    const logs = {};
    for (let i = 1; i <= 5; i++) {
        const role = order[i - 1];
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [...REQUIRED_FLAGS, tools[role], 'ohlc-lane.mjs', '--run', 'ALL'], { cwd: R1, env: childEnv(), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 });
        const ms = Date.now() - t0;
        const text = r.stdout || '';
        const logPath = join(dir, i + '-' + role + '.log');
        writeFileSync(logPath, text);
        logs[i] = text;
        put('CHILD ' + i + ' ' + role + ' exit ' + (r.status === null ? 'signal-' + r.signal : r.status) + ' ms ' + ms + ' stderr-bytes ' + (r.stderr || '').length + ' log-sha256 ' + sha256(text));
        if (r.stderr) put('STDERR ' + i + ' ' + role + ' ' + JSON.stringify(r.stderr.slice(0, 600)));
        if (r.status !== 0 && r.status !== 2 && r.status !== 3) { put('ABORT child ' + i + '-' + role + ' exit ' + r.status); return 1; }
        const v = spawnSync(process.execPath, [...REQUIRED_FLAGS, tools[role], 'ohlc-lane.mjs', '--verdict-file', logPath], { cwd: R1, env: childEnv(), encoding: 'utf8', maxBuffer: 1 << 24, timeout: 120000 });
        const vw = (/^VERDICT (PASS|FINDING|NO VERDICT)\b/m.exec(v.stdout || '') || [])[1] || 'none';
        const cw = (/^VERDICT (PASS|FINDING|NO VERDICT)\b/m.exec(text) || [])[1] || 'none';
        put('REJUDGE ' + i + ' ' + role + ' exit ' + v.status + ' verdict ' + vw + ' match ' + (v.status === r.status && vw === cw && vw !== 'none' ? 'yes' : 'no'));
    }
    put('LOAD end ' + la());
    put('BUSY end [' + busyNodes() + ']');
    const s = judgeHold({ outer: lines.join('\n') + '\n', logs }, { gSha: a['--tool-sha'] });
    for (const id of LANES) put('JUDGE lane ' + id + ' r=' + fx(s.r[id]) + ' rAB=' + fx(s.rAB[id]) + ' t=' + fx(s.t[id]) + ' rM=' + fx(s.rM[id]));
    for (const x of s.stop) put('JUDGE stop ' + x);
    for (const x of s.invalid) put('JUDGE invalid ' + x);
    const band = s.status === 'VALID' ? holdBand(s) : [];
    for (const x of [...s.kill, ...band]) put('JUDGE kill ' + x);
    const st = band.length > 0 ? 'KILL' : s.status;
    put('JUDGE hold ' + n + ' ' + st);
    return st === 'VALID' ? 0 : st === 'INVALID' ? 2 : st === 'KILL' ? 3 : 1;
}

// ---------------------------------------------------------------- judge CLI (TASK 2; pure, untimed)
export function readHolds(dir) {
    const holds = [];
    for (const d of readdirSync(dir).filter((x) => /^hold-\d+$/.test(x)).sort()) {
        const hd = join(dir, d), logs = {};
        for (const f of readdirSync(hd)) { const m = /^([1-5])-[PGM]\.log$/.exec(f); if (m !== null) logs[Number(m[1])] = readFileSync(join(hd, f), 'utf8'); }
        holds.push({ outer: existsSync(join(hd, 'outer.log')) ? readFileSync(join(hd, 'outer.log'), 'utf8') : '', logs });
    }
    return holds;
}
export function judgeMain(argv) {
    let a;
    try { a = parseArgs(argv, ['--judge', '--tool-sha']); } catch (e) { return stopNow(e.message); }
    if (!HEX64.test(a['--tool-sha'] || '')) return stopNow('--judge requires --tool-sha <64 lowercase hex> (the frozen RC G)');
    const opts = { harnessSha: sha256(readFileSync(ME)), gSha: a['--tool-sha'] };
    const j = judgeHolds(readHolds(resolve(a['--judge'])), opts);
    for (const s of j.holds) {
        process.stdout.write('HOLD ' + s.n + ' ' + s.status + (s.excluded ? ' (EXCLUDED: harness changed)' : '') + '\n');
        for (const id of LANES) process.stdout.write('  ' + id + ' r=' + fx(s.r[id]) + ' rAB=' + fx(s.rAB[id]) + ' t=' + fx(s.t[id]) + ' rM=' + fx(s.rM[id]) + '\n');
        for (const x of [...s.stop, ...s.invalid, ...s.kill]) process.stdout.write('  - ' + x + '\n');
    }
    for (const id of LANES) process.stdout.write('MEDIAN ' + id + ' r=' + fx(j.med.r[id]) + ' rAB=' + fx(j.med.rAB[id]) + ' rM=' + fx(j.med.rM[id]) + '\n');
    for (const r of j.reasons) process.stdout.write('REASON ' + r + '\n');
    process.stdout.write('U9 ' + j.verdict + ' valid=' + j.valid + '/' + HOLDS + ' attempts=' + j.attempts + ' gVoidCleanP=' + j.gVoid + '\n');
    return j.exit;
}

function isMain() { try { return typeof process.argv[1] === 'string' && realpathSync(process.argv[1]) === realpathSync(ME); } catch (e) { return false; } }
if (isMain()) {
    const argv = process.argv.slice(2);
    try {
        process.exitCode = argv[0] === '--judge' ? judgeMain(argv) : argv[0] === '--hold' ? holdMain(argv) : stopNow('usage: reproof.mjs --hold <n> --tool <path> --tool-sha <64hex> --out <dir> | --judge <dir> --tool-sha <64hex>');
    } catch (e) { process.stderr.write('reproof: CRASH ' + (e && e.stack) + '\n'); process.exitCode = 1; }
}
