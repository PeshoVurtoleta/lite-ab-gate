// test/torture.mjs -- lite-ab-gate rung E2 torture (plan-GA TASK 8, ASSERTIONS 1-2). Run via `npm run torture`; the
// package script owns the node flags (= ABGate's REQUIRED_FLAGS; checked below, fail closed).
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. ASCII only.
//
// T1 GC budget (DETERMINISTIC allocation COUNTS; the run is timed, so it goes through quiet-lock like any timed run):
//   A WINDOW line whose tool-bytes is not an integer (NaN = unmeasured) matches no WINDOW line: the row fails.
//   3 in-process runGate(toy, { run: 'toy:clean', K: 3 }) runs: each prints exactly one WINDOW line, tool-bytes=0
//   scavenges=0, no VOID GC-WINDOW, no VOID NOT-TF, no STOP / CRASH, exit 2 (a subset run is NO VERDICT (run shape)).
//   Controls that MUST read red (each makes the torture exit 1 if it does not):
//   - boxed      AB_GATE_INJECT=boxed (B boxes one HeapNumber per op): tool-bytes >= 16 x 4 x 12 = 768.
//   - tool-deopt AB_GATE_INJECT=tool-deopt in a child (it pins timedRounds out of TF, inside the window, for the whole
//                process): tool-bytes >= 2 x 16 x 4 x 12 = 1536 and `VOID NOT-TF lane=toy:clean: NOT-TF tool` with
//                `(TF at window start true, end false)` (isolates the end-of-window check).
//   - baseline   the frozen pre-E2 loop (ab-proto 74f1a3d4, sha-checked; its timed closure is byte-identical to
//                ABGate fc7f6663's) with the SAME window probe spliced in (the tool's own windowProbe text):
//                >= 2688 x 4 = 10752 B (census (b), U2, measured on ab-proto, never on the code under test; 2688 is
//                ab-proto's own 12 entries x 224 B per round, a literal, never derived from C_COPIES).
// T2 retention: 20 cycles of runGate(toy, { oracleOnly: true, out }), each `out` tracked by @zakkster/lite-leak
//   (cleanup null, tag a string: neither closes over `out`): tracker.size() === 0 after GC. Must-fail control: the
//   20 outs kept in an array -> size() reads 20.
// T-SETTLE (U9E plan TASK 6, A3; C-48): 3 fresh children of the tool on test/fixtures/settle/r1-frozen.gate.mjs (the
//   R1 lane bounds:1e5:1e5, frozen only, relative paths), K=3. Each: exit 2; exactly 1 SETTLE line and it reads
//   `settled=yes` with passes <= 3, one pass-bytes value per pass, the last exactly 0 and pass 1 > 0 (the non-vacuous
//   tier witness, law 3: a lane already settled before the first pass proves nothing, so a pass-1 read of 0 FAILS);
//   exactly 1 WINDOW line tool-bytes=0 scavenges=0; 0 B/op over 4 rounds x 15 entries (the RESULT bop columns x C);
//   no VOID GC-WINDOW / TIER-SETTLE / NOT-TF; no STOP / CRASH.
//   Must-fail control (on the R1 lane: toy:clean reads 0 B even unsettled, burst 8): AB_GATE_INJECT=no-settle prints
//   the skipped marker (and no settled= line) and WINDOW tool-bytes > 0. Revert: a pre-U9E build prints no SETTLE line.
// settle-void (A4): AB_GATE_INJECT=settle-void on toy:clean K=3 in a child: exit 2; exactly 1 SETTLE line passes=3
//   settled=no; exactly 1 `VOID TIER-SETTLE` line whose 3 pass-bytes values are each parsed and each > 0 (the tool's
//   own marker regex also accepts NaN) and equal the SETTLE line's; RESULT VOID=[..TIER-SETTLE..]; exactly 1 WINDOW
//   line (one window, no re-run, C-7); VERDICT NO VERDICT. A K=3 toy:clean --run already reads NO VERDICT (run shape) with
//   or without the VOID, so the VOID's verdict effect is gated by judge.extra's C-48 rows, not here.
// T2b (A6): 5 in-process TIMED runGate(toy, { run: 'toy:clean', K: 3, out }) runs, each `out` tracked (cleanup null,
//   tag a string): tracker.size() === 0 after GC, each exit 2. Must-fail control: the 5 outs kept -> size() reads 5.
// The GATE line's gc numbers come from @zakkster/lite-gc-profiler over the 3 T1 runs: REPORTED only (the tool forces
// its own collections: gcControl, gcWindow, the B/op windows), never gated here.
// AB_TORTURE_TOOL=<path> runs every row against another build (revert check: the frozen pre-E2 build must fail).
// Node >= 26 only (C-31): below 26 performance.now() boxes 16 B per read, so the zero-tool-bytes WINDOW row cannot
// hold; the guard below exits 1 (never skips, never exit 0) before the tool import and before any measurement.

import { GcProfiler } from '@zakkster/lite-gc-profiler';
import { createLeakTracker, createOwnerCascadeOrphanKernel } from '@zakkster/lite-leak';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ---- C-31 node-major guard: fail closed (an unparsable version reads NaN and exits 1 too) -------------------------
const NODE_SEEN = String(process.versions.node);
const NODE_MAJOR = Number((/^(\d+)\.\d+\.\d+/.exec(NODE_SEEN) || [])[1]);
if (!(NODE_MAJOR >= 26)) {
    console.error('TORTURE FAIL C-31: node >= 26 required (below 26 performance.now() boxes 16 B per read, so the ' +
        'zero-tool-bytes WINDOW row cannot hold); node seen ' + NODE_SEEN + ' (major ' + NODE_MAJOR + ')');
    process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = process.env.AB_TORTURE_TOOL ? resolve(process.env.AB_TORTURE_TOOL) : resolve(HERE, '..', 'ABGate.js');
const TOY_DIR = join(HERE, 'fixtures', 'toy');
const TOY = join(TOY_DIR, 'toy-lane.mjs');
const PROTO = join(HERE, 'fixtures', 'r1', 'ab-proto.mjs');
const PROTO_SHA = '74f1a3d41e72e83fd5690bdae9005ce5dbf200ab05b906ca4249cb427d1068c4';
const LANE = 'toy:clean';
const K = 3;
const RUNS = 3;
const CYCLES = 20;
const WINDOW_RE = /^WINDOW lane=(\S+) tool-bytes=(-?\d+) scavenges=(\d+)$/;
const SETTLE_GATE = join(HERE, 'fixtures', 'settle', 'r1-frozen.gate.mjs');
const SETTLE_LANE = 'bounds:1e5:1e5';
const SETTLE_RUNS = 3;
const SETTLE_ENTRIES = 15;                  // the R1 lane's 5 bop columns (A B AA SLOW AB: reps differ) x C 3, a literal
const T2B_RUNS = 5;
// the tool's SETTLE grammar (C-48 / A14), retyped here (never imported from the tool): 1-3 pass-bytes values
const SETTLE_RE = /^SETTLE lane=(\S+) passes=(\d+) pass-bytes=(\S+) settled=(yes|no)$/;
const SKIP_RE = /^SETTLE lane=(\S+) skipped \(AB_GATE_INJECT=no-settle\)$/;
const TSV_RE = /^VOID TIER-SETTLE lane=(\S+): TIER-SETTLE pass-bytes (\S+) \(cap 3, none read exactly 0\)$/;

const { runGate, REQUIRED_FLAGS, C_COPIES } = await import(pathToFileURL(TOOL).href);
const ENTRIES = 4 * C_COPIES;               // toy:clean: reps A = B (256), no AB column -> 4 columns x C (the toy declares no C)
const BOX_MIN = 16 * (K + 1) * ENTRIES;     // 768: one 16 B HeapNumber per live entry per round
const DEOPT_MIN = 2 * 16 * (K + 1) * ENTRIES;   // 1536: two interpreted clock boxes per live entry per round
// BASE_MIN floor: 2688 = ab-proto's own 12 entries per round x 224 B (census (b), U2, measured on ab-proto). Deliberately
// NOT derived from C_COPIES / ENTRIES: the floor must not move with the code under test.
const BASE_MIN = 2688 * (K + 1);            // 10752
const rows = [];
function row(ok, name, txt) {
    rows.push({ ok, name });
    console.log((ok ? 'ok   ' : 'FAIL ') + name + ' ' + txt);
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
function windowsOf(text) {
    const out = [];
    for (const l of text.split('\n')) {
        const m = WINDOW_RE.exec(l);
        if (m !== null) out.push({ lane: m[1], bytes: Number(m[2]), scav: Number(m[3]) });
    }
    return out;
}
const has = (text, re) => text.split('\n').some((l) => re.test(l));
const settle = (ms) => new Promise((r) => { setTimeout(r, ms); });
function sinkOut() { return { text: '', write(s) { this.text += s; return true; } }; }
async function gateRun(opts) {
    const out = sinkOut();
    const code = await runGate(TOY, { ...opts, out });
    return { code, text: out.text };
}
function child(file, args, env) {
    const e = { ...process.env, ...env };
    if (env.AB_GATE_INJECT === undefined) delete e.AB_GATE_INJECT;
    delete e.AB_TORTURE_TOOL;
    const r = spawnSync(process.execPath, [...REQUIRED_FLAGS, file, ...args], { cwd: TOY_DIR, env: e, encoding: 'utf8', timeout: 300000 });
    return { code: r.status, text: (r.stdout || '') + (r.stderr || '') };
}

console.log('TORTURE tool ' + TOOL + ' sha256 ' + sha256(readFileSync(TOOL)).slice(0, 8) + ' node ' + process.version +
    ' flags ' + process.execArgv.join(' '));
const missing = (REQUIRED_FLAGS || []).filter((f) => !process.execArgv.includes(f));
row(Array.isArray(REQUIRED_FLAGS) && missing.length === 0, 'flags', 'REQUIRED_FLAGS present (missing: ' + (missing.join(' ') || 'none') + ')');
if (missing.length > 0 || typeof globalThis.gc !== 'function') {
    console.log('TORTURE FAIL: run through `npm run torture` (the script owns the flags)');
    process.exit(1);
}
delete process.env.AB_GATE_INJECT;

// ---- T1: GC budget over the timed window --------------------------------------------------------------------------
const gcp = new GcProfiler().start();
let maxBytes = -Infinity, entriesSeen = -1;
for (let i = 0; i < RUNS; i++) {
    const r = await gateRun({ run: LANE, K });
    const w = windowsOf(r.text);
    const res = r.text.split('\n').find((l) => l.startsWith('RESULT lane=' + LANE + ' ')) || '';
    const bop = (/ bop=(\S+)/.exec(res) || [])[1];
    const cols = bop === undefined ? 0 : bop.split(',').length;
    entriesSeen = cols * C_COPIES;
    const gcWin = has(r.text, /^VOID GC-WINDOW /), notTf = has(r.text, /^VOID NOT-TF /), stopped = has(r.text, /^(STOP|CRASH) /);
    for (const x of w) if (x.bytes > maxBytes) maxBytes = x.bytes;
    const ok = r.code === 2 && w.length === 1 && w[0].lane === LANE && w[0].bytes === 0 && w[0].scav === 0 && !gcWin && !notTf && !stopped && cols === 4;
    row(ok, 'T1 run ' + (i + 1) + '/' + RUNS, 'exit ' + r.code + ' (want 2) WINDOW lines ' + w.length + ' (want 1)' +
        w.map((x) => ' [lane=' + x.lane + ' tool-bytes=' + x.bytes + ' scavenges=' + x.scav + ']').join('') + ' (want 0 / 0)' +
        ' VOID GC-WINDOW ' + gcWin + ' VOID NOT-TF ' + notTf + ' STOP/CRASH ' + stopped + ' bop columns ' + cols + ' (want 4)');
}
await settle(50);
const gs = gcp.summary();
gcp.stop();

// control: boxed (in-process; the injection only changes column B's compiled text)
process.env.AB_GATE_INJECT = 'boxed';
const rb = await gateRun({ run: LANE, K });
delete process.env.AB_GATE_INJECT;
const wb = windowsOf(rb.text);
const boxRed = wb.length === 1 && wb[0].bytes >= BOX_MIN;
row(boxRed, 'T1 control boxed (must read red)', 'exit ' + rb.code + ' WINDOW ' + wb.map((x) => 'tool-bytes=' + x.bytes + ' scavenges=' + x.scav).join(' | ') +
    ' (want 1 line, tool-bytes >= ' + BOX_MIN + ' = 16 x ' + (K + 1) + ' x ' + ENTRIES + ') -> ' + (boxRed ? 'red' : 'NOT RED'));

// control: tool-deopt (child: %NeverOptimizeFunction(timedRounds) is permanent for the process)
const rd = child(TOOL, [TOY, '--run', LANE, '--K', String(K)], { AB_GATE_INJECT: 'tool-deopt' });
const wd = windowsOf(rd.text);
const deoptVoid = has(rd.text, /^VOID NOT-TF lane=toy:clean: NOT-TF tool /);
const deoptMid = has(rd.text, /\(TF at window start true, end false\)/);
const deoptRed = wd.length === 1 && wd[0].bytes >= DEOPT_MIN && deoptVoid && deoptMid;
row(deoptRed, 'T1 control tool-deopt (must read red)', 'exit ' + rd.code + ' WINDOW ' + wd.map((x) => 'tool-bytes=' + x.bytes + ' scavenges=' + x.scav).join(' | ') +
    ' (want 1 line, >= ' + DEOPT_MIN + ' = 2 x 16 x ' + (K + 1) + ' x ' + ENTRIES + ') VOID NOT-TF tool ' + deoptVoid + ' (TF at window start true, end false) ' + deoptMid + ' -> ' + (deoptRed ? 'red' : 'NOT RED'));

// control: the frozen pre-E2 loop under the same probe (census (b) shape: 3000 + 2688 x (K + 1) B raw, closure boxes)
let baseTxt, baseRed = false;
const proto = readFileSync(PROTO);
const toolText = readFileSync(TOOL, 'utf8');
const pStart = toolText.indexOf('const WIN = new Float64Array(4);'), pFn = toolText.indexOf('function windowProbe(fn) {');
const pEnd = pFn < 0 ? -1 : toolText.indexOf('\n}\n', pFn);
if (sha256(proto) !== PROTO_SHA) baseTxt = 'ab-proto sha256 ' + sha256(proto).slice(0, 8) + ' (want ' + PROTO_SHA.slice(0, 8) + ')';
else if (pStart < 0 || pFn < pStart || pEnd < 0) baseTxt = 'no windowProbe in the tool under test (the probe is spliced from it)';
else {
    const probe = toolText.slice(pStart, pEnd + 3);
    let p = proto.toString('utf8');
    const edits = [
        ['async function gcWindow(fn) {', probe + 'async function gcWindow(fn) {'],
        ['    const w = await gcWindow(() => {\n        for (let x = 0; x < KR; x++) {',
            '    let __win = null;\n    const w = await gcWindow(() => { __win = windowProbe(() => {\n        for (let x = 0; x < KR; x++) {'],
        ['        }\n    });\n    if (inject === \'post-bend\') LATE[0] = 1;',
            '        }\n    }); });\n    say(\'WINDOW lane=\' + L.id + \' tool-bytes=\' + __win.bytes + \' scavenges=\' + __win.scavenges);\n    if (inject === \'post-bend\') LATE[0] = 1;'],
    ];
    const bad = edits.filter(([from]) => p.split(from).length !== 2).map(([from]) => JSON.stringify(from.slice(0, 40)));
    if (bad.length > 0) baseTxt = 'patch anchors not unique in ab-proto: ' + bad.join(', ');
    else {
        for (const [from, to] of edits) p = p.replace(from, () => to);
        const dir = mkdtempSync(join(tmpdir(), 'ab-gate-torture-'));
        try {
            const f = join(dir, 'ab-proto-window.mjs');
            writeFileSync(f, p);
            const r = child(f, ['toy-lane.mjs', '--run', LANE, '--K', String(K)], {});
            const w = windowsOf(r.text);
            baseRed = r.code === 2 && w.length === 1 && w[0].bytes >= BASE_MIN;
            baseTxt = 'exit ' + r.code + ' (want 2) WINDOW ' + w.map((x) => 'tool-bytes=' + x.bytes + ' scavenges=' + x.scav).join(' | ') +
                ' (want 1 line, >= ' + BASE_MIN + ' = 2688 x ' + (K + 1) + '; census (b) raw 3000 + 2688 x ' + (K + 1) + ' = ' + (3000 + 2688 * (K + 1)) + ' B before the probe intercept)';
        } finally { rmSync(dir, { recursive: true, force: true }); }
    }
}
row(baseRed, 'T1 baseline frozen pre-E2 loop (must read red)', baseTxt + ' -> ' + (baseRed ? 'red' : 'NOT RED'));

// ---- T-SETTLE (A3) + settle-void (A4): C-48 settle passes, each run in a fresh child ---------------------------------
const linesOf = (text) => text.split('\n');
// one comma list of pass-bytes values -> numbers; every value must be an integer or NaN (an empty or other token -> null)
function passBytes(s) {
    const v = s.split(',');
    return v.every((x) => /^(?:-?\d+|NaN)$/.test(x)) ? v.map(Number) : null;
}
function settleLines(text) {
    const all = linesOf(text).filter((l) => l.startsWith('SETTLE '));
    const parsed = [];
    for (const l of all) {
        const m = SETTLE_RE.exec(l);
        if (m !== null) parsed.push({ lane: m[1], passes: Number(m[2]), pb: passBytes(m[3]), pbText: m[3], settled: m[4] });
    }
    return { all, parsed, skipped: all.filter((l) => SKIP_RE.test(l)) };
}
const voidsOf = (text, kind) => linesOf(text).filter((l) => l.startsWith('VOID ' + kind + ' '));
for (let i = 0; i < SETTLE_RUNS; i++) {
    const r = child(TOOL, [SETTLE_GATE, '--run', SETTLE_LANE, '--K', String(K)], {});
    const s = settleLines(r.text), w = windowsOf(r.text);
    const p = s.parsed.length === 1 ? s.parsed[0] : null;
    const pbOk = p !== null && p.pb !== null && p.pb.length === p.passes;
    const settledOk = p !== null && p.lane === SETTLE_LANE && p.settled === 'yes' && p.passes >= 1 && p.passes <= 3 && pbOk &&
        p.pb[p.passes - 1] === 0 && p.pb[0] > 0 && p.pb.every((x, j) => (x === 0) === (j === p.passes - 1));   // C-48: only the LAST pass reads 0
    const res = linesOf(r.text).find((l) => l.startsWith('RESULT lane=' + SETTLE_LANE + ' ')) || '';
    const bop = (/ bop=(\S+)/.exec(res) || [])[1];
    const ents = bop === undefined ? 0 : bop.split(',').length * C_COPIES;
    const wOk = w.length === 1 && w[0].lane === SETTLE_LANE && w[0].bytes === 0 && w[0].scav === 0;
    const bopw = w.length === 1 && ents > 0 ? w[0].bytes / ((K + 1) * ents) : NaN;
    const gcWin = voidsOf(r.text, 'GC-WINDOW').length, tsv = voidsOf(r.text, 'TIER-SETTLE').length, notTf = voidsOf(r.text, 'NOT-TF').length;
    const stopped = has(r.text, /^(STOP|CRASH) /);
    const ok = r.code === 2 && s.all.length === 1 && settledOk && wOk && ents === SETTLE_ENTRIES && bopw === 0 && gcWin === 0 && tsv === 0 && notTf === 0 && !stopped;
    row(ok, 'T-SETTLE run ' + (i + 1) + '/' + SETTLE_RUNS, 'exit ' + r.code + ' (want 2) SETTLE lines ' + s.all.length + ' (want 1)' +
        (p === null ? '' : ' [lane=' + p.lane + ' passes=' + p.passes + ' pass-bytes=' + p.pbText + ' settled=' + p.settled + ']') +
        ' (want settled=yes, passes <= 3, one value per pass, only the last 0, pass 1 > 0) WINDOW lines ' + w.length + ' (want 1)' +
        w.map((x) => ' [lane=' + x.lane + ' tool-bytes=' + x.bytes + ' scavenges=' + x.scav + ']').join('') + ' (want 0 / 0)' +
        ' B/op ' + bopw + ' over ' + (K + 1) + ' rounds x ' + ents + ' entries (want 0 over ' + (K + 1) + ' x ' + SETTLE_ENTRIES + ')' +
        ' VOID GC-WINDOW ' + gcWin + ' TIER-SETTLE ' + tsv + ' NOT-TF ' + notTf + ' (want 0) STOP/CRASH ' + stopped);
}
const rns = child(TOOL, [SETTLE_GATE, '--run', SETTLE_LANE, '--K', String(K)], { AB_GATE_INJECT: 'no-settle' });
const sns = settleLines(rns.text), wns = windowsOf(rns.text);
const nsRed = sns.skipped.length === 1 && sns.all.length === 1 && sns.parsed.length === 0 && wns.length === 1 && wns[0].lane === SETTLE_LANE && wns[0].bytes > 0;
row(nsRed, 'T-SETTLE control no-settle on ' + SETTLE_LANE + ' (must read red)', 'exit ' + rns.code + ' skipped markers ' + sns.skipped.length +
    ' SETTLE lines ' + sns.all.length + ' settled= lines ' + sns.parsed.length + ' (want 1 / 1 / 0) WINDOW ' +
    wns.map((x) => 'tool-bytes=' + x.bytes + ' scavenges=' + x.scav).join(' | ') + ' (want 1 line, tool-bytes > 0) -> ' + (nsRed ? 'red' : 'NOT RED'));
// settle-void (A4): one function frame for the row (flat module code, no bare scope block)
function settleVoidRow() {
    const r = child(TOOL, [TOY, '--run', LANE, '--K', String(K)], { AB_GATE_INJECT: 'settle-void' });
    const s = settleLines(r.text), w = windowsOf(r.text);
    const p = s.parsed.length === 1 ? s.parsed[0] : null;
    const tl = voidsOf(r.text, 'TIER-SETTLE');
    const tm = tl.length === 1 ? TSV_RE.exec(tl[0]) : null;
    const tv = tm === null ? null : passBytes(tm[2]);
    const tvOk = tm !== null && tm[1] === LANE && tv !== null && tv.length === 3 && tv.every((x) => x > 0);
    const sOk = p !== null && s.all.length === 1 && p.lane === LANE && p.passes === 3 && p.settled === 'no' && tm !== null && p.pbText === tm[2];
    const res = linesOf(r.text).find((l) => l.startsWith('RESULT lane=' + LANE + ' ')) || '';
    // the VOID list as runLane prints it (the line's last field: ' VOID=[' + voids.join('; ') + ']'); items carry their own [..] ranges
    const vm = / VOID=\[(.*)\]$/.exec(res);
    const resVoid = vm !== null && vm[1].split('; ').some((x) => x.startsWith('TIER-SETTLE pass-bytes '));
    const verdict = linesOf(r.text).filter((l) => l.startsWith('VERDICT '));
    // K=3 --run reads NO VERDICT (run shape) with or without the VOID: the VOID's verdict effect is gated in judge.extra (C-48 rows)
    const vOk = verdict.length === 1 && verdict[0].startsWith('VERDICT NO VERDICT');
    const stopped = has(r.text, /^(STOP|CRASH) /);
    const ok = r.code === 2 && tvOk && sOk && resVoid && w.length === 1 && w[0].lane === LANE && vOk && !stopped;
    row(ok, 'settle-void (A4)', 'exit ' + r.code + ' (want 2) VOID TIER-SETTLE lines ' + tl.length + ' (want 1) values ' + (tv === null ? '(unparsed)' : tv.join(',')) +
        ' (want exactly 3, each > 0) SETTLE ' + (p === null ? s.all.length + ' lines' : 'passes=' + p.passes + ' pass-bytes=' + p.pbText + ' settled=' + p.settled) +
        ' (want 1 line, passes=3 settled=no, the VOID\'s values) RESULT VOID=[..TIER-SETTLE..] ' + resVoid + ' WINDOW lines ' + w.length + ' (want 1)' +
        ' VERDICT ' + (verdict.length === 1 ? JSON.stringify(verdict[0].slice(0, 40)) : verdict.length + ' lines') + ' (want 1, NO VERDICT) STOP/CRASH ' + stopped);
}
settleVoidRow();

// ---- T2: retention of `out` across oracle-only runs ---------------------------------------------------------------
const warns = [];
let collected = 0;
async function retention(keep) {
    const tracker = createLeakTracker({ name: keep ? 'ab-gate-keep' : 'ab-gate-out', onLeak: () => { collected++; }, onWarning: (w) => warns.push(w.kind + ':' + w.reason) });
    tracker.registerKernel(createOwnerCascadeOrphanKernel());
    const kept = [];
    let codes = '';
    // one cycle per call: `out` lives only in this frame (never in the loop's suspended registers)
    const cycle = async (i) => {
        const out = sinkOut();
        const code = await runGate(TOY, { oracleOnly: true, out });
        tracker.track(out, null, 'out#' + i);
        if (keep) kept.push(out);
        return code;
    };
    for (let i = 0; i < CYCLES; i++) {
        const code = await cycle(i);
        if (code !== 0) codes += ' cycle ' + i + ' exit ' + code;
    }
    for (let a = 0; a < 20 && tracker.size() > 0; a++) { globalThis.gc(); await settle(20); }
    const size = tracker.size(), findings = tracker.audit().length;
    kept.length = 0;
    return { size, findings, codes };
}
const c0 = collected;
const t2 = await retention(false);
const freed = collected - c0;
row(t2.size === 0 && t2.codes === '' && t2.findings === 0, 'T2 retention', CYCLES + ' oracle-only runs: tracker.size()=' + t2.size + ' (want 0) collected=' + freed +
    ' findings=' + t2.findings + (t2.codes === '' ? ' every exit 0' : t2.codes));
const t2c = await retention(true);
const keepRed = t2c.size === CYCLES;
row(keepRed, 'T2 control retained (must read red)', 'outs kept in an array: tracker.size()=' + t2c.size + ' (want ' + CYCLES + ') -> ' + (keepRed ? 'red' : 'NOT RED'));

// ---- T2b (A6): retention of `out` across TIMED runs (the settle passes, the window, the B/op lane) -----------------
async function retentionTimed(keep) {
    const tracker = createLeakTracker({ name: keep ? 'ab-gate-timed-keep' : 'ab-gate-timed', onLeak: () => {}, onWarning: (w) => warns.push(w.kind + ':' + w.reason) });
    tracker.registerKernel(createOwnerCascadeOrphanKernel());
    const kept = [];
    let codes = '';
    // one run per call: `out` lives only in this frame (never in the loop's suspended registers)
    const cycle = async (i) => {
        const out = sinkOut();
        const code = await runGate(TOY, { run: LANE, K, out });
        tracker.track(out, null, 'timed-out#' + i);
        if (keep) kept.push(out);
        return code;
    };
    for (let i = 0; i < T2B_RUNS; i++) {
        const code = await cycle(i);
        if (code !== 2) codes += ' run ' + i + ' exit ' + code;
    }
    for (let a = 0; a < 20 && tracker.size() > 0; a++) { globalThis.gc(); await settle(20); }
    const size = tracker.size(), findings = tracker.audit().length;
    kept.length = 0;
    return { size, findings, codes };
}
const t2b = await retentionTimed(false);
row(t2b.size === 0 && t2b.codes === '' && t2b.findings === 0, 'T2b timed retention', T2B_RUNS + ' timed ' + LANE + ' K=' + K + ' runs: tracker.size()=' + t2b.size +
    ' (want 0) findings=' + t2b.findings + (t2b.codes === '' ? ' every exit 2' : t2b.codes));
const t2bc = await retentionTimed(true);
const keepRedB = t2bc.size === T2B_RUNS;
row(keepRedB, 'T2b control retained (must read red)', 'outs kept in an array: tracker.size()=' + t2bc.size + ' (want ' + T2B_RUNS + ') -> ' + (keepRedB ? 'red' : 'NOT RED') +
    (t2bc.codes === '' ? '' : ' (' + t2bc.codes.trim() + ')'));

// ---- A5 (G-B B4, plan-GB ASSERTION A5): allocRow + judge retention over the 114 judge rows -------------------------
// DETERMINISTIC count rows (no timing claim). (a) allocRow, read from the tool's own `--selftest-untimed` allocBop row
//   (allocRow is module-private): the scavenging window reads Infinity, the clean window a finite B/op in [0, 1/64),
//   and the tool's own exact check printed `-> ok`. (b) 200 cycles x 114 rows = verdictOf on the 55 golden parity rows
//   (legacy dialect, logs rebuilt with ab-gate 7e0f9262's applyMut and checked against golden textSha) + the 59
//   judge.rows rows (tool dialect; the table is sliced from test/judge.rows.test.mjs, never retyped): every result
//   tracked by lite-leak (cleanup null, tag a string: neither closes over the result) -> tracker.size() === 0 after GC;
//   every code equals its row's expected exit; the judge writes nothing (stdout / stderr write calls during the loop 0:
//   ab-proto's module LOG became per-run ctx.log, verdictOf has no log) and leaves every input LOG (lines array)
//   unchanged in length and content. Must-fail control: the same loop keeping every result -> size() === 22800.
const A5_CYCLES = 200;
const JL_GATE = join(HERE, 'fixtures', 'judge-lane', 'frozen-only.gate.mjs');
const rs = child(TOOL, [JL_GATE, '--selftest-untimed'], {});
const arLines = rs.text.split('\n').filter((l) => l.startsWith('SELFTEST allocBop: '));
const arM = arLines.length === 1 ? /^SELFTEST allocBop: scavenging window (\S+) \(want Infinity\), clean window (\S+) \(want \[0, 1\/64\)\) -> (ok|FAIL)$/.exec(arLines[0]) : null;
const arClean = arM === null ? NaN : Number(arM[2]);
const arOk = arM !== null && arM[1] === 'Infinity' && /^\d+\.\d{4}$/.test(arM[2]) && arClean >= 0 && arClean < 0.015625 && arM[3] === 'ok';
row(arOk, 'A5 allocRow', 'selftest-untimed exit ' + rs.code + ' allocBop rows ' + arLines.length + ' (want 1): ' + (arLines[0] || '(none)') +
    ' -> scavenging ' + (arM ? arM[1] : '?') + ' (want Infinity), clean ' + arClean + ' (want [0, 0.015625)), tool check ' + (arM ? arM[3] : '?') + ' (want ok)');

const { judgeSpec: jSpec, verdictOf: vOf } = await import(pathToFileURL(TOOL).href);
const A5 = [];   // { spec, lines, code, name }
let a5Build = '';
if (typeof jSpec !== 'function' || typeof vOf !== 'function') a5Build = 'judgeSpec / verdictOf not exported by the tool under test';
else {
    // the 55 golden rows (applyMut: copied VERBATIM from LiteBisect bench/ab-gate.mjs sha256 7e0f9262..., as in
    // test/parity.abgate.test.mjs; each mutated text must hash to the golden textSha)
    const applyMut = (text, m) => {
        if (m[0] === 'sub') {
            const n = text.split(m[1]).length - 1;
            return n === 1 ? text.replace(m[1], () => m[2]) : 'sub ' + JSON.stringify(m[1]) + ' matched ' + n + ' times (want 1)';
        }
        if (m[0] === 'append') return text.endsWith('\n') ? text + m[1] : 'append: fixture does not end in a newline';
        const lines = text.split('\n');
        const at = [];
        for (let i = 0; i < lines.length; i++) if (lines[i].startsWith(m[1])) at.push(i);
        if (at.length !== 1) return m[0] + ' ' + JSON.stringify(m[1]) + ' matched ' + at.length + ' lines (want 1)';
        if (m[0] === 'drop') lines.splice(at[0], 1);
        else if (m[0] === 'dup') lines.splice(at[0], 0, lines[at[0]]);
        else return 'unknown mutation ' + m[0];
        return lines.join('\n');
    };
    const GD = join(HERE, 'fixtures', 'ab-gate-7e0f9262');
    const G = JSON.parse(readFileSync(join(GD, 'golden.json'), 'utf8'));
    const FX = { ubuntu: readFileSync(join(GD, 'r4-ubuntu-rung-all.log'), 'utf8'), macos: readFileSync(join(GD, 'r4-macos-rung-all.log'), 'utf8') };
    const legacy = jSpec({ laneIds: G.spec.laneIds, gated: G.spec.gated, shape: G.spec.shape, K: G.spec.K, C: G.spec.C, dialect: 'ab-gate@7e0f9262' });
    let shaBad = 0;
    for (const r of G.rows) {
        let text = FX[r.base];
        for (const m of r.muts) text = applyMut(text, m);
        if (sha256(text) !== r.textSha) shaBad++;
        const ls = text.split('\n');
        if (ls.length > 0 && ls[ls.length - 1] === '') ls.pop();
        A5.push({ spec: legacy, lines: ls, code: r.code, name: r.id });
    }
    // the 59 judge.rows rows: the table text from 'const K = 11, C = 3;' to the end of its ROWS array, evaluated with the
    // tool's judgeSpec (ab-gate between() style; both markers must occur exactly once)
    const jr = readFileSync(join(HERE, 'judge.rows.test.mjs'), 'utf8');
    const ja = jr.indexOf('const K = 11, C = 3;'), jROWS = jr.indexOf('const ROWS = [');
    const jz = jROWS < 0 ? -1 : jr.indexOf('\n];\n', jROWS);
    let J = null;
    if (ja < 0 || jr.indexOf('const K = 11, C = 3;', ja + 1) >= 0 || jROWS < ja || jr.indexOf('const ROWS = [', jROWS + 1) >= 0 || jz < 0) a5Build = 'judge.rows table markers not found exactly once';
    else J = new Function('judgeSpec', jr.slice(ja, jz + 3) + '\nreturn { ROWS, SPEC, lines };')(jSpec);
    if (shaBad > 0) a5Build += (a5Build ? '; ' : '') + shaBad + ' golden textSha mismatch(es)';
    if (J !== null) {
        const tool = J.SPEC();
        for (const [name, mk, exit] of J.ROWS) {
            // the belt row (mk null): the clean log under a hand-built spec whose gated is {} (C-14), as judge.rows builds it
            if (mk === null) A5.push({ spec: { ...tool, gated: {} }, lines: J.lines(), code: exit, name });
            else A5.push({ spec: tool, lines: mk(), code: exit, name });
        }
    }
    if (A5.length !== 114) a5Build += (a5Build ? '; ' : '') + A5.length + ' rows built (want 114 = 55 golden + 59 judge.rows)';
}
const a5Snap = A5.map((x) => ({ n: x.lines.length, h: sha256(x.lines.join('\n')) }));
async function judgeRetention(keep) {
    const tracker = createLeakTracker({ name: keep ? 'ab-gate-judge-keep' : 'ab-gate-judge', onLeak: () => {}, onWarning: (w) => warns.push(w.kind + ':' + w.reason) });
    tracker.registerKernel(createOwnerCascadeOrphanKernel());
    const kept = [];
    let wrong = 0, writes = 0, tracked = 0;
    // one cycle per call: each result lives only in this frame (never in the loop's suspended registers)
    const cycle = (c) => {
        for (let i = 0; i < A5.length; i++) {
            const v = vOf(A5[i].spec, A5[i].lines);
            if (v.code !== A5[i].code) wrong++;
            tracker.track(v, null, 'v#' + c + ':' + i);
            tracked++;
            if (keep) kept.push(v);
        }
    };
    const ow = process.stdout.write, ew = process.stderr.write;
    process.stdout.write = function (...a) { writes++; return ow.apply(this, a); };
    process.stderr.write = function (...a) { writes++; return ew.apply(this, a); };
    try {
        for (let c = 0; c < A5_CYCLES; c++) cycle(c);
    } finally {
        process.stdout.write = ow;
        process.stderr.write = ew;
    }
    for (let a = 0; a < 20 && tracker.size() > 0; a++) { globalThis.gc(); await settle(20); }
    const size = tracker.size(), findings = tracker.audit().length;
    kept.length = 0;
    const changed = A5.filter((x, i) => x.lines.length !== a5Snap[i].n || sha256(x.lines.join('\n')) !== a5Snap[i].h).length;
    return { size, findings, wrong, writes, tracked, changed };
}
const A5_WANT = A5_CYCLES * 114;
if (a5Build !== '') row(false, 'A5 judge retention', 'rows not built: ' + a5Build);
else {
    const a5 = await judgeRetention(false);
    row(a5.size === 0 && a5.findings === 0 && a5.wrong === 0 && a5.writes === 0 && a5.changed === 0 && a5.tracked === A5_WANT, 'A5 judge retention',
        A5_CYCLES + ' cycles x ' + A5.length + ' rows (55 golden legacy + 59 judge.rows tool): tracked ' + a5.tracked + ' (want ' + A5_WANT + ') tracker.size()=' + a5.size +
        ' (want 0) findings=' + a5.findings + ' codes off ' + a5.wrong + ' (want 0) writes during verdictOf ' + a5.writes + ' (want 0) input LOGs changed ' + a5.changed + ' (want 0)');
    const a5c = await judgeRetention(true);
    const a5Red = a5c.size === A5_WANT;
    row(a5Red, 'A5 control retained (must read red)', 'results kept in an array: tracker.size()=' + a5c.size + ' (want ' + A5_WANT + ') -> ' + (a5Red ? 'red' : 'NOT RED'));
}

// ---- GATE ----------------------------------------------------------------------------------------------------------
const failed = rows.filter((r) => !r.ok);
const alloc = entriesSeen > 0 && Number.isFinite(maxBytes) ? maxBytes / ((K + 1) * entriesSeen) : NaN;
console.log('GATE leak=size ' + t2.size + '/0 findings=' + t2.findings + ' warnings=' + warns.length +
    ' | gc major=' + gs.gc.major + ' minor=' + gs.gc.minor + ' maxMs=' + gs.gc.maxMs.toFixed(2) + ' (REPORTED: T1 runs incl. the tool\'s forced gcs)' +
    ' | alloc=' + alloc + ' B/op (max WINDOW tool-bytes ' + maxBytes + ' / (' + (K + 1) + ' rounds x ' + entriesSeen + ' entries))' +
    ' | ' + (failed.length === 0 ? 'ok' : 'FAIL ' + failed.map((r) => r.name).join('; ')));
if (failed.length > 0) process.exitCode = 1;
