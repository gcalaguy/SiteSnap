// Hermes-safe no-op replacement for core-js DOMException polyfill
// Hermes implements DOMException natively with frozen constants
// Attempting to redefine them throws TypeError — this shim prevents that
module.exports = {};
