/// <reference types="chrome"/>

export interface OmegaPac {
  Conditions: {
    requestFromUrl(url: string): any;
    str(condition: any): string;
  };
}

export const OmegaTargetChromium = {
  Promise: Promise,
  Log: {
    str: (arg: any) => String(arg)
  },
  Storage: class {
    constructor(type: 'local' | 'sync') {
      this.type = type;
    }
    type: 'local' | 'sync';
  },
  BrowserStorage: class {
    constructor(storage: Storage, prefix: string) {
      this.storage = storage;
      this.prefix = prefix;
    }
    storage: Storage;
    prefix: string;
  },
  OptionsSync: class {
    constructor(storage: any) {
      this.storage = storage;
    }
    storage: any;
  },
  Options: class {
    constructor(options: any, storage: any, state: any, log: any, sync: any, proxyImpl: any) {
      this.options = options;
      this.storage = storage;
      this.state = state;
      this.log = log;
      this.sync = sync;
      this.proxyImpl = proxyImpl;
    }
    options: any;
    storage: any;
    state: any;
    log: any;
    sync: any;
    proxyImpl: any;
    static transformValueForSync: any;
  },
  ExternalApi: class {
    constructor(options: any) {
      this.options = options;
    }
    options: any;
    listen() {}
  },
  SwitchySharp: class {
    static extId = 'dpplabbmogkhghncfbfdeeokoefdjegm';
    monitor() {}
  },
  ChromeTabs: class {
    constructor(actionForUrl: (url: string) => Promise<any>) {
      this.actionForUrl = actionForUrl;
    }
    actionForUrl: (url: string) => Promise<any>;
    watch() {}
  },
  Inspect: class {
    constructor(callback: (url: string, tab: chrome.tabs.Tab) => void) {
      this.callback = callback;
    }
    callback: (url: string, tab: chrome.tabs.Tab) => void;
  },
  Url: {
    parse(url: string) {
      const parsed = new URL(url);
      return {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search + parsed.hash
      };
    }
  },
  proxy: {
    getProxyImpl(log: any) {
      return {
        features: ['socks5Auth'],
        watchProxyChange(callback: (details: any) => void) {
          chrome.proxy.settings.onChange.addListener(callback);
        }
      };
    }
  }
}; 