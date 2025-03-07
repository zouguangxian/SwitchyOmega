/// <reference types="chrome"/>

interface OmegaTarget {
  options: any;
  state(name: string | string[], value?: any): Promise<any>;
  lastUrl(url?: string): string | null;
  addOptionsChangeCallback(callback: (options: any) => void): void;
  refresh(args?: any): Promise<any>;
  renameProfile(fromName: string, toName: string): Promise<any>;
  replaceRef(fromName: string, toName: string): Promise<any>;
  optionsPatch(patch: any): Promise<any>;
  resetOptions(opt: any): Promise<any>;
  updateProfile(name: string, opt_bypass_cache?: boolean): Promise<any>;
  getMessage(messageName: string, substitutions?: any[]): string;
  openOptions(hash?: string): Promise<void>;
  applyProfile(name: string): Promise<any>;
  applyProfileNoReply(name: string): void;
  addTempRule(domain: string, profileName: string): Promise<any>;
  addCondition(condition: any, profileName: string): Promise<any>;
  addProfile(profile: any): Promise<any>;
  setDefaultProfile(profileName: string, defaultProfileName: string): Promise<any>;
  getActivePageInfo(): Promise<any>;
  refreshActivePage(): Promise<void>;
  openManage(): void;
  openShortcutConfig(): void;
  setOptionsSync(enabled: boolean, args?: any): Promise<any>;
  resetOptionsSync(): Promise<any>;
  setRequestInfoCallback(callback: (info: any) => void): void;
}

function decodeError(obj: any): Error | any {
  if (obj._error === 'error') {
    const err = new Error(obj.message);
    err.name = obj.name;
    err.stack = obj.stack;
    (err as any).original = obj.original;
    return err;
  }
  return obj;
}

function callBackgroundNoReply(method: string, ...args: any[]): void {
  chrome.runtime.sendMessage({
    method,
    args,
    noReply: true
  });
}

function callBackground(method: string, ...args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      method,
      args
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      if (response.error) {
        reject(decodeError(response.error));
      } else {
        resolve(response.result);
      }
    });
  });
}

function connectBackground(name: string, message: any, callback: (message: any) => void): void {
  const port = chrome.runtime.connect({name});
  const onDisconnect = () => {
    port.onDisconnect.removeListener(onDisconnect);
    port.onMessage.removeListener(callback);
  };
  port.onDisconnect.addListener(onDisconnect);

  port.postMessage(message);
  port.onMessage.addListener(callback);
}

function isChromeUrl(url: string): boolean {
  return url.substr(0, 6) === 'chrome' ||
    url.substr(0, 4) === 'moz-' ||
    url.substr(0, 6) === 'about:';
}

const optionsChangeCallback: ((options: any) => void)[] = [];
let requestInfoCallback: ((info: any) => void) | null = null;
const prefix = 'omega.local.';
const urlParser = document.createElement('a');

const omegaTarget: OmegaTarget = {
  options: null,

  state(name: string | string[], value?: any): Promise<any> {
    if (arguments.length === 1) {
      const getValue = (key: string) => {
        try {
          return JSON.parse(localStorage[prefix + key]);
        } catch {
          return null;
        }
      };
      if (Array.isArray(name)) {
        return Promise.resolve(name.map(getValue));
      } else {
        value = getValue(name as string);
      }
    } else {
      localStorage[prefix + name] = JSON.stringify(value);
    }
    return Promise.resolve(value);
  },

  lastUrl(url?: string): string | null {
    const name = 'web.last_url';
    if (url) {
      this.state(name, url);
      return url;
    } else {
      try {
        return JSON.parse(localStorage[prefix + name]);
      } catch {
        return null;
      }
    }
  },

  addOptionsChangeCallback(callback: (options: any) => void): void {
    optionsChangeCallback.push(callback);
  },

  refresh(args?: any): Promise<any> {
    return callBackground('getAll').then((opt) => {
      this.options = opt;
      for (const callback of optionsChangeCallback) {
        callback(this.options);
      }
      return args;
    });
  },

  renameProfile(fromName: string, toName: string): Promise<any> {
    return callBackground('renameProfile', fromName, toName).then(() => this.refresh());
  },

  replaceRef(fromName: string, toName: string): Promise<any> {
    return callBackground('replaceRef', fromName, toName).then(() => this.refresh());
  },

  optionsPatch(patch: any): Promise<any> {
    return callBackground('patch', patch).then(() => this.refresh());
  },

  resetOptions(opt: any): Promise<any> {
    return callBackground('reset', opt).then(() => this.refresh());
  },

  updateProfile(name: string, opt_bypass_cache?: boolean): Promise<any> {
    return callBackground('updateProfile', name, opt_bypass_cache)
      .then((results: any) => {
        for (const key in results) {
          if (Object.prototype.hasOwnProperty.call(results, key)) {
            results[key] = decodeError(results[key]);
          }
        }
        return results;
      })
      .then(() => this.refresh());
  },

  getMessage: chrome.i18n.getMessage.bind(chrome.i18n),

  openOptions(hash?: string): Promise<void> {
    return new Promise((resolve) => {
      const options_url = chrome.runtime.getURL('options.html');
      chrome.tabs.query({ url: options_url }, (tabs) => {
        let url: string;
        if (hash) {
          urlParser.href = tabs[0]?.url || options_url;
          urlParser.hash = hash;
          url = urlParser.href;
        } else {
          url = options_url;
        }

        if (tabs.length > 0) {
          const props: chrome.tabs.UpdateProperties = { active: true };
          if (hash) {
            props.url = url;
          }
          chrome.tabs.update(tabs[0].id!, props);
        } else {
          chrome.tabs.create({ url });
        }
        resolve();
      });
    });
  },

  applyProfile(name: string): Promise<any> {
    return callBackground('applyProfile', name);
  },

  applyProfileNoReply(name: string): void {
    callBackgroundNoReply('applyProfile', name);
  },

  addTempRule(domain: string, profileName: string): Promise<any> {
    return callBackground('addTempRule', domain, profileName);
  },

  addCondition(condition: any, profileName: string): Promise<any> {
    return callBackground('addCondition', condition, profileName);
  },

  addProfile(profile: any): Promise<any> {
    return callBackground('addProfile', profile).then(() => this.refresh());
  },

  setDefaultProfile(profileName: string, defaultProfileName: string): Promise<any> {
    return callBackground('setDefaultProfile', profileName, defaultProfileName);
  },

  getActivePageInfo(): Promise<any> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (!tabs[0]?.url) {
          resolve(null);
          return;
        }
        const args = { tabId: tabs[0].id, url: tabs[0].url };
        if (tabs[0].id && requestInfoCallback) {
          connectBackground('tabRequestInfo', args, requestInfoCallback);
        }
        resolve(callBackground('getPageInfo', args));
      });
    }).then((info: any) => info?.url ? info : null);
  },

  refreshActivePage(): Promise<void> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs[0]?.url && !isChromeUrl(tabs[0].url)) {
          chrome.tabs.reload(tabs[0].id!, { bypassCache: true });
        }
        resolve();
      });
    });
  },

  openManage(): void {
    chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
  },

  openShortcutConfig(): void {
    chrome.tabs.create({ url: 'chrome://extensions/configureCommands' });
  },

  setOptionsSync(enabled: boolean, args?: any): Promise<any> {
    return callBackground('setOptionsSync', enabled, args);
  },

  resetOptionsSync(): Promise<any> {
    return callBackground('resetOptionsSync');
  },

  setRequestInfoCallback(callback: (info: any) => void): void {
    requestInfoCallback = callback;
  }
};

export default omegaTarget; 