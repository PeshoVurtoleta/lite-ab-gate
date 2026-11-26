// test/docs.test.mjs -- U10a-2 (plan-U10-v1 TASK 8): the docs / packaging claims, DETERMINISTIC, in npm test.
// Fifteen checks D1-D15, each a PURE function World -> problem list ([] = pass). Every check runs on
//   (a) the LIVE files (red when README.md / llms.txt / decisions/ are missing: a missing site is a problem, never a skip),
//   (b) an in-memory CONTROL world built here (must pass every check), and
//   (c) its in-memory MUTANT(S): only that check may fail, every other check must still pass on the mutant.
// Expected values come from the plan's ASSERTIONS and from the runtime (ABGate.js exports, TOOL_VOID_KINDS sliced from its
// text, injectionsOf / TIMED from the marker fixture), never from the README. Forbidden words are built by concatenation
// so this file never trips the sweeps it implements. node:test only, ASCII only, no dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { injectionsOf, TIMED } from './fixtures/timed-real/surface.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ns = await import(pathToFileURL(join(ROOT, 'ABGate.js')).href);
const rd = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : null);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- constants
const MANIFEST = [   // C-29 test floor: the test/*.test.mjs files that exist at U10a (14) + this one
    'docs.template.test.mjs', 'hotbody.parity.test.mjs', 'import.test.mjs', 'judge.extra.test.mjs', 'judge.rows.test.mjs',
    'mutants.test.mjs', 'parity.abgate.test.mjs', 'parity.proto.test.mjs', 'reproof.judge.test.mjs', 'selftest.untimed.test.mjs',
    'settle.test.mjs', 'spec.test.mjs', 'types.exports.test.mjs', 'workfloor.test.mjs', 'docs.test.mjs',
];
const BANNED_NUMBERS = ['44.36', '5661', '1.81', '1.19', '0.0028'];   // D10 (plus the literal '63 / 63')
const PRE_REG = ['0.98', '1.02', '0.95', '1.05', '1.04'];   // C-36 pre-registered decimals: the only ones a PENDING text may hold
const SLOT = 'Hoisted-loop re-proof (C-23, STATISTICAL):';
const SLOT_PENDING = SLOT + ' REQUIRED before 1.0 (C-23); PENDING, not yet run on this build; hosted dispatch PENDING.';
const RE_PROOF = '# 0001\n\n## Re-proof\n\nREQUIRED before 1.0 (C-23); PENDING. PASS = median r in [0.98, 1.02], per-hold r in [0.95, 1.05]; mutant B x1.04.\n\n## Next\n\nx\n';
const FORBIDDEN_NAME = 'Kara' + 'djov';
const RE_PAIR = new RegExp('re-?' + 'pair', 'i');
const TAG_RE = new RegExp('<\\/?antml|antml:|<function_calls>|<function_results>|<\\/?invoke\\b|<\\/?parameter\\b|<\\/?system-reminder>', 'i');
const NON_ASCII = /[^\x00-\x7F]/;

// ---------------------------------------------------------------- helpers
/** The decisions/ files as [relpath, text] (recursive), or null when the directory is missing. */
function listDecisions() {
    const base = join(ROOT, 'decisions');
    if (!existsSync(base) || !statSync(base).isDirectory()) return null;
    const out = [];
    const walk = (dir, rel) => {
        for (const n of readdirSync(dir).sort()) {
            const p = join(dir, n), r = rel + '/' + n;
            if (statSync(p).isDirectory()) walk(p, r); else out.push([r, readFileSync(p, 'utf8')]);
        }
    };
    walk(base, 'decisions');
    return out;
}
function runPack() {
    const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });   // a timeout is a failure (status null), never a skip
    if (r.status !== 0) return null;
    try { return JSON.parse(r.stdout); } catch { return null; }
}
const liveListing = () => readdirSync(join(ROOT, 'test')).filter((n) => n.endsWith('.test.mjs'));
const readSumLive = (p) => { const f = join(ROOT, 'research/timing-ab', p); return existsSync(f) ? readFileSync(f) : null; };

let packMemo;
function liveWorld() {
    if (packMemo === undefined) packMemo = runPack();
    const pkgText = rd('package.json');
    return {
        readme: rd('README.md'), llms: rd('llms.txt'), dts: rd('ABGate.d.ts'), changelog: rd('CHANGELOG.md'),
        license: rd('LICENSE.txt'), decisions: listDecisions(), pkgText, pkg: JSON.parse(pkgText), src: rd('ABGate.js'),
        pack: packMemo, gateText: rd('examples/ab.gate.mjs'), sums: rd('research/timing-ab/SHA256SUMS'), readSum: readSumLive,
        listing: liveListing(), exists: (rel) => existsSync(join(ROOT, rel)), readRel: rd,
    };
}

/** [name, text] sites for D4 / D5 / D6 plus the missing-site problems (a missing site is red, never skipped). */
function sitesOf(W) {
    const problems = [], sites = [];
    for (const [n, t] of [['README.md', W.readme], ['llms.txt', W.llms], ['ABGate.d.ts', W.dts], ['CHANGELOG.md', W.changelog]]) {
        if (typeof t !== 'string') problems.push(n + ' missing'); else sites.push([n, t]);
    }
    if (!Array.isArray(W.decisions) || W.decisions.length === 0) problems.push('decisions/ missing or empty');
    else for (const d of W.decisions) sites.push(d);
    return { sites, problems };
}

/** README "## API reference" section text (to the next H2), or null. */
function sectionOf(text, headRe) {
    const ls = text.split('\n');
    let a = -1;
    for (let i = 0; i < ls.length; i++) if (headRe.test(ls[i])) { a = i; break; }
    if (a < 0) return null;
    let z = ls.length;
    for (let i = a + 1; i < ls.length; i++) if (/^## /.test(ls[i])) { z = i; break; }
    return { head: ls[a], lines: ls.slice(a + 1, z) };
}
const runtimeKeys = () => Object.keys(ns).sort();
const setDiff = (a, b) => a.filter((x) => !b.includes(x));
const constRows = (readme) => {   // [name, valueCell] from the API-reference tables
    const sec = sectionOf(readme, /^## API reference/);
    if (sec === null) return null;
    const rows = [];
    for (const l of sec.lines) {
        const m = /^\|\s*`([A-Za-z_][A-Za-z0-9_.]*)`\s*\|\s*(.*?)\s*\|/.exec(l);
        if (m !== null) rows.push([m[1], m[2]]);
    }
    return rows;
};
const valueOf = (cell) => {
    const c = cell.replace(/`/g, '').trim();
    if (c !== '' && Number.isFinite(Number(c))) return Number(c);
    const f = /(\d+)\s*\/\s*(\d+)/.exec(c);
    if (f !== null) return Number(f[1]) / Number(f[2]);
    const d = /^-?\d+(?:\.\d+)?/.exec(c);
    return d !== null ? Number(d[0]) : NaN;
};

/** D14 rule on one text: PENDING with only pre-registered decimals, or a research/u9/ log holding every decimal (digit boundaries). */
function pendingProblems(name, text, W) {
    const dec = (text.replace('before 1.0', 'before').match(/(?<![\d.])\d+\.\d+(?!\d)/g)) || [];   // "before 1.0" is the release label, not a result
    if (text.includes('PENDING') && (/\b(PASS|FAIL|KILL|INVALID)\b/.test(text.replace(/\bPASS = /g, '')) || /research\/u9\//.test(text))) return [name + ' is PENDING but claims a verdict or names a research/u9/ log'];   // r2 LITERAL: no verdict beside PENDING
    if (text.includes('PENDING')) return dec.filter((d) => !PRE_REG.includes(d)).map((d) => name + ' is PENDING but quotes ' + d + ' (not pre-registered)');
    const pm = /research\/u9\/[A-Za-z0-9._\/-]*[A-Za-z0-9_]/.exec(text);
    if (pm === null) return [name + ' is neither PENDING nor names a research/u9/ log'];
    if (!W.exists(pm[0])) return [name + ' names ' + pm[0] + ', which does not exist'];
    const log = W.readRel(pm[0]), p = [];
    for (const d of text.replace(pm[0], '').replace('before 1.0', 'before').match(/(?<![\d.])\d+\.\d+(?!\d)/g) || []) {
        if (!new RegExp('(?<![\\d.])' + escRe(d) + '(?!\\d)').test(log)) p.push(name + ' quotes ' + d + ', absent from ' + pm[0]);
    }
    return p;
}
const goodRe = (j) => new RegExp(escRe(j) + '(?![ \\t]*--)');

// ---------------------------------------------------------------- the checks (each returns its problems; [] = pass)
const CHECKS = {
    // D1: runtime keys == llms "## Exports (N)" bullets (N == count) == README API names (H3 functions + table constants)
    D1(W) {
        const p = [], keys = runtimeKeys();
        if (keys.length !== 13) p.push('runtime exports ' + keys.length + ', plan says 13');
        if (typeof W.readme !== 'string') p.push('README.md missing');
        else {
            const sec = sectionOf(W.readme, /^## API reference/);
            if (sec === null) p.push('README has no "## API reference"');
            else {
                const names = new Set();
                for (const l of sec.lines) { const m = /^### `([A-Za-z_$][\w$]*)\(/.exec(l); if (m !== null) names.add(m[1]); }
                for (const [n] of constRows(W.readme)) names.add(n.startsWith('EXIT.') ? 'EXIT' : n);
                const got = [...names].sort();
                for (const x of setDiff(keys, got)) p.push('README API reference lacks ' + x);
                for (const x of setDiff(got, keys)) p.push('README API reference names non-export ' + x);
            }
        }
        if (typeof W.llms !== 'string') p.push('llms.txt missing');
        else {
            const sec = sectionOf(W.llms, /^## Exports \(\d+\)/);
            if (sec === null) p.push('llms.txt has no "## Exports (N)" heading');
            else {
                const got = [];
                for (const l of sec.lines) { const m = /^- `([^`]+)`/.exec(l); if (m !== null) got.push(m[1]); }
                const n = Number(/\((\d+)\)/.exec(sec.head)[1]);
                if (n !== got.length) p.push('llms Exports heading says ' + n + ' but lists ' + got.length);
                if (n !== keys.length) p.push('llms Exports heading says ' + n + ', runtime has ' + keys.length);
                const g = [...new Set(got)].sort();
                for (const x of setDiff(keys, g)) p.push('llms Exports lacks ' + x);
                for (const x of setDiff(g, keys)) p.push('llms Exports names non-export ' + x);
            }
        }
        return p;
    },
    // D2: README constants / EXIT table == runtime values (REQUIRED_FLAGS is D3's)
    D2(W) {
        const p = [];
        if (typeof W.readme !== 'string') return ['README.md missing'];
        const rows = constRows(W.readme);
        if (rows === null) return ['README has no "## API reference"'];
        const want = [], bare = [];
        for (const [k, v] of Object.entries(ns)) {
            if (typeof v === 'function' || k === 'REQUIRED_FLAGS') continue;
            if (k === 'EXIT') for (const [a, b] of Object.entries(v)) want.push(['EXIT.' + a, b]); else want.push([k, v]);
            bare.push([k, v]);
        }
        for (const [k, v] of want) {
            const row = rows.find((r) => r[0] === k);
            if (row === undefined) p.push('README constants table lacks ' + k);
            else if (valueOf(row[1]) !== v) p.push('README ' + k + ' = ' + row[1] + ', runtime ' + v);
        }
        if (!rows.some((r) => r[0] === 'REQUIRED_FLAGS')) p.push('README constants table lacks REQUIRED_FLAGS');
        // llms Exports bullets "- `NAME` value" (numeric constants) and the EXIT object, against the runtime values
        if (typeof W.llms !== 'string') { p.push('llms.txt missing'); return p; }
        const sec = sectionOf(W.llms, /^## Exports \(\d+\)/);
        if (sec === null) { p.push('llms.txt has no "## Exports (N)" heading'); return p; }
        const bl = new Map();
        for (const l of sec.lines) { const m = /^- `(\w+)` (\S+)/.exec(l); if (m !== null) bl.set(m[1], l); }
        for (const [k, v] of bare) {
            const l = bl.get(k);
            if (typeof v === 'number') {
                if (l === undefined) p.push('llms Exports lacks the value of ' + k);
                else if (Number(/^- `\w+` (\S+)/.exec(l)[1]) !== v) p.push('llms ' + k + ' = ' + /^- `\w+` (\S+)/.exec(l)[1] + ', runtime ' + v);
            } else if (k === 'EXIT') {
                const o = l === undefined ? null : /\{([^}]*)\}/.exec(l);
                if (o === null) { p.push('llms Exports lacks the EXIT object'); continue; }
                const got = {};
                for (const m of o[1].matchAll(/(\w+):\s*(\d+)/g)) got[m[1]] = Number(m[2]);
                for (const [a, b] of Object.entries(v)) if (got[a] !== b) p.push('llms EXIT.' + a + ' = ' + got[a] + ', runtime ' + b);
                for (const a of Object.keys(got)) if (!(a in v)) p.push('llms EXIT names non-member ' + a);
            }
        }
        return p;
    },
    // D3: REQUIRED_FLAGS.join(' ') verbatim in README and llms, and on every line that holds --expose-gc
    D3(W) {
        const j = ns.REQUIRED_FLAGS.join(' '), p = [];
        for (const [n, t] of [['README.md', W.readme], ['llms.txt', W.llms]]) {
            if (typeof t !== 'string') { p.push(n + ' missing'); continue; }
            if (!t.includes(j)) p.push(n + ' lacks the flag line: ' + j);
            // every line that names the flags must carry the FULL list (a copy that lost its last flag is stale)
            for (const l of t.split('\n')) if (l.includes('--expose-gc') && !goodRe(j).test(l)) p.push(n + ' has a flag line that is not the full REQUIRED_FLAGS: ' + l.slice(0, 60));
        }
        return p;
    },
    // D4: "re-dispatch" in README; the retired word absent from every site
    D4(W) {
        const { sites, problems } = sitesOf(W), p = [...problems];
        if (typeof W.readme === 'string' && !W.readme.includes('re-dispatch')) p.push('README lacks "re-dispatch" (C-7)');
        for (const [n, t] of sites) if (RE_PAIR.test(t)) p.push(n + ' uses the retired re-' + 'pair wording');
        return p;
    },
    // D5: ASCII in the 5 sites (U+00D7 and U+00B5 excepted)
    D5(W) {
        const { sites, problems } = sitesOf(W), p = [...problems];
        for (const [n, t] of sites) {
            const s = t.replace(/[\u00D7\u00B5]/g, '');
            const m = NON_ASCII.exec(s);
            if (m !== null) p.push(n + ' has non-ASCII U+' + m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
        }
        return p;
    },
    // D6: no tool-call tag text in the 5 sites
    D6(W) {
        const { sites, problems } = sitesOf(W), p = [...problems];
        for (const [n, t] of sites) { const m = TAG_RE.exec(t); if (m !== null) p.push(n + ' holds tool-call tag text ' + m[0]); }
        return p;
    },
    // D7: MIT + Shinikchiev in README and LICENSE.txt; the wrong surname nowhere
    D7(W) {
        const { sites } = sitesOf(W), p = [];
        for (const [n, t] of [['README.md', W.readme], ['LICENSE.txt', W.license]]) {
            if (typeof t !== 'string') { p.push(n + ' missing'); continue; }
            if (!/\bMIT\b/.test(t)) p.push(n + ' lacks MIT');
            if (!t.includes('Shinikchiev')) p.push(n + ' lacks Shinikchiev');
        }
        const all = [...sites, ['package.json', W.pkgText], ['LICENSE.txt', W.license], ['ABGate.js', W.src]];
        for (const [n, t] of all) if (typeof t === 'string' && new RegExp(FORBIDDEN_NAME, 'i').test(t)) p.push(n + ' holds the forbidden surname');
        return p;
    },
    // D8: npm pack --dry-run --json = exactly 10 entries (9 files[] + package.json); dependencies {}; every example frozen: path packed
    D8(W) {
        const p = [];
        const files = W.pkg.files;
        if (!Array.isArray(W.pack) || !Array.isArray(W.pack[0] && W.pack[0].files)) return ['npm pack --dry-run --json gave no usable result'];
        const entries = W.pack[0].files.map((f) => f.path);
        const expected = new Set([...files, 'package.json']);
        if (files.length !== 9) p.push('package.json files[] has ' + files.length + ' entries, plan says 9');
        if (entries.length !== 10) p.push('pack has ' + entries.length + ' entries, plan says exactly 10');
        for (const e of entries) if (!expected.has(e)) p.push('pack holds unexpected ' + e);
        for (const e of expected) if (!entries.includes(e)) p.push('pack lacks ' + e);
        const deps = W.pkg.dependencies;
        if (deps === null || typeof deps !== 'object' || Object.keys(deps).length !== 0) p.push('dependencies is not {}');
        if (typeof W.gateText !== 'string') p.push('examples/ab.gate.mjs missing');
        else {
            const fr = [...W.gateText.matchAll(/\bfrozen:\s*'([^']+)'/g)].map((m) => m[1]);
            if (fr.length === 0) p.push('no frozen: path found in examples/ab.gate.mjs');
            for (const f of fr) if (!entries.includes(posix.join('examples', f))) p.push('frozen path ' + f + ' is not packed');
        }
        return p;
    },
    // D9: research/timing-ab/SHA256SUMS lines all match
    D9(W) {
        const p = [];
        if (typeof W.sums !== 'string') return ['research/timing-ab/SHA256SUMS missing'];
        let n = 0;
        for (const l of W.sums.split('\n')) {
            if (l.trim() === '') continue;
            const m = /^([0-9a-f]{64})  (.+)$/.exec(l);
            if (m === null) { p.push('bad SHA256SUMS line: ' + l.slice(0, 40)); continue; }
            n++;
            const b = W.readSum(m[2]);
            if (b === null) p.push(m[2] + ' missing'); else if (sha256(b) !== m[1]) p.push(m[2] + ' sha256 differs');
        }
        if (n === 0) p.push('SHA256SUMS holds no entry');
        return p;
    },
    // D10: the U9-era numbers absent from README, llms, CHANGELOG, decisions/ (digit boundaries)
    D10(W) {
        const p = [];
        const sites = [['README.md', W.readme], ['llms.txt', W.llms], ['CHANGELOG.md', W.changelog]];
        if (Array.isArray(W.decisions)) for (const d of W.decisions) sites.push(d); else p.push('decisions/ missing');
        const pats = [...BANNED_NUMBERS, '63 / 63'].map((x) => [x, new RegExp('(?<![\\d.])' + escRe(x) + '(?!\\d)')]);
        for (const [n, t] of sites) {
            if (typeof t !== 'string') { p.push(n + ' missing'); continue; }
            for (const [x, re] of pats) if (re.test(t)) p.push(n + ' quotes ' + x);
        }
        return p;
    },
    // D11 (C-29): the manifest of test files all exist; count >= manifest length
    D11(W) {
        const p = [];
        for (const m of MANIFEST) if (!W.listing.includes(m)) p.push('test/' + m + ' missing');
        if (W.listing.length < MANIFEST.length) p.push('test/*.test.mjs count ' + W.listing.length + ' < ' + MANIFEST.length);
        return p;
    },
    // D12: README "markers: N (M timed)" == Object.keys(injectionsOf(src)).length / TIMED.length
    D12(W) {
        const n = Object.keys(injectionsOf(W.src)).length, t = TIMED.length, p = [];
        for (const [name, text] of [['README', W.readme], ['llms.txt', W.llms]]) {
            if (typeof text !== 'string') { p.push(name + ' missing'); continue; }
            const all = [...text.matchAll(/markers: (\d+) \((\d+) timed\)/g)];
            if (all.length === 0) p.push(name + ' lacks the literal "markers: N (M timed)"');
            for (const m of all) {
                if (Number(m[1]) !== n) p.push(name + ' says ' + m[1] + ' markers, INJECTIONS has ' + n);
                if (Number(m[2]) !== t) p.push(name + ' says ' + m[2] + ' timed, TIMED has ' + t);
            }
        }
        return p;
    },
    // D13 (C-59): the README workFloor section, the llms Contract section and the d.ts workFloor JSDoc name all 8 tool VOID kinds + prefix, pre-clock, (start, n), backstop
    D13(W) {
        const p = [];
        const m = /const TOOL_VOID_KINDS = Object\.freeze\(\[([^\]]*)\]\)/.exec(W.src);
        const kinds = m === null ? [] : [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
        if (kinds.length !== 8) p.push('ABGate.js TOOL_VOID_KINDS slice gave ' + kinds.length + ' kinds, plan says 8');
        let doc = null;
        if (typeof W.dts !== 'string') p.push('ABGate.d.ts missing');
        else {
            const ls = W.dts.split('\n');
            const i = ls.findIndex((l) => /^\s*readonly workFloor\?:/.test(l));
            if (i < 1) p.push('d.ts has no workFloor member'); else doc = ls[i - 1];
        }
        const want = (name, t) => {
            for (const k of kinds) if (!t.includes(k)) p.push(name + ' lacks reserved kind ' + k);
            if (!/prefix/i.test(t)) p.push(name + ' lacks the prefix rule');
            if (!/pre-clock/i.test(t)) p.push(name + ' lacks "pre-clock"');
            if (!t.includes('(start, n)')) p.push(name + ' lacks "(start, n)"');
            if (!/backstop/i.test(t)) p.push(name + ' lacks "backstop"');
        };
        if (typeof W.readme !== 'string') p.push('README.md missing');
        else {
            const s = sectionOf(W.readme, /^### The workFloor hook/);
            if (s === null) p.push('README has no "### The workFloor hook" section');
            else {
                const st = s.lines.join('\n');
                want('README workFloor section', st);
                if (!st.includes('"<KIND> <text>"')) p.push('README workFloor section lacks "<KIND> <text>"');
                if (!st.includes('STOP HARNESS: spec: ')) p.push('README workFloor section lacks "STOP HARNESS: spec: "');
            }
        }
        if (typeof W.llms !== 'string') p.push('llms.txt missing');
        else {
            const s = sectionOf(W.llms, /^## Contract/);
            if (s === null) p.push('llms.txt has no "## Contract" section'); else want('llms Contract', s.lines.join('\n'));
        }
        if (doc !== null) want('d.ts workFloor JSDoc', doc);
        return p;
    },
    // D14: exactly one slot line, and decisions/0001 "## Re-proof": each PENDING with only pre-registered decimals,
    // or naming an existing research/u9/ log that holds every decimal quoted (digit boundaries)
    D14(W) {
        if (typeof W.readme !== 'string') return ['README.md missing'];
        const slots = W.readme.split('\n').filter((l) => l.startsWith(SLOT));
        if (slots.length !== 1) return ['README has ' + slots.length + ' slot lines, plan says exactly 1'];
        const p = [...pendingProblems('slot line', slots[0], W)];
        const d = Array.isArray(W.decisions) ? W.decisions.find((x) => x[0] === 'decisions/0001-hotloop.md') : undefined;
        if (d === undefined) p.push('decisions/0001-hotloop.md missing');
        else {
            const s = sectionOf(d[1], /^## Re-proof/);
            if (s === null) p.push('decisions/0001-hotloop.md has no "## Re-proof" section');
            else p.push(...pendingProblems('0001 Re-proof', s.lines.join('\n'), W));
        }
        return p;
    },
    // D15: both scripts present; none of test / verify / prepublishOnly runs them; README shows each on a run --strict line
    D15(W) {
        const p = [], sc = W.pkg.scripts || {};
        if (sc.reproof !== 'node bench/reproof.mjs') p.push('scripts.reproof is not "node bench/reproof.mjs"');
        if (sc['selftest:timed'] !== 'node test/selftest.timed.mjs') p.push('scripts["selftest:timed"] is not "node test/selftest.timed.mjs"');
        for (const k of ['test', 'verify', 'prepublishOnly']) {
            if (typeof sc[k] !== 'string') p.push('scripts.' + k + ' missing');
            else if (/selftest:timed|reproof/.test(sc[k])) p.push('scripts.' + k + ' runs a timed script');
        }
        if (typeof W.readme !== 'string') p.push('README.md missing');
        else {
            for (const cmd of ['npm run selftest:timed', 'npm run reproof']) {   // per LINE: the same line carries run --strict before the command
                const ok = W.readme.split('\n').some((l) => { const i = l.indexOf(cmd), s = l.indexOf('run --strict'); return i >= 0 && s >= 0 && s < i; });
                if (!ok) p.push('README does not show `' + cmd + '` under `run --strict`');
            }
        }
        return p;
    },
};
const IDS = Object.keys(CHECKS);

// ---------------------------------------------------------------- the in-memory control world
const sub = (text, from, to) => {
    const n = text.split(from).length - 1;
    assert.equal(n, 1, 'mutant anchor ' + JSON.stringify(from) + ' must occur exactly once, got ' + n);
    return text.split(from).join(to);
};
function sampleReadme() {
    const src = readFileSync(join(ROOT, 'ABGate.js'), 'utf8');
    const rows = [];
    for (const [k, v] of Object.entries(ns)) {
        if (typeof v === 'function') continue;
        if (k === 'EXIT') for (const [a, b] of Object.entries(v)) rows.push('| `EXIT.' + a + '` | ' + b + ' |');
        else if (k === 'REQUIRED_FLAGS') rows.push('| `REQUIRED_FLAGS` | see below |');
        else rows.push('| `' + k + '` | ' + v + ' |');
    }
    const fns = Object.keys(ns).filter((k) => typeof ns[k] === 'function');
    const kinds = /Object\.freeze\(\[([^\]]*)\]\)/.exec(src.slice(src.indexOf('const TOOL_VOID_KINDS')))[1];
    return [
        '# lite-ab-gate', '> sample', '', '## API reference', '',
        ...fns.map((f) => '### `' + f + '(x)`'), '', '| Name | Value |', '| --- | --- |', ...rows, '',
        'Flags: ' + ns.REQUIRED_FLAGS.join(' '), '', 'FLAGS="' + ns.REQUIRED_FLAGS.join(' ') + '"', '',
        '## The workFloor', '', '### The workFloor hook and the reserved VOID kinds', '',
        'The reason is "<KIND> <text>".', '- A refusal prints STOP HARNESS: spec: <lane>.workFloor(...)', '',
        'A workFloor reason must not start with one of ' + kinds.replace(/'/g, '').replace(/,\s*/g, ', ') +
        ' (prefix rule: NANO x is reserved); checked pre-clock only for a workFloor pure in (start, n), else the backstop.', '',
        '## Verdicts', '', 'The VOID kinds include TIER-SETTLE.', '',
        'Every gate run is one dispatch; re-dispatch only on NO VERDICT.', '',
        'Versions 11.19, 441.36 and 56610 are not the banned numbers.', '',
        'markers: ' + Object.keys(injectionsOf(src)).length + ' (' + TIMED.length + ' timed)', '',
        '```', 'node ~/.claude/hooks/quiet-lock.mjs run --strict "x" -- npm run selftest:timed', '```', '',
        '```', 'node ~/.claude/hooks/quiet-lock.mjs run --strict "x" -- npm run reproof -- --hold 1', '```', '',
        SLOT_PENDING, '',
        'License: MIT (c) Zahary Shinikchiev', '',
    ].join('\n');
}
function sampleLlms() {
    const kinds = /Object\.freeze\(\[([^\]]*)\]\)/.exec(readFileSync(join(ROOT, 'ABGate.js'), 'utf8').split('const TOOL_VOID_KINDS')[1])[1].replace(/'/g, '').replace(/,\s*/g, ', ');
    const bullet = (k) => {
        const v = ns[k];
        if (typeof v === 'number') return '- `' + k + '` ' + v + ' (const)';
        if (k === 'EXIT') return '- `EXIT` { ' + Object.entries(v).map(([a, b]) => a + ': ' + b).join(', ') + ' }';
        return '- `' + k + '`';
    };
    return ['# lite-ab-gate', '', '## Exports (' + runtimeKeys().length + ')', ...Object.keys(ns).map(bullet), '',
        '## Contract', '',
        '- VOID kinds (a workFloor reason may not START WITH one; prefix match): ' + kinds + '. Reason `"<KIND> <text>"`; a reserved-kind refusal prints STOP HARNESS: spec: ...',
        '- workFloor is checked pre-clock only when its answer depends on (start, n) alone; otherwise the per-lane check is a backstop.', '',
        '## Allocation', '', 'TIER-SETTLE is also named here.', '',
        'Flags: ' + ns.REQUIRED_FLAGS.join(' '), '',
        'markers: ' + Object.keys(injectionsOf(readFileSync(join(ROOT, 'ABGate.js'), 'utf8'))).length + ' (' + TIMED.length + ' timed)', ''].join('\n');
}
function controlWorld() {
    const pkgText = readFileSync(join(ROOT, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgText);
    const sums = readFileSync(join(ROOT, 'research/timing-ab/SHA256SUMS'), 'utf8');
    return {
        readme: sampleReadme(), llms: sampleLlms(), dts: readFileSync(join(ROOT, 'ABGate.d.ts'), 'utf8'),
        changelog: '# Changelog\n\n## [Unreleased]\n\n- docs and scripts.\n', license: readFileSync(join(ROOT, 'LICENSE.txt'), 'utf8'),
        decisions: [['decisions/0001-hotloop.md', RE_PROOF]], pkgText, pkg,
        src: readFileSync(join(ROOT, 'ABGate.js'), 'utf8'),
        pack: [{ files: [...pkg.files, 'package.json'].map((path) => ({ path })) }],   // synthetic: 9 files[] + package.json
        gateText: readFileSync(join(ROOT, 'examples/ab.gate.mjs'), 'utf8'), sums, readSum: readSumLive,
        listing: [...MANIFEST], exists: () => false, readRel: () => null,
    };
}

// ---------------------------------------------------------------- mutants: [check, name, World -> World]
const MUTANTS = [
    ['D1', 'drop runGate from llms', (W) => ({ ...W, llms: sub(W.llms, '- `runGate`\n', '') })],
    ['D2', 'AA_HI 1.06', (W) => ({ ...W, readme: sub(W.readme, '| `AA_HI` | 1.05 |', '| `AA_HI` | 1.06 |') })],
    ['D2', 'llms AA_HI 1.06', (W) => ({ ...W, llms: sub(W.llms, '- `AA_HI` 1.05', '- `AA_HI` 1.06') })],
    ['D3', 'last flag dropped from one README copy', (W) => {
        const j = ns.REQUIRED_FLAGS.join(' '), cut = ns.REQUIRED_FLAGS.slice(0, -1).join(' ');
        return { ...W, readme: W.readme.replace(j, cut) };   // first copy only; the FLAGS= copy stays intact
    }],
    ['D4', 're-pair in llms', (W) => ({ ...W, llms: W.llms + 'See re-' + 'pair.\n' })],
    ['D4', 're-dispatch cut', (W) => ({ ...W, readme: sub(W.readme, 're-dispatch', 'rerun') })],
    ['D5', 'U+2192 in README', (W) => ({ ...W, readme: W.readme + 'a \u2192 b\n' })],
    ['D6', 'tag text in llms', (W) => ({ ...W, llms: W.llms + '<' + 'function_calls>\n' })],
    ['D7', 'surname swapped', (W) => ({ ...W, readme: sub(W.readme, 'Shinikchiev', FORBIDDEN_NAME) })],
    ['D8', 'extra file in the pack', (W) => ({ ...W, pack: [{ files: [...W.pack[0].files, { path: 'notes.txt' }] }] })],
    ['D8', 'ab.kernel.js missing from the pack', (W) => ({ ...W, pack: [{ files: W.pack[0].files.filter((f) => f.path !== 'examples/ab.kernel.js') }] })],
    ['D9', '1-byte flip', (W) => {
        const first = /^[0-9a-f]{64}  (.+)$/m.exec(W.sums)[1];
        return { ...W, readSum: (p) => { const b = Buffer.from(W.readSum(p)); if (p === first) b[0] ^= 1; return b; } };
    }],
    ['D10', '1.81x quoted', (W) => ({ ...W, readme: W.readme + 'Median 1.81x faster.\n' })],
    ['D11', 'import.test removed', (W) => ({ ...W, listing: W.listing.filter((n) => n !== 'import.test.mjs') })],
    ['D12', 'markers 13', (W) => ({ ...W, readme: sub(W.readme, 'markers: ' + Object.keys(injectionsOf(W.src)).length + ' (', 'markers: 13 (') })],
    ['D12', 'llms markers 13', (W) => ({ ...W, llms: sub(W.llms, 'markers: ' + Object.keys(injectionsOf(W.src)).length + ' (', 'markers: 13 (') })],
    ['D13', 'TIER-SETTLE dropped from the README workFloor section only (still named under Verdicts)', (W) => ({ ...W,
        readme: W.readme.split('\n').map((l) => (l.startsWith('A workFloor reason must not start') ? l.replace('TIER-SETTLE', 'TIER') : l)).join('\n') })],
    ['D13', 'TIER-SETTLE dropped from llms Contract', (W) => ({ ...W, llms: sub(W.llms, 'NAN, TIER-SETTLE. Reason', 'NAN, TIER. Reason') })],
    ['D13', 'STOP HARNESS: spec: bullet deleted', (W) => ({ ...W, readme: sub(W.readme, '- A refusal prints STOP HARNESS: spec: <lane>.workFloor(...)\n', '') })],
    ['D14', 'r = 1.004, no log', (W) => ({ ...W, readme: sub(W.readme, SLOT_PENDING, SLOT + ' r = 1.004') })],
    ['D14', 'slot says PASS r = 1.004 beside PENDING', (W) => ({ ...W, readme: sub(W.readme, SLOT_PENDING, SLOT + ' PASS, median r = 1.004 on every lane; hosted dispatch PENDING.') })],
    ['D14', 'N1 slot says PASS, median r = 1.02 (pre-registered decimal + verdict word) beside PENDING', (W) => ({ ...W, readme: sub(W.readme, SLOT_PENDING, SLOT + ' PASS, median r = 1.02 on every lane; hosted dispatch PENDING.') })],
    ['D14', 'N5 slot says PASS 5 of 5 holds (no decimal, verdict word) beside PENDING', (W) => ({ ...W, readme: sub(W.readme, SLOT_PENDING, SLOT + ' PASS 5 of 5 holds; hosted dispatch PENDING.') })],
    ['D14', '0001 Re-proof quotes PASS r = 1.004', (W) => ({ ...W, decisions: [['decisions/0001-hotloop.md', sub(W.decisions[0][1], 'mutant B x1.04.\n', 'mutant B x1.04.\n\nPASS: median r = 1.004\n')]] })],
    ['D15', 'reproof line without the quiet-lock prefix', (W) => ({ ...W, readme: sub(W.readme, 'node ~/.claude/hooks/quiet-lock.mjs run --strict "x" -- npm run reproof -- --hold 1', 'npm run reproof -- --hold 1') })],
    ['D15', 'verify calls selftest:timed', (W) => {
        const pkg = JSON.parse(W.pkgText);
        pkg.scripts.verify += ' && npm run selftest:timed';
        return { ...W, pkg };
    }],
];

// ---------------------------------------------------------------- rows
test('self: 15 checks, 26 mutants, each check has a mutant', () => {
    assert.equal(IDS.length, 15);
    assert.equal(MUTANTS.length, 26);
    for (const id of IDS) assert.ok(MUTANTS.some((m) => m[0] === id), id + ' has no mutant');
});

test('control world: every check passes', () => {
    const W = controlWorld();
    for (const id of IDS) assert.deepEqual(CHECKS[id](W), [], id + ' control');
});

for (const id of IDS) {
    test('live ' + id + ' (red while README.md / llms.txt / decisions/ are missing)', () => {
        assert.deepEqual(CHECKS[id](liveWorld()), []);
    });
}

for (const [id, name, mut] of MUTANTS) {
    test('mutant ' + id + ': ' + name + ' fails only ' + id, () => {
        const C = controlWorld();
        assert.deepEqual(CHECKS[id](C), [], id + ' unmutated control must pass first');
        const M = mut(C);
        assert.ok(CHECKS[id](M).length > 0, id + ' must fail on its mutant');
        for (const other of IDS) if (other !== id) assert.deepEqual(CHECKS[other](M), [], other + ' must still pass on the ' + id + ' mutant');
    });
}

// D14 log variant: a slot that quotes decimals must name an existing research/u9/ log holding every one of them
test('D14 log variant: control passes, a decimal absent from the log fails only D14', () => {
    const C = controlWorld();
    const line = SLOT + ' median r = 1.004 (research/u9/run1.log).';
    const mk = (log, exists) => ({ ...C, readme: sub(C.readme, SLOT_PENDING, line),
        exists: (r) => exists && r === 'research/u9/run1.log', readRel: () => log });
    const ok = mk('median 1.004 over 5 holds', true);
    for (const id of IDS) assert.deepEqual(CHECKS[id](ok), [], id + ' on the log-variant control');
    for (const bad of [mk('median 1.011', true), mk('median 11.0045', true), mk('', false)]) {
        assert.ok(CHECKS.D14(bad).length > 0);
        for (const other of IDS) if (other !== 'D14') assert.deepEqual(CHECKS[other](bad), [], other);
    }
    const two = { ...C, readme: C.readme + SLOT + ' PENDING again.\n' };
    assert.ok(CHECKS.D14(two).length > 0, 'two slot lines must fail');
});

// the live-file checks fail closed on a missing site (a null text is a problem, never a skip)
test('fail closed: a world with no README / llms / decisions is red on D1 D2 D3 D4 D5 D6 D10 D12 D13 D14 D15', () => {
    const C = controlWorld();
    const W = { ...C, readme: null, llms: null, decisions: null };
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D10', 'D12', 'D13', 'D14', 'D15']) assert.ok(CHECKS[id](W).length > 0, id);
});
