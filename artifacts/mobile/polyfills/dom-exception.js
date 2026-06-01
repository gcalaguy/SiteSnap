/**
 * DOMException polyfill for Hermes (React Native / Expo Go).
 *
 * React Native 0.81's runtime does not install a global `DOMException`, but some
 * dependencies reference it. Notably, @clerk/shared's telemetry storage runs
 * `err instanceof DOMException` inside a catch block; on Hermes `localStorage`
 * is undefined, so the catch fires and evaluating the undefined `DOMException`
 * global throws "ReferenceError: Property 'DOMException' doesn't exist",
 * crashing the app at startup before the JS runtime is ready.
 *
 * This file is registered as a Metro polyfill (see metro.config.js) so it runs
 * before any application or library module. It installs a spec-compatible
 * `DOMException` global only when one is not already present (web/browsers
 * provide it natively, so this is a no-op there).
 */
(function () {
  "use strict";

  var g =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof global !== "undefined"
        ? global
        : this;

  if (typeof g.DOMException === "function") {
    return;
  }

  var NAME_TO_CODE = {
    IndexSizeError: 1,
    HierarchyRequestError: 3,
    WrongDocumentError: 4,
    InvalidCharacterError: 5,
    NoModificationAllowedError: 7,
    NotFoundError: 8,
    NotSupportedError: 9,
    InUseAttributeError: 10,
    InvalidStateError: 11,
    SyntaxError: 12,
    InvalidModificationError: 13,
    NamespaceError: 14,
    InvalidAccessError: 15,
    TypeMismatchError: 17,
    SecurityError: 18,
    NetworkError: 19,
    AbortError: 20,
    URLMismatchError: 21,
    QuotaExceededError: 22,
    TimeoutError: 23,
    InvalidNodeTypeError: 24,
    DataCloneError: 25,
  };

  function DOMException(message, name) {
    var err = Error.call(this, message);

    Object.defineProperty(this, "message", {
      value: message === undefined ? "" : String(message),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(this, "name", {
      value: name === undefined ? "Error" : String(name),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(this, "code", {
      value: NAME_TO_CODE[name] || 0,
      writable: true,
      configurable: true,
    });

    if (err && err.stack) {
      Object.defineProperty(this, "stack", {
        value: err.stack,
        writable: true,
        configurable: true,
      });
    }
  }

  DOMException.prototype = Object.create(Error.prototype);
  Object.defineProperty(DOMException.prototype, "constructor", {
    value: DOMException,
    writable: true,
    configurable: true,
  });

  var LEGACY_CONSTANTS = {
    INDEX_SIZE_ERR: 1,
    DOMSTRING_SIZE_ERR: 2,
    HIERARCHY_REQUEST_ERR: 3,
    WRONG_DOCUMENT_ERR: 4,
    INVALID_CHARACTER_ERR: 5,
    NO_DATA_ALLOWED_ERR: 6,
    NO_MODIFICATION_ALLOWED_ERR: 7,
    NOT_FOUND_ERR: 8,
    NOT_SUPPORTED_ERR: 9,
    INUSE_ATTRIBUTE_ERR: 10,
    INVALID_STATE_ERR: 11,
    SYNTAX_ERR: 12,
    INVALID_MODIFICATION_ERR: 13,
    NAMESPACE_ERR: 14,
    INVALID_ACCESS_ERR: 15,
    VALIDATION_ERR: 16,
    TYPE_MISMATCH_ERR: 17,
    SECURITY_ERR: 18,
    NETWORK_ERR: 19,
    ABORT_ERR: 20,
    URL_MISMATCH_ERR: 21,
    QUOTA_EXCEEDED_ERR: 22,
    TIMEOUT_ERR: 23,
    INVALID_NODE_TYPE_ERR: 24,
    DATA_CLONE_ERR: 25,
  };

  Object.keys(LEGACY_CONSTANTS).forEach(function (key) {
    var descriptor = { value: LEGACY_CONSTANTS[key], enumerable: true };
    Object.defineProperty(DOMException, key, descriptor);
    Object.defineProperty(DOMException.prototype, key, descriptor);
  });

  g.DOMException = DOMException;
})();
