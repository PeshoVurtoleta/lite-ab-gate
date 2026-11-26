// test/fixtures/timed-real/surface.mjs -- U8 B2 (plan-U8 TASKS 2-3, ASSERTIONS A2 / A4; SPEC C-21, C-37, C-38).
// The ONE definition of (1) the marker surface sha and (2) the real-line marker gate, imported by BOTH
// test/selftest.timed.mjs (live timed children, --capture) and test/selftest.untimed.test.mjs (the captured
// lines.json), so the harness and npm test can never disagree on either. Pure: no I/O, no clock, no import of
// ABGate.js (INJECTIONS is module-private: it is sliced from the source text and evaluated). ASCII only.
//
// surfaceSha(src) = sha256 hex (64 chars) of
//     injectionsBlock(src) + '\n' + PINS.join('\n')
// where injectionsBlock(src) is the text of ABGate.js from `const INJECTIONS = Object.freeze(` through the closing
// `});` (exactly once, else it throws), and PINS is the list below (the message templates the markers are written
// against). A change to a marker, a want / verdict / absent / K field, or a pinned message template changes the sha;
// npm test then reads the captured lines.json as stale ("re-capture via quiet-lock").
import { createHash } from 'node:crypto';

/** The message templates the timed markers are written against (each must stay in ABGate.js: selftest.untimed checks
 *  src.includes(p) for every entry). Part of the surface sha. */
export const PINS = [
    "say(ctx, e instanceof Stop ? 'STOP ' + e.reason + ': ' + e.message",
    "say(ctx, 'VOID ' + v.split(' ')[0] + ' lane=' + L.id + ': ' + v);",
    "' (' + where + ') op ' + op + ' field ' + k + ' got ' + got[k] + ' want ' + ex[op * R + k]",
    "verifyAll(e, L, L.expect, 'after the oracle pass')", "verifyAll(e, L, fresh, 'after timing, fresh reference')",
    "' fold (' + where + '): got ' + got + ' want ' + want", "verifyRun(e, got, e.wants[x], L, 'timed')",
    "' data.' + k + ' (' + where + ') differs from the lane data'", "stop('ORACLE', at + ' at byte ' + i)", "checkArr(e, L, 'after warm')",
    "voids.push('ALLOC ' + c + ' ' + fmt(bop[c], 3) + ' B/op')", "voids.push('SLOW-DEAD ' + fmtS(slow, 3))", "voids.push('AA-DRIFT ' + fmtS(aa, 3))",
    "voids.push('REPS-DRIFT B/AB ' + fmtS(bab, 3) + ' reads ' + wordAB + ' but B/A ' + fmtS(ratio, 3) + ' reads ' + word(ratio) + ' (AB = A at B\\'s reps ' + repsB + ' vs A\\'s ' + reps + ')')",
    "'WARM lane=' + L.id + ' round 0 (discarded, not in any median) ' + liveCols.map((c) => c.id + '/A=' + fmt(warm0[c.id] / warm0.A, 4)).join(' ')",
    "voids.push('NOT-TF tool timedRounds (TF at window start ' + toolTfStart + ', end ' + toolTfEnd + ')')",
    "say(ctx, 'SETTLE lane=' + L.id + ' skipped (' + INJECT_ENV + '=no-settle)')",
    "settleVoid = 'TIER-SETTLE pass-bytes ' + pb + ' (cap ' + TIER_SETTLE_CAP + ', none read exactly 0)'",
];

const INJ_HEAD = 'const INJECTIONS = Object.freeze(';
/** The INJECTIONS block text, `const INJECTIONS = Object.freeze(` .. `});`, found exactly once (else throws). */
export function injectionsBlock(src) {
    const a = src.indexOf(INJ_HEAD), z = a < 0 ? -1 : src.indexOf('\n});', a);
    if (a < 0 || z < a || src.indexOf(INJ_HEAD, a + 1) >= 0) throw new Error('INJECTIONS block not found exactly once');
    return src.slice(a, z + 4);
}
/** The INJECTIONS table, evaluated from the block text (never imported). */
export function injectionsOf(src) {
    const b = injectionsBlock(src);
    return new Function('return (' + b.slice(INJ_HEAD.length, b.length - 2) + ');')();
}
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
/** See the file header: the ONE surface-sha definition (harness --capture and the npm test staleness row). */
export const surfaceSha = (src) => sha256(injectionsBlock(src) + '\n' + PINS.join('\n'));
/** '' when the captured sha equals the recomputed one, else the red text naming the fix. */
export function staleText(captured, now) {
    return captured === now ? '' : 'marker surface sha ' + String(captured).slice(0, 8) + ' captured, ' + String(now).slice(0, 8) +
        ' now: the INJECTIONS block or PINS changed -- re-capture via quiet-lock: node ~/.claude/hooks/quiet-lock.mjs run --strict ' +
        '"lite-ab-gate timed capture" -- node test/selftest.timed.mjs --capture';
}

// ---------------------------------------------------------------- the 13 real children (plan-U8 TASK 2 (iii))
/** The timed markers: the 9 --selftest injections + tool-deopt (torture-only, its own child here). */
export const TIMED = ['bent-oracle', 'boxed', 'slow-dead', 'aa-drift', 'late-bend', 'post-bend', 'ab-drift', 'warm-skew', 'arr-bend', 'tool-deopt'];
/** key = '<inject|clean> <lane>'; inject null = the clean child. */
export const CHILDREN = [...TIMED.map((n) => [n, 'null']), ['bent-oracle', 'double'], [null, 'null'], [null, 'double']]
    .map(([inject, lane]) => ({ key: (inject === null ? 'clean' : inject) + ' ' + lane, inject, lane }));
/** The only child lines kept in lines.json (TASK 2 (iv)). */
export const KEEP_RE = /^(STOP|VOID|WARM|RESULT|RAW|WINDOW|SETTLE) /;
/** The STOP ORACLE markers + warm-skew must match 0 lines in both clean children (A2; warm-skew added so a loosened
 *  `^WARM lane=` has a line it must not match: the clean WARM line). */
export const CLEAN_ZERO = ['bent-oracle', 'late-bend', 'post-bend', 'arr-bend', 'warm-skew'];
/** A4: the window controls (WINDOW tool-bytes must be > 0): tool-deopt (the tool runs interpreted) and boxed (B boxes
 *  one HeapNumber per op inside the window: torture T1's own control). Every other WINDOW line reads exactly 0. */
export const WINDOW_POS = ['tool-deopt null', 'boxed null'];
export const ALLOC_MAX = 1 / 64;
/** The loosened family prefixes of A2's must-fail controls. */
export const LOOSE = {
    'bent-oracle': /^STOP ORACLE: /m, 'late-bend': /^STOP ORACLE: /m, 'post-bend': /^STOP ORACLE: /m, 'arr-bend': /^STOP ORACLE: /m,
    'boxed': /^VOID /m, 'slow-dead': /^VOID /m, 'aa-drift': /^VOID /m, 'ab-drift': /^VOID /m, 'tool-deopt': /^VOID /m,
    'warm-skew': /^WARM lane=/m,
};

const hits = (m, line) => (typeof m === 'string' ? line.includes(m) : m instanceof RegExp ? m.test(line) : false);
const fieldOf = (line, key) => {
    const k = ' ' + key + '=', i = line.indexOf(k);
    if (i < 0 || line.indexOf(k, i + 1) >= 0) return null;
    const rest = line.slice(i + k.length), sp = rest.indexOf(' ');
    return sp < 0 ? rest : rest.slice(0, sp);
};

/** A2 marker rules on real child lines -> reasons (empty = accepted). children: { key: { lines: string[] } }.
 *  R1 every marker is a RegExp anchored ^ with m, not g / y; R2 each injection child's marker matches exactly 1 of its
 *  own lines; R3 the CLEAN_ZERO markers match 0 lines in both clean children; R4 no line of any child is matched by
 *  >= 2 markers of the table. */
export function markerRealGate(table, children) {
    const bad = [], names = Object.keys(table);
    for (const n of names) {
        const m = table[n].marker;
        if (!(m instanceof RegExp)) bad.push(n + ': marker ' + JSON.stringify(m) + ' is not a RegExp');
        else if (!m.source.startsWith('^') || !m.flags.includes('m') || m.flags.includes('g') || m.flags.includes('y')) bad.push(n + ': marker ' + m + ' not anchored ^ / m, or stateful (g / y)');
    }
    for (const c of CHILDREN) {
        const ch = children[c.key];
        if (ch === undefined || !Array.isArray(ch.lines)) { bad.push(c.key + ': child missing'); continue; }
        if (c.inject !== null) {
            const own = Object.hasOwn(table, c.inject) ? ch.lines.filter((l) => hits(table[c.inject].marker, l)).length : -1;
            if (own !== 1) bad.push(c.key + ': own marker ' + c.inject + ' matches ' + own + ' lines (want exactly 1)');
        } else {
            for (const n of CLEAN_ZERO) {
                const k = Object.hasOwn(table, n) ? ch.lines.filter((l) => hits(table[n].marker, l)).length : -1;
                if (k !== 0) bad.push(c.key + ': marker ' + n + ' matches ' + k + ' clean lines (want 0)');
            }
        }
        for (const l of ch.lines) {
            const h = names.filter((n) => hits(table[n].marker, l));
            if (h.length >= 2) bad.push(c.key + ': clash ' + h.length + ' markers (' + h.join(', ') + ') match one line ' + JSON.stringify(l.slice(0, 200)));
        }
    }
    return bad;
}

const WINDOW_RE = /^WINDOW lane=(\S+) tool-bytes=(-?\d+) scavenges=(\d+)$/;
const REPS_RE = /^A:(\d+),B:(\d+)(?:,AB:(\d+))?$/;
/** The child-level rules on real lines -> reasons. exit = the injection's want (clean 2); C-11 / C-34: AB on RESULT,
 *  RAW and WARM iff reps differ, the ab-drift child in the differ branch (C-62 (1)), both branches seen >= 1; A4: one
 *  WINDOW line per child that printed a RESULT, tool-bytes exactly 0 except WINDOW_POS (> 0), clean children bop A / AA
 *  / SLOW finite and < 1/64. */
export function childGate(table, children) {
    const bad = [];
    const keys = Object.keys(children).sort().join('|'), want = CHILDREN.map((c) => c.key).sort().join('|');
    if (keys !== want) bad.push('child set ' + keys + ' (want ' + want + ')');
    let differ = 0, equal = 0;
    for (const c of CHILDREN) {
        const ch = children[c.key];
        if (ch === undefined || !Array.isArray(ch.lines)) { bad.push(c.key + ': child missing'); continue; }
        const wantExit = c.inject === null ? 2 : (table[c.inject] || {}).want;
        if (ch.exit !== wantExit) bad.push(c.key + ': exit ' + ch.exit + ' (want ' + wantExit + ')');
        const odd = ch.lines.filter((l) => typeof l !== 'string' || !KEEP_RE.test(l));
        if (odd.length > 0) bad.push(c.key + ': ' + odd.length + ' line(s) outside STOP / VOID / WARM / RESULT / RAW / WINDOW / SETTLE');
        const pick = (p) => ch.lines.filter((l) => l.startsWith(p + ' lane=' + c.lane + ' '));
        const res = pick('RESULT'), raw = pick('RAW'), warm = pick('WARM');
        const win = ch.lines.filter((l) => l.startsWith('WINDOW '));
        if (res.length > 1) bad.push(c.key + ': ' + res.length + ' RESULT lines');
        if (res.length === 1) {
            const m = REPS_RE.exec(fieldOf(res[0], 'reps') || '');
            if (m === null) bad.push(c.key + ': RESULT reps unparsed');
            else {
                const d = m[1] !== m[2];
                if (d) differ++; else equal++;
                if (d ? m[3] !== m[2] : m[3] !== undefined) bad.push(c.key + ': RESULT reps=' + m[0] + ' (C-11: AB:<B reps> iff reps differ)');
                if (raw.length !== 1 || warm.length !== 1) bad.push(c.key + ': RAW ' + raw.length + ' / WARM ' + warm.length + ' lines (want 1 / 1)');
                else {
                    if (raw[0].includes(' AB=') !== d) bad.push(c.key + ': RAW AB column ' + (d ? 'missing with reps differing' : 'present with equal reps') + ' (C-34)');
                    if (warm[0].includes(' AB/A=') !== d) bad.push(c.key + ': WARM AB/A column ' + (d ? 'missing with reps differing' : 'present with equal reps') + ' (C-34)');
                }
                if (c.key === 'ab-drift null' && !d) bad.push(c.key + ': reps equal ' + m[0] + ' (C-62 (1): the ab-drift child forces B reps)');
            }
            if (win.length !== 1) bad.push(c.key + ': ' + win.length + ' WINDOW lines with a RESULT (want 1)');
        }
        if (win.length > 1) bad.push(c.key + ': ' + win.length + ' WINDOW lines');
        const pos = WINDOW_POS.includes(c.key);
        if ((pos || c.inject === null) && win.length !== 1) bad.push(c.key + ': ' + win.length + ' WINDOW lines (want 1)');
        for (const w of win) {
            const m = WINDOW_RE.exec(w);
            if (m === null) { bad.push(c.key + ': WINDOW unparsed ' + JSON.stringify(w)); continue; }
            const b = Number(m[2]);
            if (pos ? !(b > 0) : b !== 0) bad.push(c.key + ': WINDOW tool-bytes=' + m[2] + ' (want ' + (pos ? '> 0, the control' : '0') + ')');
        }
        if (c.inject === null) {
            const bop = res.length === 1 ? fieldOf(res[0], 'bop') : null, got = {};
            for (const e of (bop || '').split(',')) { const i = e.indexOf(':'); if (i > 0) got[e.slice(0, i)] = e.slice(i + 1); }
            for (const col of ['A', 'AA', 'SLOW']) {
                const v = typeof got[col] === 'string' && /^\d+(\.\d+)?$/.test(got[col]) ? Number(got[col]) : NaN;
                if (!(v < ALLOC_MAX)) bad.push(c.key + ': bop ' + col + '=' + got[col] + ' (want < 1/64)');
            }
        }
    }
    if (!(differ >= 1) || !(equal >= 1)) bad.push('C-11 branches: reps differ in ' + differ + ' child(ren), equal in ' + equal + ' (want >= 1 each)');
    return bad;
}

/** A2 / A4 must-fail controls on the same real lines -> the list of controls the gates did NOT reject (empty = every
 *  control has teeth). Each control must be rejected for a MATCH / VALUE reason, never only for its form. */
export function realControls(table, children) {
    const miss = [];
    const withMarker = (n, m) => ({ ...table, [n]: { ...table[n], marker: m } });
    const matchReason = (rs) => rs.some((s) => !s.endsWith('is not a RegExp') && !s.endsWith('not anchored ^ / m, or stateful (g / y)'));
    // (1) the loosened family prefixes, one per timed marker (A2: 10/10)
    let loose = 0;
    for (const n of TIMED) {
        const rs = markerRealGate(withMarker(n, LOOSE[n]), children);
        if (matchReason(rs)) loose++; else miss.push('loosened ' + n + ' ' + LOOSE[n] + ' accepted');
    }
    // (2) the old literals
    for (const [n, lit] of [['bent-oracle', 'STOP ORACLE'], ['warm-skew', 'WARM lane=']]) {
        if (!matchReason(markerRealGate(withMarker(n, lit), children))) miss.push('literal ' + n + ' ' + JSON.stringify(lit) + ' not rejected by a match');
    }
    // (3) child-level edits: each must turn childGate red
    const edit = (key, fn) => {
        const c2 = {};
        for (const k of Object.keys(children)) c2[k] = { ...children[k], lines: children[k].lines.slice() };
        if (c2[key] !== undefined) c2[key].lines = fn(c2[key].lines);
        return c2;
    };
    const edits = [
        ['ab-drift RAW AB column dropped', 'ab-drift null', (ls) => ls.map((l) => (l.startsWith('RAW ') ? l.replace(/ AB=\S+/, '') : l))],
        ['clean null RAW AB column added', 'clean null', (ls) => ls.map((l) => (l.startsWith('RAW ') ? l + ' AB=1.0000,1.0000,1.0000' : l))],
        ['ab-drift RESULT / RAW / WARM dropped (no differ branch)', 'ab-drift null', (ls) => ls.filter((l) => !/^(RESULT|RAW|WARM) /.test(l))],
        ['tool-deopt WINDOW tool-bytes 0', 'tool-deopt null', (ls) => ls.map((l) => l.replace(/ tool-bytes=\d+ /, ' tool-bytes=0 '))],
        ['clean double WINDOW tool-bytes 64', 'clean double', (ls) => ls.map((l) => l.replace(/ tool-bytes=\d+ /, ' tool-bytes=64 '))],
        ['clean null WINDOW tool-bytes NaN', 'clean null', (ls) => ls.map((l) => l.replace(/ tool-bytes=\d+ /, ' tool-bytes=NaN '))],
        ['clean null bop A 0.0200', 'clean null', (ls) => ls.map((l) => (l.startsWith('RESULT ') ? l.replace(/ bop=A:[^,\s]+/, ' bop=A:0.0200') : l))],
    ];
    for (const [what, key, fn] of edits) {
        const c2 = edit(key, fn);
        if (JSON.stringify(c2) === JSON.stringify(children)) { miss.push('control ' + what + ': the edit changed nothing'); continue; }
        if (childGate(table, c2).length === 0) miss.push('control ' + what + ' accepted');
    }
    // (4) clause controls, each rejected for ITS OWN reason: a tightened marker (R2, 0 own lines), a clean exit 0, ab-drift equal reps (C-62 (1))
    const why = (rs, re) => rs.some((s) => re.test(s));
    for (const n of TIMED) if (!why(markerRealGate(withMarker(n, /^(?!)/m), children), new RegExp(': own marker ' + n + ' matches 0 lines '))) miss.push('tightened ' + n + ' accepted');
    const ex = edit('clean null', (ls) => ls); ex['clean null'].exit = 0;
    if (!why(childGate(table, ex), /^clean null: exit 0 \(want 2\)$/)) miss.push('control clean null exit 0 not rejected by the exit rule');
    const eq = edit('ab-drift null', (ls) => ls.map((l) => (l.startsWith('RESULT ') ? l.replace(/ reps=A:(\d+),B:\d+,AB:\d+/, ' reps=A:$1,B:$1') : l)));
    if (!why(childGate(table, eq), /^ab-drift null: reps equal /)) miss.push('control ab-drift equal reps not rejected by C-62 (1)');
    return { miss, loose };
}
