// Logging utility for the extension
export default function ZeroLogFactory() {
  const logStorage = {
    _data: '',
    _lastError: '',
    append: function(msg) {
      const now = new Date();
      this._data += now.toISOString() + ': ' + msg + '\n';
      // Keep only last 1000 lines
      const lines = this._data.split('\n');
      if (lines.length > 1000) {
        this._data = lines.slice(-1000).join('\n');
      }
    },
    getLog: function() {
      return this._data;
    },
    setLastError: function(err) {
      this._lastError = err;
    },
    getLastError: function() {
      return this._lastError;
    },
    clear: function() {
      this._data = '';
      this._lastError = '';
    }
  };

  // Override console methods to capture logs
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };

  console.log = function() {
    logStorage.append('[LOG] ' + Array.from(arguments).join(' '));
    originalConsole.log.apply(console, arguments);
  };

  console.info = function() {
    logStorage.append('[INFO] ' + Array.from(arguments).join(' '));
    originalConsole.info.apply(console, arguments);
  };

  console.warn = function() {
    logStorage.append('[WARN] ' + Array.from(arguments).join(' '));
    originalConsole.warn.apply(console, arguments);
  };

  console.error = function() {
    const msg = Array.from(arguments).join(' ');
    logStorage.append('[ERROR] ' + msg);
    logStorage.setLastError(msg);
    originalConsole.error.apply(console, arguments);
  };

  // Expose log storage to global scope
  globalThis.zeroLogStorage = logStorage;
} 