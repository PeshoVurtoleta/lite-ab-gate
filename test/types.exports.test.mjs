// test/types.exports.test.mjs (in the npm test glob test/*.test.mjs) -- G-A B3 (plan-GA TASK 6): ABGate.d.ts must match the RUNTIME module (DETERMINISTIC).
// typescript has no classic JS API here, so the .d.ts is read by a line grammar over top-level declarations:
//   `export declare const NAME: <T>;`, `export declare function NAME(<params>): <R>;` (one line each, JSDoc above) and
//   `export interface NAME {` ... `}` blocks whose members sit on one line each (`    readonly key?: <T>;`).
// Expected values come from the SPEC (C-4, C-13, C-19, C-27) and the brief, never from ABGate.js; the runtime is read
// only for the export NAMES, the function arities and the constant VALUES it must equal.
// Controls: the same compare function judged on mutated d.ts TEXT (a missing / extra export, a wrong literal) must
// report a failure (suite law 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DTS = readFileSync(new URL('../ABGate.d.ts', import.meta.url), 'utf8');
const MOD = await import(new URL('../ABGate.js', import.meta.url).href);

// ---- the SPEC side (independent of ABGate.js) ----
const WANT_VALUES = ['AA_HI', 'AA_LO', 'ALLOC_MAX', 'C_COPIES', 'EXIT', 'K_ROUNDS', 'REQUIRED_FLAGS', 'SLOW_MED', 'SLOW_Q1',
    'defineGate', 'judgeSpec', 'runGate', 'verdictOf'];
const WANT_TYPES = ['Col', 'Frozen', 'GateSpec', 'Judgement', 'Lane', 'LaneRow', 'Stat'];   // C-13 surface
const WANT_ARITY = { defineGate: 1, judgeSpec: 1, runGate: 2, verdictOf: 2 };
const WANT_CONSTS = { K_ROUNDS: 11, C_COPIES: 3, AA_LO: 0.95, AA_HI: 1.05, SLOW_MED: 1.25, SLOW_Q1: 1.1, ALLOC_MAX: 1 / 64 };   // C-4
// interface -> [required keys, optional keys]
const WANT_KEYS = {
    GateSpec: [['name', 'frozen', 'transform', 'gated', 'lanes'], ['shape', 'harnessControls', 'K', 'C']],                  // C-13, C-19
    Lane: [['id', 'ops', 'minWindow', 'spin', 'recLen', 'A', 'B', 'bend', 'make'], ['workFloor']],
    Col: [['source', 'anchor', 'setup', 'run', 'one'], []],
    Frozen: [['name', 'frozen', 'sha256'], ['live']],                                                                        // C-25: live optional
    JudgeSpecInput: [['laneIds', 'gated'], ['shape', 'K', 'C', 'run', 'laneSha', 'dialect']],                                // C-27 RULED J1 shape
    RunOptions: [[], ['run', 'K', 'oracleOnly', 'out']],
    Stat: [['med', 'q1', 'q3'], []],
    Judgement: [['code', 'text', 'reported'], []],
};

const ID = '[A-Za-z_$][A-Za-z0-9_$]*';
const CONST_RE = new RegExp('^export declare const (' + ID + '): (.+);$');
const FN_RE = new RegExp('^export declare function (' + ID + ')\\(([^)]*)\\): ([^;]+);$');
const IFACE_RE = new RegExp('^export interface (' + ID + ') \\{$');
const TYPE_RE = new RegExp('^export type (' + ID + ') = ');
const MEMBER_RE = new RegExp('^    (?:readonly )?(' + ID + ')(\\?)?[:(<]');

function parseDts(text) {
    const consts = new Map(), fns = new Map(), ifaces = new Map(), types = new Set(), errors = [];
    const lines = text.split('\n');
    let cur = null, block = false, constOpen = null;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], l = raw.trim(), at = 'line ' + (i + 1) + ': ';
        if (block) { if (l.includes('*/')) block = false; continue; }
        if (l.startsWith('/*')) { if (!l.includes('*/')) block = true; continue; }
        if (cur !== null) {
            if (raw === '}') { cur = null; continue; }
            if (raw.startsWith('    ') && !raw.startsWith('     ') && !raw.startsWith('    //') && !raw.startsWith('    /*') && !raw.startsWith('    *')) {
                const m = MEMBER_RE.exec(raw);
                if (m !== null) cur.set(m[1], m[2] === '?');
            }
            continue;
        }
        if (constOpen !== null) { if (l === '];') constOpen = null; else constOpen.push(l); continue; }
        if (l === '' || l.startsWith('//')) continue;
        let m = IFACE_RE.exec(raw);
        if (m !== null) { cur = new Map(); ifaces.set(m[1], cur); continue; }
        if (TYPE_RE.test(raw)) { types.add(TYPE_RE.exec(raw)[0].split(' ')[2]); continue; }
        m = FN_RE.exec(raw);
        if (m !== null) { fns.set(m[1], { params: m[2].trim() === '' ? 0 : m[2].split(',').length, ret: m[3] }); continue; }
        m = CONST_RE.exec(raw);
        if (m !== null) { consts.set(m[1], m[2]); continue; }
        if (/^export declare const (\w+): readonly \[$/.test(raw)) { constOpen = []; consts.set(raw.split(' ')[3].slice(0, -1), constOpen); continue; }
        errors.push(at + 'unparsed top-level line: ' + raw);
    }
    return { consts, fns, ifaces, types, errors };
}

/** Compare a parsed d.ts against the runtime module; returns the list of failures (empty = match). */
function compare(p, mod) {
    const f = [];
    f.push(...p.errors);
    const dtsValues = [...p.consts.keys(), ...p.fns.keys()].sort();
    const run = Object.keys(mod).sort();
    for (const n of run) if (!dtsValues.includes(n)) f.push('runtime export missing from d.ts: ' + n);
    for (const n of dtsValues) if (!run.includes(n)) f.push('d.ts value export not in runtime: ' + n);
    for (const n of WANT_VALUES) if (!dtsValues.includes(n)) f.push('spec value export missing from d.ts: ' + n);
    for (const n of WANT_TYPES) if (!p.ifaces.has(n) && !p.types.has(n)) f.push('type missing from d.ts: ' + n);
    for (const [n, want] of Object.entries(WANT_ARITY)) {
        if (typeof mod[n] !== 'function') f.push(n + ' is not a runtime function');
        else if (mod[n].length !== want) f.push(n + ' runtime arity ' + mod[n].length + ' (want ' + want + ')');
        const d = p.fns.get(n);
        if (d === undefined || d.params !== want) f.push(n + ' d.ts params ' + (d && d.params) + ' (want ' + want + ')');
    }
    for (const [n, v] of Object.entries(WANT_CONSTS)) {
        if (mod[n] !== v) f.push(n + ' runtime ' + mod[n] + ' (want ' + v + ')');
        const t = p.consts.get(n);
        if (t === undefined || Number(t) !== v) f.push(n + ' d.ts literal ' + t + ' (want ' + v + ')');
    }
    for (const [n, [req, opt]] of Object.entries(WANT_KEYS)) {
        const m = p.ifaces.get(n);
        if (m === undefined) { f.push('interface missing: ' + n); continue; }
        for (const k of req) if (m.get(k) !== false) f.push(n + '.' + k + ' must be present and required');
        for (const k of opt) if (m.get(k) !== true) f.push(n + '.' + k + ' must be present and optional');
        for (const k of m.keys()) if (!req.includes(k) && !opt.includes(k)) f.push(n + '.' + k + ' is not in the spec');
    }
    // the REQUIRED_FLAGS tuple, EXIT, and the ruled literal 'ab-gate@7e0f9262'
    const flags = p.consts.get('REQUIRED_FLAGS');
    const flagList = Array.isArray(flags) ? flags.map((x) => x.replace(/[',]/g, '')).filter((x) => x !== '') : null;
    if (flagList === null || JSON.stringify(flagList) !== JSON.stringify(mod.REQUIRED_FLAGS)) f.push('REQUIRED_FLAGS tuple differs from the runtime array');
    const exit = p.consts.get('EXIT') || '';
    for (const [k, v] of Object.entries(mod.EXIT)) if (!exit.includes(k + ': ' + v)) f.push('EXIT.' + k + ' literal ' + v + ' not in the d.ts');
    if ((DTS_FOR_LITERALS.match(/readonly dialect\?: 'ab-gate@7e0f9262';/g) || []).length !== 2) f.push("dialect literal 'ab-gate@7e0f9262' must appear in JudgeSpecInput and JudgeSpec");
    return f;
}
let DTS_FOR_LITERALS = DTS;

test('types: ABGate.d.ts parses by the line grammar (0 unparsed top-level lines)', () => {
    DTS_FOR_LITERALS = DTS;
    assert.deepEqual(parseDts(DTS).errors, []);
});

test('types: ABGate.d.ts matches the runtime export names, arities, constants and interface keys', () => {
    DTS_FOR_LITERALS = DTS;
    assert.deepEqual(compare(parseDts(DTS), MOD), []);
});

test('types: d.ts is ASCII only and says what the spec requires (K 11..51, C 3..9, top gate file only, plain options)', () => {
    assert.ok(/^[\x00-\x7f]*$/.test(DTS), 'non-ASCII byte in ABGate.d.ts');
    assert.ok(/11 \.\. 51/.test(DTS), 'K range 11 .. 51 (C-19)');
    assert.ok(/3 \.\. 9/.test(DTS), 'C range 3 .. 9 (C-19)');
    assert.ok(/top gate file only/.test(DTS), 'lane-sha256 covers the top gate file only');
    assert.ok(/PLAIN object/.test(DTS) || /plain object/.test(DTS), 'runGate opts must be a plain object');
});

// ---- controls: the same compare, mutated d.ts text, must fail ----
function mutate(text, from, to) {
    const i = text.indexOf(from);
    assert.ok(i >= 0 && text.indexOf(from, i + 1) < 0, 'mutation not applicable (need exactly one match): ' + from);
    return text.slice(0, i) + to + text.slice(i + from.length);
}
const CONTROLS = [
    ['export dropped', (t) => mutate(t, 'export declare function verdictOf(', 'declare function verdictOf(')],
    ['extra export', (t) => t + '\nexport declare const EXTRA: 1;\n'],
    ['wrong literal', (t) => mutate(t, 'export declare const K_ROUNDS: 11;', 'export declare const K_ROUNDS: 12;')],
    ['optional became required', (t) => mutate(t, 'readonly live?: string;', 'readonly live: string;')],
    ['required became optional', (t) => mutate(t, 'readonly gated: { readonly [laneId: string]: Word };\n    /** Extra HEADER', 'readonly gated?: { readonly [laneId: string]: Word };\n    /** Extra HEADER')],
    ['wrong arity', (t) => mutate(t, 'verdictOf(spec: JudgeSpec, lines: readonly string[])', 'verdictOf(spec: JudgeSpec)')],
    ['dialect literal changed', (t) => mutate(t, "readonly dialect?: 'ab-gate@7e0f9262';\n}\n\n/** The validated", "readonly dialect?: 'x';\n}\n\n/** The validated")],
];
for (const [name, fn] of CONTROLS) {
    test('types control: ' + name + ' -> the compare reports a failure', () => {
        DTS_FOR_LITERALS = DTS;
        assert.deepEqual(compare(parseDts(DTS), MOD), [], 'control is vacuous: the unmutated d.ts must pass first');
        const text = fn(DTS);
        DTS_FOR_LITERALS = text;
        try { assert.ok(compare(parseDts(text), MOD).length > 0, 'the mutated d.ts still passes'); } finally { DTS_FOR_LITERALS = DTS; }
    });
}
