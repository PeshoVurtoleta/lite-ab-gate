// clock-trap.mjs -- test fixture for test/workfloor.test.mjs (C-59 R5 / R5c). Loaded with `node --import <this file> ...`.
// performance.now() throws CLOCK-TRAP at the first read, so a run that reaches a clock read CRASHes, and a run that
// STOPs before any clock read never prints the word. No real measurement can happen under this trap (deterministic).
Object.defineProperty(globalThis.performance, 'now', {
    configurable: true,
    writable: true,
    value() { throw new Error('CLOCK-TRAP'); },
});
