// test/spec.test.mjs -- G-A B3 (plan-GA ASSERTIONS 4 + 5, TEETH GAPS M04 M12 M16 M20 M25 M28 M30 M31 M32). DETERMINISTIC (C-3):
// no timed verdict is read. Where a run is timed (M12 / M16 / M20 / M25) only SHAPE facts are asserted (a setup count, a
// frozen flag, the STOP text) that do not depend on any measured number; a --selftest child is read only up to its
// untimed judge rows and killed (M31).
// Expected values come from the SPEC (C-4, C-13, C-14, C-17, C-19, C-20, C-21, C-25, C-27) and the plan ASSERTIONS, never from
// a run of the implementation. Gate variants are cut from the toy fixture's TEXT in a temp dir (each edit is one-match or abort).
//
// Teeth (each test names its mutant; the red/green table is .handoff/evidence/U4-GAB3-teeth.log):
//   M04 the live STOPs revert to the old shared 'STOP ANCHOR: live ' text   -> test "four distinct ANCHOR STOPs"
//   M12 harnessControls gets unfrozen rows                                  -> test "harnessControls rows are deep-frozen"
//   M15 (import.test.mjs)
//   M16 a module-level shared log                                           -> test "the log is per run"
//   M20 runLane builds C_COPIES copies, not the declared C                  -> test "timed run builds the declared C copies"
//   M25 armNatives does not reset __labLate                                 -> test "__labLate is reset on every run"
//   M28 a K=13 test must anchor on ^HEADER rung=                            -> the K=13 tests use /^HEADER rung=.../m
//   M30 HEADER rule prints fixed K / C                                      -> test "declared K / C in the HEADER rung and rule lines"
//   M31 selftest judgeRows use fixed K / C                                  -> test "selftest judge rows follow the declared K / C"
//   M32 runGate accepts K:52                                                -> tests "runGate K bounds"
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineGate, runGate } from '../ABGate.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ABGATE = join(ROOT, 'ABGate.js');
const TOY = join(ROOT, 'test', 'fixtures', 'toy');
const TOY_GATE = join(TOY, 'toy-lane.mjs');
const FLAGS = ['--expose-gc', '--allow-natives-syntax', '--no-concurrent-recompilation', '--min-semi-space-size=4', '--max-semi-space-size=4', '--single-threaded-gc'];
const { default: toy } = await import(pathToFileURL(TOY_GATE).href);

const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });
const cleanEnv = () => { const e = { ...process.env }; delete e.AB_GATE_INJECT; delete e.GITHUB_ACTIONS; return e; };

function rep(text, from, to) {
    const i = text.indexOf(from);
    assert.ok(i >= 0 && text.indexOf(from, i + 1) < 0, 'gate edit needs exactly one match: ' + from);
    return text.slice(0, i) + to + text.slice(i + from.length);
}
/** A temp copy of the toy gate (frozen/live k.js copied) with one-match text edits. Returns the gate path. */
function variant(o = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-spec-'));
    tmps.push(dir);
    mkdirSync(join(dir, 'frozen')); mkdirSync(join(dir, 'live'));
    copyFileSync(join(TOY, 'frozen', 'k.js'), join(dir, 'frozen', 'k.js'));
    copyFileSync(join(TOY, 'live', 'k.js'), join(dir, 'live', 'k.js'));
    if (o.tamperFrozen) writeFileSync(join(dir, 'frozen', 'k.js'), readFileSync(join(dir, 'frozen', 'k.js'), 'utf8') + '\n// tamper\n');
    if (o.tamperLive) writeFileSync(join(dir, 'live', 'k.js'), readFileSync(join(dir, 'live', 'k.js'), 'utf8') + '\n// tamper\n');
    let t = readFileSync(TOY_GATE, 'utf8');
    if (o.K !== undefined || o.C !== undefined) t = rep(t, "name: 'lite-ab-gate-toy',", "name: 'lite-ab-gate-toy', " + (o.K !== undefined ? 'K: ' + o.K + ', ' : '') + (o.C !== undefined ? 'C: ' + o.C + ', ' : ''));
    if (o.count) t = rep(t, 'function setup(d) { return', 'function setup(d) { globalThis.__setups = (globalThis.__setups | 0) + 1; return');
    if (o.harness) t = rep(t, "gated: Object.freeze({ 'toy:clean': 'WITHIN' }),", 'harnessControls: ' + o.harness + ", gated: Object.freeze({ 'toy:clean': 'WITHIN' }),");
    const fz = o.frozenPath !== undefined ? o.frozenPath : o.absFrozen ? join(dir, 'frozen', 'k.js') : 'frozen/k.js';
    const lv = o.livePath !== undefined ? o.livePath : o.absLive ? join(dir, 'live', 'k.js') : 'live/k.js';
    if (fz !== 'frozen/k.js') t = rep(t, "frozen: 'frozen/k.js'", 'frozen: ' + JSON.stringify(fz));
    if (lv !== 'live/k.js') t = rep(t, "live: 'live/k.js'", 'live: ' + JSON.stringify(lv));
    const gate = join(dir, 'toy-lane.mjs');
    writeFileSync(gate, t);
    return gate;
}
function cli(gate, args, env = {}) {
    const r = spawnSync(process.execPath, [...FLAGS, ABGATE, gate, ...args], { encoding: 'utf8', env: { ...cleanEnv(), ...env }, timeout: 300000 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
// ---- the in-child driver: several runGate calls in ONE process (REQUIRED_FLAGS present), each step's lines collected ----
const DRIVER = `
const job = JSON.parse(process.argv[1]);
const { runGate } = await import(job.tool);
const res = [];
for (const s of job.steps) {
  for (const [k, v] of Object.entries(s.env || {})) { if (v === null) delete process.env[k]; else process.env[k] = v; }
  globalThis.__setups = 0;
  const lines = [];
  const code = await runGate(s.gate, Object.assign({}, s.opts, { out: { write(x) { lines.push(x); } } }));
  res.push({ code, out: lines.join(''), setups: globalThis.__setups });
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
function collect() { const lines = []; return { lines, write(s) { lines.push(s); return true; }, text() { return lines.join(''); } }; }

// ============================================================ defineGate: fail closed (C-4, C-13, C-14, C-19)
test('defineGate: gated {} throws "spec: gated must name at least one lane" (reason HARNESS)', () => {
    assert.throws(() => defineGate({ ...toy, gated: {} }), (e) => e.message === 'spec: gated must name at least one lane' && e.reason === 'HARNESS');
});
test('defineGate: K / C bounds -- K:10 and C:2 throw citing C-4; K:11 K:13 C:3 C:9 pass; above the cap throws (C-19)', () => {
    for (const [k, v] of [['K', 10], ['C', 2], ['K', 0], ['C', 0], ['K', 52], ['C', 10], ['K', 13.5], ['C', 3.5], ['K', '13'], ['C', null], ['K', NaN]]) {
        assert.throws(() => defineGate({ ...toy, [k]: v }), (e) => e.reason === 'HARNESS' && /^spec: [KC] must be an integer in \[/.test(e.message), k + '=' + String(v));
    }
    for (const [k, v] of [['K', 10], ['C', 2]]) assert.throws(() => defineGate({ ...toy, [k]: v }), /C-4/, k + '=' + v + ' must cite C-4');
    assert.equal(defineGate({ ...toy, K: 11 }).K, 11);
    assert.equal(defineGate({ ...toy, K: 13 }).K, 13);
    assert.equal(defineGate({ ...toy, K: 51 }).K, 51);
    assert.equal(defineGate({ ...toy, C: 3 }).C, 3);
    assert.equal(defineGate({ ...toy, C: 9 }).C, 9);
    assert.equal(defineGate(toy).K, undefined, 'no K declared stays undefined (the tool default applies)');
});
test('defineGate: unknown key, gated id without a lane, bad word -> HARNESS (C-14)', () => {
    assert.throws(() => defineGate({ ...toy, kk: 1 }), (e) => e.reason === 'HARNESS' && /unknown key spec\.kk/.test(e.message));
    assert.throws(() => defineGate({ ...toy, gated: { 'nope:lane': 'WITHIN' } }), (e) => e.reason === 'HARNESS');
    assert.throws(() => defineGate({ ...toy, gated: { 'toy:clean': 'BIGGER' } }), (e) => e.reason === 'HARNESS' && /word BIGGER/.test(e.message));
});
test('defineGate: returns a deep-frozen copy (spec, arrays, lanes), functions kept by reference', () => {
    const g = defineGate(toy);
    assert.ok(Object.isFrozen(g) && Object.isFrozen(g.frozen) && Object.isFrozen(g.frozen[0]) && Object.isFrozen(g.lanes) && Object.isFrozen(g.lanes[0]) && Object.isFrozen(g.lanes[0].A) && Object.isFrozen(g.gated));
    assert.equal(g.transform, toy.transform);
    assert.notEqual(g, toy);
});
test('defineGate: every object must be plain -- prototype keys / Symbol keys / class instances -> HARNESS', () => {
    const sym = Symbol('s');
    const cases = {
        'top-level prototype key': Object.assign(Object.create({ inherited: 1 }), toy),
        'top-level Symbol key': { ...toy, [sym]: 1 },
        'lane Symbol key': { ...toy, lanes: [{ ...toy.lanes[0], [sym]: 1 }, toy.lanes[1]] },
        'frozen[] prototype key': { ...toy, frozen: [Object.assign(Object.create({ inherited: 1 }), toy.frozen[0])] },
        'gated Symbol key': { ...toy, gated: { 'toy:clean': 'WITHIN', [sym]: 'WITHIN' } },
        'col class instance': { ...toy, lanes: [{ ...toy.lanes[0], A: new (class Col2 { constructor() { Object.assign(this, toy.lanes[0].A); } })() }, toy.lanes[1]] },
    };
    for (const [name, spec] of Object.entries(cases)) assert.throws(() => defineGate(spec), (e) => e.reason === 'HARNESS', name);
});

// ============================================================ runGate options (in-process: every case stops before the flags check)
test('runGate: non-plain options -> exit 1, STOP CLI "runGate: options must be a plain object", VERDICT NO VERDICT (STOP CLI)', async () => {
    // the options bag IS the thing under test, so its `out` cannot carry the collector: temporarily capture process.stdout
    const real = process.stdout.write;
    for (const bag of [Object.create({ run: 'ALL' }), [], null, 'ALL', new (class O {})(), { [Symbol('x')]: 1 }]) {
        const lines = [];
        process.stdout.write = function (c) { lines.push(String(c)); return true; };
        let code;
        try { code = await runGate(TOY_GATE, bag); } finally { process.stdout.write = real; }
        const text = lines.join('');
        assert.equal(code, 1);
        assert.match(text, /^STOP CLI: runGate: options must be a plain object$/m);
        assert.match(text, /^VERDICT NO VERDICT \(STOP CLI\) no spec loaded$/m);
    }
});
test('runGate: unknown option -> STOP CLI with a did-you-mean hint (suite law)', async () => {
    const out = collect();
    const code = await runGate(TOY_GATE, { orcleOnly: true, out });
    assert.equal(code, 1);
    assert.match(out.text(), /^STOP CLI: runGate: unknown option orcleOnly \(did you mean oracleOnly\?\)$/m);
});
test('runGate K bounds (M32): K:52, K:0, K:1.5, K:NaN -> STOP CLI "--K 1..51" before any run', async () => {
    for (const K of [52, 0, 1.5, NaN, 1e9, -1]) {
        const out = collect();
        const code = await runGate(TOY_GATE, { K, oracleOnly: true, out });
        assert.equal(code, 1, 'K=' + K);
        assert.match(out.text(), /^STOP CLI: --K 1\.\.51$/m, 'K=' + K);
        assert.doesNotMatch(out.text(), /^HEADER rung=/m, 'K=' + K + ' must stop before the HEADER');
    }
});
test('runGate K bounds (M32): K:1 and K:51 are accepted by the option check (research runs; oracle-only exit 0)', () => {
    const r = drive([{ gate: TOY_GATE, opts: { K: 51, oracleOnly: true }, env: {} }, { gate: TOY_GATE, opts: { K: 1, oracleOnly: true }, env: {} }]);
    assert.equal(r[0].code, 0); assert.match(r[0].out, /^HEADER rung=ALL ORACLE-ONLY \(no clock\) node .* K=51 C=3 /m);
    assert.equal(r[1].code, 0); assert.match(r[1].out, /^HEADER rung=ALL ORACLE-ONLY \(no clock\) node .* K=1 C=3 /m);
});
test('runGate: a gate spec with prototype / Symbol keys -> exit 1, STOP HARNESS, VERDICT NO VERDICT (STOP HARNESS)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lite-ab-gate-spec-')); tmps.push(dir);
    const url = JSON.stringify(pathToFileURL(TOY_GATE).href);
    const files = {
        proto: `import toy from ${url}; export default Object.assign(Object.create({ inherited: 1 }), toy);\n`,
        symbol: `import toy from ${url}; export default { ...toy, [Symbol('s')]: 1 };\n`,
    };
    for (const [name, src] of Object.entries(files)) {
        const f = join(dir, name + '.mjs'); writeFileSync(f, src);
        const out = collect();
        const code = await runGate(f, { oracleOnly: true, out });
        assert.equal(code, 1, name);
        assert.match(out.text(), /^STOP HARNESS: spec: every object in a gate spec must be a plain object/m, name);
        assert.match(out.text(), /^VERDICT NO VERDICT \(STOP HARNESS\)/m, name);
    }
});

// ============================================================ hosted safety (C-17, C-25, ASSERTION 4)
test('GITHUB_ACTIONS=true + an absolute frozen path -> exit 1 with VERDICT NO VERDICT (STOP HARNESS), nothing run', () => {
    const g = variant({ absFrozen: true });
    const r = cli(g, ['--oracle-only'], { GITHUB_ACTIONS: 'true' });
    assert.equal(r.status, 1);
    assert.match(r.out, /^VERDICT NO VERDICT \(STOP HARNESS\)/m);
    assert.match(r.out, /^STOP HARNESS: /m);
    assert.doesNotMatch(r.out, /^ORACLE lane=/m, 'no lane may run');
});
test('GITHUB_ACTIONS=true + an absolute LIVE path (frozen relative) -> exit 1, STOP HARNESS', () => {
    const r = cli(variant({ absLive: true }), ['--oracle-only'], { GITHUB_ACTIONS: 'true' });
    assert.equal(r.status, 1);
    assert.match(r.out, /^VERDICT NO VERDICT \(STOP HARNESS\)/m);
});
test('hosted-safety controls: the same absolute gate is fine locally; relative paths are fine under GITHUB_ACTIONS=true', () => {
    for (const [g, env, name] of [[variant({ absFrozen: true, absLive: true }), {}, 'absolute, not hosted'], [variant({ absFrozen: true }), { GITHUB_ACTIONS: 'false' }, 'absolute, GITHUB_ACTIONS=false'],
        [TOY_GATE, { GITHUB_ACTIONS: 'true' }, 'relative, hosted']]) {
        const r = cli(g, ['--oracle-only'], env);
        assert.equal(r.status, 0, name + ': ' + r.out.slice(0, 300));
        assert.match(r.out, /^ORACLE-ONLY ALL: lanes=2 .* -> clean$/m, name);
    }
});

// ============================================================ C-21 / M04: four distinct ANCHOR STOPs, exactly one marker each
test('four distinct ANCHOR STOPs: each output holds exactly its own marker once, never another, never the old "STOP ANCHOR: live " (M04)', () => {
    const MARK = ['frozen-unreadable', 'frozen-sha', 'live-unreadable', 'live-drift'];
    const cases = [
        ['frozen-unreadable', variant({ frozenPath: 'frozen/nope.js' })],
        ['frozen-sha', variant({ tamperFrozen: true })],
        ['live-unreadable', variant({ livePath: 'live/nope.js' })],
        ['live-drift', variant({ tamperLive: true })],
    ];
    const seen = new Set();
    for (const [want, g] of cases) {
        const r = cli(g, ['--oracle-only']);
        assert.equal(r.status, 1, want);
        assert.match(r.out, /^VERDICT NO VERDICT \(STOP ANCHOR\)/m, want);
        for (const m of MARK) {
            const n = r.out.split('STOP ANCHOR: ' + m + ' ').length - 1;
            assert.equal(n, m === want ? 1 : 0, want + ' output holds marker ' + m + ' x' + n);
        }
        assert.equal(r.out.split('STOP ANCHOR: ').length - 1, 1, want + ': exactly one STOP ANCHOR line');
        assert.ok(!r.out.includes('STOP ANCHOR: live '), want + ': the old shared marker "STOP ANCHOR: live " must not appear');
        seen.add(want);
    }
    assert.equal(seen.size, 4);
});
test('live-drift injection (timed child, stops before any timing): the STOP names live-drift once', () => {
    const r = cli(TOY_GATE, ['--run', 'toy:clean', '--K', '3'], { AB_GATE_INJECT: 'live-drift' });
    assert.equal(r.status, 1);
    assert.equal(r.out.split('STOP ANCHOR: live-drift ').length - 1, 1);
    assert.ok(!r.out.includes('STOP ANCHOR: live '));
});

// ============================================================ declared K / C (C-4, C-19; M28, M30, M20)
test('declared K / C in the HEADER rung and rule lines (M28 anchored, M30): K:13 C:4 prints 13 / 4, never 11 / 3, and 20 copies', () => {
    const g = variant({ K: 13, C: 4 });
    const r = cli(g, ['--oracle-only']);
    assert.equal(r.status, 0, r.out.slice(0, 400));
    // M28: anchored on the line start (a bare /K=13/ also matches the rule line)
    assert.match(r.out, /^HEADER rung=ALL ORACLE-ONLY \(no clock\) node \S+ arch \S+ v8 \S+ cpu .+ K=13 C=4 ops=1024,1024 minWindow=64,64 inject=null$/m);
    assert.doesNotMatch(r.out, /^HEADER rung=.* K=11 /m);
    assert.match(r.out, /^HEADER rule: .*\(one HEADER rung=ALL TIMED with K=13 C=4 and the shape fields,/m);
    assert.doesNotMatch(r.out, /^HEADER rule: .*with K=11 C=3 and the shape fields/m);
    // copies = 5 columns x C = 20 (plan: the toy default 15 = 5 x 3)
    assert.equal((r.out.match(/^ORACLE lane=\S+ \(\w+\) A=k\.js B=k\.js copies=20 /gm) || []).length, 2);
});
test('default K / C (control): no declaration -> K=11 C=3, 15 copies, rule line 11 / 3', () => {
    const r = cli(TOY_GATE, ['--oracle-only']);
    assert.equal(r.status, 0);
    assert.match(r.out, /^HEADER rung=ALL ORACLE-ONLY \(no clock\) node .* K=11 C=3 ops=/m);
    assert.match(r.out, /^HEADER rule: .*with K=11 C=3 and the shape fields,/m);
    assert.equal((r.out.match(/ copies=15 /g) || []).length, 2);
});
test('declared K (13) with a research --K 3: the HEADER prints the K used (3), the rule line still the declared 13', () => {
    const r = cli(variant({ K: 13, C: 4 }), ['--oracle-only', '--K', '3']);
    assert.equal(r.status, 0);
    assert.match(r.out, /^HEADER rung=ALL ORACLE-ONLY \(no clock\) node .* K=3 C=4 ops=/m);
    assert.match(r.out, /^HEADER rule: .*with K=13 C=4 and the shape fields,/m);
});
test('timed run builds the declared C copies (M20): 5 columns x C=4 = 20 setups for one lane, the default C=3 gives 15', () => {
    const r = drive([
        { gate: variant({ C: 4, count: true }), opts: { run: 'toy:clean', K: 3 }, env: {} },
        { gate: variant({ count: true }), opts: { run: 'toy:clean', K: 3 }, env: {} },
    ]);
    assert.equal(r[0].setups, 20);
    assert.equal(r[1].setups, 15);
    for (const x of r) assert.match(x.out, /^VERDICT NO VERDICT /m);   // a subset run is never a verdict (C-15); no timing number is asserted
});

// ============================================================ C-20 / M12: harnessControls
test('harnessControls rows are deep-frozen (M12): rows, a row, its Stat, voids, ns, bop, push throws; STOP from it -> STOP HARNESS', () => {
    const hc = `function (rows, stop) {
        let t1 = false, t2 = false;
        try { rows.push(1); } catch (e) { t1 = e instanceof TypeError; }
        try { rows[0].voids.push('x'); } catch (e) { t2 = e instanceof TypeError; }
        const r = rows[0];
        stop('HC-REPORT frozen=' + [Object.isFrozen(rows), Object.isFrozen(r), Object.isFrozen(r.ratio), Object.isFrozen(r.voids), Object.isFrozen(r.ns), Object.isFrozen(r.ns.A), Object.isFrozen(r.bop), t1, t2].join(',') + ' n=' + rows.length + ' lane=' + r.lane);
    }`;
    const r = drive([{ gate: variant({ harness: hc }), opts: { run: 'toy:clean', K: 3 }, env: {} }]);
    assert.equal(r[0].code, 1);
    assert.match(r[0].out, /^STOP HARNESS: HC-REPORT frozen=true,true,true,true,true,true,true,true,true n=1 lane=toy:clean$/m);
    assert.match(r[0].out, /^VERDICT NO VERDICT \(STOP HARNESS\)/m);
});

// ============================================================ per-run state (M16, M25)
test('the log is per run (M16): a STOP verdict after an earlier run in the SAME process equals the same STOP in a fresh process', () => {
    const stopStep = { gate: TOY_GATE, opts: { run: 'toy:clean', K: 3 }, env: { AB_GATE_INJECT: 'live-drift' } };
    const alone = drive([stopStep])[0];
    const after1 = drive([{ gate: TOY_GATE, opts: { oracleOnly: true }, env: {} }, stopStep]);
    assert.equal(after1[0].code, 0);
    assert.equal(alone.code, 1);
    assert.match(alone.out, /^VERDICT NO VERDICT \(STOP ANCHOR\) shape=\[0 HEADER rung= lines \(want 1\);/m);
    assert.equal(after1[1].code, 1);
    assert.equal(after1[1].out, alone.out, 'the second run saw the first run\'s log lines');
});
test('__labLate is reset on every run (M25): a post-bend run, then a late-bend run in the same process still fails at "fold (timed)"', () => {
    const r = drive([
        { gate: TOY_GATE, opts: { run: 'toy:clean', K: 3 }, env: { AB_GATE_INJECT: 'post-bend' } },
        { gate: TOY_GATE, opts: { run: 'toy:clean', K: 3 }, env: { AB_GATE_INJECT: 'late-bend' } },
    ]);
    assert.equal(r[0].code, 1);
    assert.match(r[0].out, /^STOP ORACLE: .*\(after timing, fresh reference\)/m);
    assert.equal(r[1].code, 1);
    assert.match(r[1].out, /^STOP ORACLE: .* fold \(timed\)/m);
    assert.doesNotMatch(r[1].out, /after the oracle pass/, 'a stale __labLate flag bent B before its window');
});

// ============================================================ M31: selftest judge rows follow the declared K / C
test('selftest judge rows follow the declared K / C (M31): K:13 C:4 -> every judge row up to "(i) C=2" is ok and names want 13 / want 4', async () => {
    const g = variant({ K: 13, C: 4 });
    const text = await new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [...FLAGS, ABGATE, g, '--selftest'], { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
        let buf = '';
        const timer = setTimeout(() => { c.kill('SIGKILL'); reject(new Error('selftest judge rows not reached in 120 s')); }, 120000);
        c.stdout.on('data', (d) => { buf += d; if (/^SELFTEST judge \(i\) C=2[^\n]*\n/m.test(buf)) c.kill('SIGKILL'); });
        c.on('close', () => { clearTimeout(timer); resolve(buf); });
        c.on('error', reject);
    });
    const rows = text.split('\n').filter((l) => l.startsWith('SELFTEST judge '));
    assert.ok(rows.length >= 13, 'only ' + rows.length + ' judge rows read');
    for (const l of rows) assert.match(l, / -> ok$/, 'judge row failed: ' + l.slice(0, 200));
    assert.ok(rows.some((l) => /^SELFTEST judge \(i\) K=7: .*K=7 \(want 13\)/.test(l)), 'K=7 row must name want 13');
    assert.ok(rows.some((l) => /^SELFTEST judge \(i\) C=2: .*C=2 \(want 4\)/.test(l)), 'C=2 row must name want 4');
    assert.ok(rows.some((l) => /^SELFTEST judge PASS /.test(l)), 'the PASS row ran');
});

// ============================================================ M04b: the selftest's live-drift row names the marker it checks
test('selftest live-drift row reads its anchored marker /^STOP ANCHOR: live-drift .../m present and ok (M04b: the INJECTIONS marker RegExp, J2 C-21)', async () => {
    const text = await new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [...FLAGS, ABGATE, TOY_GATE, '--selftest'], { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
        let buf = '';
        const killGroup = () => { try { process.kill(-c.pid, 'SIGKILL'); } catch (e) { /* already gone */ } };
        const timer = setTimeout(() => { killGroup(); reject(new Error('selftest live-drift row not reached in 240 s')); }, 240000);
        c.stdout.on('data', (d) => { buf += d; if (/^SELFTEST live-drift [^\n]*\n/m.test(buf)) killGroup(); });
        c.on('close', () => { clearTimeout(timer); killGroup(); resolve(buf); });
        c.on('error', (e) => { killGroup(); reject(e); });
    });
    const row = text.split('\n').find((l) => l.startsWith('SELFTEST live-drift '));
    assert.ok(row !== undefined, 'no live-drift row read');
    assert.ok(row.endsWith(' -> ok'), row.slice(0, 300));
    assert.match(row, /marker \/\^STOP ANCHOR: live-drift \\S\+ differs from the frozen .* present, stopped before the clock/, row.slice(0, 300));
});
