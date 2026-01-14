// Suppress url.parse() deprecation warnings from Node.js dependencies
// These warnings come from internal Node.js dependencies (Express, Vercel runtime, etc.), not our code
// We use the WHATWG URL API (new URL()) in our code, but dependencies still use url.parse()

if (typeof process !== 'undefined') {
  // Suppress via process.emitWarning
  if (process.emitWarning) {
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = function(warning, ...args) {
      // Check if it's a url.parse() deprecation warning
      if (typeof warning === 'string' && warning.includes('url.parse()')) {
        return; // Suppress
      }
      if (warning && typeof warning === 'object') {
        if (warning.name === 'DeprecationWarning' && 
            warning.message && 
            (warning.message.includes('url.parse()') || 
             warning.message.includes('DEP0169'))) {
          return; // Suppress
        }
      }
      // Check args for warning message
      if (args && args.length > 0) {
        const firstArg = args[0];
        if (typeof firstArg === 'string' && firstArg.includes('url.parse()')) {
          return; // Suppress
        }
      }
      return originalEmitWarning.call(this, warning, ...args);
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
