/// <reference types="chrome"/>

// MV3: Bundle dependencies directly into the service worker
// Import the module (which will be bundled by esbuild)
import * as OmegaTargetChromium from '../module';
import * as OmegaPacImport from 'omega-pac';
import { offscreenManager } from '../module/offscreen_manager';
import { setQuickSwitchHandler } from './background_preload';
import { storageWrapper, localStorageCompat } from '../module/storage_wrapper';

// Make OmegaPac available
const OmegaPac = OmegaPacImport;

const OmegaTargetCurrent = Object.create(OmegaTargetChromium);
// MV3 CSP: Use native Promise instead of Bluebird

OmegaTargetCurrent.Log = Object.create(OmegaTargetCurrent.Log);
const Log = OmegaTargetCurrent.Log;

// Logging setup
async function _writeLogToStorage(content: string): Promise<void> {
  try {
    const currentLog = await storageWrapper.getItem('log') || '';
    await storageWrapper.setItem('log', currentLog + content);
  } catch (_) {
    // Maybe we have reached our limit here. See #1288. Try trimming it.
    try {
      await storageWrapper.setItem('log', content);
    } catch (e) {
      // Storage failed completely, just log to console
      console.warn('Failed to write to storage:', e);
    }
  }
}

Log.log = (...args: any[]): void => {
  console.log(...args);
  const content = args.map(Log.str.bind(Log)).join(' ') + '\n';
  _writeLogToStorage(content); // Fire and forget
};

Log.error = (...args: any[]): void => {
  console.error(...args);
  const content = args.map(Log.str.bind(Log)).join(' ');
  storageWrapper.set('logLastError', content); // Synchronous cache
  _writeLogToStorage('ERROR: ' + content + '\n'); // Fire and forget
};

// Unhandled promise tracking (native Promise)
const unhandledPromises = new Map<Promise<any>, number>();
let unhandledPromisesNextId = 1;

self.addEventListener('unhandledrejection', (event) => {
  const id = unhandledPromisesNextId++;
  Log.error(`[${id}] Unhandled rejection:\n`, event.reason);
  unhandledPromises.set(event.promise, id);
});

self.addEventListener('rejectionhandled', (event) => {
  const id = unhandledPromises.get(event.promise);
  if (id !== undefined) {
    Log.log(`[${id}] Rejection handled!`);
    unhandledPromises.delete(event.promise);
  }
});

// Icon drawing
interface IconSet {
  [size: number]: ImageData;
}

const iconCache: { [key: string]: IconSet | null | Promise<IconSet | null> } = {};
let drawError: Error | null = null;

async function drawIcon(resultColor: string, profileColor?: string): Promise<IconSet | null> {
  const cacheKey = `omega+${resultColor || ''}+${profileColor || ''}`;
  const cachedIcon = iconCache[cacheKey];
  
  // Return cached value if available
  if (cachedIcon !== undefined) {
    if (cachedIcon instanceof Promise) {
      return await cachedIcon;
    }
    return cachedIcon;
  }

  // Create a promise for this icon and cache it to prevent concurrent draws
  const drawPromise = (async () => {
    let icon: IconSet | null = null;
    try {
      icon = {};
      // Draw each size using offscreen document
      for (const size of [16, 19, 24, 32, 38]) {
        const imageData = await offscreenManager.drawIcon(resultColor, profileColor, size);
        if (!imageData) {
          throw new Error('Failed to draw icon');
        }
        if (imageData.data[3] === 255) {
          // Some browsers may replace the image data with a opaque white image to
          // resist fingerprinting. In that case the icon cannot be drawn.
          throw new Error('Icon drawing blocked by privacy.resistFingerprinting.');
        }
        icon[size] = imageData;
      }
    } catch (e) {
      if (drawError == null) {
        drawError = e as Error;
        Log.error(e);
        Log.error('Profile-colored icon disabled. Falling back to static icon.');
      }
      icon = null;
    }

    // Cache the result
    iconCache[cacheKey] = icon;
    return icon;
  })();

  // Cache the promise
  iconCache[cacheKey] = drawPromise;
  return await drawPromise;
}

// Helper functions
const charCodeUnderscore = '_'.charCodeAt(0);
function isHidden(name: string): boolean {
  return (
    name.charCodeAt(0) === charCodeUnderscore &&
    name.charCodeAt(1) === charCodeUnderscore
  );
}

function dispName(name: string): string {
  return chrome.i18n.getMessage('profile_' + name) || name;
}

interface ActionResult {
  title: string;
  shortTitle: string;
  icon: IconSet | null;
  resultColor: string;
  profileColor: string;
}

function actionForUrl(url: string): Promise<ActionResult | null> {
  return options.ready
    .then(() => {
      const request = OmegaPac.Conditions.requestFromUrl(url);
      return options.matchProfile(request);
    })
    .then(({ profile, results }: any) => {
      let current = options.currentProfile();
      let currentName = dispName(current.name);
      let realCurrentName: string | undefined;

      if (current.profileType === 'VirtualProfile') {
        realCurrentName = current.defaultProfileName;
        currentName += ` [${dispName(realCurrentName)}]`;
        // Use the actual backing profile for colors and comparisons
        current = options.profile(realCurrentName);
      }

      let details = '';
      let direct = false;
      let attached = false;

      const condition2Str = (condition: any): string => {
        return condition.pattern || OmegaPac.Conditions.str(condition);
      };

      for (const result of results) {
        if (Array.isArray(result)) {
          if (result[1] == null) {
            attached = false;
            let name = result[0];
            if (name[0] === '+') {
              name = name.substr(1);
            }
            if (isHidden(name)) {
              attached = true;
            } else if (name !== realCurrentName) {
              details += chrome.i18n.getMessage('browserAction_defaultRuleDetails');
              details += ` => ${dispName(name)}\n`;
            }
          } else if (result[1].length === 0) {
            if (result[0] === 'DIRECT') {
              details += chrome.i18n.getMessage('browserAction_directResult');
              details += '\n';
              direct = true;
            } else {
              details += `${result[0]}\n`;
            }
          } else if (typeof result[1] === 'string') {
            details += `${result[1]} => ${result[0]}\n`;
          } else {
            const condition = condition2Str(result[1].condition || result[1]);
            details += `${condition} => `;
            if (result[0] === 'DIRECT') {
              details += chrome.i18n.getMessage('browserAction_directResult');
              details += '\n';
              direct = true;
            } else {
              details += `${result[0]}\n`;
            }
          }
        } else if (result.profileName) {
          if (result.isTempRule) {
            details += chrome.i18n.getMessage('browserAction_tempRulePrefix');
          } else if (attached) {
            details += chrome.i18n.getMessage('browserAction_attachedPrefix');
            attached = false;
          }
          const condition = result.source || condition2Str(result.condition);
          details += `${condition} => ${dispName(result.profileName)}\n`;
        }
      }

      if (!details) {
        details = options.printProfile(
          realCurrentName ? options.profile(realCurrentName) : current
        );
      }

      let resultColor = profile.color;
      let profileColor = current.color;
      let icon: IconSet | null = null;

      if (direct) {
        resultColor = options.profile('direct').color;
        profileColor = profile.color;
      } else if (
        profile.name === current.name &&
        options.isCurrentProfileStatic()
      ) {
        resultColor = profileColor = profile.color;
        icon = drawIcon(profile.color);
      } else {
        resultColor = profile.color;
        profileColor = current.color;
      }

      if (icon == null) {
        icon = drawIcon(resultColor, profileColor);
      }

      let shortTitle = 'Omega: ' + currentName; // TODO: I18n.
      if (profile.name !== currentName) {
        shortTitle += ' => ' + profile.name; // TODO: I18n.
      }

      return {
        title: chrome.i18n.getMessage('browserAction_titleWithResult', [
          currentName,
          dispName(profile.name),
          details,
        ]),
        shortTitle: shortTitle,
        icon: icon,
        resultColor: resultColor,
        profileColor: profileColor,
      };
    })
    .catch(() => null);
}

// Initialize storage and options (async to wait for storage to be ready)
async function initializeExtension() {
  // Wait for storage cache to be loaded
  await storageWrapper.ready.catch(e => {
    console.error('Failed to init storage:', e);
  });

  const storage = new OmegaTargetCurrent.Storage('local');
  const state = new OmegaTargetCurrent.BrowserStorage(localStorageCompat, 'omega.local.');

  let syncStorage: any;
  let sync: any;
  if (chrome?.storage?.sync || (typeof browser !== 'undefined' && browser?.storage?.sync)) {
    syncStorage = new OmegaTargetCurrent.Storage('sync');
    sync = new OmegaTargetCurrent.OptionsSync(syncStorage);
    // Now safe to use synchronous get() after awaiting ready
    const syncOptions = storageWrapper.get('omega.local.syncOptions');
    if (syncOptions !== '"sync"') {
      sync.enabled = false;
    }
    sync.transformValue = OmegaTargetCurrent.Options.transformValueForSync;
  }

  const proxyImpl = OmegaTargetCurrent.proxy.getProxyImpl(Log);
  state.set({ proxyImplFeatures: proxyImpl.features });

  const options = new OmegaTargetCurrent.Options(
    null,
    storage,
    state,
    Log,
    sync,
    proxyImpl
  );

  options.externalApi = new OmegaTargetCurrent.ExternalApi(options);
  options.externalApi.listen();

  if (chrome.runtime.id !== OmegaTargetCurrent.SwitchySharp.extId) {
    options.switchySharp = new OmegaTargetCurrent.SwitchySharp();
    options.switchySharp.monitor();
  }

  const tabs = new OmegaTargetCurrent.ChromeTabs(actionForUrl);
  tabs.watch();

  options._inspect = new OmegaTargetCurrent.Inspect((url: string, tab: chrome.tabs.Tab) => {
  if (url === tab.url) {
    options.clearBadge();
    tabs.processTab(tab);
    state.remove('inspectUrl');
    return;
  }

  state.set({ inspectUrl: url });

  actionForUrl(url).then((action) => {
    if (!action) return;

    const parsedUrl = OmegaTargetCurrent.Url.parse(url);
    const tabUrl = OmegaTargetCurrent.Url.parse(tab.url!);
    let urlDisp: string;
    if (parsedUrl.hostname === tabUrl.hostname) {
      urlDisp = parsedUrl.path;
    } else {
      urlDisp = parsedUrl.hostname;
    }

    const title =
      chrome.i18n.getMessage('browserAction_titleInspect', urlDisp) +
      '\n' +
      action.title;
    chrome.action.setTitle({ title: title, tabId: tab.id });
    tabs.setTabBadge(tab, {
      text: '#',
      color: action.resultColor,
    });
  });
});

// Proxy change handling
options.setProxyNotControllable(null);
let timeout: NodeJS.Timeout | null = null;

proxyImpl.watchProxyChange((details: any) => {
  if (options.externalApi.disabled) return;
  if (!details) return;

  const notControllableBefore = options.proxyNotControllable();
  let internal = false;
  let noRevert = false;

  switch (details['levelOfControl']) {
    case 'controlled_by_other_extensions':
    case 'not_controllable': {
      const reason =
        details['levelOfControl'] === 'not_controllable' ? 'policy' : 'app';
      options.setProxyNotControllable(reason);
      noRevert = true;
      break;
    }
    default:
      options.setProxyNotControllable(null);
  }

  if (details['levelOfControl'] === 'controlled_by_this_extension') {
    internal = true;
    if (!notControllableBefore) return;
  }

  Log.log('external proxy: ', details);

  // Chromium will send chrome.proxy.settings.onChange on extension unload,
  // just after the current extension has lost control of the proxy settings.
  // This is just annoying, and may change the currentProfileName state
  // surprisingly.
  // To workaround this issue, wait for some time before setting the proxy.
  // However this will cause some delay before the settings are processed.
  if (timeout != null) {
    clearTimeout(timeout);
  }

  let parsed: any = null;
  timeout = setTimeout(() => {
    if (parsed) {
      options.setExternalProfile(parsed, {
        noRevert: noRevert,
        internal: internal,
      });
    }
  }, 500);

  parsed = proxyImpl.parseExternalProfile(details, options._options);
});

// Profile change handling
let external = false;
options.currentProfileChanged = (reason: string) => {
  Object.keys(iconCache).forEach((key) => delete iconCache[key]);

  if (reason === 'external') {
    external = true;
  } else if (reason !== 'clearBadge') {
    external = false;
  }

  let current = options.currentProfile();
  let currentName = '';
  let realCurrentName: string | undefined;

  if (current) {
    currentName = dispName(current.name);
    if (current.profileType === 'VirtualProfile') {
      realCurrentName = current.defaultProfileName;
      currentName += ` [${dispName(realCurrentName)}]`;
      // Use the actual backing profile for colors and comparisons
      current = options.profile(realCurrentName);
    }
  }

  const details = options.printProfile(
    realCurrentName ? options.profile(realCurrentName) : current
  );

  let title: string;
  let shortTitle: string;

  if (currentName) {
    title = chrome.i18n.getMessage('browserAction_titleWithResult', [
      currentName,
      '',
      details,
    ]);
    shortTitle = 'Omega: ' + currentName; // TODO: I18n.
  } else {
    title = details;
    shortTitle = 'Omega: ' + details; // TODO: I18n.
  }

  if (external && current.profileType !== 'SystemProfile') {
    const message = chrome.i18n.getMessage('browserAction_titleExternalProxy');
    title = message + '\n' + title;
    shortTitle = 'Omega-Extern: ' + details; // TODO: I18n.
    options.setBadge();
  }

  let icon: IconSet | null;
  if (!current.name || !OmegaPac.Profiles.isInclusive(current)) {
    icon = drawIcon(current.color);
  } else {
    icon = drawIcon(options.profile('direct').color, current.color);
  }

  tabs.resetAll({
    icon: icon,
    title: title,
    shortTitle: shortTitle,
  });
};

// Error encoding for messaging
function encodeError(obj: any): any {
  if (obj instanceof Error) {
    return {
      _error: 'error',
      name: obj.name,
      message: obj.message,
      stack: obj.stack,
      original: obj,
    };
  } else {
    return obj;
  }
}

  // Refresh active page if enabled (uses storageWrapper which is now initialized)
  function refreshActivePageIfEnabled(): void {
    if (storageWrapper.get('omega.local.refreshOnProfileChange') === 'false') return;

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (!url) return;
      if (url.substr(0, 6) === 'chrome') return;
      if (url.substr(0, 6) === 'about:') return;
      if (url.substr(0, 4) === 'moz-') return;
      chrome.tabs.reload(tabs[0].id!, { bypassCache: true });
    });
  }

  return { options, tabs, state, refreshActivePageIfEnabled };
}

// Module-level variables (initialized asynchronously)
let options: any;
let tabs: any;
let state: any;
let refreshActivePageIfEnabled: () => void;

// Initialization promise for waiting
const initPromise = initializeExtension().then((result) => {
  options = result.options;
  tabs = result.tabs;
  state = result.state;
  refreshActivePageIfEnabled = result.refreshActivePageIfEnabled;
  return result;
}).catch(e => {
  console.error('Failed to initialize extension:', e);
  throw e;
});

// Message handling (waits for initialization first)
chrome.runtime.onMessage.addListener(
  (
    request: any,
    sender: chrome.runtime.MessageSender,
    respond: (response?: any) => void
  ): boolean | void => {
    if (!request || !request.method) return;

    // Wait for initialization, then for options.ready
    initPromise.then(() => options.ready).then(() => {
      let target: any;
      let method: any;

      if (request.method === 'getState') {
        target = state;
        method = state.get;
      } else {
        target = options;
        method = target[request.method];
      }

      if (typeof method !== 'function') {
        Log.error(`No such method ${request.method}!`);
        respond({
          error: {
            reason: 'noSuchMethod',
          },
        });
        return;
      }

      const promise = Promise.resolve().then(() =>
        method.apply(target, request.args)
      );

      if (request.refreshActivePage && refreshActivePageIfEnabled) {
        promise.then(refreshActivePageIfEnabled);
      }

      if (request.noReply) return;

      promise.then((result: any) => {
        if (request.method === 'updateProfile') {
          for (const key in result) {
            if (Object.prototype.hasOwnProperty.call(result, key)) {
              result[key] = encodeError(result[key]);
            }
          }
        }
        respond({ result: result });
      });

      promise.catch((error: any) => {
        Log.error(request.method + ' ==>', error);
        respond({ error: encodeError(error) });
      });
    }).catch((initError: any) => {
      // Initialization failed
      Log.error('Extension not initialized:', initError);
      respond({ error: { reason: 'notInitialized', message: String(initError) } });
    });

    return true; // Always async (waiting for init)
  }
);

