/** @module omega-target/log */

const replacer = (key: string, value: any): any => {
  switch (key) {
    // Hide values for a few keys with privacy concerns.
    case "username":
    case "password":
    case "host":
    case "port":
      return "<secret>";
    default:
      return value;
  }
};

/**
 * Log is used as singleton.
 */
const Log = {
  /**
   * Pretty-print an object and return the result string.
   * @param obj The object to format
   * @returns the formatted object in string
   */
  str(obj: any): string {
    // TODO(catus): This can be improved to print things more friendly.
    if (typeof obj === 'object' && obj !== null) {
      if (obj.debugStr != null) {
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
      return '' + obj;
    }
  },

  /**
   * Print something to the log.
   * @param args The objects to log
   */
  log: console.log.bind(console) as (...args: any[]) => void,

  /**
   * Print something to the error log.
   * @param args The objects to log
   */
  error: console.error.bind(console) as (...args: any[]) => void,

  /**
   * Log a function call with target and arguments
   * @param name The name of the method
   * @param args The arguments to the method call
   */
  func(name: string, args: IArguments | any[]): void {
    this.log(name, '(', Array.prototype.slice.call(args), ')');
  },

  /**
   * Log a method call with target and arguments
   * @param name The name of the method
   * @param self The target of the method call
   * @param args The arguments to the method call
   */
  method(name: string, self: any, args: IArguments | any[]): void {
    this.log(this.str(self), '<<', name, Array.prototype.slice.call(args));
  }
};

export default Log;

