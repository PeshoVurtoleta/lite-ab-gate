// test/hotbody.parity.test.mjs -- U9E B1 (plan-U9E-v1 TASK 4, ASSERTION A1; SPEC C-48). DETERMINISTIC and untimed: it
// reads source text only. The measured span (WIN[2]..WIN[3]) may change in exactly one way in U9E: timedRounds' two
// clock reads `performance.now()` -> `PERF.now()` (module const `PERF = performance`). Every other hot-body slice
// (windowProbe + WIN + usedNew, newSpaceUsed, gcWindow, runLane's `const w = await gcWindow(` line) stays byte-identical
// to ABGate.js d4991c39 (test/fixtures/hotbody/d4991c39.json, cut from that frozen build AND HEAD 0b37af7, identical).
// The expected bytes come from the fixture (never from the live file); the timedRounds golden sha is pinned below too.
// Controls (law 4): the frozen d4991c39 timedRounds as "live", the hoisted golden plus a 3rd PERF.now(), and one byte
// flipped in windowProbe each read red, for their own reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FX = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'hotbody', 'd4991c39.json'), 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
// pinned here as well as in the fixture, so an edited fixture cannot move the golden on its own
const PINS = {
    windowProbe: '1d291f51120f866567c257534764752d21f8250e19e44569983d0225f1807853',
    newSpaceUsed: '60992a9a40f965f8b4893a211f0f40ae925b14756001a9609174735fb287b0d4',
    gcWindow: 'aa0a5ef53fe3e9eeee2ba2716b9461eed63b0371ef76adfd727fbd1d98a5078a',
    timedRounds: 'cac70320451e4927a1d5c4214d62d2342125fb0eb943b6dabdb7567987a85892',
    'runLane.gcWindow': '24ed967b9191c7487a7a94891e4a73434c75cb397b436e6a662e65efc3ae661b',
};
const TR_HEAD = 'function timedRounds(live, N, starts, KR, n, L, tfBad, WARM) {';
const count = (t, s) => t.split(s).length - 1;

/** -> the reasons `src` breaks A1 (empty = holds). */
function hotBodyProblems(src) {
    const bad = [];
    const names = FX.slices.map((s) => s.name);
    if (names.slice().sort().join() !== Object.keys(PINS).sort().join()) bad.push('fixture slice set ' + names.join(','));
    for (const s of FX.slices) {
        if (sha(s.text) !== PINS[s.name] || s.sha256 !== PINS[s.name]) { bad.push(s.name + ': fixture text sha ' + sha(s.text).slice(0, 8) + ' (pin ' + String(PINS[s.name]).slice(0, 8) + ')'); continue; }
        if (s.name === 'timedRounds') continue;
        const k = count(src, s.text);
        if (k !== 1) bad.push(s.name + ': byte-identical slice found ' + k + ' times (want 1)');
    }
    const golden = FX.slices.find((s) => s.name === 'timedRounds');
    if (count(src, TR_HEAD) !== 1) { bad.push('timedRounds: head found ' + count(src, TR_HEAD) + ' times (want 1)'); return bad; }
    const a = src.indexOf(TR_HEAD), z = src.indexOf('\n}\n', a);
    const live = src.slice(a, z + 3);
    if (count(live, 'PERF.now()') !== 2) bad.push('timedRounds: PERF.now() ' + count(live, 'PERF.now()') + ' (want 2)');
    if (count(live, 'performance') !== 0) bad.push('timedRounds: performance ' + count(live, 'performance') + ' (want 0)');
    if (golden !== undefined && live.replaceAll('PERF.now()', 'performance.now()') !== golden.text) bad.push('timedRounds: with PERF.now() -> performance.now() it differs from the d4991c39 golden');
    const k = (src.match(/^const PERF = performance;/gm) || []).length;
    if (k !== 1) bad.push('module const PERF = performance: ' + k + ' (want 1)');
    return bad;
}

const SRC = readFileSync(join(ROOT, 'ABGate.js'), 'utf8');
const sliceOf = (src) => { const a = src.indexOf(TR_HEAD); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('A1: the live hot body is d4991c39 byte for byte, except timedRounds\' 2 clock reads PERF.now()', () => {
    assert.deepEqual(hotBodyProblems(SRC), []);
});

test('A1 control: the frozen d4991c39 timedRounds as "live" reads red (0 PERF.now(), 2 performance)', () => {
    const golden = FX.slices.find((s) => s.name === 'timedRounds').text;
    const live = sliceOf(SRC);
    assert.equal(count(SRC, live), 1);
    const p = hotBodyProblems(SRC.replace(live, () => golden));
    assert.ok(p.includes('timedRounds: PERF.now() 0 (want 2)'), p.join('\n'));
    assert.ok(p.includes('timedRounds: performance 2 (want 0)'), p.join('\n'));
});

test('A1 control: the hoisted golden plus a 3rd PERF.now() reads red', () => {
    const live = sliceOf(SRC);
    const extra = live.replace('            T[1] = PERF.now();\n', () => '            T[1] = PERF.now();\n            T[1] = PERF.now();\n');
    assert.notEqual(extra, live);
    const p = hotBodyProblems(SRC.replace(live, () => extra));
    assert.ok(p.includes('timedRounds: PERF.now() 3 (want 2)'), p.join('\n'));
    assert.ok(p.includes('timedRounds: with PERF.now() -> performance.now() it differs from the d4991c39 golden'), p.join('\n'));
});

test('A1 control: one byte flipped in windowProbe reads red', () => {
    const wp = FX.slices.find((s) => s.name === 'windowProbe').text;
    const i = wp.indexOf('WIN[3] = newSpaceUsed();');
    assert.ok(i > 0 && count(SRC, wp) === 1);
    const flipped = wp.slice(0, i + 4) + '2' + wp.slice(i + 5);   // WIN[3] -> WIN[2]: one byte
    assert.equal(flipped.length, wp.length);
    const p = hotBodyProblems(SRC.replace(wp, () => flipped));
    assert.deepEqual(p, ['windowProbe: byte-identical slice found 0 times (want 1)']);
});
