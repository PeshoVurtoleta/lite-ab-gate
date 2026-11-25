// ab.kernel.js -- @zakkster/lite-ab-gate example: the FROZEN kernel source that examples/ab.gate.mjs pins by sha256.
// The tool reads this file as TEXT and compiles a fresh copy per column (`new Function`); nothing ever imports it, so
// it has no exports and the gate's transform is the identity. Any byte edited here changes its sha256: the tool then
// STOPs ANCHOR (frozen-sha) until the pin in ab.gate.mjs is updated on purpose.
// Op domain: op = 8 consecutive Int32 elements of x starting at op * 8. Each entry writes the op's record [sum, hash]
// (int32 values held in a caller-owned Float64Array) and returns nothing.
//   kInto       one pass: sum = int32-wrapped sum, hash = h = imul(h ^ v, 16777619) over the 8 elements.
//   kTwiceInto  the same record computed by two independent passes and cross-checked: 2x the work of kInto.
// No allocation, no closure state, no double crosses a call boundary. ASCII only.

function kInto(x, op, out) {
    const base = op << 3;
    let s = 0, h = 0;
    for (let j = 0; j < 8; j++) {
        const v = x[base + j];
        s = (s + v) | 0;
        h = Math.imul(h ^ v, 16777619);
    }
    out[0] = s;
    out[1] = h;
}

function kTwiceInto(x, op, out) {
    const base = op << 3;
    let s1 = 0, h1 = 0, s2 = 0, h2 = 0;
    for (let j = 0; j < 8; j++) {
        const v = x[base + j];
        s1 = (s1 + v) | 0;
        h1 = Math.imul(h1 ^ v, 16777619);
    }
    for (let k = 0; k < 8; k++) {
        const w = x[base + k];
        s2 = (w + s2) | 0;
        h2 = Math.imul(w ^ h2, 16777619);
    }
    out[0] = s2;
    out[1] = s1 === s2 && h1 === h2 ? h2 : 0.5;
}
