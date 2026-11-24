// timing-ab R2a -- offline, UNTIMED analysis of saved hosted ab.yml / ab-research.yml logs (LiteBisect, READ ONLY).
// INTAKE: PROGRESS.md "R2a.0" (written before this file). Prints REPORT lines; exit 0 = self-check ok, 1 = probe VOID.
// node r2a-hosted.mjs [--bisect <LiteBisect dir>] [--r1logs <dir>]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BIS = opt('--bisect', '/Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteBisect');
const R1LOGS = opt('--r1logs', join(HERE, '..', 'r1', 'logs'));
const H = join(BIS, '.handoff');
// review r1 nit: the judge text below is a copy of this file; pin it
const GATE_SHA = createHash('sha256').update(readFileSync(join(BIS, 'bench', 'ab-gate.mjs'))).digest('hex');
if (!GATE_SHA.startsWith('7e0f9262')) { console.log('SELFCHECK FAIL ab-gate.mjs sha256 ' + GATE_SHA.slice(0, 8) + ' (want 7e0f9262)'); process.exit(1); }

// ---------------------------------------------------------------- ab-gate 7e0f9262 :183-205 (verbatim) + :86-92
function quant(sorted, p) {
    const n = sorted.length;
    if (!(n > 0) || typeof p !== 'number' || !(p >= 0 && p <= 1)) return NaN;
    if (n === 1) return sorted[0];
    const h = (n - 1) * p, i = Math.floor(h);
    return i + 1 < n ? sorted[i] + (h - i) * (sorted[i + 1] - sorted[i]) : sorted[i];
}
function summarize(arr) {
    const s = Array.from(arr);
    for (let i = 0; i < s.length; i++) if (typeof s[i] !== 'number' || !Number.isFinite(s[i])) return { med: NaN, q1: NaN, q3: NaN };
    s.sort((a, b) => a - b);
    return { med: quant(s, 0.5), q1: quant(s, 0.25), q3: quant(s, 0.75) };
}
const AA_LO = 0.95, AA_HI = 1.05;
const aaOk = (s) => s.med >= AA_LO && s.med <= AA_HI;
const slowOk = (s) => s.med > 1.25 && s.q1 > 1.10;
function word(s) {
    if (!Number.isFinite(s.med)) return 'NONE';
    if (s.med > AA_HI && s.q1 > 1) return 'SLOWER';
    if (s.med < AA_LO && s.q3 < 1) return 'FASTER';
    return 'WITHIN';
}
const GATED = Object.freeze({
    'uni:256': 'SLOWER', 'uni:4096': 'SLOWER', 'uni:65536': 'SLOWER',
    'walk:4096:1': 'FASTER', 'walk:65536:1': 'FASTER', 'walk:65536:4': 'FASTER',
    'walk:256:4': 'SLOWER',
    'ro:16': 'FASTER', 'ro:256': 'FASTER', 'ro:4096': 'FASTER', 'ro:65536': 'FASTER',
    'fw:16': 'SLOWER', 'fw:128': 'SLOWER',
});
const GATED_IDS = Object.keys(GATED);

// ---------------------------------------------------------------- inputs
const LEGS = [
    { id: 'P1-ubuntu', role: 'REF', file: 'rejudge/run-43145179770/ab-gate-ubuntu-latest/gate.log', job: null },
    { id: 'P1-macos', role: 'REF', file: 'rejudge/run-43145179770/ab-gate-macos-latest/gate.log', job: null },
    { id: 'P2-ubuntu', role: 'REF', file: 'audit-neon/ab/run-45079558712.log', job: 'ab gate (ubuntu-latest' },
    { id: 'V1-ubuntu', role: 'TARGET', file: 'rejudge/run-45087568692.joblog', job: 'ab gate (ubuntu-latest' },
    { id: 'V1-macos', role: 'TARGET', file: 'rejudge/run-45087568692.joblog', job: 'ab gate (macos-latest' },
    { id: 'L1-ubuntu', role: 'REF', file: 'research/ab/logs/r4-43127032794/ab-r4-ubuntu-latest/rung-all.log', job: null, lab: true },
    { id: 'L1-macos', role: 'REF', file: 'research/ab/logs/r4-43127032794/ab-r4-macos-latest/rung-all.log', job: null, lab: true },
];
const out = [];
const say = (s) => { out.push(s); console.log(s); };
const fails = [];
const fail = (s) => { fails.push(s); say('SELFCHECK FAIL ' + s); };
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));
const fS = (s) => f3(s.med) + '[' + f3(s.q1) + '..' + f3(s.q3) + ']';
const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

function legLines(leg) {
    const buf = readFileSync(join(H, leg.file));
    let txt = buf.toString('utf8').replace(/^\uFEFF/, '');
    let lines = txt.split('\n').map((l) => l.replace(/\r$/, ''));
    if (leg.job !== null) {
        lines = lines.filter((l) => l.startsWith(leg.job)).map((l) => l.split('\t'))
            .filter((p) => p.length >= 3 && p[1] === 'gate (rung ALL)')
            .map((p) => p.slice(2).join('\t').replace(/^\uFEFF/, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, ''));
    }
    return { lines, sha: sha8(buf) };
}
const field = (line, k) => {
    const i = line.indexOf(' ' + k + '=');
    if (i < 0) return null;
    const rest = line.slice(i + k.length + 2), sp = rest.indexOf(' ');
    return sp < 0 ? rest : rest.slice(0, sp);
};
function stat3(s) {
    const m = s === null ? null : /^([^[\]]*)\[([^[\]]*)\.\.([^[\]]*)\]$/.exec(s);
    return m === null ? { med: NaN, q1: NaN, q3: NaN } : { med: Number(m[1]), q1: Number(m[2]), q3: Number(m[3]) };
}
// review r1 blocker 3: a token that is not a plain decimal is NaN, never 0 (ab-gate fails closed the same way, :900)
const vec = (line, k) => { const v = field(line, k); return v === null ? null : v.split(',').map((t) => (/^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN)); };

function parseLeg(leg) {
    const { lines, sha } = legLines(leg);
    const n = (p) => lines.filter((l) => l.startsWith(p)).length;
    if (n('HEADER rung=') !== 1 || n('PROV start ') !== 1 || n('PROV end ') !== 1) fail(leg.id + ': run shape HEADER ' + n('HEADER rung=') + ' PROV ' + n('PROV start ') + '/' + n('PROV end '));
    const prov = lines.filter((l) => l.startsWith('PROV ')).map((l) => l.replace(/ busy-node.*/, ''));
    const header = lines.find((l) => l.startsWith('HEADER rung=')) || '';
    const cpu = (/ cpu (.*?) K=/.exec(header) || [])[1] || '?';
    const verdict = lines.find((l) => l.startsWith('VERDICT ')) || null;
    const lanes = [];
    for (const l of lines) {
        if (!l.startsWith('RESULT lane=')) continue;
        const id = l.slice(12).split(' ')[0];
        const raw = lines.filter((r) => r.startsWith('RAW lane=' + id + ' '));
        if (raw.length !== 1) { fail(leg.id + ' ' + id + ': ' + raw.length + ' RAW lines'); continue; }
        const vt = l.indexOf(' VOID=[');
        const voids = vt < 0 ? [] : l.slice(vt + 7).replace(/\]$/, '').split('; ').map((v) => v.split(' ')[0]);
        lanes.push({
            id, order: lanes.length, gated: Object.hasOwn(GATED, id), line: l,
            ratio: stat3(field(l, 'B/A')), aa: stat3(field(l, 'aa')), slow: stat3(field(l, 'slow')), word: field(l, 'word'), voids,
            B: vec(raw[0], 'B/A'), AA: vec(raw[0], 'AA'), SLOW: vec(raw[0], 'SLOW'),
        });
    }
    return { leg, sha, prov, cpu, verdict, lanes };
}

// ---------------------------------------------------------------- self-check (oracle before analysis)
const near = (a, b) => Math.abs(a - b) <= 0.0011;
const near3 = (p, s) => near(p.med, s.med) && near(p.q1, s.q1) && near(p.q3, s.q3);
function selfCheckLane(legId, L, bend) {
    const AA = bend ? L.AA.map((v, i) => (i === 5 ? v + 0.05 : v)) : L.AA;
    const ok = [L.B, AA, L.SLOW].every((v) => v !== null && v.length === 11)
        && near3(L.ratio, summarize(L.B)) && near3(L.aa, summarize(AA)) && near3(L.slow, summarize(L.SLOW));
    if (!bend && !ok) fail(legId + ' ' + L.id + ': RAW does not reproduce RESULT ' + fS(L.ratio) + ' / ' + fS(L.aa) + ' / ' + fS(L.slow));
    return ok;
}

// ---------------------------------------------------------------- mechanisms
const OTHER = (L) => L.voids.filter((v) => v !== 'AA-DRIFT' && v !== 'SLOW-DEAD');
const pick = (v, idx) => idx.map((i) => v[i]);
function judge(L, mech, AAin) {
    const AA = AAin || L.AA;
    const why = OTHER(L).slice();
    let idx = [...Array(11).keys()];
    if (mech === 'MW') idx = idx.slice(1);
    if (mech === 'MT') {
        idx = idx.filter((i) => AA[i] >= AA_LO && AA[i] <= AA_HI);
        if (idx.length < 8) why.push('TRIM-SHORT(' + idx.length + ')');
    }
    const B = pick(L.B, idx), A2 = pick(AA, idx), S = pick(L.SLOW, idx);
    const ratio = summarize(B), aa = summarize(A2), slow = summarize(S);
    const w = word(ratio);
    if (mech === 'MJ') {
        const w2 = word(summarize(B.map((b, i) => b / A2[i])));
        if (w2 !== w) why.push('AA-DISAGREE(' + w + '/' + w2 + ')');
    } else if (!aaOk(aa)) why.push('AA-DRIFT');
    if (!slowOk(slow)) why.push('SLOW-DEAD');
    return { clean: why.length === 0, why, word: w, ratio, aa, slow, kept: idx.length };
}
function legVerdict(lanes, mech, inj) {
    let finding = false, unclean = 0, missing = 0;
    for (const id of GATED_IDS) {
        const L = lanes.find((x) => x.id === id);
        if (!L) { missing++; continue; }
        const j = judge(L, mech, inj ? L.AA.map((v) => v * inj) : null);
        if (j.clean && j.word !== GATED[id]) finding = true;
        if (!j.clean) unclean++;
    }
    if (missing > 0) return 'NO VERDICT (missing)';
    if (finding) return 'FINDING';
    return unclean === 0 ? 'PASS' : 'NO VERDICT (gated lane not clean, ' + (13 - unclean) + '/13 clean)';
}

// ---------------------------------------------------------------- run
const legs = LEGS.map(parseLeg);
say('INPUT LiteBisect ' + BIS + ' (read only)');
for (const g of legs) say('INPUT ' + g.leg.id + ' ' + g.leg.role + ' ' + g.leg.file + ' sha256/8 ' + g.sha + ' lanes=' + g.lanes.length + ' cpu ' + g.cpu + ' | ' + g.prov.join(' | ') + (g.verdict ? ' | printed ' + g.verdict : ''));

// self-check 1: RAW reproduces RESULT on every lane; 2: M0 reproduces printed VOID set + word; 3: printed VERDICT
let bentCaught = 0, laneN = 0;
for (const g of legs) {
    for (const L of g.lanes) {
        laneN++;
        selfCheckLane(g.leg.id, L, false);
        if (!selfCheckLane(g.leg.id, L, true)) bentCaught++;
        const j = judge(L, 'M0');
        const printedCtl = L.voids.filter((v) => v === 'AA-DRIFT' || v === 'SLOW-DEAD').sort().join(',');
        const mine = j.why.filter((v) => v === 'AA-DRIFT' || v === 'SLOW-DEAD').sort().join(',');
        if (printedCtl !== mine) fail(g.leg.id + ' ' + L.id + ': M0 controls ' + mine + ' vs printed ' + printedCtl);
        if (j.word !== L.word) fail(g.leg.id + ' ' + L.id + ': M0 word ' + j.word + ' vs printed ' + L.word);
    }
    if (GATED_IDS.some((id) => !g.lanes.find((x) => x.id === id))) fail(g.leg.id + ': a gated lane is missing');
    // review r1 blocker 2: every leg carries the same lane set, no duplicates
    const ids = g.lanes.map((x) => x.id);
    if (new Set(ids).size !== ids.length || [...ids].sort().join(',') !== legs[0].lanes.map((x) => x.id).sort().join(',')) fail(g.leg.id + ': lane set differs from ' + legs[0].leg.id + ' or has duplicates');
    // review r1 nit: leg identity (a job filter pointed at the wrong OS)
    if (/macos/.test(g.leg.id) !== /Apple/.test(g.cpu)) fail(g.leg.id + ': cpu ' + g.cpu + ' does not match the leg OS');
    const v0 = legVerdict(g.lanes, 'M0');
    // review r1 blocker 1: a non-lab leg must print a VERDICT line
    if (!g.leg.lab && g.verdict === null) fail(g.leg.id + ': no VERDICT line');
    if (g.leg.lab) say('M0 ' + g.leg.id + ' verdict: not printed in lab format (M0 recomputed only)');
    if (g.verdict !== null) {
        const pv = g.verdict.replace(/^VERDICT /, '');
        const want = pv.startsWith('PASS') ? 'PASS' : pv.startsWith('FINDING') ? 'FINDING' : 'NO VERDICT';
        if (!v0.startsWith(want)) fail(g.leg.id + ': M0 verdict ' + v0 + ' vs printed ' + g.verdict);
    }
    say('M0 ' + g.leg.id + ' -> ' + v0);
}
// must-fail control: bending one AA round by +0.05 must break reproduction on >= 1 lane
if (bentCaught < 1) fail('bent-RAW control caught 0 lanes (the reproduction check has no teeth)');
say('SELFCHECK lanes=' + laneN + ' RAW->RESULT checked; bent-RAW control caught ' + bentCaught + '/' + laneN + ' lanes; fails=' + fails.length);
if (fails.length > 0) { say('PROBE VOID (self-check failed)'); process.exit(1); }

// ---------------------------------------------------------------- (i) descriptive
const iqr = (s) => s.q3 - s.q1;
const medOf = (a) => summarize(a).med;
say('');
say('DESC per leg: AA/A over all lanes (per-lane IQR width median, per-lane aa med range, rounds outside [0.95, 1.05] / total)');
const hostedIqr = [];
for (const g of legs) {
    const w = g.lanes.map((L) => iqr(summarize(L.AA)));
    hostedIqr.push(...w);
    const meds = g.lanes.map((L) => summarize(L.AA).med);
    const outR = g.lanes.reduce((s, L) => s + L.AA.filter((v) => v < AA_LO || v > AA_HI).length, 0);
    const r0 = g.lanes.reduce((s, L) => s + (L.AA[0] < AA_LO || L.AA[0] > AA_HI ? 1 : 0), 0);
    say('DESC ' + g.leg.id + ' iqrW med ' + medOf(w).toFixed(4) + ' max ' + Math.max(...w).toFixed(4) + ' | aa med ' + Math.min(...meds).toFixed(3) + '..' + Math.max(...meds).toFixed(3)
        + ' | rounds out ' + outR + '/' + g.lanes.length * 11 + ' (round 0 out on ' + r0 + ' lanes)');
}
say('');
say('DESC V1 VOID lanes, gated and reported (INTAKE H1 / H2: any lane; order = position in the run, AA/A per round):');
const h1 = [], h2 = [];
for (const g of legs.filter((x) => x.leg.role === 'TARGET')) {
    for (const L of g.lanes.filter((x) => !judge(x, 'M0').clean)) {
        const s = summarize(L.AA);
        const level = s.q1 > AA_HI || s.q3 < AA_LO;
        h1.push(level);
        h2.push(L.order < g.lanes.length / 2);
        say('DESC ' + g.leg.id + ' ' + L.id + ' order ' + L.order + '/' + g.lanes.length + ' aa ' + fS(s) + (L.gated ? ' gated' : ' reported') + (level ? ' LEVEL' : ' spread') + ' AA=' + L.AA.map((v) => v.toFixed(3)).join(','));
    }
}
// H3: R1 local QUIET hold AA IQR widths
let r1w = []; const r1miss = [];
for (let r = 1; r <= 5; r++) {
    let t; try { t = readFileSync(join(R1LOGS, 'hold-' + r + '.log'), 'utf8'); } catch { r1miss.push(r); continue; }
    for (const l of t.split('\n')) if (l.startsWith('RAW lane=')) r1w.push(iqr(summarize(vec(l, 'AA'))));
}
const v1macos = legs.find((x) => x.leg.id === 'V1-macos');
const macVoid = v1macos.lanes.filter((x) => !judge(x, 'M0').clean);
say('');
say('H1 level shift: ' + h1.filter(Boolean).length + ' / ' + h1.length + ' V1 VOID lanes have AA q1..q3 entirely outside the band -> ' + (h1.length === 0 ? 'UNDECIDED' : h1.every(Boolean) ? 'HOLDS' : h1.some(Boolean) ? 'HOLDS on ' + h1.filter(Boolean).length + ', FAILS on ' + h1.filter((x) => !x).length : 'FAILS'));
say('H2 boot decay: V1-macos VOID lanes at order ' + macVoid.map((x) => x.order).join(',') + ' of ' + v1macos.lanes.length + ' (first half: ' + macVoid.filter((x) => x.order < v1macos.lanes.length / 2).length + ' / ' + macVoid.length + ') -> ' + (macVoid.length === 0 ? 'UNDECIDED' : macVoid.every((x) => x.order < v1macos.lanes.length / 2) ? 'HOLDS' : 'FAILS'));
const hm = medOf(hostedIqr), rm = medOf(r1w);
say('H3 hosted spread: per-lane AA IQR width median hosted ' + hm.toFixed(4) + ' (' + hostedIqr.length + ' lanes, 7 legs) vs R1 local QUIET hold ' + rm.toFixed(4) + ' (' + r1w.length + ' lanes) = ' + (hm / rm).toFixed(2) + 'x -> ' + (r1miss.length !== 0 || !Number.isFinite(hm / rm) ? 'UNDECIDED (R1 hold logs missing: ' + r1miss.join(',') + ')' : hm / rm >= 3 ? 'HOLDS' : 'FAILS'));
// per-leg version for context
for (const g of legs) say('H3 leg ' + g.leg.id + ' iqrW median ' + medOf(g.lanes.map((L) => iqr(summarize(L.AA)))).toFixed(4) + ' = ' + (medOf(g.lanes.map((L) => iqr(summarize(L.AA)))) / rm).toFixed(2) + 'x R1');

// ---------------------------------------------------------------- (ii) counterfactual
say('');
const MECHS = ['MW', 'MT', 'MJ'];
const INJ = [0.90, 0.94, 1.06, 1.10];
const verdictOf = {};
let W2N = -1;
for (const m of MECHS) {
    const rescue = legs.filter((g) => g.leg.role === 'TARGET').map((g) => [g.leg.id, legVerdict(g.lanes, m)]);
    const a = rescue.every(([, v]) => v === 'PASS');
    const w1 = [], w2 = [], w3 = [];
    for (const g of legs) {
        for (const L of g.lanes) {
            const j0 = judge(L, 'M0'), j = judge(L, m);
            if (j0.why.includes('SLOW-DEAD') && j.clean) w2.push(g.leg.id + ' ' + L.id);
            if (g.leg.role !== 'REF') continue;
            for (const f of (g.leg.lab && !L.gated) ? [] : INJ) {
                const AAi = L.AA.map((v) => v * f);
                const i0 = judge(L, 'M0', AAi), im = judge(L, m, AAi);
                if (!i0.clean && im.clean) w3.push(g.leg.id + ' ' + L.id + ' x' + f);
            }
            if (!L.gated) continue;
            if (j0.clean !== j.clean || j0.word !== j.word) w1.push(g.leg.id + ' ' + L.id + ' ' + (j0.clean ? 'clean' : 'VOID') + '/' + j0.word + ' -> ' + (j.clean ? 'clean' : 'VOID(' + j.why.join(',') + ')') + '/' + j.word);
        }
        if (g.leg.role === 'REF') { const v0 = legVerdict(g.lanes, 'M0'), vm = legVerdict(g.lanes, m); if (v0 !== vm) w1.push(g.leg.id + ' verdict ' + v0 + ' -> ' + vm); }
    }
    // how many injected-drift lanes M0 voids at all (W3's denominator)
    let inj0 = 0;
    for (const g of legs.filter((x) => x.leg.role === 'REF')) for (const L of g.lanes.filter((x) => x.gated || !g.leg.lab)) for (const f of INJ) if (!judge(L, 'M0', L.AA.map((v) => v * f)).clean) inj0++;
    verdictOf[m] = { a, w1: w1.length, w2: w2.length, w3: w3.length };
    const w2n = legs.reduce((n, g) => n + g.lanes.filter((L) => judge(L, 'M0').why.includes('SLOW-DEAD')).length, 0);
    W2N = w2n;
    say('MECH ' + m + ' rescue: ' + rescue.map(([id, v]) => id + ' ' + v).join(' | ') + ' -> (a) ' + (a ? 'YES' : 'NO'));
    say('MECH ' + m + ' W1 ' + w1.length + (w1.length ? ': ' + w1.slice(0, 8).join('; ') + (w1.length > 8 ? '; ...' : '') : ''));
    say('MECH ' + m + ' W2 ' + (w2n === 0 ? 'n/a (0 lanes M0 voids for SLOW-DEAD on any leg; untestable on these logs)' : w2.length + ' of ' + w2n + (w2.length ? ': ' + w2.join('; ') : '')));
    say('MECH ' + m + ' W3 ' + w3.length + ' of ' + inj0 + ' injected lanes (all lanes, REF legs) M0 voids' + (w3.length ? ': ' + w3.slice(0, 10).join('; ') + (w3.length > 10 ? '; ...' : '') : ''));
    for (const g of legs.filter((x) => x.leg.role === 'TARGET')) {
        for (const L of g.lanes.filter((x) => x.gated && !judge(x, 'M0').clean)) {
            const j = judge(L, m);
            say('MECH ' + m + ' ' + g.leg.id + ' ' + L.id + ' -> ' + (j.clean ? 'clean ' + j.word + (j.word === GATED[L.id] ? ' (= GATED)' : ' (!= GATED ' + GATED[L.id] + ')') : 'VOID(' + j.why.join(',') + ')') + ' kept ' + j.kept + ' aa ' + fS(j.aa) + ' B/A ' + fS(j.ratio));
        }
    }
}
// M1 re-pair: the number of lanes it would have to rescue
const toRescue = legs.filter((g) => g.leg.role === 'TARGET').map((g) => g.leg.id + ' ' + g.lanes.filter((x) => x.gated && !judge(x, 'M0').clean).length);
say('M1 re-pair (untestable offline): VOID gated lanes to rescue ' + toRescue.join(', '));
const winners = MECHS.filter((m) => verdictOf[m].a && verdictOf[m].w1 === 0 && verdictOf[m].w2 === 0 && verdictOf[m].w3 === 0);
const design = MECHS.filter((m) => verdictOf[m].a && verdictOf[m].w1 === 0 && verdictOf[m].w2 === 0 && verdictOf[m].w3 > 0);
say('KILL RULE R2a: ' + (winners.length === 0 ? 'FIRED -- no offline mechanism rescues both V1 legs without weakening' : 'NOT FIRED -- ' + winners.join(',') + ' rescue both V1 legs with no W1-W3') + (W2N === 0 ? ' (W2 untestable: no SLOW-DEAD lane in the inputs)' : ''));
if (design.length > 0) say('DESIGN QUESTION: ' + design.join(',') + ' rescue with W3 only' + (W2N === 0 ? ' (W2 untestable)' : '') + ' (margin-aware A/A; re-rules law 5 / A8, not adopted here)');
process.exit(0);
