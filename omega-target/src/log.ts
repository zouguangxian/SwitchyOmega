/** @module omega-target/log */

interface DebugStringable {
  debugStr?: string | (() => string);
}

function replacer(key: string, value: any): any {
  switch (key) {
    // Hide values for a few keys with privacy concerns.
    case 'username':
    case 'password':
    case 'host':
    case 'port':
      return '<secret>';
    default:
      return value;
  }
}

/**
 * Pretty-print an object and return the result string.
 * @param obj The object to format
 * @returns the formatted object in string
 */
function str(obj: any): string {
  if (typeof obj === 'object' && obj !== null) {
    if (obj.debugStr !== undefined) {
      if (typeof obj.debugStr === 'function') {
        return obj.debugStr();
      } else {
        return obj.debugStr;
      }
    } else if (obj instanceof Error) {
      return obj.stack || obj.message;
    } else {
      return JSON.stringify(obj, replacer, 4);
    }
  } else if (typeof obj === 'function') {
    if (obj.name) {
      return `<f: ${obj.name}>`;
    } else {
      return obj.toString();
    }
  } else {
    return String(obj);
  }
}

/**
 * Print something to the log.
 * @param args The objects to log
 */
const log = console.log.bind(console);

/**
 * Print something to the error log.
 * @param args The objects to log
 */
const error = console.error.bind(console);

/**
 * Log a function call with target and arguments
 * @param name The name of the method
 * @param args The arguments to the method call
 */
function func(name: string, args: IArguments | any[]): void {
  log(name, '(', Array.prototype.slice.call(args), ')');
}

/**
 * Log a method call with target and arguments
 * @param name The name of the method
 * @param self The target of the method call
 * @param args The arguments to the method call
 */
function method(name: string, self: any, args: IArguments | any[]): void {
  log(str(self), '<<', name, Array.prototype.slice.call(args));
}

export const Log = {
  str,
  log,
  error,
  func,
  method
}; 