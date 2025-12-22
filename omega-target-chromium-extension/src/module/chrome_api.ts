/** @module omega-target-chromium-extension/chrome_api */

export function chromeApiPromisify<T = any>(
  target: any,
  method: string,
): (...args: any[]) => Promise<T> {
  return (...args: any[]) => {
    return new Promise<T>((resolve, reject) => {
      const callback = (...callbackArgs: any[]) => {
        if (chrome.runtime.lastError) {
          const error: any = new Error(chrome.runtime.lastError.message);
          error.original = chrome.runtime.lastError;
          return reject(error);
        }
        if (callbackArgs.length <= 1) {
          resolve(callbackArgs[0]);
        } else {
          resolve(callbackArgs as any);
        }
      };

      args.push(callback);
      target[method].apply(target, args);
    });
  };
}
