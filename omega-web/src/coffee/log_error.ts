/** @module omega-web/log_error */

window.onerror = (message: string | Event, url?: string, line?: number, col?: number, err?: Error): void => {
  let log = localStorage['log'] || '';
  if (err?.stack) {
    log += err.stack + '\n\n';
  } else {
    log += `${url}:${line}:${col}:\t${message}\n\n`;
  }
  localStorage['log'] = log;
};

