// docs.template.test.mjs -- the workflow template drift guard (plan-GC TASK 6, ASSERTION 1; C-7, C-14, C-17, C-24, C-31;
// plan-U8 TASK 5: the selftest STOP gate requires timed >= 1, and the summary names a red selftest NO VERDICT;
// FILL7 / C-57 STEPKEYS: every step of every checked job has its exact key set, plain or quoted, in failclosed).
// DETERMINISTIC: reads templates/ab.yml, .github/workflows/ab.yml, .github/workflows/ci.yml and examples/ as TEXT
// (zero deps: YAML parsed as lines) and checks them against ABGate.js's REQUIRED_FLAGS and EXIT. Teeth: every check also
// runs on in-memory mutants of the real files; on each mutant exactly its own check must fail and every other check
// must pass. A mutant whose edit does not apply (text not found exactly once) throws: no vacuous mutant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { REQUIRED_FLAGS, EXIT } from '../ABGate.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

function loadWorld() {
    const examples = {};
    for (const f of readdirSync(new URL('examples/', ROOT)).sort()) examples['examples/' + f] = read('examples/' + f);
    return { template: read('templates/ab.yml'), own: read('.github/workflows/ab.yml'), ci: read('.github/workflows/ci.yml'), examples };
}
const WORLD = loadWorld();

// ---------------------------------------------------------------- YAML-as-lines helpers
const linesOf = (t) => t.split('\n');
const indentOf = (s) => s.length - s.trimStart().length;
/** The leading comment block (every line before the first line that does not start with '#'). */
function headerOf(t) {
    const out = [];
    for (const l of linesOf(t)) { if (!l.startsWith('#')) break; out.push(l); }
    return out.join('\n');
}
/** Every line `<indent>KEY: value [# comment]`; returns the values (comment stripped). */
function envValues(t, key) {
    const re = new RegExp('^\\s+' + key + ': (.*?)(?:\\s+#.*)?$');
    const out = [];
    for (const l of linesOf(t)) { const m = re.exec(l); if (m !== null) out.push(m[1]); }
    return out;
}
/** Steps: each `- name: X` line up to the next line indented at or left of it. */
function stepsOf(t) {
    const ls = linesOf(t), out = [];
    for (let i = 0; i < ls.length; i++) {
        const m = /^(\s*)- name: (.*)$/.exec(ls[i]);
        if (m === null) continue;
        const ind = m[1].length, body = [ls[i]];
        for (let j = i + 1; j < ls.length; j++) {
            if (ls[j].trim() !== '' && indentOf(ls[j]) <= ind) break;
            body.push(ls[j]);
        }
        out.push({ name: m[2], text: body.join('\n') });
    }
    return out;
}
/** Every run: value (a `run: |` block scalar = the following lines indented deeper than the key, or the inline value). */
function runBlocksOf(t) {
    const ls = linesOf(t), out = [];
    for (let i = 0; i < ls.length; i++) {
        const m = /^(\s*)(- )?run: ?(.*)$/.exec(ls[i]);
        if (m === null) continue;
        if (m[3].trim() === '') continue;   // a bare 'run:' key is a mapping (defaults: run: shell:), not a command
        const keyInd = m[1].length + (m[2] ? 2 : 0);
        if (!/^[|>][-+]?\s*$/.test(m[3])) { out.push({ line: i + 1, text: m[3] }); continue; }
        const body = [];
        for (let j = i + 1; j < ls.length; j++) {
            if (ls[j].trim() !== '' && indentOf(ls[j]) <= keyInd) break;
            body.push(ls[j]);
        }
        out.push({ line: i + 1, text: body.join('\n') });
    }
    return out;
}
/** Absolute (or home-relative) paths in a text, minus the allowlist (sysfs informational reads, /dev/null). */
const ABS_RE = /(?:^|[\s"'`=(:>|;,])((?:~|\$HOME)?\/[A-Za-z0-9._~-][^\s"'`;|)]*)/g;
const ABS_ALLOW = (p) => p.startsWith('/sys/devices/') || p === '/dev/null';
function absPaths(text) {
    const out = [];
    for (const l of linesOf(text)) for (const m of l.matchAll(ABS_RE)) if (!ABS_ALLOW(m[1])) out.push(m[1]);
    return out;
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------- the checks (each returns its problems; [] = pass)
const WFS = (w) => [['templates/ab.yml', w.template], ['.github/workflows/ab.yml', w.own]];
const TOOL_LINE = '      AB_TOOL: node_modules/@zakkster/lite-ab-gate/ABGate.js';
const OWN_TOOL_LINE = '      AB_TOOL: ABGate.js';
const GATE_RE = /^(      AB_GATE: )(\S+)(  # PARAM: .*)$/;
const OWN_GATE = 'examples/ab.gate.mjs';
const CP_LINE = 'cp node_modules/@zakkster/lite-ab-gate/templates/ab.yml .github/workflows/ab.yml';
const GATE_STEP = 'gate (--run ALL)';
const IMAGEOS_LINE = '          : "${ImageOS:?unset}"';   // exact: ${ImageOS:-unset} would fail open on a runner with no image id
// the runner-identity step, exact (FILL5): its whole run: block and its env, literal text (never derived from the file checked).
// Nothing before / between / after: a line before the guard (e.g. ImageOS="${ImageOS:-unknown}") would make the :? guard never fire.
const RUNID_STEP = 'runner identity';
const RUNID_RUN = [
    ': "${ImageOS:?unset}"',
    'test "$RUNNER_ARCH" = "$WANT_ARCH"',
    'case "$WANT_OS" in',
    '  ubuntu-latest) test "$RUNNER_OS" = Linux ;;',
    '  macos-latest) test "$RUNNER_OS" = macOS ;;',
    '  *) echo "unexpected matrix os: $WANT_OS"; exit 1 ;;',
    'esac',
].join('\n');
const RUNID_ENV = ['WANT_OS: ${{ matrix.os }}', 'WANT_ARCH: ${{ matrix.arch }}'];
/** Problems of the runner-identity step in one workflow text: exactly one step, exact env keys, exact run: block. */
function runnerIdProblems(f, t) {
    const s = stepsOf(t).filter((x) => x.name === RUNID_STEP);
    if (s.length !== 1) return [f + ': ' + s.length + ' steps named ' + RUNID_STEP + ' (want 1)'];
    const p = [], ls = linesOf(s[0].text);
    if (stepsOf(t)[0].name !== RUNID_STEP) p.push(f + ': step ' + RUNID_STEP + ' is not the first step');
    // r3 blockers 1 + 2: first list item under steps: is runner identity; its YAML extent (comments never end it) has keys exactly env,run
    const L = linesOf(t), isKey = (l) => l.trim() !== '' && !l.trim().startsWith('#'), si = L.indexOf('    steps:');
    const first = si < 0 ? undefined : L.slice(si + 1).find(isKey);
    if (first !== '      - name: ' + RUNID_STEP) p.push(f + ': the first item under steps: is not "- name: ' + RUNID_STEP + '": ' + JSON.stringify(first));
    const a = L.indexOf('      - name: ' + RUNID_STEP); let b = a + 1;
    while (b < L.length && !(isKey(L[b]) && indentOf(L[b]) <= 6)) b++;
    const sk = a < 0 ? [] : L.slice(a + 1, b).filter((l) => isKey(l) && indentOf(l) < 10).map((l) => l.trim().replace(/:.*$/, ''));
    if (sk.join(',') !== 'env,run') p.push(f + ': step ' + RUNID_STEP + ' keys ' + JSON.stringify(sk) + ' (want env,run)');
    const runKeys = ls.filter((l) => /^\s*(?:- )?run\s*:/.test(l));
    if (runKeys.length !== 1 || runKeys[0] !== '        run: |') p.push(f + ': step ' + RUNID_STEP + ' run key is not exactly "        run: |"');
    const ei = ls.findIndex((l) => /^\s+env:\s*$/.test(l));
    const env = [];
    if (ei >= 0) for (let j = ei + 1; j < ls.length && (ls[j].trim() === '' || ls[j].trim().startsWith('#') || indentOf(ls[j]) > indentOf(ls[ei])); j++) if (ls[j].trim() !== '') env.push(ls[j].trim());
    if (env.join('\n') !== RUNID_ENV.join('\n')) p.push(f + ': step ' + RUNID_STEP + ' env is not exactly WANT_OS / WANT_ARCH: ' + JSON.stringify(env));
    const r = runBlocksOf(s[0].text);
    if (r.length !== 1 || dedent(r[0].text) !== RUNID_RUN) p.push(f + ': step ' + RUNID_STEP + ' run: block is not the exact 7-line text');
    return p;
}
// C-52: the job env's exact KEY set (values free: AB_TOOL differs between the template and the dogfood file); no top-level env:
const JOB_ENV_KEYS = ['AB_GATE', 'AB_NODE', 'AB_TOOL', 'FLAGS'];
const TOP_KEYS = 'name,on,permissions,defaults,jobs';
function jobEnvProblems(f, t) {
    const ls = linesOf(t), p = [];
    // r2: an allowlist, not a denylist (escaped / explicit-key spellings of env must not slip through); literal, never derived
    const top = ls.filter((l) => /^[^\s#]/.test(l)).map((l) => l.replace(/:.*$/, '')).join(',');
    if (top !== TOP_KEYS) p.push(f + ': top-level keys ' + JSON.stringify(top) + ' (want ' + TOP_KEYS + ')');
    // r3 blockers 3 + 4: printable ASCII + LF only (YAML also breaks lines on CR / NEL); defaults: block exact
    const bad = /[^\n\x20-\x7e]/.exec(t);
    if (bad !== null) p.push(f + ': char ' + JSON.stringify(bad[0]) + ' outside printable ASCII + LF (a YAML line break the line model cannot see)');
    const di = ls.indexOf('defaults:'), dv = [];
    for (let j = di + 1; di >= 0 && j < ls.length && !(ls[j].trim() !== '' && !ls[j].trim().startsWith('#') && indentOf(ls[j]) === 0); j++) if (ls[j].trim() !== '' && !ls[j].trim().startsWith('#')) dv.push(ls[j]);
    if (dv.join('\n') !== '  run:\n    shell: bash') p.push(f + ': defaults: is not exactly run: shell: bash: ' + JSON.stringify(dv));
    // precondition (no mutant possible: the second-env mutant is killed by the job-key / env-key rows first)
    const at = ls.map((l, i) => (/^    env:\s*$/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (at.length !== 1) return p.concat(f + ': ' + at.length + ' job env: blocks (want 1)');
    const keys = [];
    for (let j = at[0] + 1; j < ls.length && (ls[j].trim() === '' || ls[j].trim().startsWith('#') || indentOf(ls[j]) > 4); j++) {
        if (ls[j].trim() === '' || ls[j].trim().startsWith('#')) continue;
        if (indentOf(ls[j]) !== 6) continue;   // a continuation, not a key
        const m = /^\s+([^:]*):/.exec(ls[j]);
        keys.push(m === null ? ls[j].trim() : m[1]);
    }
    if (keys.join(',') !== JOB_ENV_KEYS.join(',')) p.push(f + ': job env keys ' + JSON.stringify(keys) + ' != ' + JSON.stringify(JOB_ENV_KEYS));
    return p;
}
// C-53 JOBKEYS: the jobs map holds exactly one job `ab`; its key set is exactly the literal list below (sorted compare); runs-on is
// exactly `${{ matrix.os }}`. So container / services / self-hosted routes cannot set ImageOS ahead of the guard.
const JOB_KEYS = ['env', 'name', 'runs-on', 'steps', 'strategy', 'timeout-minutes'];
const RUNS_ON_LINE = '    runs-on: ${{ matrix.os }}';
function jobKeyProblems(f, t) {
    const ls = linesOf(t), p = [];
    const ji = ls.indexOf('jobs:');
    if (ji < 0) return [f + ': no jobs: key'];
    const jobs = [], keys = [];
    let inAb = false;
    for (let j = ji + 1; j < ls.length; j++) {
        const l = ls[j], tr = l.trim();
        if (tr === '' || tr.startsWith('#')) continue;
        const ind = indentOf(l);
        if (ind === 0) break;
        const m = /^\s*([^:]*):/.exec(l);
        const k = m === null ? tr : m[1];
        if (ind === 2) { jobs.push(k); inAb = k === 'ab'; }
        else if (ind === 4 && inAb) { keys.push(k); if (k === 'runs-on' && l !== RUNS_ON_LINE) p.push(f + ': job ab runs-on is not exactly "' + RUNS_ON_LINE.trim() + '": ' + JSON.stringify(l)); }
    }
    if (jobs.join(',') !== 'ab') p.push(f + ': jobs ' + JSON.stringify(jobs) + ' (want exactly ab)');
    if (keys.slice().sort().join(',') !== JOB_KEYS.join(',')) p.push(f + ': job ab keys ' + JSON.stringify(keys) + ' (want ' + JOB_KEYS.join(',') + ')');
    return p;
}
// C-57 STEPKEYS (P99): every step of the checked job, in order, by name, with its exact top-level key set (sorted compare,
// duplicates kept). Keys are read at the step's own indentation, plain or quoted ("k": / 'k': normalize to k), so a quoted
// continue-on-error / shell / if cannot slip past the unquoted regex rows. Literal per step, never derived from the file.
const STEP_KEYS_AB = Object.freeze([
    ['runner identity', 'env,name,run'],
    ['checkout', 'name,uses,with'],
    ['setup node', 'name,uses,with'],
    ['node is exactly the pin', 'env,name,run'],
    ['gate file path', 'name,run'],
    ['npm ci', 'name,run'],
    ['provenance', 'name,run'],
    ['selftest', 'name,run'],
    [GATE_STEP, 'name,run'],
    ['verdict to the job summary', 'env,if,name,run'],
    ['upload logs', 'if,name,uses,with'],
]);
const STEP_KEYS_CI = Object.freeze([
    ['checkout', 'name,uses,with'],
    ['setup node', 'name,uses,with'],
    ['provenance', 'name,run'],
    ['node is exactly the verdict pin', 'env,if,name,run'],
    ['npm ci', 'name,run'],
    ['npm test', 'name,run'],
    ['npm run torture', 'if,name,run'],
]);
// a MISSING step-level if: on these steps is left to the check that owns its presence; each owner reads the if: at the
// step key indent (8) only, so an if: moved into a nested block or commented out fails the owner too (controls below:
// dropped, moved). An extra if: anywhere and every other missing / extra key fail here
const IF_OWNER = Object.freeze({ 'verdict to the job summary': 'always', 'upload logs': 'always', 'node is exactly the verdict pin': 'pin', 'npm run torture': 'ci' });
// a key: double-quoted, single-quoted, or plain starting with a letter; anything else (? explicit key, { flow, & anchor,
// * alias, a key with ': ' or '#' in it) does not parse and fails closed
const STEP_KEY_RE = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([A-Za-z_][^:#]*?))\s*:(?:\s|$)/;
function stepKeyName(m) {
    if (m[1] !== undefined) { try { return JSON.parse('"' + m[1] + '"'); } catch { return m[1]; } }   // an unknown escape stays raw: no allowed key, fails closed
    if (m[2] !== undefined) return m[2].replaceAll("''", "'");
    return m[3].trimEnd();
}
/** Problems of the steps: block (the one '    steps:' line, items '      - ' at indent 6, keys at indent 8) against `want`. */
function stepKeyProblems(f, t, want) {
    const ls = linesOf(t), p = [], tag = f + ': stepkeys ';
    const at = ls.map((l, i) => (l === '    steps:' ? i : -1)).filter((i) => i >= 0);
    if (at.length !== 1) return [tag + at.length + ' "    steps:" lines (want 1)'];
    const items = [];
    for (let j = at[0] + 1; j < ls.length; j++) {
        const l = ls[j];
        // before the comment / blank skip: a CR or tab inside a comment line is a YAML line break the line model cannot see
        if (/[^\x20-\x7e]/.test(l)) { p.push(tag + 'line ' + (j + 1) + ': char outside printable ASCII'); continue; }
        if (l.trim() === '' || l.trim().startsWith('#')) continue;
        const ind = indentOf(l);
        if (ind <= 4) break;
        let rest;
        if (ind === 6) {
            const m = /^ {6}- (\S.*)$/.exec(l);
            if (m === null) { p.push(tag + 'line ' + (j + 1) + ': indent-6 line is not "- <key>": ' + JSON.stringify(l)); continue; }
            items.push({ line: j + 1, name: null, keys: [] });
            rest = m[1];
        } else if (ind === 8 && items.length > 0) rest = l.slice(8);
        else if (ind > 8 && items.length > 0) continue;   // a nested value or block scalar line, not a step key
        else { p.push(tag + 'line ' + (j + 1) + ': unexpected indent ' + ind + ': ' + JSON.stringify(l)); continue; }
        const k = STEP_KEY_RE.exec(rest);
        if (k === null) { p.push(tag + 'line ' + (j + 1) + ': key does not parse: ' + JSON.stringify(l)); continue; }
        const it = items[items.length - 1], key = stepKeyName(k);
        it.keys.push(key);
        if (key === 'name') it.name = it.name === null ? rest.slice(k[0].length).trim() : '(two name keys)';
    }
    if (items.length !== want.length) p.push(tag + items.length + ' steps (want ' + want.length + ')');
    for (let i = 0; i < Math.min(items.length, want.length); i++) {
        const it = items[i], [name, keys] = want[i];
        if (it.name !== name) { p.push(tag + 'step ' + (i + 1) + ' (line ' + it.line + ') is ' + JSON.stringify(it.name) + ' (want ' + JSON.stringify(name) + ')'); continue; }
        const got = it.keys.slice().sort();
        let exp = keys.split(',').sort();
        if (Object.hasOwn(IF_OWNER, name) && !got.includes('if')) exp = exp.filter((x) => x !== 'if');
        if (got.join(',') !== exp.join(',')) p.push(tag + 'step ' + name + ' keys ' + JSON.stringify(got) + ' (want ' + exp.join(',') + ')');
    }
    return p;
}
const isStepKeyProblem = (s) => / stepkeys /.test(s);
// the timed-case count the selftest must report (ABGate.js selftest's summary line), as a POSIX ERE that JS reads alike;
// accepts the timed run, rejects the untimed-only form and timed 0 (stopgate + the static row below)
const COUNT_ERE = 'SELFTEST ran [0-9]+ of [0-9]+ \\(untimed [0-9]+, timed [1-9][0-9]*\\)';
const SELFTEST_RUN = [
    'node $FLAGS "$AB_TOOL" "$AB_GATE" --selftest 2>&1 | tee logs/selftest.log',
    "grep -qx 'SELFTEST all ok' logs/selftest.log",
    "grep -Eqx '" + COUNT_ERE + "' logs/selftest.log",
].join('\n');
// the summary's selftest block (exact text, dedented): a red or untimed selftest reads STOP -> NO VERDICT (law 7, C-17)
const SUMMARY_SELFTEST = [
    '# the selftest STOP gate: all ok AND the timed cases ran (timed >= 1), else the run is NO VERDICT',
    "ran=''",
    "if [ -f logs/selftest.log ] && grep -qx 'SELFTEST all ok' logs/selftest.log; then",
    "  ran=\"$(sed -n -E 's/^SELFTEST (ran [0-9]+ of [0-9]+ \\(untimed [0-9]+, timed [1-9][0-9]*\\))$/\\1/p' logs/selftest.log)\"",
    'fi',
    'if [ -n "$ran" ]; then',
    '  echo "selftest: all ok, $ran"',
    'else',
    "  echo 'selftest: red or not run -> STOP -> NO VERDICT, never host evidence'",
    'fi',
].join('\n');
// real ABGate.js selftest summary lines: the timed run (examples/ab.gate.mjs, plan-U8 A1) and the two forms the gate must refuse
// The summary FORMAT is read from the producer: ABGate.js is read as text and the say(...) that prints the summary is found by its
// literal pieces (never by line number). Not found exactly once -> a problem (fail closed), never a skip.
const ABSRC = read('ABGate.js');
const PRODUCER_RE = /^[ \t]*say\(ctx, '(SELFTEST ran )' \+ ran \+ '( of )' \+ total \+ '( \(untimed )' \+ untimed \+ '(, timed )' \+ \(untimedOnly \? '([^'\n]*)' : cases\.length\) \+ '(\))'\);$/gm;
/** { ok, bad[] , problems[] } sample lines built from the producer's literal pieces. */
function producerSamples(src) {
    const ms = [...src.matchAll(PRODUCER_RE)];
    if (ms.length !== 1) return { ok: '', bad: [], problems: ['ABGate.js: the selftest summary say(...) found ' + ms.length + ' times (want exactly 1)'] };
    const [, a, b, c, d, untimedForm, e] = ms[0];
    const line = (timed) => a + 78 + b + 78 + c + 67 + d + timed + e;
    return { ok: line(11), bad: [line(untimedForm), line(0)], problems: [] };
}
/** The count problems of a POSIX ERE read as a JS whole-line regex (grep -x / sed ^...$). */
function countProblems(ere, src = ABSRC) {
    const s = producerSamples(src);
    if (s.problems.length !== 0) return s.problems;
    let re;
    try { re = new RegExp('^(?:' + ere + ')$'); } catch (e) { return ['count regex does not compile: ' + e.message]; }
    const p = [];
    if (!re.test(s.ok)) p.push('count regex rejects the timed run ' + JSON.stringify(s.ok));
    for (const b of s.bad) if (re.test(b)) p.push('count regex accepts ' + JSON.stringify(b));
    return p;
}
const GATE_RUN = [
    'set +e',
    'node $FLAGS "$AB_TOOL" "$AB_GATE" --run ALL 2>&1 | tee logs/gate.log',
    'st=("${PIPESTATUS[@]}")',
    'set -e',
    'echo "${st[0]}" > logs/exit-code.txt',
    '# a failed tee means an incomplete log: fail the step whatever the tool returned',
    'test "${st[1]}" = 0',
    'exit "${st[0]}"',
].join('\n');
// the only '|| true' lines: informational provenance reads whose absence on a hosted VM is not a failure
const PROV_OK = [
    'grep . /sys/devices/system/cpu/cpu0/cache/index*/{level,type,size,coherency_line_size} || true',
    'sysctl hw.physicalcpu hw.logicalcpu hw.l1icachesize || true',
    "sysctl -a | grep -E '^hw\\.perflevel' || true",
];
// any '||' except '|| exit <1-9>', and any set +<flags> that clears e or o (incl. combined flags: set +eo pipefail)
const OPEN_RE = /\|\|(?!\s*exit\s+[1-9]\b)|\bset\b[^#]*\s\+[A-Za-z]*[eo]/;
// the only '||' in the summary step: the exit-code read, whose absence prints 'none' (the summary reports, never gates)
const SUMMARY_OK = 'echo "### ab gate, $MOS (exit $(cat logs/exit-code.txt 2>/dev/null || echo \'none\'))"';
const IF_OK_AB = Object.freeze({ 'verdict to the job summary': 'always()', 'upload logs': 'always()' });
const IF_OK_CI = Object.freeze({ 'node is exactly the verdict pin': "matrix.node == '26.8.2'", 'npm run torture': "startsWith(matrix.node, '26')" });
/** A run: block body without its common indentation and trailing blank lines. */
function dedent(text) {
    const ls = linesOf(text);
    while (ls.length > 0 && ls[ls.length - 1].trim() === '') ls.pop();
    const ind = Math.min(...ls.filter((l) => l.trim() !== '').map(indentOf));
    return ls.map((l) => l.slice(ind)).join('\n');
}

const CHECKS = {
    // FLAGS equals REQUIRED_FLAGS.join(' '), one FLAGS line per workflow
    flags(w) {
        const p = [];
        for (const [f, t] of WFS(w)) {
            const v = envValues(t, 'FLAGS');
            if (v.length !== 1) p.push(f + ': ' + v.length + ' FLAGS lines');
            else if (v[0] !== REQUIRED_FLAGS.join(' ')) p.push(f + ': FLAGS ' + JSON.stringify(v[0]) + ' != REQUIRED_FLAGS');
        }
        return p;
    },
    // exactly 2 `# PARAM` lines: AB_GATE then AB_NODE
    params(w) {
        const p = [];
        for (const [f, t] of WFS(w)) {
            const ls = linesOf(t).filter((l) => /#\s*PARAM\b/.test(l));
            const keys = ls.map((l) => (/^\s+([A-Z_]+):/.exec(l) || [null, '?'])[1]);
            if (keys.join(',') !== 'AB_GATE,AB_NODE') p.push(f + ': PARAM lines ' + JSON.stringify(keys) + ' (want exactly AB_GATE, AB_NODE)');
        }
        return p;
    },
    // AB_NODE is an exact quoted x.y.z and equals ci.yml's pin legs; the ci pin guard reads templates/ab.yml's AB_NODE
    pin(w) {
        const p = [];
        const v = envValues(w.template, 'AB_NODE');
        if (v.length !== 1 || !/^'\d+\.\d+\.\d+'$/.test(v[0])) return ['templates/ab.yml: AB_NODE ' + JSON.stringify(v) + ' is not one quoted x.y.z'];
        const pin = v[0].slice(1, -1);
        const legs = [...w.ci.matchAll(/^\s+node: '(\d+\.\d+\.\d+)'\s*$/gm)].map((m) => m[1]);
        if (legs.length !== 2) p.push('ci.yml: ' + legs.length + ' x.y.z pin legs (want 2)');
        for (const l of legs) if (l !== pin) p.push('ci.yml: pin leg ' + l + ' != AB_NODE ' + pin);
        const guard = stepsOf(w.ci).filter((s) => s.text.includes("\n        if: matrix.node == '" + pin + "'\n"));
        if (guard.length !== 1) p.push('ci.yml: ' + guard.length + " steps guarded by if: matrix.node == '" + pin + "' (want 1)");
        else {
            const run = runBlocksOf(guard[0].text).map((r) => r.text).join('\n');
            if (!run.includes('templates/ab.yml') || !run.includes('AB_NODE') || !run.includes('test "$(node --version)" = "v$want"')) p.push('ci.yml: the pin guard does not compare node --version with templates/ab.yml AB_NODE');
        }
        return p;
    },
    // the header's exit-code table equals EXIT (0 PASS, 1 STOP, 2 NO VERDICT, 3 FINDING), nothing more
    exits(w) {
        const p = [];
        const want = Object.entries(EXIT).map(([k, c]) => c + ' ' + k.replace('_', ' ')).sort().join(', ');
        for (const [f, t] of WFS(w)) {
            const got = [...new Set([...headerOf(t).matchAll(/\b(\d+) (PASS|FINDING|NO VERDICT|STOP)\b/g)].map((m) => m[1] + ' ' + m[2]))].sort().join(', ');
            if (got !== want) p.push(f + ': header exits [' + got + '] != EXIT [' + want + ']');
        }
        return p;
    },
    // no absolute path in any run: block (allowlist /sys/devices informational, /dev/null) or in examples/
    abspath(w) {
        const p = [];
        for (const [f, t] of [...WFS(w), ['.github/workflows/ci.yml', w.ci]]) {
            const runs = runBlocksOf(t);
            if (runs.length === 0) p.push(f + ': no run: block found (parser drift)');
            for (const r of runs) for (const a of absPaths(r.text)) p.push(f + ':' + r.line + ' run: block names absolute path ' + a);
        }
        for (const [f, t] of Object.entries(w.examples)) for (const a of absPaths(t)) p.push(f + ': absolute path ' + a);
        return p;
    },
    // summary and upload steps run `if: always()`
    always(w) {
        const p = [];
        for (const [f, t] of WFS(w)) {
            const st = stepsOf(t);
            for (const name of ['verdict to the job summary', 'upload logs']) {
                const s = st.filter((x) => x.name === name);
                if (s.length !== 1) p.push(f + ': ' + s.length + ' steps named ' + name);
                else if (!/^ {8}if: always\(\)\s*$/m.test(s[0].text)) p.push(f + ': step ' + name + ' lacks if: always()');
            }
        }
        return p;
    },
    // C-7: no in-run pairing-again wording anywhere (template, own, ci, examples): /re-?pair/i absent
    c7words(w) {
        const p = [];
        for (const [f, t] of [...WFS(w), ['.github/workflows/ci.yml', w.ci], ...Object.entries(w.examples)]) {
            const m = /re-?pair/i.exec(t);
            if (m !== null) p.push(f + ': C-7 wording ' + JSON.stringify(m[0]));
        }
        return p;
    },
    // C-24: the own ab.yml equals the template byte for byte except the AB_TOOL and AB_GATE values
    dogfood(w) {
        const a = linesOf(w.template), b = linesOf(w.own);
        if (a.length !== b.length) return ['own ab.yml has ' + b.length + ' lines, template ' + a.length];
        const p = [];
        let tool = 0, gate = 0;
        for (let i = 0; i < a.length; i++) {
            if (a[i] === TOOL_LINE) { tool++; if (b[i] !== OWN_TOOL_LINE) p.push('line ' + (i + 1) + ': own AB_TOOL ' + JSON.stringify(b[i])); continue; }
            const g = GATE_RE.exec(a[i]);
            if (g !== null) { gate++; if (b[i] !== g[1] + OWN_GATE + g[3]) p.push('line ' + (i + 1) + ': own AB_GATE ' + JSON.stringify(b[i])); continue; }
            if (a[i] !== b[i]) p.push('line ' + (i + 1) + ' differs outside the 2 dogfood lines: ' + JSON.stringify(b[i]));
        }
        if (tool !== 1 || gate !== 1) p.push('template has ' + tool + ' AB_TOOL / ' + gate + ' AB_GATE lines (want 1 / 1)');
        return p;
    },
    // the template's fixed contract (plan-GC TASK 3): tool path, pin guard, path guard, npm ci, provenance, and the
    // header's operating rules + cp line (the selftest STOP gate and --run ALL + PIPESTATUS: exact text in failclosed)
    contract(w) {
        const t = w.template, p = [];
        const need = (ok, what) => { if (!ok) p.push('templates/ab.yml: ' + what); };
        const ls = linesOf(t), hdr = headerOf(t);
        need(ls.filter((l) => l === TOOL_LINE).length === 1, 'AB_TOOL is not exactly node_modules/@zakkster/lite-ab-gate/ABGate.js');
        need(t.includes('node-version: ${{ env.AB_NODE }}'), 'setup-node does not read env.AB_NODE');
        const runs = runBlocksOf(t).map((r) => r.text);
        const has = (s) => runs.some((r) => r.includes(s));
        need(has('[[ "$AB_NODE" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]') && has('test "$(node --version)" = "v$AB_NODE"') && has('test "$(node -p process.arch)" = "$WANT_NODEARCH"'), 'pin guard (x.y.z, node --version, arch) missing');
        const pg = runs.find((r) => r.includes('case "$AB_GATE" in'));
        need(pg !== undefined && /\n\s+\/\*\|~\*\|\*\.\.\*\) .*exit 1 ;;\n\s+esac\n\s+test -f "\$AB_GATE"/.test(pg), 'path guard (reject /*, ~*, *..*, then test -f) missing');
        need(has('npm ci --ignore-scripts\n'), 'npm ci --ignore-scripts missing');
        need(has('shasum -a 256 "$AB_TOOL" "$AB_GATE" package-lock.json') && has('tool="$(node -p "') && has("p.name + ' ' + p.version") && has('echo "tool: $tool"'), 'provenance (tool name / version assigned then echoed, shasum of tool, gate, lockfile) missing');
        need(hdr.includes('BOTH OS read PASS in the same dispatch'), 'header: both OS must read PASS in one dispatch');
        need(hdr.includes('A NO VERDICT run gets ONE re-dispatch'), 'header: ONE re-dispatch of a NO VERDICT run');
        need(hdr.includes('a FINDING is never re-run'), 'header: a FINDING is never re-run');
        need(/harness failure on a runner .*is NO VERDICT, never host evidence/.test(hdr), 'header: a harness failure is NO VERDICT, never host evidence');
        need(hdr.includes('#   ' + CP_LINE + '\n'), 'header: the consumer cp line');
        return p;
    },
    // no fail-open edit in any of the 3 workflows: no continue-on-error, no step shell override, if: only on the allowed
    // steps with the allowed condition, no '|| true' / '|| :' / '|| exit 0' / 'set +e' / 'set +o' in a run: block except
    // an exact allow-list (the gate step's one set +e, the 3 informational provenance reads); the selftest and gate
    // run: blocks equal their exact text, selftest first; C-57: every step of every checked job has its exact key set
    failclosed(w) {
        const p = [];
        for (const [f, t, ifOk] of [...WFS(w).map(([f, t]) => [f, t, IF_OK_AB]), ['.github/workflows/ci.yml', w.ci, IF_OK_CI]]) {
            const ls = linesOf(t), steps = stepsOf(t);
            ls.forEach((l, i) => {
                if (/^\s*(?:- )?continue-on-error\s*:/.test(l)) p.push(f + ':' + (i + 1) + ' continue-on-error');
                const sh = /^(\s*)(?:- )?shell\s*:\s*(.*?)\s*$/.exec(l);
                if (sh !== null && !(sh[1].length === 4 && sh[2] === 'bash')) p.push(f + ':' + (i + 1) + ' shell override ' + JSON.stringify(sh[2]));
            });
            let stepIfs = 0;
            for (const s of steps) {
                const ifs = linesOf(s.text).map((l) => /^\s*(?:- )?if\s*:\s*(.*?)\s*$/.exec(l)).filter((m) => m !== null).map((m) => m[1]);
                stepIfs += ifs.length;
                for (const c of ifs) if (!(Object.hasOwn(ifOk, s.name) && ifOk[s.name] === c && ifs.length === 1)) p.push(f + ': step ' + s.name + ' if: ' + c + ' not allowed');
            }
            const allIfs = ls.filter((l) => /^\s*(?:- )?if\s*:/.test(l)).length;
            if (allIfs !== stepIfs) p.push(f + ': ' + (allIfs - stepIfs) + ' if: outside a step');
            let stepRuns = 0;
            for (const s of steps) {
                const seen = new Set();
                for (const r of runBlocksOf(s.text)) {
                    stepRuns++;
                    for (const raw of linesOf(r.text)) {
                        const l = raw.trim();
                        if (!OPEN_RE.test(l)) continue;
                        const ok = (s.name === 'provenance' && PROV_OK.includes(l)) || (s.name === GATE_STEP && l === 'set +e') || (s.name === 'verdict to the job summary' && l === SUMMARY_OK);
                        if (ok && !seen.has(l)) { seen.add(l); continue; }
                        p.push(f + ': step ' + s.name + ' fail-open line ' + JSON.stringify(l));
                    }
                }
            }
            if (stepRuns !== runBlocksOf(t).length) p.push(f + ': a run: block outside a step');
        }
        for (const [f, t] of WFS(w)) {
            const n = linesOf(t).filter((l) => l === IMAGEOS_LINE).length;
            if (n !== 1) p.push(f + ': ' + n + ' exact ImageOS guard lines (want 1): ' + IMAGEOS_LINE.trim());
        }
        for (const [f, t] of WFS(w)) p.push(...runnerIdProblems(f, t), ...jobEnvProblems(f, t), ...jobKeyProblems(f, t));
        // C-57 STEPKEYS: every step's exact key set, plain or quoted (P99), in all 3 workflows (folded here: the step-level
        // fail-open mutants M17 / M18 / M20 / M25 / M44 / M56..M58 already target failclosed, so a separate check would fail twice)
        for (const [f, t] of WFS(w)) p.push(...stepKeyProblems(f, t, STEP_KEYS_AB));
        p.push(...stepKeyProblems('.github/workflows/ci.yml', w.ci, STEP_KEYS_CI));
        for (const [f, t] of WFS(w)) {
            const st = stepsOf(t);
            const si = st.findIndex((s) => s.name === 'selftest'), gi = st.findIndex((s) => s.name === GATE_STEP);
            if (si < 0 || gi < 0 || gi < si) { p.push(f + ': selftest / gate steps missing or out of order'); continue; }
            for (const [s, want] of [[st[si], SELFTEST_RUN], [st[gi], GATE_RUN]]) {
                const r = runBlocksOf(s.text);
                if (r.length !== 1 || dedent(r[0].text) !== want) p.push(f + ': step ' + s.name + ' run: block is not the exact fail-closed text');
            }
        }
        return p;
    },
    // plan-U8 TASK 5 (law 7, C-17): the summary step carries the exact selftest block, and its count regex (the sed
    // capture, read as a JS whole-line regex) accepts the timed run and rejects the untimed-only form and timed 0
    stopgate(w) {
        const p = [];
        for (const [f, t] of WFS(w)) {
            const s = stepsOf(t).filter((x) => x.name === 'verdict to the job summary');
            if (s.length !== 1) { p.push(f + ': ' + s.length + ' summary steps'); continue; }
            const r = runBlocksOf(s[0].text);
            const body = r.length === 1 ? dedent(r[0].text) : '';
            const lines = linesOf(body).map((l) => l.replace(/^  /, ''));
            const first = linesOf(SUMMARY_SELFTEST)[0];
            const i = lines.indexOf(first);
            const SELF_RE = /selftest|\bran=/i, want = linesOf(SUMMARY_SELFTEST).filter((l) => SELF_RE.test(l)).length;
            const occ = lines.filter((l) => SELF_RE.test(l)).length;
            if (occ > want) p.push(f + ': summary step has ' + (occ - want) + ' selftest line(s) outside the one STOP block (want exactly 1 block)');
            if (i < 0 || lines.slice(i, i + linesOf(SUMMARY_SELFTEST).length).join('\n') !== SUMMARY_SELFTEST) p.push(f + ': summary step lacks the exact selftest STOP block');
            const m = /sed -n -E 's\/\^SELFTEST \((.*)\)\$\/\\1\/p' logs\/selftest\.log/.exec(body);
            if (m === null) p.push(f + ': summary step has no selftest count capture');
            else for (const e of countProblems('SELFTEST ' + m[1])) p.push(f + ': summary ' + e);
        }
        return p;
    },
    // ci.yml: 2 OS x node 22 / 24 / 26 + 2 pin legs = 8; npm ci + npm test on all, torture only on node 26 legs (C-31);
    // no timed step (C-3)
    ci(w) {
        const t = w.ci, p = [];
        const os = /^\s+os: \[(.*)\]\s*$/m.exec(t), node = /^\s+node: \[(.*)\]\s*$/m.exec(t);
        const osL = os === null ? [] : os[1].split(',').map((s) => s.trim());
        const nodeL = node === null ? [] : node[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
        if (osL.join(',') !== 'ubuntu-latest,macos-latest') p.push('os list ' + JSON.stringify(osL));
        if (nodeL.join(',') !== '22,24,26') p.push('node list ' + JSON.stringify(nodeL));
        const inc = [...t.matchAll(/^\s+- os: (\S+)\n\s+node: '([^']+)'\s*$/gm)].map((m) => m[1] + '@' + m[2]);
        const extra = inc.filter((x) => !nodeL.includes(x.split('@')[1]));
        if (extra.length !== 2 || new Set(extra.map((x) => x.split('@')[0])).size !== 2) p.push('include legs ' + JSON.stringify(inc) + ' (want one new leg per OS)');
        const legs = osL.length * nodeL.length + extra.length;
        if (legs !== 8) p.push(legs + ' legs (want 8)');
        const st = stepsOf(t);
        const step = (n) => st.filter((s) => s.name === n);
        for (const n of ['npm ci', 'npm test']) {
            const s = step(n);
            if (s.length !== 1 || /^\s+if:/m.test(s[0].text) || !s[0].text.includes('run: ' + n)) p.push('step ' + n + ' missing, conditional or wrong');
        }
        const tor = step('npm run torture');
        if (tor.length !== 1 || !tor[0].text.includes('run: npm run torture')) p.push('step npm run torture missing');
        else {
            const cond = /^ {8}if: (.*)$/m.exec(tor[0].text);
            if (cond === null || cond[1].trim() !== "startsWith(matrix.node, '26')") p.push('torture step is not gated on node 26 legs: ' + (cond === null ? 'no if:' : cond[1]));
            // the legs the condition selects: each OS on node 26 + each OS's 26.x.y pin leg = 4; never 22 / 24
            const all = [...osL.flatMap((o) => nodeL.map((n) => o + '@' + n)), ...extra];
            const on = all.filter((x) => x.split('@')[1].startsWith('26'));
            const off = all.filter((x) => !x.split('@')[1].startsWith('26'));
            if (on.length !== 4 || off.some((x) => !/@2[24]$/.test(x))) p.push('torture legs ' + JSON.stringify(on) + ', off ' + JSON.stringify(off));
        }
        for (const r of runBlocksOf(t)) if (/ABGate\.js|--selftest|--run\b|--oracle-only|quiet-lock|\bbench\b/.test(r.text)) p.push('timed step in ci.yml at line ' + r.line);
        return p;
    },
    // the example (C-24): frozen-only, lanes null WITHIN + double SLOWER, the package self-reference, the kernel pin
    example(w) {
        const g = w.examples['examples/ab.gate.mjs'], k = w.examples['examples/ab.kernel.js'], p = [];
        if (g === undefined || k === undefined) return ['examples/ab.gate.mjs or examples/ab.kernel.js missing'];
        if (!g.includes("import { defineGate } from '@zakkster/lite-ab-gate';")) p.push('the example does not import the package by its own name');
        if (!g.includes("gated: { null: 'WITHIN', double: 'SLOWER' },")) p.push('gated is not { null: WITHIN, double: SLOWER }');
        if (/\blive\s*:/.test(g)) p.push('the example binds a live path (frozen-only)');
        const pin = /const KERNEL_SHA = '([0-9a-f]{64})';/.exec(g);
        if (pin === null || pin[1] !== sha256(k)) p.push('KERNEL_SHA ' + (pin && pin[1].slice(0, 8)) + ' != sha256(ab.kernel.js) ' + sha256(k).slice(0, 8));
        return p;
    },
};
const NAMES = Object.keys(CHECKS);
const failing = (w) => NAMES.filter((n) => CHECKS[n](w).length !== 0);

// ---------------------------------------------------------------- mutants (in memory; each edit must apply exactly once)
function edit(text, from, to, what) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error('mutant ' + what + ': ' + JSON.stringify(from) + ' found ' + n + ' times (want 1)');
    return text.replace(from, () => to);
}
/** Apply to the template AND the own ab.yml (so the dogfood check stays equal), or to one named file. */
function mutant(where, from, to) {
    return (w, what) => {
        const m = { template: w.template, own: w.own, ci: w.ci, examples: { ...w.examples } };
        if (where === 'both') { m.template = edit(m.template, from, to, what); m.own = edit(m.own, from, to, what); }
        else if (where.startsWith('examples/')) m.examples[where] = edit(m.examples[where], from, to, what);
        else m[where] = edit(m[where], from, to, what);
        return m;
    };
}
const MUTANTS = [
    // ASSERTION 1's six
    ['M1 last flag dropped', 'flags', mutant('both', '--max-semi-space-size=4 --single-threaded-gc\n', '--max-semi-space-size=4\n')],
    ['M2 AB_NODE 26', 'pin', mutant('both', "AB_NODE: '26.8.2'", "AB_NODE: '26'")],
    ['M3 /Users/x in a run: block', 'abspath', mutant('both', '            echo "gate: $AB_GATE"\n', '            echo "gate: $AB_GATE"\n            test -f /Users/x/gate.mjs\n')],
    ['M4 upload without if: always()', 'always', mutant('both', '      - name: upload logs\n        if: always()\n', '      - name: upload logs\n')],
    // the C-7 word is built from two halves so this file never spells it
    ['M5 C-7 word added (re- + pair)', 'c7words', mutant('both', '# A NO VERDICT run gets ONE re-dispatch;', '# A VOID lane is ' + 're-' + 'paired once. A NO VERDICT run gets ONE re-dispatch;')],
    ['M6 1 byte changed outside the 2 dogfood lines', 'dogfood', mutant('own', 'timeout-minutes: 30\n', 'timeout-minutes: 31\n')],
    // one more per remaining check
    ['M7 a third PARAM line', 'params', mutant('both', '# fixed (do not edit): the tool', '# PARAM fixed (do not edit): the tool')],
    ['M8 header exit 2 renumbered', 'exits', mutant('both', '| 2 NO VERDICT |', '| 4 NO VERDICT |')],
    ['M9 npm ci without --ignore-scripts', 'contract', mutant('both', 'npm ci --ignore-scripts\n', 'npm ci\n')],
    ['M10 torture on every ci leg', 'ci', mutant('ci', "        if: startsWith(matrix.node, '26')\n", '')],
    ['M11 absolute frozen path in the example', 'abspath', mutant('examples/ab.gate.mjs', "frozen: 'ab.kernel.js', sha256", "frozen: '/Users/x/ab.kernel.js', sha256")],
    ['M12 ci pin leg drifted from AB_NODE', 'pin', mutant('ci', "          - os: macos-latest\n            node: '26.8.2'", "          - os: macos-latest\n            node: '26.8.1'")],
    ['M13 kernel edited without a re-pin', 'example', mutant('examples/ab.kernel.js', 'out[1] = h;\n', 'out[1] = h; \n')],
    ['M14 path guard drops the .. reject', 'contract', mutant('both', '/*|~*|*..*)', '/*|~*)')],
    ['M15 absolute path in a ci.yml run: block', 'abspath', mutant('ci', 'run: npm test\n', 'run: npm test --prefix ~/x\n')],
    // review r1 fail-open mutants (R1 / R4 / R5 / R7 / R11 required; R6 / R9 / R10 / R12 + a shell override added)
    ['M16 (R1) selftest grep || true', 'failclosed', mutant('both', "grep -qx 'SELFTEST all ok' logs/selftest.log\n", "grep -qx 'SELFTEST all ok' logs/selftest.log || true\n")],
    ['M17 (R4) if: always() on the gate step', 'failclosed', mutant('both', '      - name: gate (--run ALL)\n', '      - name: gate (--run ALL)\n        if: always()\n')],
    ['M18 (R5) continue-on-error on selftest', 'failclosed', mutant('both', '      - name: selftest\n', '      - name: selftest\n        continue-on-error: true\n')],
    ['M19 (R7) exit 0 after the verdict exit', 'failclosed', mutant('both', '          exit "${st[0]}"\n', '          exit "${st[0]}"\n          exit 0\n')],
    ['M20 (R11) continue-on-error on ci torture', 'failclosed', mutant('ci', "        if: startsWith(matrix.node, '26')\n", "        if: startsWith(matrix.node, '26')\n        continue-on-error: true\n")],
    ['M21 (R6) pin guard || true', 'failclosed', mutant('both', 'test "$(node --version)" = "v$AB_NODE"\n', 'test "$(node --version)" = "v$AB_NODE" || true\n')],
    ['M22 (R9) set +e in selftest', 'failclosed', mutant('both', '          node $FLAGS "$AB_TOOL" "$AB_GATE" --selftest', '          set +e\n          node $FLAGS "$AB_TOOL" "$AB_GATE" --selftest')],
    ['M23 (R10) runner arch test || true', 'failclosed', mutant('both', 'test "$RUNNER_ARCH" = "$WANT_ARCH"\n', 'test "$RUNNER_ARCH" = "$WANT_ARCH" || true\n')],
    ['M24 (R12) ci pin guard || true', 'failclosed', mutant('ci', 'test "$(node --version)" = "v$want"\n', 'test "$(node --version)" = "v$want" || true\n')],
    ['M25 step shell override drops pipefail', 'failclosed', mutant('both', '      - name: selftest\n', '      - name: selftest\n        shell: sh\n')],
    // review r2 fail-open mutants E1 / E2 / E4 / E5
    ['M26 (E1) pin guard || echo', 'failclosed', mutant('both', 'test "$(node --version)" = "v$AB_NODE"\n', 'test "$(node --version)" = "v$AB_NODE" || echo mismatch\n')],
    ['M27 (E2) set +eo pipefail in the path guard', 'failclosed', mutant('both', '          case "$AB_GATE" in\n', '          set +eo pipefail\n          case "$AB_GATE" in\n')],
    ['M28 (E4) tool check || echo', 'failclosed', mutant('both', 'test -f "$AB_TOOL"\n', 'test -f "$AB_TOOL" || echo missing\n')],
    ['M29 (E5) ci npm test || echo', 'failclosed', mutant('ci', 'run: npm test\n', 'run: npm test || echo failed\n')],
    // plan-U8 TASK 5: the selftest STOP gate (timed >= 1) and its summary wording
    ['M30 selftest count grep dropped', 'failclosed', mutant('both', "          grep -Eqx '" + COUNT_ERE + "' logs/selftest.log\n", '')],
    ['M31 summary count regex accepts timed 0', 'stopgate', mutant('both', 'timed [1-9][0-9]*\\))$/', 'timed [0-9]*\\))$/')],
    ['M32 summary selftest block dropped', 'stopgate', mutant('both', '            ' + linesOf(SUMMARY_SELFTEST).join('\n            ') + '\n', '')],
    ['M33 selftest count grep || true', 'failclosed', mutant('both', "grep -Eqx '" + COUNT_ERE + "' logs/selftest.log\n", "grep -Eqx '" + COUNT_ERE + "' logs/selftest.log || true\n")],
    // U8 B3 review nits: summary block exactly once (fail-open copy second), ImageOS guard pinned
    ['M34 summary selftest block duplicated, 2nd copy fail-open', 'stopgate', mutant('both', '            ' + linesOf(SUMMARY_SELFTEST).join('\n            ') + '\n',
        '            ' + linesOf(SUMMARY_SELFTEST).join('\n            ') + '\n            ' + linesOf(SUMMARY_SELFTEST.replace("selftest: red or not run -> STOP -> NO VERDICT, never host evidence", 'selftest: all ok')).join('\n            ') + '\n')],
    ['M35 (E3) ImageOS guard :- instead of :?', 'failclosed', mutant('both', IMAGEOS_LINE + '\n', '          : "${ImageOS:-unset}"\n')],
    ['M36 comment-less fail-open selftest line after the block', 'stopgate', mutant('both', "              echo 'selftest: red or not run -> STOP -> NO VERDICT, never host evidence'\n            fi\n", "              echo 'selftest: red or not run -> STOP -> NO VERDICT, never host evidence'\n            fi\n" + "            echo 'selftest: all ok'\n")],
    ['M37 ImageOS guard duplicated', 'failclosed', mutant('both', IMAGEOS_LINE + '\n', IMAGEOS_LINE + '\n' + IMAGEOS_LINE + '\n')],
    // FILL5: the whole runner-identity run: block pinned (FILL3 r1 nit 3); each caught by the exact-block check alone
    ['M38 ImageOS defaulted before the guard (fail-open)', 'failclosed', mutant('both', IMAGEOS_LINE + '\n', '          ImageOS="${ImageOS:-unknown}"\n' + IMAGEOS_LINE + '\n')],
    ['M39 RUNNER_ARCH test line deleted', 'failclosed', mutant('both', '          test "$RUNNER_ARCH" = "$WANT_ARCH"\n', '')],
    ['M40 os default arm exit 1 -> true (fail-open)', 'failclosed', mutant('both', 'exit 1 ;;\n          esac\n      - name: checkout', 'true ;;\n          esac\n      - name: checkout')],
    ['M41 extra line after esac', 'failclosed', mutant('both', '          esac\n      - name: checkout', '          esac\n          true\n      - name: checkout')],
    ['M42 env gains a third key', 'failclosed', mutant('both', '          WANT_ARCH: ${{ matrix.arch }}\n', '          WANT_ARCH: ${{ matrix.arch }}\n          ImageOS: x\n')],
    // FILL5 r1: blank-line env terminator, step position, job env key set (C-52), run key form
    ['M43 env key after a blank line', 'failclosed', mutant('both', '          WANT_ARCH: ${{ matrix.arch }}\n', '          WANT_ARCH: ${{ matrix.arch }}\n\n          ImageOS: x\n')],
    ['M44 GITHUB_ENV writer before runner identity', 'failclosed', mutant('both', '      - name: runner identity\n', '      - name: pre\n        run: echo "ImageOS=x" >> "$GITHUB_ENV"\n      - name: runner identity\n')],
    ['M45 ImageOS added to the job env', 'failclosed', mutant('both', '    steps:\n      # runner identity', '      ImageOS: unknown\n    steps:\n      # runner identity')],
    ['M46 top-level env: with ImageOS', 'failclosed', mutant('both', 'permissions:\n', 'env:\n  ImageOS: unknown\n\npermissions:\n')],
    ['M47 double-quoted ImageOS key in the job env', 'failclosed', mutant('both', '    steps:\n      # runner identity', '      "ImageOS": x\n    steps:\n      # runner identity')],
    ['M48 runner identity run: > instead of |', 'failclosed', mutant('both', '        run: |\n          : "${ImageOS:?unset}"', '        run: >\n          : "${ImageOS:?unset}"')],
    // FILL5 r2 (REVIEW r2 item 1): a YAML comment line at any indent never ends a mapping (Q4 job env, Q5 step env)
    ['M49 job env key after an indent-4 comment line', 'failclosed', mutant('both', '--single-threaded-gc\n    steps:', '--single-threaded-gc\n    # c\n      ImageOS: x\n    steps:')],
    ['M50 step env key after an indent-8 comment line', 'failclosed', mutant('both', '          WANT_ARCH: ${{ matrix.arch }}\n', '          WANT_ARCH: ${{ matrix.arch }}\n        # c\n          ImageOS: x\n')],
    // FILL5 r2 (item 2): explicit-key spelling of a top-level env (Q13); the allowlist catches it
    ['M51 explicit-key top-level env (? env)', 'failclosed', mutant('both', 'permissions:\n', '? env\n: { ImageOS: unknown }\n\npermissions:\n')],
    // C-53 JOBKEYS: container / self-hosted / services routes on the ab job
    ['M52 (C-53) container: on the ab job', 'failclosed', mutant('both', '    timeout-minutes: 30\n', '    timeout-minutes: 30\n    container: node:22\n')],
    ['M53 (C-53) runs-on: self-hosted', 'failclosed', mutant('both', '    runs-on: ${{ matrix.os }}\n', '    runs-on: self-hosted\n')],
    ['M54 (C-53) services: on the ab job', 'failclosed', mutant('both', '    timeout-minutes: 30\n', '    timeout-minutes: 30\n    services:\n      x:\n        image: y\n')],
    // FILL5 r3: C-53 jobs row control (M55); blockers 1-4 (M56 P2, M57 P10, M58 P6, M59 P8, M60 P4)
    ['M55 (C-53) a second job beside ab', 'failclosed', mutant('both', 'jobs:\n  ab:\n', 'jobs:\n  pre:\n    runs-on: ubuntu-latest\n  ab:\n')],
    ['M56 quoted shell: on runner identity sets ImageOS (P2)', 'failclosed', mutant('both', '      - name: runner identity\n', '      - name: runner identity\n        "shell": env ImageOS=x bash -e {0}\n')],
    ['M57 col-0 comment then quoted continue-on-error in runner identity (P10)', 'failclosed', mutant('both', '          esac\n      - name: checkout', '          esac\n# c\n        "continue-on-error": true\n      - name: checkout')],
    ['M58 unnamed uses step before runner identity (P6)', 'failclosed', mutant('both', '      - name: runner identity\n', '      - uses: ./x\n      - name: runner identity\n')],
    ['M59 CR hides container: after timeout-minutes (P8)', 'failclosed', mutant('both', '    timeout-minutes: 30\n', '    timeout-minutes: 30\r    container: node:22\n')],
    ['M60 quoted shell in defaults sets ImageOS (P4)', 'failclosed', mutant('both', '    shell: bash\n', '    "shell": env ImageOS=x bash -e {0}\n')],
    // FILL7 (C-57 STEPKEYS): one per step class (A name,run / B env,name,run / C name,uses,with / D env,if,name,run /
    // E if,name,uses,with / F if,name,run), each caught by the stepkeys row alone (control below)
    ['M61 (P99) double-quoted continue-on-error on selftest (A)', 'failclosed', mutant('both', '      - name: selftest\n', '      - name: selftest\n        "continue-on-error": true\n')],
    ['M62 single-quoted continue-on-error on the gate step (A)', 'failclosed', mutant('both', '      - name: gate (--run ALL)\n', "      - name: gate (--run ALL)\n        'continue-on-error': true\n")],
    ['M63 unknown extra key on node is exactly the pin (B)', 'failclosed', mutant('both', '      - name: node is exactly the pin\n', '      - name: node is exactly the pin\n        x-extra: 1\n')],
    ['M64 double-quoted if: false on checkout (C)', 'failclosed', mutant('both', '      - name: checkout\n        uses: actions/checkout@v7\n', '      - name: checkout\n        "if": false\n        uses: actions/checkout@v7\n')],
    ['M65 single-quoted shell on the summary step (D)', 'failclosed', mutant('both', '      - name: verdict to the job summary\n', "      - name: verdict to the job summary\n        'shell': sh\n")],
    ['M66 double-quoted continue-on-error on upload logs (E)', 'failclosed', mutant('both', '      - name: upload logs\n', '      - name: upload logs\n        "continue-on-error": true\n')],
    ['M67 (P99 ci) double-quoted continue-on-error on ci torture (F)', 'failclosed', mutant('ci', '        run: npm run torture\n', '        run: npm run torture\n        "continue-on-error": true\n')],
    ['M68 unknown extra key on ci npm test (A, ci)', 'failclosed', mutant('ci', '      - name: npm test\n', '      - name: npm test\n        x-extra: 1\n')],
    ['M69 duplicate quoted run key on selftest (last key wins)', 'failclosed', mutant('both', "logs/selftest.log\n      # the step's status", "logs/selftest.log\n        \"run\": \"true\"\n      # the step's status")],
    ['M70 missing uses on checkout (C)', 'failclosed', mutant('both', '      - name: checkout\n        uses: actions/checkout@v7\n', '      - name: checkout\n')],
    ['M71 col-0 comment then single-quoted continue-on-error after selftest', 'failclosed', mutant('both', "logs/selftest.log\n      # the step's status", "logs/selftest.log\n# c\n        'continue-on-error': true\n      # the step's status")],
];

// ---------------------------------------------------------------- tests
test('the real files: every check passes', () => {
    for (const n of NAMES) assert.deepEqual(CHECKS[n](WORLD), [], n);
});
for (const n of NAMES) {
    test('check ' + n + ' passes on the real files and has >= 1 mutant', () => {
        assert.deepEqual(CHECKS[n](WORLD), []);
        assert.ok(MUTANTS.some((m) => m[1] === n), 'no mutant targets ' + n);
    });
}
for (const [what, target, mk] of MUTANTS) {
    test('mutant ' + what + ': only check ' + target + ' fails', (t) => {
        const m = mk(WORLD, what);
        t.diagnostic(target + ': ' + CHECKS[target](m).join(' | '));
        assert.deepEqual(failing(m), [target]);
    });
}
test('the count regex: accepts the timed run, rejects untimed-only and timed 0; the loosened form is caught (control)', () => {
    assert.deepEqual(countProblems(COUNT_ERE), []);
    assert.ok(SELFTEST_RUN.includes("'" + COUNT_ERE + "'") && SUMMARY_SELFTEST.includes(COUNT_ERE.slice('SELFTEST '.length)), 'step and summary share COUNT_ERE');
    assert.deepEqual(countProblems(COUNT_ERE.replace('[1-9][0-9]*', '[0-9]*')), ['count regex accepts ' + JSON.stringify(producerSamples(ABSRC).bad[1])]);
    assert.equal(countProblems(COUNT_ERE.replace('timed [1-9][0-9]*', 'timed .*')).length, 2);
    assert.equal(countProblems(COUNT_ERE.replace('timed', 'timedX')).length, 1);
});
test('the summary format is read from the producer; a missing or duplicated producer say(...) fails closed (control)', () => {
    const s = producerSamples(ABSRC);
    assert.deepEqual(s.problems, []);
    assert.equal(s.ok, 'SELFTEST ran 78 of 78 (untimed 67, timed 11)');   // the independent expected format, from the spec
    assert.equal(s.bad.length, 2);
    const piece = ABSRC.match(new RegExp(PRODUCER_RE.source, 'm'))[0];
    assert.deepEqual(countProblems(COUNT_ERE, ABSRC.replace(piece, piece + '\n' + piece)), ['ABGate.js: the selftest summary say(...) found 2 times (want exactly 1)'], 'duplicated');
    assert.deepEqual(countProblems(COUNT_ERE, ABSRC.replace(piece, piece.replace("' (untimed '", "' (untimedX '"))), ['ABGate.js: the selftest summary say(...) found 0 times (want exactly 1)'], 'renamed piece');
    assert.deepEqual(countProblems(COUNT_ERE, ''), ['ABGate.js: the selftest summary say(...) found 0 times (want exactly 1)'], 'absent');
});
test('control: the unmutated files pass the runner-identity exact-block check, and each FILL5 mutant fails it alone', () => {
    for (const [f, t] of WFS(WORLD)) assert.deepEqual(runnerIdProblems(f, t), [], f);
    for (const [f, t] of WFS(WORLD)) assert.deepEqual(jobEnvProblems(f, t), [], f);
    const sel = MUTANTS.filter((m) => /^M(3[89]|4[0-9]|50) /.test(m[0]));
    assert.equal(sel.length, 13);
    for (const [what, , mk] of sel) {
        const m = mk(WORLD, what);
        assert.ok(WFS(m).every(([f, t]) => runnerIdProblems(f, t).length + jobEnvProblems(f, t).length !== 0), what);
    }
});
test('control (r2 / C-53): the unmutated files pass the top-level / job-key checks, and M51..M54 each fail the new row alone', () => {
    for (const [f, t] of WFS(WORLD)) assert.deepEqual(jobKeyProblems(f, t), [], f);
    const sel = MUTANTS.filter((m) => /^M5[1-4] /.test(m[0]));
    assert.equal(sel.length, 4);
    for (const [what, , mk] of sel) {
        const m = mk(WORLD, what);
        assert.ok(WFS(m).every(([f, t]) => runnerIdProblems(f, t).length === 0 && jobEnvProblems(f, t).length + jobKeyProblems(f, t).length !== 0), what);
    }
});
test('control (r3): M55..M60 each make the runner-identity / job-env / job-key rows non-empty; the unmutated files give []', () => {
    for (const [f, t] of WFS(WORLD)) assert.deepEqual([...runnerIdProblems(f, t), ...jobEnvProblems(f, t), ...jobKeyProblems(f, t)], [], f);
    const sel = MUTANTS.filter((m) => /^M(5[5-9]|60) /.test(m[0]));
    assert.equal(sel.length, 6);
    for (const [what, , mk] of sel) {
        const m = mk(WORLD, what);
        assert.ok(WFS(m).every(([f, t]) => runnerIdProblems(f, t).length + jobEnvProblems(f, t).length + jobKeyProblems(f, t).length !== 0), what);
    }
});
test('control (C-57): the unmutated files give no stepkeys problem; M61..M71 are caught by the stepkeys row and by no other row', () => {
    for (const [f, t] of WFS(WORLD)) assert.deepEqual(stepKeyProblems(f, t, STEP_KEYS_AB), [], f);
    assert.deepEqual(stepKeyProblems('ci.yml', WORLD.ci, STEP_KEYS_CI), []);
    const sel = MUTANTS.filter((m) => /^M(6[1-9]|7[01]) /.test(m[0]));
    assert.equal(sel.length, 11);
    for (const [what, , mk] of sel) {
        const p = CHECKS.failclosed(mk(WORLD, what));
        assert.ok(p.some(isStepKeyProblem), what + ': stepkeys row silent');
        assert.deepEqual(p.filter((s) => !isStepKeyProblem(s)), [], what + ': another failclosed row also fires (not a gap probe)');
    }
});
test('control (C-57): a missing if: on an IF_OWNER step fails exactly its owner check, never stepkeys (no gap, no double fail)', () => {
    const drops = [
        ['verdict to the job summary', mutant('both', '      - name: verdict to the job summary\n        if: always()\n', '      - name: verdict to the job summary\n')],
        ['upload logs', mutant('both', '      - name: upload logs\n        if: always()\n', '      - name: upload logs\n')],
        ['node is exactly the verdict pin', mutant('ci', "        if: matrix.node == '26.8.2'\n", '')],
        ['npm run torture', mutant('ci', "        if: startsWith(matrix.node, '26')\n", '')],
    ];
    assert.deepEqual(drops.map((d) => d[0]).sort(), Object.keys(IF_OWNER).sort());
    for (const [name, mk] of drops) {
        const m = mk(WORLD, 'drop if: ' + name);
        assert.deepEqual(failing(m), [IF_OWNER[name]], name);
        assert.deepEqual(CHECKS.failclosed(m).filter(isStepKeyProblem), [], name);
    }
});
test('control (C-57): quoted keys normalize; a key that does not parse, a bad indent or a CR inside a comment fails closed', () => {
    const sel = (t) => edit(WORLD.template, '      - name: selftest\n', '      - name: selftest\n' + t, 'probe');
    const keysOf = (t) => stepKeyProblems('t', sel(t), STEP_KEYS_AB).filter((s) => / step selftest keys | key does not parse| unexpected indent | char outside |two name keys/.test(s));
    const probes = ['        "continue-on-error": true\n', "        'continue-on-error': true\n", '        "continue\\u002don-error": true\n', '        "continue\\x2don-error": true\n',
        '        ? continue-on-error\n', '        { a: b }\n', '       x: 1\n', '# c\r        "continue-on-error": true\n', '        name: again\n', '        "run": "true"\n'];
    for (const t of probes) assert.equal(keysOf(t).length, 1, JSON.stringify(t) + ' -> ' + JSON.stringify(keysOf(t)));
    assert.deepEqual(keysOf(''), []);
    assert.deepEqual(keysOf('        \n# c\n'), [], 'blank and col-0 comment lines are not keys');
    assert.deepEqual(stepKeyProblems('t', WORLD.template.replace("      - name: selftest\n        run: |", "      - 'name': selftest\n        \"run\": |"), STEP_KEYS_AB), []);
});
test('control (C-57): an IF_OWNER if: moved below step level (nested block / comment) fails exactly its owner check', () => {
    const moved = [
        ['upload logs', mutant('both', '      - name: upload logs\n        if: always()\n        uses: actions/upload-artifact@v7\n        with:\n', '      - name: upload logs\n        uses: actions/upload-artifact@v7\n        with:\n          if: always()\n')],
        ['verdict to the job summary', mutant('both', '        if: always()\n        env:\n          MOS: ${{ matrix.os }}\n', '        env:\n          MOS: ${{ matrix.os }}\n          if: always()\n')],
        ['node is exactly the verdict pin', mutant('ci', "        if: matrix.node == '26.8.2'\n        env:\n          PIN: ${{ matrix.node }}\n", "        env:\n          PIN: ${{ matrix.node }}\n          if: matrix.node == '26.8.2'\n")],
        ['node is exactly the verdict pin', mutant('ci', "        if: matrix.node == '26.8.2'\n", "        # if: matrix.node == '26.8.2'\n")],
    ];
    for (const [name, mk] of moved) assert.deepEqual(failing(mk(WORLD, 'moved if: ' + name)), [IF_OWNER[name]], name);
});
test('control (C-57): stepkeys pins step names, order and count (a renamed, reordered or appended step fails it alone)', () => {
    const GP = '      - name: gate file path\n        run: |\n          case "$AB_GATE" in\n            /*|~*|*..*) echo "AB_GATE must be repo-relative, got: $AB_GATE"; exit 1 ;;\n          esac\n          test -f "$AB_GATE"\n';
    const NC = '      - name: npm ci\n        run: |\n          npm ci --ignore-scripts\n          test -f "$AB_TOOL"\n';
    const probes = [
        ['renamed ci provenance', mutant('ci', '      - name: provenance\n', '      - name: info\n')],
        ['npm ci swapped before gate file path', mutant('both', GP + NC, NC + GP)],
        ['extra step appended after ci torture', mutant('ci', '        run: npm run torture\n', '        run: npm run torture\n      - name: extra\n        run: exit 0\n')],
    ];
    for (const [what, mk] of probes) {
        const m = mk(WORLD, what);
        assert.deepEqual(failing(m), ['failclosed'], what);
        const p = CHECKS.failclosed(m);
        assert.ok(p.some(isStepKeyProblem), what + ': stepkeys silent');
        assert.deepEqual(p.filter((s) => !isStepKeyProblem(s)), [], what + ': another failclosed row fires');
    }
});
test('the real files are untouched by the mutants (in-memory only)', () => {
    assert.deepEqual(loadWorld(), WORLD);
});
