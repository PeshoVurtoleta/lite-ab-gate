// test/parity.proto.test.mjs -- G-A B3 (plan-GA ASSERTION 3, SPEC C-18 (c)): ABGate.js vs the frozen research prototype
// ab-proto 74f1a3d4, through the goldens cut from it (test/fixtures/golden/, masks in mask.mjs). DETERMINISTIC (no clock):
//   toy --oracle-only, masked (timing: false) == golden/toy-oracle-only.log: 0 differing lines.
//   the three CLI STOPs == golden/cli.log blocks.
// Declared diffs (plan-GA "Parity"): the usage text (program name ab-proto.mjs -> ABGate.js), the 4 ANCHOR texts, the
// frozen-only HEADER line, and the additive WINDOW line. The toy lane binds live, stops nowhere and runs no clock, so on
// these runs NONE of them may appear: a declared-diff line showing up here is itself a failure (nothing hides in the allowance).
// The golden's expected text is read from the golden file, never from ABGate.js output. The r1 lane is `npm run parity:r1`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { maskLog } from './fixtures/golden/mask.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOY = join(ROOT, 'test', 'fixtures', 'toy');
const GOLD = join(ROOT, 'test', 'fixtures', 'golden');
const FLAGS = ['--expose-gc', '--allow-natives-syntax', '--no-concurrent-recompilation', '--min-semi-space-size=4', '--max-semi-space-size=4', '--single-threaded-gc'];
const env = () => { const e = { ...process.env }; delete e.AB_GATE_INJECT; delete e.GITHUB_ACTIONS; return e; };
const run = (args) => { const r = spawnSync(process.execPath, [...FLAGS, join(ROOT, 'ABGate.js'), ...args], { cwd: TOY, encoding: 'utf8', env: env(), timeout: 120000 }); return { status: r.status, out: r.stdout || '', err: r.stderr || '' }; };

// Declared-diff line shapes (they are the ONLY lines the compare may ignore, and only when the caller allows them).
const DECLARED = [/^WINDOW lane=/, /^STOP ANCHOR: /, /^STOP CLI: usage: /, / live not bound \(frozen only\)$/];
const isDeclared = (l) => DECLARED.some((re) => re.test(l));

/** Number of differing lines between two texts (position by position; a length difference counts the extra lines). */
function diffCount(a, b) {
    const x = a.split('\n'), y = b.split('\n');
    let n = 0;
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) n++;
    return n;
}

test('toy --oracle-only, masked, equals golden/toy-oracle-only.log: 0 differing lines, no declared-diff line present', () => {
    const golden = readFileSync(join(GOLD, 'toy-oracle-only.log'), 'utf8');
    assert.equal(golden.split('\n').length - 1, 13, 'golden is 13 lines');
    const r = run(['toy-lane.mjs', '--oracle-only']);
    assert.equal(r.status, 0, r.err + r.out.slice(0, 300));
    assert.equal(r.err, '');
    assert.deepEqual(r.out.split('\n').filter(isDeclared), [], 'a declared-diff line appeared on a run that must have none');
    const masked = maskLog(r.out, { timing: false });
    assert.equal(diffCount(masked, golden), 0);
    assert.equal(masked, golden);
});

test('parity controls: the compare sees a changed line, a dropped line, an extra WINDOW line, and an unmasked host field', () => {
    const golden = readFileSync(join(GOLD, 'toy-oracle-only.log'), 'utf8');
    const lines = golden.split('\n');
    assert.equal(diffCount(golden, golden), 0);
    assert.equal(diffCount(golden.replace('records-checked=46080', 'records-checked=46081'), golden), 1);
    assert.equal(diffCount(lines.slice(0, 4).concat(lines.slice(5)).join('\n'), golden) > 0, true);
    assert.ok(diffCount('WINDOW lane=toy:clean tool-bytes=0 scavenges=0\n' + golden, golden) > 0, 'an extra WINDOW line must show (it is not hidden by the compare)');
    const raw = run(['toy-lane.mjs', '--oracle-only']).out;
    assert.ok(diffCount(raw, golden) >= 4, 'the raw output must differ from the golden at the host fields (so the mask is doing the work)');
});

test('the three CLI STOPs equal golden/cli.log (usage program name is the one declared diff)', () => {
    const text = readFileSync(join(GOLD, 'cli.log'), 'utf8');
    const blocks = [];
    for (const l of text.split('\n')) {
        const m = /^# case (\S+) argv=(\[.*\]) exit=(\d+)$/.exec(l);
        if (m !== null) blocks.push({ name: m[1], argv: JSON.parse(m[2]), exit: Number(m[3]), lines: [] });
        else if (blocks.length > 0 && l !== '') blocks[blocks.length - 1].lines.push(l);
    }
    assert.deepEqual(blocks.map((b) => b.name), ['no-args', 'bad-flag', 'K-0']);
    for (const b of blocks) {
        const r = run(b.argv);
        assert.equal(r.status, b.exit, b.name);
        const got = maskLog(r.out, { timing: false }).split('\n').filter((l) => l !== '');
        const want = b.lines.map((l) => l.replace(/^STOP CLI: usage: ab-proto\.mjs /, 'STOP CLI: usage: ABGate.js '));   // the declared usage diff
        assert.deepEqual(got, want, b.name);
    }
});
