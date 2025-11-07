/** @module omega-target-chromium-extension/proxy/proxy_impl_settings */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;
const Promise = OmegaTarget.Promise;
import { chromeApiPromisify } from '../chrome_api';
import ProxyImpl = require('./proxy_impl');

interface ProxyConfig {
  mode?: string;
  pacScript?: {
    url?: string;
    data?: string;
    mandatory?: boolean;
  };
  rules?: any;
}

class SettingsProxyImpl extends ProxyImpl {
  features = ['fullUrlHttp', 'pacScript', 'watchProxyChange'];
  private _proxyChangeWatchers: ((details: any) => void)[] | null = null;

  static isSupported(): boolean {
    return !!(chrome as any)?.proxy?.settings;
  }

  applyProfile(profile: any, meta?: any, options?: any): Promise<void> {
    if (!meta) {
      meta = profile;
    }
    
    if (profile.profileType === 'SystemProfile') {
      // Clear proxy settings, returning proxy control to Chromium.
      return chromeApiPromisify(chrome.proxy.settings, 'clear')({}).then(() => {
        chrome.proxy.settings.get({}, this._proxyChangeListener.bind(this));
      });
    }
    
    let config: ProxyConfig = {};
    
    if (profile.profileType === 'DirectProfile') {
      config['mode'] = 'direct';
    } else if (profile.profileType === 'PacProfile') {
      config['mode'] = 'pac_script';
      
      config['pacScript'] = 
        (!profile.pacScript || OmegaPac.Profiles.isFileUrl(profile.pacUrl))
          ? {
              url: profile.pacUrl,
              mandatory: true
            }
          : {
              data: OmegaPac.PacGenerator.ascii(profile.pacScript),
              mandatory: true
            };
    } else if (profile.profileType === 'FixedProfile') {
      config = this._fixedProfileConfig(profile);
    } else {
      config['mode'] = 'pac_script';
      config['pacScript'] = {
        mandatory: true,
        data: this.getProfilePacScript(profile, meta, options)
      };
    }
    
    return this.setProxyAuth(profile, options).then(() => {
      return chromeApiPromisify(chrome.proxy.settings, 'set')({ value: config });
    }).then(() => {
      chrome.proxy.settings.get({}, this._proxyChangeListener.bind(this));
    });
  }

  private _fixedProfileConfig(profile: any): ProxyConfig {
    const config: ProxyConfig = {};
    config['mode'] = 'fixed_servers';
    const rules: any = {};
    const protocols = ['proxyForHttp', 'proxyForHttps', 'proxyForFtp'];
    let protocolProxySet = false;
    
    for (const protocol of protocols) {
      if (profile[protocol] != null) {
        rules[protocol] = profile[protocol];
        protocolProxySet = true;
      }
    }

    if (profile.fallbackProxy) {
      if (profile.fallbackProxy.scheme === 'http') {
        // Chromium does not allow HTTP proxies in 'fallbackProxy'.
        if (!protocolProxySet) {
          // Use 'singleProxy' if no proxy is configured for other protocols.
          rules['singleProxy'] = profile.fallbackProxy;
        } else {
          // Try to set the proxies of all possible protocols.
          for (const protocol of protocols) {
            if (!rules[protocol]) {
              rules[protocol] = JSON.parse(JSON.stringify(profile.fallbackProxy));
            }
          }
        }
      } else {
        rules['fallbackProxy'] = profile.fallbackProxy;
      }
    } else if (!protocolProxySet) {
      config['mode'] = 'direct';
    }

    if (config['mode'] !== 'direct') {
      const bypassList: string[] = [];
      for (const condition of profile.bypassList) {
        bypassList.push(this._formatBypassItem(condition));
      }
      rules['bypassList'] = bypassList;
      config['rules'] = rules;
    }
    
    return config;
  }

  private _formatBypassItem(condition: any): string {
    const str = OmegaPac.Conditions.str(condition);
    const i = str.indexOf(' ');
    return str.substr(i + 1);
  }

  private _proxyChangeListener(details: any): void {
    for (const watcher of (this._proxyChangeWatchers || [])) {
      watcher(details);
    }
  }

  watchProxyChange(callback: (details: any) => void): void {
    if (!this._proxyChangeWatchers) {
      this._proxyChangeWatchers = [];
      if (chrome?.proxy?.settings?.onChange) {
        chrome.proxy.settings.onChange.addListener(
          this._proxyChangeListener.bind(this)
        );
      }
    }
    this._proxyChangeWatchers.push(callback);
  }

  parseExternalProfile(details: any, options: any): any {
    if (details.name) {
      return details;
    }
    
    switch (details.value.mode) {
      case 'system':
        return OmegaPac.Profiles.byName('system');
      
      case 'direct':
        return OmegaPac.Profiles.byName('direct');
      
      case 'auto_detect':
        return OmegaPac.Profiles.create({
          profileType: 'PacProfile',
          name: '',
          pacUrl: 'http://wpad/wpad.dat'
        });
      
      case 'pac_script': {
        const url = details.value.pacScript.url;
        if (url) {
          let profile: any = null;
          OmegaPac.Profiles.each(options, (key: string, p: any) => {
            if (p.profileType === 'PacProfile' && p.pacUrl === url) {
              profile = p;
            }
          });
          return profile || OmegaPac.Profiles.create({
            profileType: 'PacProfile',
            name: '',
            pacUrl: url
          });
        } else {
          let profile: any = null;
          let script = details.value.pacScript.data;
          OmegaPac.Profiles.each(options, (key: string, p: any) => {
            if (p.profileType === 'PacProfile' && p.pacScript === script) {
              profile = p;
            }
          });
          
          if (profile) return profile;
          
          // Try to parse the prefix used by this class.
          script = script.trim();
          const magic = '/*OmegaProfile*';
          if (script.substr(0, magic.length) === magic) {
            const end = script.indexOf('*/');
            if (end > 0) {
              const tokens = script.substring(magic.length, end).split('*');
              let [profileName, revision] = tokens;
              
              try {
                profileName = JSON.parse(profileName);
              } catch (e) {
                profileName = null;
              }
              
              if (profileName && revision) {
                profile = OmegaPac.Profiles.byName(profileName, options);
                if (profile && OmegaPac.Revision.compare(profile.revision, revision) === 0) {
                  return profile;
                }
              }
            }
          }
          
          return OmegaPac.Profiles.create({
            profileType: 'PacProfile',
            name: '',
            pacScript: script
          });
        }
      }
      
      case 'fixed_servers': {
        const props = ['proxyForHttp', 'proxyForHttps', 'proxyForFtp',
          'fallbackProxy', 'singleProxy'];
        const proxies: Record<string, string> = {};
        
        for (const prop of props) {
          const result = OmegaPac.Profiles.pacResult(details.value.rules[prop]);
          if (prop === 'singleProxy' && details.value.rules[prop] != null) {
            proxies['fallbackProxy'] = result;
          } else {
            proxies[prop] = result;
          }
        }
        
        const bypassSet: Record<string, boolean> = {};
        let bypassCount = 0;
        
        if (details.value.rules.bypassList) {
          for (const pattern of details.value.rules.bypassList) {
            bypassSet[pattern] = true;
            bypassCount++;
          }
        }
        
        if (bypassSet['<local>']) {
          for (const host of OmegaPac.Conditions.localHosts) {
            if (bypassSet[host]) {
              delete bypassSet[host];
              bypassCount--;
            }
          }
        }
        
        let profile: any = null;
        OmegaPac.Profiles.each(options, (key: string, p: any) => {
          if (p.profileType !== 'FixedProfile') return;
          if (p.bypassList.length !== bypassCount) return;
          
          for (const condition of p.bypassList) {
            if (!bypassSet[condition.pattern]) return;
          }
          
          const rules = this._fixedProfileConfig(p).rules;
          if (rules['singleProxy']) {
            rules['fallbackProxy'] = rules['singleProxy'];
            delete rules['singleProxy'];
          }
          
          if (!rules) return;
          
          for (const prop of props) {
            if (rules[prop] || proxies[prop]) {
              if (OmegaPac.Profiles.pacResult(rules[prop]) !== proxies[prop]) {
                return;
              }
            }
          }
          
          profile = p;
        });
        
        if (profile) {
          return profile;
        } else {
          profile = OmegaPac.Profiles.create({
            profileType: 'FixedProfile',
            name: ''
          });
          
          for (const prop of props) {
            if (details.value.rules[prop]) {
              if (prop === 'singleProxy') {
                profile['fallbackProxy'] = details.value.rules[prop];
              } else {
                profile[prop] = details.value.rules[prop];
              }
            }
          }
          
          profile.bypassList = [];
          for (const pattern in bypassSet) {
            if (bypassSet.hasOwnProperty(pattern)) {
              profile.bypassList.push({
                conditionType: 'BypassCondition',
                pattern
              });
            }
          }
          
          return profile;
        }
      }
    }
  }
}

export = SettingsProxyImpl;

