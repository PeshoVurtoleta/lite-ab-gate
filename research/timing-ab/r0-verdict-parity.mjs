// r0-verdict-parity.mjs -- timing-ab research burst, rung R0 probe (UNTIMED, deterministic; no clock, no quiet lock).
// Question: can ab-gate's verdict path (verdictOf, bench/ab-gate.mjs:893-1021 at 7e0f9262) be parametrized behind declared
// data WITHOUT changing a verdict? Method: a parametrized prototype verdictOfG(spec, lines) -- every LiteBisect-specific
// input (lane id set, GATED map, the HEADER's workload shape fields NQ2 / minWindow) moved into `spec`, every other line
// copied -- is run in-process on each fixture row of ab-gate's own selftest (F1-F45: one row per verdictOf check, LEDGER
// law 9), and the ORIGINAL ab-gate.mjs is run as a child `--verdict-file -` on the same mutated text. PASS = for every
// row the VERDICT line, the REPORTED line and the code are byte-identical.
// Self-checks (a probe without them is void):
//   P0 the ab-gate.mjs and fixture sha256 equal the pins below (a changed input = STOP, no numbers);
//   P1 every row's mutation applies exactly once (ab-gate's own applyMut, sliced from its source text, not retyped);
//   P2 the original reads the row's own expected exit + VERDICT prefix (ab-gate's FIXTURE_CASES table);
//   P3 must-fail controls: three BENT specs (a gated word flipped; a HEADER shape field dropped; the A/A band widened)
//      must each DIFFER from the original on >= 1 row, else the parity comparison has no teeth;
//   P5 (review r1) boundary rows B1-B10: F1-F45 sit away from every comparator boundary, so a > / >= flip kept 45 / 45.
//      B-rows put one value ON each boundary (word med 0.95 / 1.05, word q1 / q3 = 1, aa med 0.95 / 1.05, slow med 1.25,
//      slow q1 1.10, bop 1/64, a literal Infinity); parity must hold there too, and each of 10 comparator flips (spec.flip,
//      default off) must differ on >= 1 row (its must-fail control);
//   P4 a SYNTHETIC 3-lane spec (no LiteBisect name in it) reads PASS / FINDING / NO VERDICT on 3 synthetic logs:
//      the parametrization is not secretly bound to LiteBisect's 23 lanes.
// Reads LiteBisect files only (absolute paths, read-only). Writes nothing. ASCII only.
//   node r0-verdict-parity.mjs [/abs/path/to/LiteBisect]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const PKG = process.argv[2] || '/Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteBisect';
const GATE = join(PKG, 'bench/ab-gate.mjs');
const PIN = '7e0f9262f5f9b5fff5dee7c3a35a7f25c8b604164a3a45059e1619f0432a7f35';
const sha = (b) => createHash('sha256').update(b).digest('hex');
let bad = 0;
const out = (s) => process.stdout.write(s + '\n');
function check(ok, txt) { out((ok ? 'ok   ' : 'FAIL ') + txt); if (!ok) bad++; return ok; }

// ---------------------------------------------------------------- P0 + slice ab-gate's own tables (never retyped)
const gateBuf = readFileSync(GATE);
const gateSha = sha(gateBuf);
if (!check(gateSha === PIN, 'P0 ab-gate.mjs sha256 ' + gateSha.slice(0, 8) + ' (pin ' + PIN.slice(0, 8) + ')')) process.exit(1);
const src = gateBuf.toString('utf8');
function between(a, b) {
    const i = src.indexOf(a), j = src.indexOf(b, i + 1);
    if (i < 0 || j < 0 || src.indexOf(a, i + 1) >= 0) throw new Error('anchor ' + a + ' / ' + b + ' not unique');
    return src.slice(i, j);
}
const tablesSrc = between('const FIXTURES = Object.freeze({', 'const REQUIRED_FLAGS') + '\n' +
    between('const MUT_F3 =', 'const MUT_ERR =') + '\nconst MUT_ERR = /^(sub|append|drop|dup|unknown mutation)\\b/;\n' +
    'return { FIXTURES, FIXTURE_CASES, applyMut, MUT_ERR };';
const T = new Function('join', 'PKG', tablesSrc)(join, PKG);
for (const k of Object.keys(T.FIXTURES)) {
    const b = readFileSync(T.FIXTURES[k].path);
    if (!check(sha(b) === T.FIXTURES[k].sha, 'P0 fixture ' + k + ' sha256 ' + sha(b).slice(0, 8))) process.exit(1);
    T.FIXTURES[k].text = b.toString('utf8');
}
// GATED and the lane ids: sliced from the source text too (the spec is data, typed nowhere here)
const GATED_LB = new Function(between('const GATED = Object.freeze({', 'const isGated') + '\nreturn GATED;')();
const LANES_LB = (() => {
    const t2 = [256, 4096, 65536], ds = (n) => [1, 4, 64, n >>> 3].sort((x, y) => x - y);
    const ids = t2.flatMap((n) => ['uni:' + n, ...ds(n).map((d) => 'walk:' + n + ':' + d)]);
    return [...ids, ...[16, 256, 4096, 65536].map((n) => 'ro:' + n), ...[16, 128, 1024, 2048].map((n) => 'fw:' + n)];
})();
// the lane-id list above is the one thing retyped (rungSpecs builds it from code, not a literal): guard it against the
// source's own size constants and against the ubuntu fixture's RESULT lines (both must agree, order included)
const fxIds = T.FIXTURES.ubuntu.text.split('\n').filter((l) => l.startsWith('RESULT lane=')).map((l) => l.split(' ')[1].slice(5));
check(src.includes('const T2_SIZES = [256, 4096, 65536];') && src.includes('const RO_SIZES = [16, 256, 4096, 65536];') &&
    src.includes('const FW_SIZES = [16, 128, 1024, 2048];') && src.includes('const t2Ds = (n) => [1, 4, 64, n >>> 3]'),
'P0 lane-id generator matches ab-gate size constants');
check(JSON.stringify(fxIds) === JSON.stringify(LANES_LB), 'P0 lane ids (' + LANES_LB.length + ') equal the ubuntu fixture RESULT order');

// ---------------------------------------------------------------- the generic prototype (verdictOf with spec inputs)
function makeSpec(o) {
    const s = {
        laneIds: o.laneIds, gated: o.gated, K: o.K ?? 11, C: o.C ?? 3, shape: o.shape ?? [], run: o.run ?? 'ALL',
        aaLo: o.aaLo ?? 0.95, aaHi: o.aaHi ?? 1.05, slowMed: o.slowMed ?? 1.25, slowQ1: o.slowQ1 ?? 1.10,
        allocMax: o.allocMax ?? 1 / 64, flip: new Set(o.flip ?? []), allocTxt: o.allocTxt ?? '1/64', bopCols: o.bopCols ?? ['A', 'B', 'AA', 'SLOW'],
    };
    for (const id of Object.keys(s.gated)) if (!s.laneIds.includes(id)) throw new Error('gated lane ' + id + ' not in laneIds');
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s.headRe = new RegExp('^HEADER rung=(\\S+) (TIMED|ORACLE-ONLY \\(no clock\\)) node (\\S+)(?: arch (\\S+))? v8 (\\S+) cpu (.+) K=(\\S+) C=(\\S+)' +
        s.shape.map(([k]) => ' ' + esc(k) + '=(\\S+)').join('') + ' inject=(\\S+)$');
    return Object.freeze(s);
}
const NUM_RE = /^-?\d+(\.\d+)?$/;
const NUM_RE_INF = /^-?(\d+(\.\d+)?|Infinity)$/;   // P5 flip numInf only
let FLIP = new Set();
const num = (t) => (typeof t === 'string' && (FLIP.has('numInf') ? NUM_RE_INF : NUM_RE).test(t) ? Number(t) : NaN);
const fmt = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const fmtS = (s, d) => fmt(s.med, d) + '[' + fmt(s.q1, d) + '..' + fmt(s.q3, d) + ']';
const fin3 = (s) => Number.isFinite(s.med) && Number.isFinite(s.q1) && Number.isFinite(s.q3);
function field(line, key) {
    const k = ' ' + key + '=';
    const i = line.indexOf(k);
    if (i < 0 || line.indexOf(k, i + 1) >= 0) return null;
    const rest = line.slice(i + k.length), sp = rest.indexOf(' ');
    return sp < 0 ? rest : rest.slice(0, sp);
}
function stat3(t) {
    const m = t === null ? null : /^([^[\]]*)\[([^[\]]*)\.\.([^[\]]*)\]$/.exec(t);
    return m === null ? { med: NaN, q1: NaN, q3: NaN } : { med: num(m[1]), q1: num(m[2]), q3: num(m[3]) };
}
function wordG(sp, s) {
    if (!Number.isFinite(s.med)) return 'NONE';
    const f = sp.flip;
    if ((f.has('wordMedHi') ? s.med >= sp.aaHi : s.med > sp.aaHi) && (f.has('wordQ1') ? s.q1 >= 1 : s.q1 > 1)) return 'SLOWER';
    if ((f.has('wordMedLo') ? s.med <= sp.aaLo : s.med < sp.aaLo) && (f.has('wordQ3') ? s.q3 <= 1 : s.q3 < 1)) return 'FASTER';
    return 'WITHIN';
}
function laneStateG(sp, id, line, voidKinds) {
    const why = [];
    const vt = line.indexOf(' VOID=[');
    if (vt >= 0) why.push('VOID(' + line.slice(vt + 7).split('; ').map((v) => v.split(/[\s\]]/)[0]).join(',') + ')');
    if (voidKinds.has(id)) why.push('VOID-line(' + voidKinds.get(id).join(',') + ')');
    const ratio = stat3(field(line, 'B/A'));
    const printed = field(line, 'word');
    const aa = stat3(field(line, 'aa')), slow = stat3(field(line, 'slow'));
    if (!fin3(ratio)) why.push('B/A not finite');
    if (!fin3(aa)) why.push('aa ' + fmtS(aa, 3) + ' not finite');
    else if (!(sp.flip.has('aaBand') ? aa.med > sp.aaLo && aa.med < sp.aaHi : aa.med >= sp.aaLo && aa.med <= sp.aaHi)) why.push('aa ' + fmtS(aa, 3) + ' not in [' + sp.aaLo + ', ' + sp.aaHi + ']');
    if (!fin3(slow)) why.push('slow ' + fmtS(slow, 3) + ' not finite');
    else if (!((sp.flip.has('slowMed') ? slow.med >= sp.slowMed : slow.med > sp.slowMed) && (sp.flip.has('slowQ1') ? slow.q1 >= sp.slowQ1 : slow.q1 > sp.slowQ1))) why.push('slow ' + fmtS(slow, 3) + ' not med > ' + sp.slowMed.toFixed(2) + ' and q1 > ' + sp.slowQ1.toFixed(2));
    const bopTxt = field(line, 'bop');
    const bops = bopTxt === null ? [] : bopTxt.split(',');
    const seen = new Set(), neg = [];
    let bopOk = bops.length === sp.bopCols.length;
    for (const b of bops) {
        const kv = b.split(':');
        const v = kv.length === 2 ? num(kv[1]) : NaN;
        if (kv.length !== 2 || !sp.bopCols.includes(kv[0]) || seen.has(kv[0]) || !(sp.flip.has('bopMax') ? v <= sp.allocMax : v < sp.allocMax)) bopOk = false;
        else if (!(sp.flip.has('bopZero') ? v > 0 : v >= 0)) neg.push(b);
        seen.add(kv[0]);
    }
    if (!bopOk) why.push('bop ' + bopTxt + ' not ' + sp.bopCols.join(', ') + ' each < ' + sp.allocTxt);
    if (neg.length > 0) why.push('bop ' + neg.join(',') + ' negative (want >= 0)');
    const w = wordG(sp, ratio);
    if (printed !== w) why.push('printed word=' + printed + ' but B/A ' + fmtS(ratio, 3) + ' reads ' + w);
    return { id, word: printed, ratio, clean: why.length === 0, why };
}
const laneTxt = (s) => s.id + ' ' + s.word + ' ' + fmtS(s.ratio, 3);
function verdictOfG(sp, lines) {
    FLIP = sp.flip;
    const ids = sp.laneIds;
    const shape = [];
    let cpu = '?', arch = 'not printed', nodeV = '?';
    const heads = lines.filter((l) => l.startsWith('HEADER rung='));
    if (heads.length !== 1) shape.push(heads.length + ' HEADER rung= lines (want 1)');
    else {
        const m = sp.headRe.exec(heads[0]);
        if (m === null) shape.push('HEADER rung= line unparsed');
        else {
            nodeV = m[3]; if (m[4] !== undefined) arch = m[4]; cpu = m[6];
            if (m[1] !== sp.run) shape.push('rung=' + m[1] + ' (want ' + sp.run + ')');
            if (m[2] !== 'TIMED') shape.push('not TIMED');
            if (m[7] !== String(sp.K)) shape.push('K=' + m[7] + ' (want ' + sp.K + ')');
            if (m[8] !== String(sp.C)) shape.push('C=' + m[8] + ' (want ' + sp.C + ')');
            sp.shape.forEach(([k, want], i) => { if (m[9 + i] !== want) shape.push(k + '=' + m[9 + i] + ' (want ' + want + ')'); });
            const inj = m[9 + sp.shape.length];
            if (inj !== 'null') shape.push('inject=' + inj + ' (want null)');
        }
    }
    const stops = lines.filter((l) => l.startsWith('STOP ') || l.startsWith('CRASH '));
    for (const l of stops) shape.push(l.startsWith('CRASH ') ? 'CRASH' : 'STOP ' + l.slice(5).split(':')[0]);
    const provStart = lines.filter((l) => l.startsWith('PROV start ')).length;
    if (provStart !== 1) shape.push(provStart + ' PROV start lines (want 1)');
    const provEnd = lines.filter((l) => l.startsWith('PROV end ')).length;
    if (provEnd !== 1) shape.push(provEnd + ' PROV end lines (want 1)');
    const res = new Map(), unknown = [], voidKinds = new Map();
    for (const l of lines) {
        const r = /^RESULT lane=(\S+) /.exec(l);
        if (r !== null) {
            if (!ids.includes(r[1])) unknown.push(r[1]);
            else if (res.has(r[1])) res.get(r[1]).push(l);
            else res.set(r[1], [l]);
        }
        const v = /^VOID (\S+) lane=(\S+): /.exec(l);
        if (v !== null) { if (!voidKinds.has(v[2])) voidKinds.set(v[2], []); voidKinds.get(v[2]).push(v[1]); }
    }
    if (unknown.length > 0) shape.push('RESULT for unknown lane(s) ' + unknown.join(','));
    const missing = ids.filter((id) => !res.has(id)), dup = ids.filter((id) => res.has(id) && res.get(id).length !== 1);
    if (missing.length > 0) shape.push('no RESULT for ' + missing.length + ' lane(s) ' + missing.join(','));
    if (dup.length > 0) shape.push('several RESULT lines for ' + dup.join(','));
    const st = new Map();
    for (const id of ids) if (res.has(id) && res.get(id).length === 1) st.set(id, laneStateG(sp, id, res.get(id)[0], voidKinds));
    const gatedIds = Object.keys(sp.gated);
    const isG = (id) => Object.hasOwn(sp.gated, id);
    const wrong = gatedIds.filter((id) => st.has(id) && st.get(id).clean && st.get(id).word !== sp.gated[id]);
    const notClean = gatedIds.filter((id) => !st.has(id) || !st.get(id).clean);
    const wrongTxt = wrong.map((id) => laneTxt(st.get(id)) + ' expected ' + sp.gated[id]).join(', ');
    const ncTxt = notClean.map((id) => (st.has(id) ? id + ' ' + st.get(id).why.join(' + ') : id + ' missing')).join(', ');
    const tail = ' | cpu ' + cpu + ' | arch ' + arch + ' | node ' + nodeV;
    const reported = 'REPORTED (never read by the verdict) ' + ids.filter((id) => !isG(id)).map((id) => (!st.has(id) ? id + ' missing'
        : st.get(id).clean ? laneTxt(st.get(id)) : laneTxt(st.get(id)) + ' NOT-CLEAN ' + st.get(id).why.join(' + '))).join(', ');
    const clean = gatedIds.length - notClean.length;
    if (shape.length > 0) {
        const head = stops.length > 0 ? shape.find((s) => s === 'CRASH' || s.startsWith('STOP ')) : 'run shape';
        return { code: 2, reported, text: 'VERDICT NO VERDICT (' + head + ') shape=[' + shape.join('; ') + ']' +
            (wrong.length > 0 ? ' wrong-gated=[' + wrongTxt + ']' : '') + ' gated-clean=' + clean + '/' + gatedIds.length + tail };
    }
    if (wrong.length > 0) {
        return { code: 3, reported, text: 'VERDICT FINDING wrong-gated=[' + wrongTxt + ']' + (notClean.length > 0 ? ' not-clean=[' + ncTxt + ']' : '') +
            ' gated-clean=' + clean + '/' + gatedIds.length + tail };
    }
    if (notClean.length > 0) {
        return { code: 2, reported, text: 'VERDICT NO VERDICT (gated lane not clean) not-clean=[' + ncTxt + '] gated-clean=' + clean + '/' + gatedIds.length + tail };
    }
    return { code: 0, reported, text: 'VERDICT PASS gated=' + gatedIds.length + '/' + gatedIds.length + ' clean, every word as expected' + tail };
}

// ---------------------------------------------------------------- P1 + P2: the rows, the original as a child
const SPEC_LB = makeSpec({ laneIds: LANES_LB, gated: GATED_LB, shape: [['NQ2', '524288'], ['minWindow', '131072']] });
const rows = [];
for (const [id, base, muts, want, prefix, names] of T.FIXTURE_CASES) {
    let text = T.FIXTURES[base].text, err = null;
    for (const m of muts) { const t = T.applyMut(text, m); if (T.MUT_ERR.test(t)) { err = t; break; } text = t; }
    if (!check(err === null, 'P1 ' + id + ' mutation applies' + (err ? ': ' + err : ''))) continue;
    const r = spawnSync(process.execPath, [GATE, '--verdict-file', '-'], { input: text, encoding: 'utf8', maxBuffer: 1 << 24, timeout: 60000 });
    const ls = (r.stdout || '').split('\n');
    const vl = ls.filter((l) => l.startsWith('VERDICT ')), rl = ls.filter((l) => l.startsWith('REPORTED '));
    const named = names.every((s) => vl.length === 1 && vl[0].includes(s));
    check(r.status === want && vl.length === 1 && vl[0].startsWith(prefix) && named && rl.length === 1,
        'P2 ' + id + ': original exit ' + r.status + ' (want ' + want + ') ' + (vl[0] || '(no VERDICT)').slice(0, 70));
    const lines = text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    rows.push({ id, lines, code: r.status, vline: vl[0], rline: rl[0] });
}
check(rows.length === T.FIXTURE_CASES.length && rows.length === 45, 'P1 rows built ' + rows.length + ' / ' + T.FIXTURE_CASES.length + ' (want 45: F1-F45)');

// ---------------------------------------------------------------- R0 parity: prototype vs original, byte for byte
function parity(spec, list = rows) {
    let same = 0;
    const diff = [];
    for (const r of list) {
        const g = verdictOfG(spec, r.lines);
        if (g.code === r.code && g.text === r.vline && g.reported === r.rline) same++;
        else diff.push(r.id.split(' ')[0]);
    }
    return { same, diff };
}
const p = parity(SPEC_LB);
check(p.diff.length === 0, 'R0 PARITY verdict + REPORTED line + code byte-identical on ' + p.same + ' / ' + rows.length + ' rows' + (p.diff.length ? ' DIFF at ' + p.diff.join(',') : ''));

// ---------------------------------------------------------------- P3 must-fail controls on the comparison
const bents = [
    ['gated ro:16 expected word flipped to SLOWER', makeSpec({ laneIds: LANES_LB, gated: { ...GATED_LB, 'ro:16': 'SLOWER' }, shape: SPEC_LB.shape })],
    ['HEADER shape field minWindow dropped', makeSpec({ laneIds: LANES_LB, gated: GATED_LB, shape: [['NQ2', '524288']] })],
    ['A/A band widened to [0.90, 1.10]', makeSpec({ laneIds: LANES_LB, gated: GATED_LB, shape: SPEC_LB.shape, aaLo: 0.90, aaHi: 1.10 })],
];
for (const [txt, sp] of bents) {
    const q = parity(sp);
    check(q.diff.length > 0, 'P3 control "' + txt + '" differs on ' + q.diff.length + ' row(s): ' + q.diff.slice(0, 8).join(',') + (q.diff.length > 8 ? ',..' : ''));
}

// ---------------------------------------------------------------- P5 boundary rows (review r1) + comparator-flip controls
const U4096 = 'aa=1.001[1.000..1.003] slow=5.821[5.815..5.823]', FW16 = 'slow=3.023[3.019..3.026]';
const RO16 = 'B/A=0.338[0.338..0.339] word=FASTER', U256 = 'B:0.0000,A:0.0000 win=262144 reps=2 branches=2098642';
const BROWS = [
    ['B1 gated uni:4096 aa median exactly 0.950', ['sub', U4096, 'aa=0.950[0.940..0.960] slow=5.821[5.815..5.823]'], 0],
    ['B2 gated uni:4096 aa median exactly 1.050', ['sub', U4096, 'aa=1.050[1.040..1.060] slow=5.821[5.815..5.823]'], 0],
    ['B3 gated fw:16 slow median exactly 1.250', ['sub', FW16, 'slow=1.250[1.200..1.300]'], 2],
    ['B4 gated fw:16 slow q1 exactly 1.100', ['sub', FW16, 'slow=3.023[1.100..3.026]'], 2],
    ['B5 gated uni:256 bop B exactly 1/64', ['sub', U256, 'B:0.015625,A:0.0000 win=262144 reps=2 branches=2098642'], 2],
    ['B6 gated ro:16 B/A median exactly 1.050, WITHIN', ['sub', RO16, 'B/A=1.050[1.040..1.060] word=WITHIN'], 3],
    ['B7 gated ro:16 B/A q1 exactly 1.000, WITHIN', ['sub', RO16, 'B/A=1.100[1.000..1.200] word=WITHIN'], 3],
    ['B8 gated ro:16 B/A median exactly 0.950, WITHIN', ['sub', RO16, 'B/A=0.950[0.940..0.960] word=WITHIN'], 3],
    ['B9 gated ro:16 B/A q3 exactly 1.000, WITHIN', ['sub', RO16, 'B/A=0.900[0.800..1.000] word=WITHIN'], 3],
    ['B10 gated uni:4096 aa q1 literal Infinity', ['sub', U4096, 'aa=1.001[Infinity..1.003] slow=5.821[5.815..5.823]'], 2],
];
const brows = [];
for (const [id, m, want] of BROWS) {
    const text = T.applyMut(T.FIXTURES.ubuntu.text, m);
    if (!check(!T.MUT_ERR.test(text), 'P5 ' + id + ' mutation applies')) continue;
    const r = spawnSync(process.execPath, [GATE, '--verdict-file', '-'], { input: text, encoding: 'utf8', maxBuffer: 1 << 24, timeout: 60000 });
    const ls = (r.stdout || '').split('\n');
    const vl = ls.filter((l) => l.startsWith('VERDICT ')), rl = ls.filter((l) => l.startsWith('REPORTED '));
    check(r.status === want && vl.length === 1 && rl.length === 1, 'P5 ' + id + ': original exit ' + r.status + ' (want ' + want + ') ' + (vl[0] || '(no VERDICT)').slice(0, 90));
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    brows.push({ id, lines, code: r.status, vline: vl[0], rline: rl[0] });
}
const pb = parity(SPEC_LB, brows);
check(brows.length === BROWS.length && pb.diff.length === 0, 'P5 PARITY on boundary rows ' + pb.same + ' / ' + BROWS.length + (pb.diff.length ? ' DIFF at ' + pb.diff.join(',') : ''));
const FLIPS = ['wordMedHi', 'wordQ1', 'wordMedLo', 'wordQ3', 'aaBand', 'slowMed', 'slowQ1', 'bopMax', 'bopZero', 'numInf'];
for (const f of FLIPS) {
    const sp = makeSpec({ laneIds: LANES_LB, gated: GATED_LB, shape: SPEC_LB.shape, flip: [f] });
    const qb = parity(sp, brows), qf = parity(sp, rows);
    check(qb.diff.length > 0, 'P5 control flip ' + f + ' differs on ' + qb.diff.length + ' boundary row(s) ' + qb.diff.join(',') + ' (F-rows differing: ' + qf.diff.length + ')');
}
FLIP = new Set();
// P6 (review r2 nit): the default spec still reads 45 / 45 + 10 / 10 after every flip spec ran (no flip leaks)
const p6 = parity(SPEC_LB), p6b = parity(SPEC_LB, brows);
check(SPEC_LB.flip.size === 0 && p6.diff.length === 0 && p6b.diff.length === 0, 'P6 default spec after the flip loop: ' + p6.same + ' / ' + rows.length + ' F-rows, ' + p6b.same + ' / ' + brows.length + ' B-rows');

// ---------------------------------------------------------------- P4 a synthetic, non-LiteBisect spec
const SYN = makeSpec({ laneIds: ['x:a', 'x:b', 'x:c'], gated: { 'x:a': 'FASTER', 'x:b': 'SLOWER' }, K: 11, C: 3, shape: [['ops', '1000']] });
const head = 'HEADER rung=ALL TIMED node v26.8.2 arch arm64 v8 14.6 cpu Synthetic CPU K=11 C=3 ops=1000 inject=null';
const res = (id, ba, w, aa = '1.000[0.990..1.010]') => 'RESULT lane=' + id + ' (x) A=1.00[1.00..1.00] B=1.00[1.00..1.00] ns/op B/A=' + ba + ' word=' + w +
    ' B-A=0.00[0.00..0.00]ns aa=' + aa + ' slow=2.000[1.900..2.100] bop=A:0.0000,B:0.0000,AA:0.0000,SLOW:0.0000 win=1 reps=1 branches=1';
const log = (a, b, c) => [head, 'PROV start t', res('x:a', ...a), res('x:b', ...b), res('x:c', ...c), 'PROV end t'];
const synCases = [
    ['PASS', log(['0.500[0.490..0.510]', 'FASTER'], ['1.500[1.490..1.510]', 'SLOWER'], ['1.000[0.990..1.010]', 'WITHIN']), 0, 'VERDICT PASS gated=2/2'],
    ['FINDING', log(['1.000[0.990..1.010]', 'WITHIN'], ['1.500[1.490..1.510]', 'SLOWER'], ['0.500[0.490..0.510]', 'FASTER']), 3, 'VERDICT FINDING wrong-gated=[x:a WITHIN'],
    ['NO VERDICT (A/A)', log(['0.500[0.490..0.510]', 'FASTER'], ['1.500[1.490..1.510]', 'SLOWER', '1.080[1.070..1.090]'], ['1.000[0.990..1.010]', 'WITHIN']), 2, 'VERDICT NO VERDICT (gated lane not clean) not-clean=[x:b aa 1.080'],
];
for (const [name, lines, code, pre] of synCases) {
    const g = verdictOfG(SYN, lines);
    check(g.code === code && g.text.startsWith(pre), 'P4 synthetic ' + name + ': code ' + g.code + ' ' + g.text.slice(0, 80));
}
check(!JSON.stringify(SYN).match(/uni:|walk:|ro:|fw:|NQ2|minWindow/), 'P4 synthetic spec names no LiteBisect lane or field');

out('R0-PARITY ' + (bad === 0 ? 'all ok' : bad + ' FAIL') + ' | ab-gate ' + gateSha.slice(0, 8) + ' | node ' + process.version + ' | ' + new Date().toISOString());
process.exitCode = bad === 0 ? 0 : 1;
