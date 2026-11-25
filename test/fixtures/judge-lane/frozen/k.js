// k.js -- lite-ab-gate judge-lane fixture kernel (frozen copy; live/k.js is byte-identical). ASCII only, zero deps.
// One op = the int32 sum of 4 consecutive elements of x, written to out[0].
export function sumInto(x, op, out) {
    const b = op * 4;
    let s = 0;
    for (let j = 0; j < 4; j++) s = (s + x[b + j]) | 0;
    out[0] = s;
}
