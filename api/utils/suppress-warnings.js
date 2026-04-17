// Suppress url.parse() deprecation warnings from Node.js dependencies (DEP0169).
// Dependencies (mysql2, axios internals, runtime) may still call url.parse(); our code uses WHATWG URL.

function isUrlParseDeprecation(warning, args) {
  const msg =
    typeof warning === 'string'
      ? warning
      : warning && typeof warning === 'object'
        ? String(warning.message || '')
        : '';
  const code =
    typeof warning === 'object' && warning != null && warning.code
      ? String(warning.code)
      : '';
  if (code === 'DEP0169') return true;
  if (msg.includes('url.parse()') || msg.includes('DEP0169')) return true;
  if (args && args.length > 1 && args[1] === 'DEP0169') return true;
  return false;
}

if (typeof process !== 'undefined') {
  // Primary hook: intercept Node's emitWarning (covers most DEP0169 emissions)
  if (process.emitWarning) {
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = function (warning, ...args) {
      if (isUrlParseDeprecation(warning, args)) return;
      return originalEmitWarning.apply(this, [warning, ...args]);
    };
  }

  // Also suppress via console.warn override (some dependencies use this)
  const originalWarn = console.warn;
  console.warn = function(...args) {
    const message = args.join(' ');
    if (message.includes('url.parse()') || message.includes('DEP0169')) {
      return; // Suppress
    }
    return originalWarn.apply(console, args);
  };

  // Suppress via process.on('warning') if available
  if (process.on) {
    process.on('warning', (warning) => {
      if (warning.name === 'DeprecationWarning' && 
          warning.message && 
          (warning.message.includes('url.parse()') || 
           warning.message.includes('DEP0169'))) {
        return; // Suppress by not emitting
      }
    });
  }
}

module.exports = {};
