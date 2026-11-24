// cut-golden.mjs -- G-B TASK 0 (C-9): cut the ab-gate 7e0f9262 judge goldens for test/parity.abgate.test.mjs.
// UNTIMED and deterministic: --verdict-file runs no clock, so no quiet lock is needed.
//   node test/fixtures/ab-gate-7e0f9262/cut-golden.mjs <LiteBisectDir>
// <LiteBisectDir> is REQUIRED and has no default (C-17): a LiteBisect checkout, or a read-only snapshot of one with the
// same relative layout (bench/ab-gate.mjs + bench/ab-fixtures/r4-{ubuntu,macos}-rung-all.log). Never point it at a tree
// someone is editing: export the pinned blobs first (git show <commit>:<path>).
// Reads only. Writes golden.json, the two fixture logs (verbatim) and SHA256SUMS next to this script, and only after
// every self-check passed:
//   P0 ab-gate.mjs, both fixtures and r0 equal the sha256 pins below (a changed input = STOP, exit 1, nothing written);
//      the lane-id generator matches ab-gate's size constants and both fixtures' RESULT order; the spec's K / C / shape
//      match ab-gate's own constants, its HEAD_RE field order and both fixtures' HEADER line;
//   P1 every row's mutation applies exactly once (ab-gate's own applyMut, sliced from its source text, never retyped);
//   P2 every row reads its own expected exit and VERDICT prefix (F-rows: ab-gate's FIXTURE_CASES, incl. its "names"
//      texts; B-rows: r0's exit plus the prefix of that exit, and a non-PASS B-row names its lane), exactly one VERDICT
//      and one REPORTED line, and the child's VERDICT-FILE line echoes this row's text sha256 and line count.
// Sources: ab-gate.mjs blob 7e0f9262 is introduced by LiteBisect commit 3621f699f0f100d61498e51ad1fad86f971ecada and is
// unchanged at b5c298831debaa70aac3a140d28003f10d92a46f (LITEBISECT-PIN.txt), the commit this golden was cut from.
// r0 = research/timing-ab/r0-verdict-parity.mjs 16693c6e: its between() is copied verbatim below; its lane-id
// generator and its boundary rows B1-B10 are sliced from its source text. ASCII only.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const AB_GATE_SHA = '7e0f9262f5f9b5fff5dee7c3a35a7f25c8b604164a3a45059e1619f0432a7f35';
const FIXTURE_SHAS = Object.freeze({
    ubuntu: 'c7bdc7bf1eb0e6ccb7e17765da7ff21effe615238a46c1dd1d2f912bc66e0f58',
    macos: '569b7d183451150b3ea8fff425b9a55f8351cbd80160973862e91b22ce3d46fe',
});
const R0_SHA = '16693c6e23d07d4a2e3fc8d9a97776c242e69e5e5c487ce8e736ef3d33b1624f';
const LITEBISECT_COMMIT = 'b5c298831debaa70aac3a140d28003f10d92a46f';
const SHAPE = [['NQ2', '524288'], ['minWindow', '131072']];
const K = 11, C = 3;
const N_F = 45, N_B = 10, N_LANES = 23, N_GATED = 13;
// B-rows carry an exit only (r0 :254-264); the prefix each exit must read (C-15; every B-row targets one gated lane)
const B_PREFIX = Object.freeze({ 0: 'VERDICT PASS', 2: 'VERDICT NO VERDICT (gated lane not clean)', 3: 'VERDICT FINDING' });

const ME = fileURLToPath(import.meta.url);
const OUT = dirname(ME);
const R0 = resolve(OUT, '../../../research/timing-ab/r0-verdict-parity.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const say = (s) => process.stdout.write(s + '\n');
function die(s) { process.stderr.write('STOP ' + s + '\n'); process.exit(1); }

if (process.argv.length !== 3 || process.argv[2] === '') {
    process.stderr.write('usage: node test/fixtures/ab-gate-7e0f9262/cut-golden.mjs <LiteBisectDir>\n' +
        '  <LiteBisectDir> (required, no default): a LiteBisect checkout or snapshot holding bench/ab-gate.mjs ' + AB_GATE_SHA.slice(0, 8) + '\n');
    process.exit(1);
}
const PKG = resolve(process.argv[2]);
const GATE = join(PKG, 'bench/ab-gate.mjs');

// r0 :40-44, verbatim, bound to one source text
function makeBetween(src) {
    return function between(a, b) {
        const i = src.indexOf(a), j = src.indexOf(b, i + 1);
        if (i < 0 || j < 0 || src.indexOf(a, i + 1) >= 0) throw new Error('anchor ' + a + ' / ' + b + ' not unique');
        return src.slice(i, j);
    };
}
function readPinned(path, want, what) {
    let buf;
    try { buf = readFileSync(path); } catch (e) { return die('P0 ' + what + ' unreadable (' + (e.code || e.message) + ')'); }
    const got = sha(buf);
    if (got !== want) die('P0 ' + what + ' sha256 ' + got.slice(0, 8) + ' (want ' + want.slice(0, 8) + ')');
    say('ok   P0 ' + what + ' sha256 ' + got.slice(0, 8));
    return buf;
}

// ---------------------------------------------------------------- P0: pins, then slice (never retyped)
const gateBuf = readPinned(GATE, AB_GATE_SHA, 'ab-gate.mjs');
const r0Src = readPinned(R0, R0_SHA, 'r0-verdict-parity.mjs').toString('utf8');
const src = gateBuf.toString('utf8');
const between = makeBetween(src), r0Between = makeBetween(r0Src);
const tablesSrc = between('const FIXTURES = Object.freeze({', 'const REQUIRED_FLAGS') + '\n' +
    between('const MUT_F3 =', 'const MUT_ERR =') + '\n' + between('const MUT_ERR =', '\n') + '\n' +
    'return { FIXTURES, FIXTURE_CASES, applyMut, MUT_ERR, MUT_F3, MUT_F4 };';
const T = new Function('join', 'PKG', tablesSrc)(join, PKG);
const GATED = new Function(between('const GATED = Object.freeze({', 'const isGated') + '\nreturn GATED;')();
const LANES = new Function(r0Between('const LANES_LB = (() => {', '// the lane-id list above') + '\nreturn LANES_LB;')();
const BROWS = new Function(r0Between('const U4096 =', 'const brows = [];') + '\nreturn BROWS;')();

if (JSON.stringify(Object.keys(T.FIXTURES)) !== JSON.stringify(Object.keys(FIXTURE_SHAS))) die('P0 fixture keys ' + Object.keys(T.FIXTURES).join(','));
const fx = {};
for (const k of Object.keys(FIXTURE_SHAS)) {
    if (T.FIXTURES[k].sha !== FIXTURE_SHAS[k]) die('P0 ab-gate FIXTURES.' + k + '.sha ' + T.FIXTURES[k].sha.slice(0, 8) + ' (want ' + FIXTURE_SHAS[k].slice(0, 8) + ')');
    const buf = readPinned(T.FIXTURES[k].path, FIXTURE_SHAS[k], 'fixture ' + k);
    fx[k] = { buf, name: T.FIXTURES[k].path.slice(T.FIXTURES[k].path.lastIndexOf('/') + 1), text: buf.toString('utf8') };
}
function need(ok, txt) { if (!ok) die(txt); say('ok   ' + txt); }
need(src.includes('const T2_SIZES = [256, 4096, 65536];') && src.includes('const RO_SIZES = [16, 256, 4096, 65536];') &&
    src.includes('const FW_SIZES = [16, 128, 1024, 2048];') && src.includes('const t2Ds = (n) => [1, 4, 64, n >>> 3]'),
'P0 lane-id generator matches ab-gate size constants');
for (const k of Object.keys(fx)) {
    const ids = fx[k].text.split('\n').filter((l) => l.startsWith('RESULT lane=')).map((l) => l.split(' ')[1].slice(5));
    need(LANES.length === N_LANES && JSON.stringify(ids) === JSON.stringify(LANES), 'P0 lane ids (' + LANES.length + ') equal the ' + k + ' fixture RESULT order');
}
const gatedIds = Object.keys(GATED);
need(gatedIds.length === N_GATED && gatedIds.every((id) => LANES.includes(id)), 'P0 GATED (' + gatedIds.length + ') sliced, every id a lane');
need(src.includes('const K_FULL = ' + K + ';') && src.includes('const C_COPIES = ' + C + ';') && src.includes('const NQ = 1 << 18;') &&
    src.includes('const NQ2 = NQ * 2;') && src.includes('const MIN_N = 1 << 17;') && 2 * (1 << 18) === Number(SHAPE[0][1]) && (1 << 17) === Number(SHAPE[1][1]) &&
    src.includes(' K=(\\S+) C=(\\S+) NQ2=(\\S+) minWindow=(\\S+) inject=(\\S+)$/;'),
'P0 spec K=' + K + ' C=' + C + ' shape ' + JSON.stringify(SHAPE) + ' equal ab-gate constants and HEAD_RE field order');
const headTail = ' K=' + K + ' C=' + C + SHAPE.map(([k, v]) => ' ' + k + '=' + v).join('') + ' inject=null';
for (const k of Object.keys(fx)) {
    const h = fx[k].text.split('\n').filter((l) => l.startsWith('HEADER rung='));
    need(h.length === 1 && h[0].endsWith(headTail), 'P0 ' + k + ' fixture HEADER ends' + headTail);
}
need(T.FIXTURE_CASES.length === N_F && BROWS.length === N_B, 'P0 sliced ' + T.FIXTURE_CASES.length + ' F-rows (want ' + N_F + ') and ' + BROWS.length + ' B-rows (want ' + N_B + ')');

// ---------------------------------------------------------------- P1 + P2: every row through the original child
function judge(id, base, muts, want, prefix, names) {
    let text = fx[base].text;
    for (const m of muts) {
        const t = T.applyMut(text, m);
        if (T.MUT_ERR.test(t)) die('P1 ' + id + ' mutation did not apply: ' + t);
        text = t;
    }
    const textSha = sha(text);
    let nLines = text.split('\n').length;
    if (text.endsWith('\n')) nLines--;
    // r0 :214 / :270: the same child, the same options, no node flags (--verdict-file needs none)
    const r = spawnSync(process.execPath, [GATE, '--verdict-file', '-'], { input: text, encoding: 'utf8', maxBuffer: 1 << 24, timeout: 60000 });
    const ls = (r.stdout || '').split('\n');
    const vl = ls.filter((l) => l.startsWith('VERDICT ')), rl = ls.filter((l) => l.startsWith('REPORTED ')), fl = ls.filter((l) => l.startsWith('VERDICT-FILE '));
    const echo = fl.length === 1 && fl[0] === 'VERDICT-FILE (stdin) sha256 ' + textSha.slice(0, 8) + ' lines=' + nLines;
    const named = names.every((s) => vl.length === 1 && vl[0].includes(s));
    const ok = r.error === undefined && r.signal === null && r.status === want && vl.length === 1 && vl[0].startsWith(prefix) && named && rl.length === 1 && echo;
    if (!ok) {
        die('P2 ' + id + ': exit ' + r.status + ' (want ' + want + ') signal ' + r.signal + (r.error ? ' error ' + r.error.message : '') + ' VERDICT lines ' + vl.length +
            ' REPORTED lines ' + rl.length + ' echo ' + (echo ? 'ok' : JSON.stringify(fl)) + ' verdict ' + JSON.stringify((vl[0] || '').slice(0, 120)) +
            ' (want ' + JSON.stringify(prefix) + (names.length > 0 ? ' naming ' + JSON.stringify(names) : '') + ')');
    }
    say('ok   P2 ' + id.split(' ')[0] + ' exit ' + r.status + ' ' + vl[0].slice(0, 70));
    return { id, base, muts, textSha, code: r.status, vline: vl[0], rline: rl[0] };
}
const rows = [];
for (const [id, base, muts, want, prefix, names] of T.FIXTURE_CASES) rows.push(judge(id, base, muts, want, prefix, names));
for (const [id, m, want] of BROWS) {
    if (!Object.hasOwn(B_PREFIX, want)) die('P2 ' + id + ': exit ' + want + ' has no prefix');
    const lane = /^B\d+ gated (\S+) /.exec(id);
    if (lane === null || !LANES.includes(lane[1])) die('P2 ' + id + ': names no lane');
    rows.push(judge(id, 'ubuntu', [m], want, B_PREFIX[want], want === 0 ? [] : [lane[1]]));
}
need(rows.length === N_F + N_B && new Set(rows.map((r) => r.id.split(' ')[0])).size === rows.length, 'P2 rows ' + rows.length + ' (want ' + (N_F + N_B) + '), ids unique');

// ---------------------------------------------------------------- write (only after every check passed)
const golden = {
    source: { abGateSha256: AB_GATE_SHA, fixtureShas: { ...FIXTURE_SHAS }, litebisectCommit: LITEBISECT_COMMIT },
    node: process.version,
    date: new Date().toISOString(),
    spec: { laneIds: LANES, gated: { ...GATED }, shape: SHAPE, K, C },
    rows,
};
const goldenTxt = JSON.stringify(golden, null, 1) + '\n';
if (!/^[\x0a\x20-\x7e]*$/.test(goldenTxt)) die('golden.json is not ASCII');
const files = [['golden.json', Buffer.from(goldenTxt, 'utf8')], ...Object.keys(fx).map((k) => [fx[k].name, fx[k].buf])];
for (const [name, buf] of files) writeFileSync(join(OUT, name), buf);
writeFileSync(join(OUT, 'SHA256SUMS'), files.map(([name, buf]) => sha(buf) + '  ' + name).join('\n') + '\n');
const codes = {};
for (const r of rows) codes[r.code] = (codes[r.code] || 0) + 1;
say('CUT-GOLDEN ok | rows ' + rows.length + ' codes ' + Object.keys(codes).map((c) => c + ':' + codes[c]).join(' ') + ' | ab-gate ' + AB_GATE_SHA.slice(0, 8) +
    ' | golden.json ' + sha(files[0][1]).slice(0, 8) + ' | node ' + process.version + ' | ' + golden.date);
