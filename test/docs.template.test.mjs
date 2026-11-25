// docs.template.test.mjs -- the workflow template drift guard (plan-GC TASK 6, ASSERTION 1; C-7, C-14, C-17, C-24, C-31).
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
const SELFTEST_RUN = [
    'node $FLAGS "$AB_TOOL" "$AB_GATE" --selftest 2>&1 | tee logs/selftest.log',
    "grep -qx 'SELFTEST all ok' logs/selftest.log",
].join('\n');
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
        const guard = stepsOf(w.ci).filter((s) => s.text.includes("if: matrix.node == '" + pin + "'"));
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
                else if (!/^\s+if: always\(\)\s*$/m.test(s[0].text)) p.push(f + ': step ' + name + ' lacks if: always()');
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
    // run: blocks equal their exact text, selftest first
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
            const cond = /^\s+if: (.*)$/m.exec(tor[0].text);
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
test('the real files are untouched by the mutants (in-memory only)', () => {
    assert.deepEqual(loadWorld(), WORLD);
});
