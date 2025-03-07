const OmegaTargetCurrent = Object.create(OmegaTargetChromium);
const Promise = OmegaTargetCurrent.Promise;
Promise.longStackTraces();
OmegaTargetCurrent.Log = Object.create(OmegaTargetCurrent.Log);
const Log = OmegaTargetCurrent.Log;
function _writeLogToLocalStorage(content) {
    try {
        localStorage['log'] += content;
    }
    catch (_) {
        // Maybe we have reached our limit here. See #1288. Try trimming it.
        localStorage['log'] = content;
    }
}
Log.log = (...args) => {
    console.log(...args);
    const content = args.map(Log.str.bind(Log)).join(' ') + '\n';
    _writeLogToLocalStorage(content);
};
Log.error = (...args) => {
    console.error(...args);
    const content = args.map(Log.str.bind(Log)).join(' ');
    localStorage['logLastError'] = content;
    _writeLogToLocalStorage('ERROR: ' + content + '\n');
};
const unhandledPromises = [];
const unhandledPromisesId = [];
let unhandledPromisesNextId = 1;
Promise.onPossiblyUnhandledRejection((reason, promise) => {
    Log.error(`[${unhandledPromisesNextId}] Unhandled rejection:\n`, reason);
    unhandledPromises.push(promise);
    unhandledPromisesId.push(unhandledPromisesNextId);
    unhandledPromisesNextId++;
});
Promise.onUnhandledRejectionHandled((promise) => {
    const index = unhandledPromises.indexOf(promise);
    Log.log(`[${unhandledPromisesId[index]}] Rejection handled!`, promise);
    unhandledPromises.splice(index, 1);
    unhandledPromisesId.splice(index, 1);
});
const iconCache = {};
let drawContext = null;
let drawError = null;
function drawIcon(resultColor, profileColor) {
    const cacheKey = `omega+${resultColor ?? ''}+${profileColor}`;
    const icon = iconCache[cacheKey];
    if (icon)
        return icon;
    try {
        if (!drawContext) {
            const canvas = document.getElementById('canvas-icon');
            drawContext = canvas.getContext('2d');
        }
        if (!drawContext)
            throw new Error('Could not get canvas context');
        const icon = {};
        for (const size of [16, 19, 24, 32, 38]) {
            drawContext.scale(size, size);
            drawContext.clearRect(0, 0, 1, 1);
            if (resultColor) {
                drawOmega(drawContext, resultColor, profileColor);
            }
            else {
                drawOmega(drawContext, profileColor);
            }
            drawContext.setTransform(1, 0, 0, 1, 0, 0);
            icon[size] = drawContext.getImageData(0, 0, size, size);
            if (icon[size].data[3] === 255) {
                throw new Error('Icon drawing blocked by privacy.resistFingerprinting.');
            }
        }
        return iconCache[cacheKey] = icon;
    }
    catch (e) {
        if (!drawError) {
            drawError = e;
            Log.error(e);
            Log.error('Profile-colored icon disabled. Falling back to static icon.');
        }
        return null;
    }
}
const charCodeUnderscore = '_'.charCodeAt(0);
const isHidden = (name) => name.charCodeAt(0) === charCodeUnderscore && name.charCodeAt(1) === charCodeUnderscore;
const dispName = (name) => chrome.i18n.getMessage('profile_' + name) || name;
async function actionForUrl(url) {
    try {
        await options.ready;
        const request = OmegaPac.Conditions.requestFromUrl(url);
        const { profile, results } = await options.matchProfile(request);
        const current = options.currentProfile();
        let currentName = dispName(current.name);
        let realCurrentName = current.name;
        if (current.profileType === 'VirtualProfile') {
            realCurrentName = current.defaultProfileName;
            currentName += ` [${dispName(realCurrentName)}]`;
        }
        let details = '';
        let direct = false;
        let attached = false;
        const condition2Str = (condition) => condition.pattern || OmegaPac.Conditions.str(condition);
        for (const result of results) {
            if (Array.isArray(result)) {
                if (!result[1]) {
                    attached = false;
                    let name = result[0];
                    if (name[0] === '+') {
                        name = name.substr(1);
                    }
                    if (isHidden(name)) {
                        attached = true;
                    }
                    else if (name !== realCurrentName) {
                        details += chrome.i18n.getMessage('browserAction_defaultRuleDetails');
                        details += ` => ${dispName(name)}\n`;
                    }
                }
                else if (result[1].length === 0) {
                    if (result[0] === 'DIRECT') {
                        details += chrome.i18n.getMessage('browserAction_directResult');
                        details += '\n';
                        direct = true;
                    }
                    else {
                        details += `${result[0]}\n`;
                    }
                }
                else if (typeof result[1] === 'string') {
                    details += `${result[1]} => ${result[0]}\n`;
                }
                else {
                    const condition = condition2Str(result[1].condition ?? result[1]);
                    details += `${condition} => `;
                    if (result[0] === 'DIRECT') {
                        details += chrome.i18n.getMessage('browserAction_directResult');
                        details += '\n';
                        direct = true;
                    }
                    else {
                        details += `${result[0]}\n`;
                    }
                }
            }
            else if (result.profileName) {
                if (result.isTempRule) {
                    details += chrome.i18n.getMessage('browserAction_tempRulePrefix');
                }
                else if (attached) {
                    details += chrome.i18n.getMessage('browserAction_attachedPrefix');
                    attached = false;
                }
                const condition = result.source ?? condition2Str(result.condition);
                details += `${condition} => ${dispName(result.profileName)}\n`;
            }
        }
        if (!details) {
            details = options.printProfile(current);
        }
        let resultColor = profile.color;
        let profileColor = current.color;
        let icon = null;
        if (direct) {
            resultColor = options.profile('direct').color;
            profileColor = profile.color;
        }
        else if (profile.name === current.name && options.isCurrentProfileStatic()) {
            resultColor = profileColor = profile.color;
            icon = drawIcon(profile.color);
        }
        else {
            resultColor = profile.color;
            profileColor = current.color;
        }
        icon = icon ?? drawIcon(resultColor, profileColor);
        let shortTitle = 'Omega: ' + currentName;
        if (profile.name !== currentName) {
            shortTitle += ' => ' + profile.name;
        }
        return {
            title: chrome.i18n.getMessage('browserAction_titleWithResult', [
                currentName,
                dispName(profile.name),
                details
            ]),
            shortTitle,
            icon,
            resultColor,
            profileColor
        };
    }
    catch (error) {
        return null;
    }
}
// Initialize storage and state
const storage = new OmegaTargetCurrent.Storage('local');
const state = new OmegaTargetCurrent.BrowserStorage(localStorage, 'omega.local.');
// Initialize sync if available
let sync;
if (chrome?.storage?.sync || browser?.storage?.sync) {
    const syncStorage = new OmegaTargetCurrent.Storage('sync');
    sync = new OmegaTargetCurrent.OptionsSync(syncStorage);
    if (localStorage['omega.local.syncOptions'] !== '"sync"') {
        sync.enabled = false;
    }
    sync.transformValue = OmegaTargetCurrent.Options.transformValueForSync;
}
// Initialize proxy implementation
const proxyImpl = OmegaTargetCurrent.proxy.getProxyImpl(Log);
state.set({ proxyImplFeatures: proxyImpl.features });
// Initialize options
const options = new OmegaTargetCurrent.Options(null, storage, state, Log, sync, proxyImpl);
options.externalApi = new OmegaTargetCurrent.ExternalApi(options);
options.externalApi.listen();
// Initialize SwitchySharp compatibility if needed
if (chrome.runtime.id !== OmegaTargetCurrent.SwitchySharp.extId) {
    options.switchySharp = new OmegaTargetCurrent.SwitchySharp();
    options.switchySharp.monitor();
}
// Initialize tabs
const tabs = new OmegaTargetCurrent.ChromeTabs(actionForUrl);
tabs.watch();
// Initialize inspect
options._inspect = new OmegaTargetCurrent.Inspect(async (url, tab) => {
    if (url === tab.url) {
        options.clearBadge();
        tabs.processTab(tab);
        state.remove('inspectUrl');
        return;
    }
    state.set({ inspectUrl: url });
    const action = await actionForUrl(url);
    if (!action)
        return;
    const parsedUrl = OmegaTargetCurrent.Url.parse(url);
    const urlDisp = parsedUrl.hostname === OmegaTargetCurrent.Url.parse(tab.url).hostname
        ? parsedUrl.path
        : parsedUrl.hostname;
    const title = chrome.i18n.getMessage('browserAction_titleInspect', urlDisp) + '\n' + action.title;
    chrome.action.setTitle({ title, tabId: tab.id });
    tabs.setTabBadge(tab, {
        text: '#',
        color: action.resultColor
    });
});
// Initialize proxy control
options.setProxyNotControllable(null);
proxyImpl.watchProxyChange((details) => {
    if (options.externalApi.disabled || !details)
        return;
    const notControllableBefore = options.proxyNotControllable();
    let internal = false;
    let noRevert = false;
    switch (details['levelOfControl']) {
        case "controlled_by_other_extensions":
        case "not_controllable":
            const reason = details['levelOfControl'] === 'not_controllable' ? 'policy' : 'app';
            options.setProxyNotControllable(reason);
            noRevert = true;
            break;
        default:
            options.setProxyNotControllable(null);
    }
    if (details['levelOfControl'] === 'controlled_by_this_extension') {
        internal = true;
        if (!notControllableBefore)
            return;
    }
    Log.log('external proxy: ', details);
});
export {};
