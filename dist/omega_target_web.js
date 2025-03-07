/// <reference types="chrome"/>
function decodeError(obj) {
    if (obj._error === 'error') {
        const err = new Error(obj.message);
        err.name = obj.name;
        err.stack = obj.stack;
        err.original = obj.original;
        return err;
    }
    return obj;
}
function callBackgroundNoReply(method, ...args) {
    chrome.runtime.sendMessage({
        method,
        args,
        noReply: true
    });
}
function callBackground(method, ...args) {
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
            }
            else {
                resolve(response.result);
            }
        });
    });
}
function connectBackground(name, message, callback) {
    const port = chrome.runtime.connect({ name });
    const onDisconnect = () => {
        port.onDisconnect.removeListener(onDisconnect);
        port.onMessage.removeListener(callback);
    };
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage(message);
    port.onMessage.addListener(callback);
}
function isChromeUrl(url) {
    return url.substr(0, 6) === 'chrome' ||
        url.substr(0, 4) === 'moz-' ||
        url.substr(0, 6) === 'about:';
}
const optionsChangeCallback = [];
let requestInfoCallback = null;
const prefix = 'omega.local.';
const urlParser = document.createElement('a');
const omegaTarget = {
    options: null,
    state(name, value) {
        if (arguments.length === 1) {
            const getValue = (key) => {
                try {
                    return JSON.parse(localStorage[prefix + key]);
                }
                catch {
                    return null;
                }
            };
            if (Array.isArray(name)) {
                return Promise.resolve(name.map(getValue));
            }
            else {
                value = getValue(name);
            }
        }
        else {
            localStorage[prefix + name] = JSON.stringify(value);
        }
        return Promise.resolve(value);
    },
    lastUrl(url) {
        const name = 'web.last_url';
        if (url) {
            this.state(name, url);
            return url;
        }
        else {
            try {
                return JSON.parse(localStorage[prefix + name]);
            }
            catch {
                return null;
            }
        }
    },
    addOptionsChangeCallback(callback) {
        optionsChangeCallback.push(callback);
    },
    refresh(args) {
        return callBackground('getAll').then((opt) => {
            this.options = opt;
            for (const callback of optionsChangeCallback) {
                callback(this.options);
            }
            return args;
        });
    },
    renameProfile(fromName, toName) {
        return callBackground('renameProfile', fromName, toName).then(() => this.refresh());
    },
    replaceRef(fromName, toName) {
        return callBackground('replaceRef', fromName, toName).then(() => this.refresh());
    },
    optionsPatch(patch) {
        return callBackground('patch', patch).then(() => this.refresh());
    },
    resetOptions(opt) {
        return callBackground('reset', opt).then(() => this.refresh());
    },
    updateProfile(name, opt_bypass_cache) {
        return callBackground('updateProfile', name, opt_bypass_cache)
            .then((results) => {
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
    openOptions(hash) {
        return new Promise((resolve) => {
            const options_url = chrome.runtime.getURL('options.html');
            chrome.tabs.query({ url: options_url }, (tabs) => {
                let url;
                if (hash) {
                    urlParser.href = tabs[0]?.url || options_url;
                    urlParser.hash = hash;
                    url = urlParser.href;
                }
                else {
                    url = options_url;
                }
                if (tabs.length > 0) {
                    const props = { active: true };
                    if (hash) {
                        props.url = url;
                    }
                    chrome.tabs.update(tabs[0].id, props);
                }
                else {
                    chrome.tabs.create({ url });
                }
                resolve();
            });
        });
    },
    applyProfile(name) {
        return callBackground('applyProfile', name);
    },
    applyProfileNoReply(name) {
        callBackgroundNoReply('applyProfile', name);
    },
    addTempRule(domain, profileName) {
        return callBackground('addTempRule', domain, profileName);
    },
    addCondition(condition, profileName) {
        return callBackground('addCondition', condition, profileName);
    },
    addProfile(profile) {
        return callBackground('addProfile', profile).then(() => this.refresh());
    },
    setDefaultProfile(profileName, defaultProfileName) {
        return callBackground('setDefaultProfile', profileName, defaultProfileName);
    },
    getActivePageInfo() {
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
        }).then((info) => info?.url ? info : null);
    },
    refreshActivePage() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                if (tabs[0]?.url && !isChromeUrl(tabs[0].url)) {
                    chrome.tabs.reload(tabs[0].id, { bypassCache: true });
                }
                resolve();
            });
        });
    },
    openManage() {
        chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    },
    openShortcutConfig() {
        chrome.tabs.create({ url: 'chrome://extensions/configureCommands' });
    },
    setOptionsSync(enabled, args) {
        return callBackground('setOptionsSync', enabled, args);
    },
    resetOptionsSync() {
        return callBackground('resetOptionsSync');
    },
    setRequestInfoCallback(callback) {
        requestInfoCallback = callback;
    }
};
export default omegaTarget;
