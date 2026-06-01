// Safe DOMException polyfill for Hermes (React Native)
// Hermes implements DOMException natively — do not reassign its properties
if (typeof global.DOMException === 'undefined') {
  global.DOMException = class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'DOMException';
    }
  };
}
// Do NOT assign INDEX_SIZE_ERR or any other error code constants
// Hermes defines these as read-only — assigning throws TypeError
