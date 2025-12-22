/** @module omega-target-chromium-extension/omega_target_web */

// This file provides an Angular module for communicating with the background page

declare const angular: any;

const getActiveTab = (callback: (tab?: chrome.tabs.Tab) => void): void => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      callback(undefined);
    } else {
      callback(tabs[0]);
    }
  });
};

angular.module('omegaTarget', []).factory('omegaTarget', [
  '$q',
  function ($q: any) {
    const decodeError = (obj: any): any => {
      if (obj._error === 'error') {
        const err: any = new Error(obj.message);
        err.name = obj.name;
        err.stack = obj.stack;
        err.original = obj.original;
        return err;
      } else {
        return obj;
      }
    };

    const RETRYABLE_ERRORS = ['Could not establish connection. Receiving end does not exist.'];
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 150;

    const sendMessageWithRetry = (
      payload: any,
      retries: number,
      onSuccess: (response: any) => void,
      onFailure: (error: chrome.runtime.LastError) => void,
    ) => {
      chrome.runtime.sendMessage(payload, (response: any) => {
        const error = chrome.runtime.lastError;
        if (error) {
          const retryable = RETRYABLE_ERRORS.some((message) => error.message?.includes(message));
          if (retryable && retries > 0) {
            setTimeout(
              () => sendMessageWithRetry(payload, retries - 1, onSuccess, onFailure),
              RETRY_DELAY_MS,
            );
          } else {
            onFailure(error);
          }
          return;
        }
        onSuccess(response);
      });
    };

    const callBackgroundNoReply = (method: string, ...args: any[]): void => {
      const payload = { method, args, noReply: true };
      sendMessageWithRetry(
        payload,
        MAX_RETRIES,
        () => {},
        (error) => {
          // Surface the error in the console for debugging.
          console.warn('callBackgroundNoReply failed:', error.message);
        },
      );
    };

    const callBackground = (method: string, ...args: any[]): Promise<any> => {
      const d = $q['defer']();
      const payload = { method, args };
      sendMessageWithRetry(
        payload,
        MAX_RETRIES,
        (response: any) => {
          if (response?.error) {
            d.reject(decodeError(response.error));
          } else {
            d.resolve(response?.result);
          }
        },
        (error) => {
          d.reject(error);
        },
      );
      return d.promise;
    };

    const connectBackground = (name: string, message: any, callback: (msg: any) => void): void => {
      const port = chrome.runtime.connect({ name });
      const onDisconnect = () => {
        port.onDisconnect.removeListener(onDisconnect);
        port.onMessage.removeListener(callback);
      };
      port.onDisconnect.addListener(onDisconnect);

      port.postMessage(message);
      port.onMessage.addListener(callback);
    };

    const isChromeUrl = (url: string): boolean => {
      return (
        url.substr(0, 6) === 'chrome' ||
        url.substr(0, 4) === 'moz-' ||
        url.substr(0, 6) === 'about:'
      );
    };

    const optionsChangeCallback: Array<(options: any) => void> = [];
    let requestInfoCallback: ((msg: any) => void) | null = null;
    const prefix = 'omega.local.';
    const urlParser = document.createElement('a');
    const getLocalValue = (key: string) => {
      try {
        return JSON.parse(localStorage[prefix + key]);
      } catch (e) {
        return undefined;
      }
    };

    const omegaTarget = {
      options: null as any,

      state(name: string | string[], value?: any): Promise<any> {
        const deferred = $q.defer();
        if (arguments.length === 1) {
          if (Array.isArray(name)) {
            callBackground('getState', name).then((values: Record<string, any>) => {
              deferred.resolve(
                name.map((key) => {
                  const remoteValue = values?.[key];
                  return remoteValue !== undefined ? remoteValue : getLocalValue(key);
                }),
              );
            });
          } else {
            callBackground('getState', [name]).then((values: Record<string, any>) => {
              const remoteValue = values?.[name];
              deferred.resolve(remoteValue !== undefined ? remoteValue : getLocalValue(name));
            });
          }
        } else {
          const payload: Record<string, any> = {};
          payload[name as string] = value;
          localStorage[prefix + (name as string)] = JSON.stringify(value);
          callBackground('setState', payload).then(() => deferred.resolve(value));
        }
        return deferred.promise;
      },

      lastUrl(url?: string): string | undefined {
        const name = 'web.last_url';
        if (url) {
          omegaTarget.state(name, url);
          return url;
        } else {
          try {
            return JSON.parse(localStorage[prefix + name]);
          } catch (e) {
            return undefined;
          }
        }
      },

      addOptionsChangeCallback(callback: (options: any) => void): void {
        optionsChangeCallback.push(callback);
      },

      refresh(args?: any): Promise<any> {
        return callBackground('getAll').then((opt: any) => {
          omegaTarget.options = opt;
          for (const callback of optionsChangeCallback) {
            callback(omegaTarget.options);
          }
          return args;
        });
      },

      renameProfile(fromName: string, toName: string): Promise<any> {
        return callBackground('renameProfile', fromName, toName).then(omegaTarget.refresh);
      },

      replaceRef(fromName: string, toName: string): Promise<any> {
        return callBackground('replaceRef', fromName, toName).then(omegaTarget.refresh);
      },

      optionsPatch(patch: any): Promise<any> {
        return callBackground('patch', patch).then(omegaTarget.refresh);
      },

      resetOptions(opt?: any): Promise<any> {
        return callBackground('reset', opt).then(omegaTarget.refresh);
      },

      updateProfile(name: string, opt_bypass_cache?: boolean): Promise<any> {
        return callBackground('updateProfile', name, opt_bypass_cache)
          .then((results: any) => {
            for (const key in results) {
              if (results.hasOwnProperty(key)) {
                results[key] = decodeError(results[key]);
              }
            }
            return results;
          })
          .then(omegaTarget.refresh);
      },

      getMessage: chrome.i18n.getMessage.bind(chrome.i18n),

      openOptions(hash?: string): Promise<void> {
        const d = $q['defer']();
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

          if (tabs.length > 0 && tabs[0].id) {
            const props: any = { active: true };
            if (hash) {
              props.url = url;
            }
            chrome.tabs.update(tabs[0].id, props);
          } else {
            chrome.tabs.create({ url });
          }
          d.resolve();
        });
        return d.promise;
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
        return callBackground('addProfile', profile).then(omegaTarget.refresh);
      },

      setDefaultProfile(profileName: string, defaultProfileName: string): Promise<any> {
        return callBackground('setDefaultProfile', profileName, defaultProfileName);
      },

      getActivePageInfo(): Promise<any> {
        const d = $q['defer']();
        getActiveTab((tab) => {
          const url = tab?.pendingUrl || tab?.url;
          if (!url || !tab?.id) {
            d.resolve(null);
            return;
          }
          const args = { tabId: tab.id, url };
          if (requestInfoCallback) {
            connectBackground('tabRequestInfo', args, requestInfoCallback);
          }
          d.resolve(callBackground('getPageInfo', args));
        });
        return d.promise.then((info: any) => (info?.url ? info : null));
      },

      refreshActivePage(): Promise<void> {
        const d = $q['defer']();
        getActiveTab((tab) => {
          const url = tab?.pendingUrl || tab?.url;
          if (url && !isChromeUrl(url) && tab?.id) {
            if (tab.pendingUrl) {
              chrome.tabs.update(tab.id, { url });
            } else {
              chrome.tabs.reload(tab.id, { bypassCache: true });
            }
          }
          d.resolve();
        });
        return d.promise;
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

      resetOptionsSync(enabled?: boolean, args?: any): Promise<any> {
        return callBackground('resetOptionsSync');
      },

      setRequestInfoCallback(callback: (msg: any) => void): void {
        requestInfoCallback = callback;
      },
    };

    return omegaTarget;
  },
]);
