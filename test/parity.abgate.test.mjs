// test/parity.abgate.test.mjs -- G-B B1 (rung J1), plan-GB ASSERTION A1 + SPEC C-9 / C-27 / C-33. DETERMINISTIC (no clock).
// The judge in the legacy dialect 'ab-gate@7e0f9262' must reproduce ab-gate 7e0f9262's VERDICT / REPORTED / exit bytes
// on the golden cut by test/fixtures/ab-gate-7e0f9262/cut-golden.mjs (55 rows: F1-F45 + B1-B10) from LiteBisect's lanes,
// gated map and HEADER shape given as data. The expected bytes come from golden.json (ab-gate's own child output),
// never from ABGate.js. Teeth: 4 bent specs must each change >= 1 row, and the same logs judged in the TOOL dialect
// (dialect omitted) must change all 55 (the tool-only checks are really on there). C-33: the tool dialect refuses a
// missing / malformed laneSha (judgeSpec throws; verdictOf's belt reads code 2 for a hand-built spec).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { judgeSpec, verdictOf } from '../ABGate.js';

const DIR = new URL('./fixtures/ab-gate-7e0f9262/', import.meta.url);
const AB_GATE_SHA = '7e0f9262f5f9b5fff5dee7c3a35a7f25c8b604164a3a45059e1619f0432a7f35';
const FIXTURE_SHAS = { ubuntu: 'c7bdc7bf1eb0e6ccb7e17765da7ff21effe615238a46c1dd1d2f912bc66e0f58', macos: '569b7d183451150b3ea8fff425b9a55f8351cbd80160973862e91b22ce3d46fe' };
const FIXTURE_FILES = { ubuntu: 'r4-ubuntu-rung-all.log', macos: 'r4-macos-rung-all.log' };
const LEGACY = 'ab-gate@7e0f9262';
const sha = (b) => createHash('sha256').update(b).digest('hex');

// applyMut + MUT_ERR: copied VERBATIM from LiteBisect bench/ab-gate.mjs sha256 7e0f9262f5f9b5fff5dee7c3a35a7f25c8b604164a3a45059e1619f0432a7f35
// (lines 1127-1142; cut-golden.mjs slices the same text from the pinned source at cut time).
function applyMut(text, m) {
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
}
const MUT_ERR = /^(sub|append|drop|dup|unknown mutation)\b/;

const goldenBuf = readFileSync(new URL('golden.json', DIR));
const G = JSON.parse(goldenBuf.toString('utf8'));
const FX = {};
for (const k of Object.keys(FIXTURE_FILES)) FX[k] = readFileSync(new URL(FIXTURE_FILES[k], DIR));

/** The row's log text: its fixture with its mutations applied (each exactly once, else the row is a failure). */
function rowText(r) {
    let text = FX[r.base].toString('utf8');
    for (const m of r.muts) {
        const t = applyMut(text, m);
        if (MUT_ERR.test(t)) throw new Error(r.id + ': mutation did not apply: ' + t);
        text = t;
    }
    return text;
}
/** verdictFile's split: text -> lines, one trailing empty line dropped. */
function toLines(text) {
    const ls = text.split('\n');
    if (ls.length > 0 && ls[ls.length - 1] === '') ls.pop();
    return ls;
}
const ROWS = G.rows.map((r) => ({ r, text: rowText(r) }));
const legacySpec = (over) => judgeSpec({ laneIds: G.spec.laneIds, gated: G.spec.gated, shape: G.spec.shape, K: G.spec.K, C: G.spec.C, dialect: LEGACY, ...over });
const same = (v, r) => v.code === r.code && v.text === r.vline && v.reported === r.rline;
const judgeAll = (spec) => ROWS.map(({ r, text }) => ({ r, v: verdictOf(spec, toLines(text)) }));
/** The differential tests below are only meaningful against an unbent legacy judge that equals the golden on 55/55. */
const baseline = () => assert.equal(judgeAll(legacySpec({})).filter(({ r, v }) => !same(v, r)).length, 0, 'precondition: the unbent legacy spec equals the golden on 55/55');

test('golden provenance: ab-gate 7e0f9262 pin, 2/2 fixture log shas, SHA256SUMS matches the 3 files, 55 rows (45 F + 10 B)', (t) => {
    assert.equal(G.source.abGateSha256, AB_GATE_SHA);
    let ok = 0;
    for (const k of Object.keys(FIXTURE_SHAS)) {
        assert.equal(G.source.fixtureShas[k], FIXTURE_SHAS[k], 'golden.json pins ' + k);
        assert.equal(sha(FX[k]), FIXTURE_SHAS[k], k + ' log sha256');
        ok++;
    }
    t.diagnostic('log shas ' + ok + '/2');
    assert.equal(ok, 2);
    const sums = readFileSync(new URL('SHA256SUMS', DIR), 'utf8').trim().split('\n').map((l) => l.split('  '));
    const want = { 'golden.json': sha(goldenBuf), [FIXTURE_FILES.ubuntu]: sha(FX.ubuntu), [FIXTURE_FILES.macos]: sha(FX.macos) };
    assert.equal(sums.length, 3);
    for (const [h, name] of sums) assert.equal(h, want[name], 'SHA256SUMS ' + name);
    assert.equal(G.rows.length, 55);
    assert.equal(G.rows.filter((r) => /^F\d+ /.test(r.id)).length, 45);
    assert.equal(G.rows.filter((r) => /^B\d+ /.test(r.id)).length, 10);
    assert.equal(new Set(G.rows.map((r) => r.id.split(' ')[0])).size, 55, 'row ids unique');
});

test('A1 textSha: 55/55 mutated logs hash to the golden textSha (applyMut verbatim, every mutation applied once)', (t) => {
    const bad = ROWS.filter(({ r, text }) => sha(text) !== r.textSha).map(({ r }) => r.id);
    t.diagnostic('textSha ' + (ROWS.length - bad.length) + '/' + ROWS.length);
    assert.deepEqual(bad, []);
    assert.equal(ROWS.length, 55);
});

test('A1 legacy dialect: {VERDICT, REPORTED, code} byte-equal to ab-gate 7e0f9262 on 55/55 rows', (t) => {
    const res = judgeAll(legacySpec({}));
    const bad = res.filter(({ r, v }) => !same(v, r));
    for (const { r, v } of bad.slice(0, 5)) t.diagnostic(r.id + ': code ' + v.code + ' (want ' + r.code + ')\n  got  ' + v.text + '\n  want ' + r.vline + (v.reported === r.rline ? '' : '\n  REPORTED differs'));
    t.diagnostic('byte-equal ' + (res.length - bad.length) + '/' + res.length);
    assert.equal(bad.length, 0);
    const codes = {};
    for (const { v } of res) codes[v.code] = (codes[v.code] || 0) + 1;
    assert.deepEqual(codes, { 0: 5, 2: 44, 3: 6 }, 'the golden code mix');
});

test('A1 bent specs: each of the 4 changes >= 1 row (ro:16 -> SLOWER; minWindow dropped; laneIds without fw:2048; K 13)', (t) => {
    const bents = [
        ['ro:16 -> SLOWER', { gated: { ...G.spec.gated, 'ro:16': 'SLOWER' } }],
        ['minWindow dropped from shape', { shape: G.spec.shape.filter(([k]) => k !== 'minWindow') }],
        ['laneIds without fw:2048', { laneIds: G.spec.laneIds.filter((id) => id !== 'fw:2048') }],
        ['K 13', { K: 13 }],
    ];
    baseline();
    for (const [name, over] of bents) {
        const res = judgeAll(legacySpec(over));
        const n = res.filter(({ r, v }) => !same(v, r)).length;
        t.diagnostic(name + ': differs on ' + n + '/55');
        assert.ok(n >= 1, name + ' changed no row');
    }
});

test('A1 dialect omitted (TOOL): the same 55 logs differ on 55/55 (the tool-only checks are live)', (t) => {
    baseline();
    const tool = judgeSpec({ laneIds: G.spec.laneIds, gated: G.spec.gated, shape: G.spec.shape, K: G.spec.K, C: G.spec.C, laneSha: AB_GATE_SHA });
    const res = judgeAll(tool);
    const n = res.filter(({ r, v }) => !same(v, r)).length;
    t.diagnostic('dialect omitted differs on ' + n + '/55');
    assert.equal(n, 55);
    for (const { v } of res) assert.notEqual(v.code, 0, 'an ab-gate log (no HEADER spec line, no warm) is never a tool PASS: ' + v.text);
});

// ---------------------------------------------------------------- C-33: laneSha is required in the tool dialect
const IDS = ['x:a', 'x:b'];
const GATED = { 'x:a': 'WITHIN' };
const SHA = '0123456789abcdef'.repeat(4);
const K = 11;
/** A clean tool-dialect log (own builder, independent of judge.rows.test.mjs): PASS under a spec with laneSha = SHA. */
function toolLog(laneSha) {
    const raw = new Array(K).fill('1.0000').join(',');
    const out = ['HEADER rung=ALL TIMED node v26.8.2 arch x64 v8 14.6 cpu Synthetic K=' + K + ' C=3 inject=null',
        'HEADER spec c33 lane-file /x/gate.mjs lane-sha256=' + laneSha + ' transform=k.js:identity | tool /x/ABGate.js sha256 00000000',
        'PROV start 2026-11-25T10:00:00.000Z load 1.00 1.00 1.00 busy-node [] quiet-lock none'];
    for (const id of IDS) {
        out.push('RESULT lane=' + id + (GATED[id] ? ' (gated)' : ' (reported)') + ' A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=1.000[0.990..1.010] word=WITHIN' +
            ' B-A=0.00[0.00..0.00]ns aa=1.000[0.990..1.010] slow=2.000[1.900..2.100] ab=n/a B/AB=n/a wordAB=n/a bop=A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000 win=64 reps=A:1,B:1 spin=8 warm=1');
        out.push('RAW lane=' + id + ' B/A=' + raw + ' AA=' + raw + ' SLOW=' + raw);
        out.push('WARM lane=' + id + ' round 0 (discarded, not in any median) A/A=1.0000 B/A=1.0000 AA/A=1.0000 SLOW/A=2.0000');
    }
    out.push('PROV end 2026-11-25T10:00:01.000Z load 1.00 1.00 1.00 busy-node [] quiet-lock none');
    return out;
}

test('C-33 judgeSpec: the tool dialect throws on a missing / undefined / null / non-64-lowercase-hex laneSha; the legacy dialect ignores it', () => {
    const base = { laneIds: IDS, gated: GATED };
    assert.doesNotThrow(() => judgeSpec({ ...base, laneSha: SHA }));
    assert.equal(judgeSpec({ ...base, laneSha: SHA }).laneSha, SHA);
    const bad = [['missing', {}], ['undefined', { laneSha: undefined }], ['null', { laneSha: null }], ['uppercase', { laneSha: SHA.toUpperCase() }],
        ['63 hex', { laneSha: SHA.slice(1) }], ['65 hex', { laneSha: SHA + '0' }], ['non-hex', { laneSha: SHA.slice(1) + 'g' }], ['number', { laneSha: 1 }], ['empty', { laneSha: '' }]];
    for (const [name, o] of bad) assert.throws(() => judgeSpec({ ...base, ...o }), /laneSha/, 'tool dialect, laneSha ' + name);
    for (const [name, o] of bad) {
        let s = null;
        assert.doesNotThrow(() => { s = judgeSpec({ ...base, ...o, dialect: LEGACY }); }, 'legacy dialect, laneSha ' + name);
        assert.equal(s.laneSha, null, 'legacy dialect stores no laneSha (' + name + ')');
    }
    // the other refusals still name their own key once laneSha is valid (C-13 / C-14 / C-4 / C-27)
    const ok = { ...base, laneSha: SHA };
    assert.throws(() => judgeSpec({ ...ok, bogus: 1 }), /unknown key bogus/);
    assert.throws(() => judgeSpec({ ...ok, gated: {} }), /gated must name at least one lane/);
    assert.throws(() => judgeSpec({ ...ok, gated: { 'x:nope': 'FASTER' } }), /x:nope not in laneIds/);
    assert.throws(() => judgeSpec({ ...ok, gated: { 'x:a': 'FAST' } }), /word FAST /);
    assert.throws(() => judgeSpec({ ...ok, K: 10 }), /^Error: judgeSpec: K 10 /);
    assert.throws(() => judgeSpec({ ...ok, C: 2 }), /^Error: judgeSpec: C 2 /);
    assert.throws(() => judgeSpec({ ...ok, dialect: 'nope' }), /unknown dialect/);
    assert.throws(() => judgeSpec({ ...ok, shape: [['k', 5]] }), /bad shape entry/);
    for (const k of ['aaLo', 'aaHi', 'slowMed', 'slowQ1', 'allocMax', 'allocTxt', 'bopCols', 'band']) assert.throws(() => judgeSpec({ ...ok, [k]: 1 }), new RegExp('unknown key ' + k));
});

test('C-33 belt: verdictOf reads code 2 for a tool-dialect spec object whose laneSha is not 64 lowercase hex (built without judgeSpec)', () => {
    const good = judgeSpec({ laneIds: IDS, gated: GATED, laneSha: SHA });
    const log = toolLog(SHA);
    const control = verdictOf(good, log);
    assert.equal(control.code, 0, 'control: the clean tool log reads PASS under the valid spec: ' + control.text);
    const { laneSha: _drop, ...noKey } = good;
    for (const [name, sp] of [['null', { ...good, laneSha: null }], ['undefined', { ...good, laneSha: undefined }], ['key absent', noKey],
        ['uppercase', { ...good, laneSha: SHA.toUpperCase() }], ['short', { ...good, laneSha: SHA.slice(8) }]]) {
        const v = verdictOf(sp, log);
        assert.equal(v.code, 2, 'belt ' + name + ': ' + v.text);
        assert.ok(v.text.startsWith('VERDICT NO VERDICT'), v.text);
    }
    // the legacy dialect ignores laneSha: the same hand-built null is no belt there (an ab-gate log has no HEADER spec line)
    const leg = judgeSpec({ laneIds: IDS, gated: GATED, dialect: LEGACY });
    assert.equal(verdictOf({ ...leg, laneSha: null }, log).code, 0);
});

test('r2 own keys only: a polluted Object.prototype.dialect never flips the tool dialect to legacy (C-27 / C-33)', () => {
    const good = judgeSpec({ laneIds: IDS, gated: GATED, laneSha: SHA });
    const { dialect: _d, ...noOwnDialect } = good;
    try {
        Object.prototype.dialect = LEGACY;
        assert.throws(() => judgeSpec({ laneIds: IDS, gated: GATED }), /laneSha/, 'judgeSpec read an inherited dialect');
        const v = verdictOf({ ...noOwnDialect, laneSha: null }, toolLog(SHA));
        assert.equal(v.code, 2, 'verdictOf read an inherited dialect: ' + v.text);
        assert.ok(v.text.includes('(judge spec)'), v.text);
    } finally {
        delete Object.prototype.dialect;
    }
    assert.equal(Object.hasOwn(Object.prototype, 'dialect'), false);
});
