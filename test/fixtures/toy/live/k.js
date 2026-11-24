// k.js -- lite-ab-gate test fixture: the toy kernel source (compiled per copy by the tool, `export ` stripped).
// Two entries over the same op domain: op = 8 consecutive Int32 elements of x starting at op * 8. Each writes the
// op's record [sum, hash] into out[0], out[1] (int32 values held in a caller-owned Float64Array) and returns nothing.
// sum = the int32-wrapped sum of the 8 elements; hash = FNV-1a style h = imul(h ^ v, 16777619) over the 8 elements.
// The second entry is the first with its loop unrolled by 2 (same record, different code).
// No allocation, no closure state, no double crosses a call boundary. ASCII only. This file is the FROZEN copy;
// live/k.js is byte-identical (the tool STOPs ANCHOR on any byte of drift).

export function kInto(x, op, out) {
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

export function kUnrolledInto(x, op, out) {
    const base = op << 3;
    let s = 0, h = 0;
    for (let j = 0; j < 8; j += 2) {
        const v0 = x[base + j], v1 = x[base + j + 1];
        s = (s + v0 + v1) | 0;
        h = Math.imul(Math.imul(h ^ v0, 16777619) ^ v1, 16777619);
    }
    out[0] = s;
    out[1] = h;
}
