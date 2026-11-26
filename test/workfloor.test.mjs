// test/workfloor.test.mjs -- WF1 B2 (plan-C59-v1 TASK 5, ASSERTIONS A2 / A3; SPEC C-59 as extended by A26). DETERMINISTIC (C-3):
// no timed number is read. Every run is --oracle-only (no clock) or runs under test/fixtures/workfloor/clock-trap.mjs
// (performance.now throws at the first read, so no measurement can happen).
// Expected values come from the SPEC and the plan, never from a run of the implementation: the 8 reserved tool VOID kinds are
// LITERALS below; the sweep's (start, n) pair set is computed here (n = the sizeWindow ladder minWindow 64 doubling to NQ = 512 for the
// toy's 1024 ops; starts = roundStart of round -1 plus rounds 0..K-1, with roundStart(r) = imul(r + 1, 39313) & (NQ - 1)).
// Rows (red on frozen 1a280a18 unless "pin"):
//   R1  every reserved kind at every pair STOPs HARNESS pre-clock (also --oracle-only)   R2 reserved only at n = 512
//   R2b reserved only at n = 512 with minWindow 48 (not a power of two: the ladder caps at NQ, WF1 review r1 B1)
//   R3  first call legal, later call reserved (every pair is checked, not the first non-null)
//   R4  reserved only after make() ran: the sweep (no make) passes, the floorReason backstop STOPs
//   R5  timed run under the clock trap: STOP before any HEADER / PROV / clock read       R5c pin: trap fires on the unmodified toy
//   R6  pin: legal reasons are not STOPs (WORK-FLOOR ..., AL-LOC x); NANO x is reserved (prefix, P3)
//   R7  drift gate: ABGate.js TOOL_VOID_KINDS == the 8 literals == every voids.push / settleVoid kind == the header comment; must-fail copies
//   R8  pin: a non-string reason keeps the old format message
//   R8b a non-string reason, timed under the clock trap: the sweep format-checks pre-clock (WF1 review r1 B2)
//   R8c pin: leading space / lowercase / bare kind -> the format STOP, never the prefix check (WF1 review r1 B3)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ABGATE = join(ROOT, 'ABGate.js');
const TOY = join(ROOT, 'test', 'fixtures', 'toy');
const TOY_GATE = join(TOY, 'toy-lane.mjs');
const TRAP = pathToFileURL(join(ROOT, 'test', 'fixtures', 'workfloor', 'clock-trap.mjs')).href;
// the package.json "torture" node flags
const FLAGS = ['--expose-gc', '--allow-natives-syntax', '--no-concurrent-recompilation', '--min-semi-space-size=4', '--max-semi-space-size=4', '--single-threaded-gc'];

// the 8 reserved tool VOID kinds, as literals (C-59); NOT read from the source
const KINDS = ['SLOW-DEAD', 'AA-DRIFT', 'REPS-DRIFT', 'NOT-TF', 'ALLOC', 'GC-WINDOW', 'NAN', 'TIER-SETTLE'];

const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });
const cleanEnv = () => { const e = { ...process.env }; delete e.AB_GATE_INJECT; delete e.GITHUB_ACTIONS; return e; };

function rep(text, from, to) {
    const i = text.indexOf(from);
    assert.ok(i >= 0 && text.indexOf(from, i + 1) < 0, 'gate edit needs exactly one match: ' + from);
    return text.slice(0, i) + to + text.slice(i + from.length);
}
/** A temp copy of the toy gate with a workFloor on every lane. o.decl = module-level text; o.wf = the workFloor function expression;
 *  o.make = text injected at the top of make(). Returns the gate path. */
function variant(o) {
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-wf-'));
    tmps.push(dir);
    mkdirSync(join(dir, 'frozen')); mkdirSync(join(dir, 'live'));
    copyFileSync(join(TOY, 'frozen', 'k.js'), join(dir, 'frozen', 'k.js'));
    copyFileSync(join(TOY, 'live', 'k.js'), join(dir, 'live', 'k.js'));
    let t = readFileSync(TOY_GATE, 'utf8');
    if (o.decl) t = rep(t, 'const OPS = 1024;', 'const OPS = 1024; ' + o.decl);
    t = rep(t, 'recLen: REC, A, B, bend,', 'recLen: REC, A, B, bend, workFloor: ' + o.wf + ',');
    if (o.make) t = rep(t, 'make() { return {', 'make() { ' + o.make + ' return {');
    const gate = join(dir, 'toy-lane.mjs');
    writeFileSync(gate, t);
    return gate;
}
// env-driven workFloor: WF_KIND = the reason kind, WF_S / WF_N = the only (start, n) pair it fires at ('' = any)
const ENV_WF = "(s, n) => (process.env.WF_S === '' || s === +process.env.WF_S) && (process.env.WF_N === '' || n === +process.env.WF_N) ? process.env.WF_KIND + ' x' : null";

function cli(gate, args, flags = FLAGS) {
    const r = spawnSync(process.execPath, [...flags, ABGATE, gate, ...args], { encoding: 'utf8', env: cleanEnv(), timeout: 300000 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
// in-child driver: several oracle-only runGate calls in ONE process (REQUIRED_FLAGS present), each step's lines collected
const DRIVER = `
const job = JSON.parse(process.argv[1]);
const { runGate } = await import(job.tool);
const res = [];
for (const s of job.steps) {
  for (const [k, v] of Object.entries(s.env || {})) process.env[k] = v;
  const lines = [];
  const code = await runGate(s.gate, Object.assign({}, s.opts, { out: { write(x) { lines.push(x); } } }));
  res.push({ code, out: lines.join('') });
}
process.stdout.write('@@RES ' + JSON.stringify(res) + '\\n');
`;
function drive(steps) {
    const r = spawnSync(process.execPath, [...FLAGS, '--input-type=module', '-e', DRIVER, JSON.stringify({ tool: pathToFileURL(ABGATE).href, steps })],
        { encoding: 'utf8', env: cleanEnv(), timeout: 600000, maxBuffer: 1 << 26 });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@RES '));
    assert.ok(line !== undefined, 'driver child gave no result (status ' + r.status + '): ' + (r.stderr || '').slice(0, 500));
    return JSON.parse(line.slice(6));
}
const stopLine = (out) => out.split('\n').find((l) => l.startsWith('STOP ')) || '';
const reservedRe = (kind) => new RegExp('^STOP HARNESS: spec: toy:clean\\.workFloor\\((\\d+), (\\d+)\\) reason "' + kind + ' x" starts with the tool VOID kind ' + kind + ' \\(reserved, C-59\\)$');
function assertReservedStop(res, kind, what) {
    assert.equal(res.code, 1, what + ': exit 1');
    const m = reservedRe(kind).exec(stopLine(res.out));
    assert.ok(m !== null, what + ': STOP line, got ' + JSON.stringify(stopLine(res.out)));
    assert.ok(res.out.includes('VERDICT NO VERDICT (STOP HARNESS)'), what + ': judge verdict line');
    assert.ok(!/^ORACLE /m.test(res.out), what + ': no ORACLE line (the sweep is before any lane work)');
    return m;
}

// the (start, n) pairs the pre-clock sweep must cover, computed from the SPEC (see header)
const NQ = 512;
const LADDER = [64, 128, 256, 512];
const roundStart = (r) => Math.imul(r + 1, 39313) & (NQ - 1);
function pairsFor(K) {
    const starts = [roundStart(2000)];
    for (let x = 0; x < K; x++) starts.push(roundStart(x));
    const seen = new Set(), pairs = [];
    for (const s of starts) for (const n of LADDER) if (!seen.has(s + ',' + n)) { seen.add(s + ',' + n); pairs.push([s, n]); }
    return pairs;
}

// ============================================================ R1
test('R1: each of the 8 reserved kinds at every pair -> STOP HARNESS spec:, NO VERDICT (STOP HARNESS), exit 1, --oracle-only', () => {
    const gate = variant({ wf: ENV_WF });
    const res = drive(KINDS.map((k) => ({ gate, opts: { oracleOnly: true, run: 'toy:clean' }, env: { WF_KIND: k, WF_S: '', WF_N: '' } })));
    assert.equal(res.length, 8);
    KINDS.forEach((k, i) => assertReservedStop(res[i], k, k));
});
test('R1: the reserved kind at exactly ONE (start, n) pair is found, for every pair of the sweep (K=13), kinds rotated', () => {
    const gate = variant({ wf: ENV_WF });
    const pairs = pairsFor(13);
    assert.ok(pairs.length >= 40, 'coverage floor: >= 40 distinct pairs, got ' + pairs.length);
    const res = drive(pairs.map(([s, n], i) => ({ gate, opts: { oracleOnly: true, K: 13, run: 'toy:clean' }, env: { WF_KIND: KINDS[i % 8], WF_S: String(s), WF_N: String(n) } })));
    const used = new Set();
    pairs.forEach(([s, n], i) => {
        used.add(KINDS[i % 8]);
        const m = assertReservedStop(res[i], KINDS[i % 8], 'pair (' + s + ', ' + n + ')');
        assert.deepEqual([+m[1], +m[2]], [s, n], 'the STOP names the offending pair');
    });
    assert.equal(used.size, 8, 'coverage floor: all 8 kinds exercised');
});
// ============================================================ R2
test('R2: reserved only at n === 512 (the largest window) -> STOP naming n 512', () => {
    const gate = variant({ wf: "(s, n) => n === 512 ? 'ALLOC x' : null" });
    const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
    assert.equal(r.status, 1);
    assert.match(stopLine(r.out), /^STOP HARNESS: spec: toy:clean\.workFloor\(\d+, 512\) reason "ALLOC x" starts with the tool VOID kind ALLOC \(reserved, C-59\)$/);
});
test('R2b: non-power-of-two minWindow 48: reserved only at n === 512 -> STOP naming n 512 (the ladder is capped at NQ, not doubled past it)', () => {
    const gate = variant({ wf: "(s, n) => n === 512 ? 'ALLOC x' : null" });
    writeFileSync(gate, rep(readFileSync(gate, 'utf8'), 'const MIN_WINDOW = 64;', 'const MIN_WINDOW = 48;'));
    const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
    assert.equal(r.status, 1, r.out.slice(0, 300));
    assert.match(stopLine(r.out), /^STOP HARNESS: spec: toy:clean\.workFloor\(\d+, 512\) reason "ALLOC x" starts with the tool VOID kind ALLOC \(reserved, C-59\)$/);
});
// ============================================================ R3
test('R3: first call legal (WORK-FLOOR x), a later call reserved (ALLOC x) -> STOP (every pair is checked, not the first non-null)', () => {
    const gate = variant({ decl: 'let wfc = 0;', wf: "() => (wfc++ === 0 ? 'WORK-FLOOR x' : 'ALLOC x')" });
    const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
    assert.equal(r.status, 1);
    assert.match(stopLine(r.out), /^STOP HARNESS: spec: toy:clean\.workFloor\(\d+, \d+\) reason "ALLOC x" starts with the tool VOID kind ALLOC \(reserved, C-59\)$/);
    assert.ok(r.out.includes('VERDICT NO VERDICT (STOP HARNESS)'));
});
// ============================================================ R4
test('R4: reserved only after make() ran (sweep sees none) -> the floorReason backstop still STOPs', () => {
    const gate = variant({ make: 'globalThis.__wfMade = 1;', wf: "() => (globalThis.__wfMade === 1 ? 'ALLOC x' : null)" });
    const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
    assert.equal(r.status, 1);
    assert.match(stopLine(r.out), /^STOP HARNESS: spec: toy:clean\.workFloor\(\d+, \d+\) reason "ALLOC x" starts with the tool VOID kind ALLOC \(reserved, C-59\)$/);
});
// ============================================================ R5 / R5c
test('R5: timed run under the clock trap, ALLOC reserved -> STOP before any HEADER / PROV / clock read (0 CLOCK-TRAP)', () => {
    const gate = variant({ wf: "() => 'ALLOC x'" });
    const r = cli(gate, ['--run', 'toy:clean'], [...FLAGS, '--import', TRAP]);
    assert.equal(r.status, 1);
    assert.ok(/^STOP HARNESS: spec: .*starts with the tool VOID kind ALLOC \(reserved, C-59\)$/m.test(r.out), 'STOP line: ' + r.out.slice(0, 400));
    assert.equal((r.out.match(/CLOCK-TRAP/g) || []).length, 0, 'no clock read happened');
    assert.equal((r.out.match(/^(HEADER|PROV|CONTROL|SETTLE|WINDOW|RESULT|CRASH)/mg) || []).length, 0, 'no pre-STOP run line');
    assert.ok(r.out.includes('VERDICT NO VERDICT (STOP HARNESS)'));
});
test('R5c (must-fail control): the same trap on the unmodified toy reaches a clock read -> CRASH CLOCK-TRAP', () => {
    const r = cli(TOY_GATE, ['--run', 'toy:clean'], [...FLAGS, '--import', TRAP]);
    assert.ok((r.out.match(/CLOCK-TRAP/g) || []).length >= 1, 'the trap fired: ' + r.out.slice(0, 400));
    assert.ok(/^CRASH /m.test(r.out));
    assert.equal(r.status, 1);
});
// ============================================================ R6
test('R6 (pin): legal reasons are not STOPs (WORK-FLOOR ..., AL-LOC x): a VOID line, exit 2 (--oracle-only, no clock)', () => {
    for (const reason of ['WORK-FLOOR window 64 ops below the floor', 'AL-LOC x']) {
        const gate = variant({ wf: '() => ' + JSON.stringify(reason) });
        const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
        assert.ok(!/^STOP /m.test(r.out), reason + ': no STOP: ' + r.out.slice(0, 300));
        assert.ok(new RegExp('^VOID ' + reason.split(' ')[0] + ' lane=toy:clean', 'm').test(r.out), reason + ': a VOID line');
        assert.equal(r.status, 2, reason + ': exit 2');
    }
});
test('R6: NANO x STOPs (prefix match, P3: NANO starts with the reserved NAN)', () => {
    const gate = variant({ wf: "() => 'NANO x'" });
    const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
    assert.equal(r.status, 1);
    assert.match(stopLine(r.out), /^STOP HARNESS: spec: toy:clean\.workFloor\(\d+, \d+\) reason "NANO x" starts with the tool VOID kind NAN \(reserved, C-59\)$/);
});
// ============================================================ R8
test('R8 (pin): a non-string reason keeps the old format message', () => {
    const gate = variant({ wf: '() => 1' });
    const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
    assert.equal(r.status, 1);
    assert.equal(stopLine(r.out), 'STOP HARNESS: toy:clean: workFloor reason must be "<KIND> <text>", got 1');
});
test('R8b: a non-string reason, timed run under the clock trap -> the format STOP before any HEADER / clock read (the sweep format-checks too)', () => {
    const gate = variant({ wf: '() => 1' });
    const r = cli(gate, ['--run', 'toy:clean'], [...FLAGS, '--import', TRAP]);
    assert.equal(r.status, 1);
    assert.equal(stopLine(r.out), 'STOP HARNESS: toy:clean: workFloor reason must be "<KIND> <text>", got 1');
    assert.equal((r.out.match(/CLOCK-TRAP/g) || []).length, 0, 'no clock read happened');
    assert.equal((r.out.match(/^(HEADER|PROV|CRASH)/mg) || []).length, 0, 'no pre-STOP run line');
});
test('R8c (pin): reasons that dodge the prefix (leading space, lowercase, bare kind) -> the format STOP', () => {
    for (const reason of [' ALLOC x', 'alloc x', 'ALLOC']) {
        const gate = variant({ wf: '() => ' + JSON.stringify(reason) });
        const r = cli(gate, ['--oracle-only', '--run', 'toy:clean']);
        assert.equal(r.status, 1, JSON.stringify(reason));
        assert.equal(stopLine(r.out), 'STOP HARNESS: toy:clean: workFloor reason must be "<KIND> <text>", got ' + JSON.stringify(reason));
    }
});
// ============================================================ R7 drift gate
/** Problems found in an ABGate.js source text (empty = in sync with the test's 8 literals). */
function driftProblems(src) {
    const p = [];
    const decls = src.match(/\bconst TOOL_VOID_KINDS\b/g) || [];
    if (decls.length !== 1) p.push('TOOL_VOID_KINDS declarations: ' + decls.length);
    const m = /\bconst TOOL_VOID_KINDS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(src);
    const set = m === null ? [] : [...m[1].matchAll(/'([A-Z][A-Z0-9-]*)'/g)].map((x) => x[1]);
    const want = [...KINDS].sort().join(',');
    const same = (name, list) => { if ([...new Set(list)].sort().join(',') !== want) p.push(name + ' != the 8 kinds: ' + [...new Set(list)].sort().join(',')); };
    same('TOOL_VOID_KINDS', set);
    same('voids.push + settleVoid kinds', [...src.matchAll(/voids\.push\('([A-Z][A-Z0-9-]*) /g), ...src.matchAll(/settleVoid = '([A-Z][A-Z0-9-]*) /g)].map((x) => x[1]));
    const h = /^\/\/ VOID kinds per lane: ([^\n]*(?:\n\/\/[^\n]*?)?) plus\b/m.exec(src);
    same('header comment list', h === null ? [] : h[1].replace(/\n\/\//g, ' ').split(',').map((s) => s.trim()).filter((s) => s !== ''));
    return p;
}
test('R7: ABGate.js TOOL_VOID_KINDS == the 8 literals == every voids.push / settleVoid kind == the header comment list', () => {
    assert.deepEqual(driftProblems(readFileSync(ABGATE, 'utf8')), []);
});
// a synthetic in-sync source (independent of ABGate.js), shaped like the real one, for the must-fail copies
const GOOD = [
    '// VOID kinds per lane: SLOW-DEAD, AA-DRIFT, REPS-DRIFT, NOT-TF, ALLOC, GC-WINDOW, NAN, TIER-SETTLE, plus the lane\'s workFloor',
    '// reason.',
    "const TOOL_VOID_KINDS = Object.freeze(['SLOW-DEAD', 'AA-DRIFT', 'REPS-DRIFT', 'NOT-TF', 'ALLOC', 'GC-WINDOW', 'NAN', 'TIER-SETTLE']);",
    "let settleVoid = null; settleVoid = 'TIER-SETTLE pass-bytes 1';",
    "voids.push('GC-WINDOW major 1'); voids.push('ALLOC a 1'); voids.push('NOT-TF a'); voids.push('NAN a');",
    "voids.push('AA-DRIFT 1'); voids.push('SLOW-DEAD 1'); voids.push('REPS-DRIFT 1');",
].join('\n');
test('R7 must-fail copies: the checker passes a synthetic in-sync source, and catches a new voids.push kind, a const without TIER-SETTLE, a second declaration, a stale header', () => {
    assert.deepEqual(driftProblems(GOOD), [], 'control: the synthetic source is in sync');
    assert.ok(driftProblems(GOOD + "\nvoids.push('ZZZ-NEW x');\n").length > 0, 'extra voids.push kind');
    const noTier = GOOD.replace(", 'TIER-SETTLE']", ']');
    assert.notEqual(noTier, GOOD);
    assert.ok(driftProblems(noTier).length > 0, 'const without TIER-SETTLE');
    const decl = GOOD.split('\n')[2];
    assert.ok(driftProblems(GOOD + '\n' + decl + '\n').length > 0, 'two declarations');
    const noHeader = GOOD.replace(', TIER-SETTLE, plus', ', plus');
    assert.notEqual(noHeader, GOOD);
    assert.ok(driftProblems(noHeader).length > 0, 'stale header comment');
});
