/** @module omega-target-chromium-extension/options */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;
const Promise = OmegaTarget.Promise;
import * as querystring from 'querystring';
import WebRequestMonitor = require('./web_request_monitor');
import ChromePort = require('./chrome_port');
import fetchUrl = require('./fetch_url');
import * as Url from 'url';

interface BadgeOptions {
  text: string;
  color: string;
  title?: string;
}

interface PageInfoRequest {
  tabId: number;
  url?: string;
}

interface PageInfoResult {
  url?: string;
  domain?: string;
  tempRuleProfileName?: string | null;
  errorCount?: number;
}

class ChromeOptions extends OmegaTarget.Options {
  _inspect: any = null;
  switchySharp?: any;
  externalApi: any;
  
  private _proxyNotControllable: string | null = null;
  private _badgeTitle: string | null = null;
  private _quickSwitchInit: boolean = false;
  private _quickSwitchHandlerReady: boolean = false;
  private _quickSwitchCanEnable: boolean = false;
  private _requestMonitor: WebRequestMonitor | null = null;
  private _monitorWebRequests: boolean = false;
  private _tabRequestInfoPorts: Record<number, ChromePort> | null = null;
  private _alarms: Record<string, () => void> | null = null;

  fetchUrl = fetchUrl;

  updateProfile(name?: string | string[] | null, opt_bypass_cache?: boolean): Promise<Record<string, any>> {
    return super.updateProfile(name, opt_bypass_cache).then((results) => {
      let error = false;
      for (const profileName in results) {
        if (results.hasOwnProperty(profileName)) {
          const result = results[profileName];
          if (result instanceof Error) {
            error = true;
            break;
          }
        }
      }
      
      if (error) {
        // TODO(catus): Find a better way to notify the user.
        /*
        this.setBadge({
          text: '!',
          color: '#faa732',
          title: chrome.i18n.getMessage('browserAction_titleDownloadFail')
        });
        */
      }
      return results;
    });
  }

  proxyNotControllable(): string | null {
    return this._proxyNotControllable;
  }

  setProxyNotControllable(reason: string | null, badge?: BadgeOptions): void {
    this._proxyNotControllable = reason;
    if (reason) {
      this._state.set({ 'proxyNotControllable': reason });
      this.setBadge(badge);
    } else {
      this._state.remove(['proxyNotControllable']);
      this.clearBadge();
    }
  }

  setBadge(options?: BadgeOptions): void {
    if (!options) {
      options = this._proxyNotControllable
        ? { text: '=', color: '#da4f49' }
        : { text: '?', color: '#49afcd' };
    }
    
    chrome.browserAction.setBadgeText({ text: options.text });
    chrome.browserAction.setBadgeBackgroundColor({ color: options.color });
    
    if (options.title) {
      this._badgeTitle = options.title;
      chrome.browserAction.setTitle({ title: options.title });
    } else {
      this._badgeTitle = null;
    }
  }

  clearBadge(): void {
    if (this.externalApi.disabled) return;
    
    if (this._badgeTitle) {
      this.currentProfileChanged('clearBadge');
    }
    
    if (this._proxyNotControllable) {
      this.setBadge();
    } else {
      chrome.browserAction.setBadgeText?.({ text: '' });
    }
  }

  setQuickSwitch(quickSwitch: string[] | null, canEnable: boolean): Promise<void> {
    this._quickSwitchCanEnable = canEnable;
    
    if (!this._quickSwitchHandlerReady) {
      this._quickSwitchHandlerReady = true;
      (window as any).OmegaContextMenuQuickSwitchHandler = (info: chrome.contextMenus.OnClickData) => {
        const changes: Record<string, any> = {};
        changes['-enableQuickSwitch'] = info.checked;
        const setOptions = this._setOptions(changes);
        
        if (info.checked && !this._quickSwitchCanEnable) {
          setOptions.then(() => {
            chrome.tabs.create({
              url: chrome.extension.getURL('options.html#/ui')
            });
          });
        }
      };
    }

    if (quickSwitch || !chrome.browserAction.setPopup) {
      chrome.browserAction.setPopup?.({ popup: '' });
      
      if (!this._quickSwitchInit) {
        this._quickSwitchInit = true;
        chrome.browserAction.onClicked.addListener((tab) => {
          this.clearBadge();
          
          if (!this._options['-enableQuickSwitch']) {
            // If we reach here, then the browser does not support popup.
            // Let's open the popup page in a tab.
            chrome.tabs.create({ url: 'popup/index.html' });
            return;
          }
          
          const profiles = this._options['-quickSwitchProfiles'];
          let index = profiles.indexOf(this._currentProfileName);
          index = (index + 1) % profiles.length;
          
          this.applyProfile(profiles[index]).then(() => {
            if (this._options['-refreshOnProfileChange']) {
              const url = tab.url;
              if (!url) return;
              if (url.substr(0, 6) === 'chrome') return;
              if (url.substr(0, 6) === 'about:') return;
              if (url.substr(0, 4) === 'moz-') return;
              if (tab.id != null) {
                chrome.tabs.reload(tab.id);
              }
            }
          });
        });
      }
    } else {
      chrome.browserAction.setPopup({ popup: 'popup/index.html' });
    }

    chrome.contextMenus?.update('enableQuickSwitch', { checked: !!quickSwitch });
    return Promise.resolve();
  }

  setInspect(settings: { showMenu: boolean }): Promise<void> {
    if (this._inspect) {
      if (settings.showMenu) {
        this._inspect.enable();
      } else {
        this._inspect.disable();
      }
    }
    return Promise.resolve();
  }

  setMonitorWebRequests(enabled: boolean): Promise<void> {
    this._monitorWebRequests = enabled;
    
    if (enabled && !this._requestMonitor) {
      this._tabRequestInfoPorts = {};
      const wildcardForReq = (req: any) => OmegaPac.wildcardForUrl(req.url);
      this._requestMonitor = new WebRequestMonitor(wildcardForReq);
      
      this._requestMonitor.watchTabs((tabId, info) => {
        if (!this._monitorWebRequests) return;
        
        if (info.errorCount > 0) {
          info.badgeSet = true;
          const badge = { text: info.errorCount.toString(), color: '#f0ad4e' };
          chrome.browserAction.setBadgeText({ text: badge.text, tabId });
          chrome.browserAction.setBadgeBackgroundColor({
            color: badge.color,
            tabId
          });
        } else if (info.badgeSet) {
          info.badgeSet = false;
          chrome.browserAction.setBadgeText({ text: '', tabId });
        }
        
        this._tabRequestInfoPorts![tabId]?.postMessage({
          errorCount: info.errorCount,
          summary: info.summary
        });
      });

      chrome.runtime.onConnect.addListener((rawPort) => {
        if (rawPort.name !== 'tabRequestInfo') return;
        if (!this._monitorWebRequests) return;
        
        let tabId: number | null = null;
        const port = new ChromePort(rawPort);
        
        port.onMessage.addListener((msg: any) => {
          tabId = msg.tabId;
          this._tabRequestInfoPorts![tabId] = port;
          const info = this._requestMonitor!.tabInfo[tabId];
          if (info) {
            port.postMessage({
              errorCount: info.errorCount,
              summary: info.summary
            });
          }
        });
        
        port.onDisconnect.addListener(() => {
          if (tabId != null) {
            delete this._tabRequestInfoPorts![tabId];
          }
        });
      });
    }
    
    return Promise.resolve();
  }

  schedule(name: string, periodInMinutes: number, callback: () => void): Promise<void> {
    name = 'omega.' + name;
    
    if (!this._alarms) {
      this._alarms = {};
      chrome.alarms.onAlarm.addListener((alarm) => {
        this._alarms![alarm.name]?.();
      });
    }
    
    if (periodInMinutes < 0) {
      delete this._alarms[name];
      chrome.alarms.clear(name);
    } else {
      this._alarms[name] = callback;
      chrome.alarms.create(name, {
        periodInMinutes
      });
    }
    
    return Promise.resolve();
  }

  printFixedProfile(profile: any): string | null {
    if (profile.profileType !== 'FixedProfile') return null;
    
    let result = '';
    for (const scheme of OmegaPac.Profiles.schemes) {
      if (profile[scheme.prop]) {
        const pacResult = OmegaPac.Profiles.pacResult(profile[scheme.prop]);
        if (scheme.scheme) {
          result += `${scheme.scheme}: ${pacResult}\n`;
        } else {
          result += `${pacResult}\n`;
        }
      }
    }
    
    result = result || chrome.i18n.getMessage('browserAction_profileDetails_DirectProfile');
    return result;
  }

  printProfile(profile: any): string | null {
    let type = profile.profileType;
    if (type.indexOf('RuleListProfile') >= 0) {
      type = 'RuleListProfile';
    }

    if (type === 'FixedProfile') {
      return this.printFixedProfile(profile);
    } else if (type === 'PacProfile' && profile.pacUrl) {
      return profile.pacUrl;
    } else {
      return chrome.i18n.getMessage('browserAction_profileDetails_' + type) || null;
    }
  }

  upgrade(options: any, changes?: Record<string, any>): Promise<[any, Record<string, any>]> {
    return super.upgrade(options, changes).catch((err) => {
      if (options?.['schemaVersion']) {
        return Promise.reject(err);
      }
      
      let getOldOptions = this.switchySharp
        ? this.switchySharp.getOptions().timeout(1000)
        : Promise.reject();

      getOldOptions = getOldOptions.catch(() => {
        if (options?.['config']) {
          return Promise.resolve(options);
        } else if (localStorage['config']) {
          return Promise.resolve(localStorage);
        } else {
          return Promise.reject(new OmegaTarget.Options.NoOptionsError());
        }
      });

      return getOldOptions.then((oldOptions: any) => {
        const i18n = {
          upgrade_profile_auto: chrome.i18n.getMessage('upgrade_profile_auto')
        };
        
        let upgraded: any;
        try {
          // Upgrade from SwitchySharp.
          upgraded = require('./upgrade')(oldOptions, i18n);
        } catch (ex) {
          this.log.error(ex);
          return Promise.reject(ex);
        }
        
        if (localStorage['config']) {
          Object.getPrototypeOf(localStorage).clear.call(localStorage);
        }
        this._state.set({ 'firstRun': 'upgrade' });
        return super.upgrade(upgraded, upgraded);
      });
    });
  }

  onFirstRun(reason: string): void {
    chrome.tabs.create({ url: chrome.extension.getURL('options.html') });
  }

  getPageInfo({ tabId, url }: PageInfoRequest): Promise<PageInfoResult | null> {
    const errorCount = this._requestMonitor?.tabInfo[tabId]?.errorCount;
    const result: PageInfoResult | null = errorCount ? { errorCount } : null;
    
    const getBadge = new Promise<string>((resolve, reject) => {
      if (!chrome.browserAction.getBadgeText) {
        resolve('');
        return;
      }
      chrome.browserAction.getBadgeText({ tabId }, (badgeText) => {
        resolve(badgeText);
      });
    });

    const getInspectUrl = this._state.get({ inspectUrl: '' });
    
    return Promise.join(getBadge, getInspectUrl, (badge, { inspectUrl }) => {
      if (badge === '#' && inspectUrl) {
        url = inspectUrl;
      } else {
        this.clearBadge();
      }
      
      if (!url) return result;
      
      if (url.substr(0, 6) === 'chrome') {
        const errorPagePrefix = 'chrome://errorpage/';
        if (url.substr(0, errorPagePrefix.length) === errorPagePrefix) {
          const parsed = querystring.parse(url.substr(url.indexOf('?') + 1));
          url = parsed.lasturl as string;
          if (!url) return result;
        } else {
          return result;
        }
      }
      
      if (url.substr(0, 6) === 'about:') return result;
      if (url.substr(0, 4) === 'moz-') return result;
      
      const domain = OmegaPac.getBaseDomain(Url.parse(url).hostname);

      return {
        url,
        domain,
        tempRuleProfileName: this.queryTempRule(domain),
        errorCount
      };
    });
  }
}

export = ChromeOptions;

