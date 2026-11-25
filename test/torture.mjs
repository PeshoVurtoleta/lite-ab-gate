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

// ---- GATE ----------------------------------------------------------------------------------------------------------
const failed = rows.filter((r) => !r.ok);
const alloc = entriesSeen > 0 && Number.isFinite(maxBytes) ? maxBytes / ((K + 1) * entriesSeen) : NaN;
console.log('GATE leak=size ' + t2.size + '/0 findings=' + t2.findings + ' warnings=' + warns.length +
    ' | gc major=' + gs.gc.major + ' minor=' + gs.gc.minor + ' maxMs=' + gs.gc.maxMs.toFixed(2) + ' (REPORTED: T1 runs incl. the tool\'s forced gcs)' +
    ' | alloc=' + alloc + ' B/op (max WINDOW tool-bytes ' + maxBytes + ' / (' + (K + 1) + ' rounds x ' + entriesSeen + ' entries))' +
    ' | ' + (failed.length === 0 ? 'ok' : 'FAIL ' + failed.map((r) => r.name).join('; ')));
if (failed.length > 0) process.exitCode = 1;
