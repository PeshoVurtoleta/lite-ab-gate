// r1-frozen.gate.mjs -- lite-ab-gate torture fixture (U9E plan TASK 6, C-48 T-SETTLE / A3): the R1 LiteOhlc lane
// bounds:1e5:1e5 (the R1-shaped lane whose callee tier-up bytes C-48 settles before the window), FROZEN ONLY.
// It imports ../r1/ohlc-lane.mjs for the lane object (data, oracle, columns) and rebuilds the frozen entries with
// paths RELATIVE to this file (C-25: resolved against the gate file's directory) and the same sha256 pins, with no
// live binding (C-30: the HEADER says 'live not bound (frozen only)'; C-17: nothing here depends on a local
// absolute path, so a hosted run takes it). Only lane bounds:1e5:1e5; GATED as R1.0 declared it (SLOWER).
// A pin that differs from ohlc-lane.mjs's own throws at import (fail closed). ASCII only, zero deps.

import R1 from '../r1/ohlc-lane.mjs';

const OHLC_SHA = 'a600028c4cbba39086f93b21be34c57305e4d4acaec35d9faded8ac46dc275b2';
const BASE_SHA = '9c875a5ecb9bf8ef26436254d72b8d9c2ba9345167bd4c4b7d93d6a567bbe89e';
const LANE_ID = 'bounds:1e5:1e5';

const pin = (name) => { const f = R1.frozen.filter((x) => x.name === name); return f.length === 1 ? f[0].sha256 : null; };
if (pin('Ohlc.js') !== OHLC_SHA || pin('baseline.mjs') !== BASE_SHA) throw new Error('r1-frozen.gate: frozen pins differ from ../r1/ohlc-lane.mjs');
const lanes = R1.lanes.filter((l) => l.id === LANE_ID);
if (lanes.length !== 1) throw new Error('r1-frozen.gate: lane ' + LANE_ID + ' found ' + lanes.length + ' times in ../r1/ohlc-lane.mjs (want 1)');

export default Object.freeze({
    name: 'lite-ab-gate-settle-r1-frozen',
    frozen: [
        { name: 'Ohlc.js', frozen: '../r1/frozen/Ohlc.js', sha256: OHLC_SHA },
        { name: 'baseline.mjs', frozen: '../r1/frozen/baseline.mjs', sha256: BASE_SHA },
    ],
    transform: R1.transform,
    gated: Object.freeze({ [LANE_ID]: 'SLOWER' }),
    lanes: [lanes[0]],
});
