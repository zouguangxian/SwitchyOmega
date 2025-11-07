/** @module omega-target-chromium-extension/proxy/proxy_impl_listener */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;
// The browser only accepts native promises as onRequest return values.
// DO NOT USE Bluebird Promises here!
const NativePromise = Promise;
import ProxyImpl = require('./proxy_impl');

interface ProxyInfo {
  type: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  proxyDNS?: boolean;
}

class ListenerProxyImpl extends ProxyImpl {
  features = ['fullUrl', 'socks5Auth'];
  
  private _options: any;
  private _profile: any;
  private _optionsReady: Promise<void>;
  private _optionsReadyCallback: (() => void) | null;

  static isSupported(): boolean {
    return typeof Promise !== 'undefined' && !!(browser as any)?.proxy?.onRequest;
  }

  constructor(log: typeof OmegaTarget.Log) {
    super(log);
    this._optionsReady = new NativePromise<void>((resolve) => {
      this._optionsReadyCallback = resolve;
    });
    // We want to register listeners early so that it can start blocking requests
    // when starting the browser & extension, returning correct results later.
    this._initRequestListeners();
  }

  private _initRequestListeners(): void {
    (browser as any).proxy.onRequest.addListener(
      this.onRequest.bind(this),
      { urls: ["<all_urls>"] }
    );
    (browser as any).proxy.onError.addListener(this.onError.bind(this));
  }

  watchProxyChange(callback: (details: any) => void): null {
    return null;
  }

  applyProfile(profile: any, state: any, options: any): Promise<void> {
    this._options = options;
    this._profile = profile;
    
    if (this._optionsReadyCallback) {
      this._optionsReadyCallback();
    }
    this._optionsReadyCallback = null;
    
    return this.setProxyAuth(profile, options);
  }

  private onRequest(requestDetails: any): Promise<ProxyInfo[] | undefined> {
    // The browser only recognizes native promises return values, not Bluebird.
    return NativePromise.resolve(this._optionsReady.then(() => {
      const request = OmegaPac.Conditions.requestFromUrl(requestDetails.url);
      let profile = this._profile;
      
      while (profile) {
        const result = OmegaPac.Profiles.match(profile, request);
        
        if (!result) {
          switch (profile.profileType) {
            case 'DirectProfile':
              return [{ type: 'direct', host: '', port: 0 }];
            case 'SystemProfile':
              // Returning undefined means using the default proxy from previous.
              // https://hg.mozilla.org/mozilla-central/rev/9f0ee2f582a2#l1.337
              return undefined;
            default:
              throw new Error('Unsupported profile: ' + profile.profileType);
          }
        }
        
        let next: string;
        if (Array.isArray(result)) {
          const proxy = result[2];
          const auth = result[3];
          if (proxy) {
            return this.proxyInfo(proxy, auth);
          }
          next = result[0];
        } else if (result.profileName) {
          next = OmegaPac.Profiles.nameAsKey(result.profileName);
        } else {
          break;
        }
        
        profile = OmegaPac.Profiles.byKey(next, this._options);
      }

      throw new Error('Profile not found');
    }));
  }

  private onError(error: any): void {
    this.log.error(error);
  }

  private proxyInfo(proxy: any, auth: any): ProxyInfo[] {
    const proxyInfo: ProxyInfo = {
      type: proxy.scheme,
      host: proxy.host,
      port: proxy.port
    };
    
    if (proxyInfo.type === 'socks5') {
      // MOZ: SOCKS5 proxies should be specified as "type": "socks".
      // https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/proxy/ProxyInfo
      proxyInfo.type = 'socks';
      
      if (auth) {
        // Username & password here are only available for SOCKS5.
        // https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/proxy/ProxyInfo
        // HTTP proxy auth must be handled via webRequest.onAuthRequired.
        proxyInfo.username = auth.username;
        proxyInfo.password = auth.password;
      }
    }
    
    if (proxyInfo.type === 'socks') {
      // Enable SOCKS remote DNS.
      // TODO(catus): Maybe allow the users to configure this?
      proxyInfo.proxyDNS = true;
    }

    // TODO(catus): Maybe allow proxyDNS for socks4? Server may support SOCKS4a.
    // It cannot default to true though, since SOCKS4 servers that does not have
    // the SOCKS4a extension may simply refuse to work.

    return [proxyInfo];
  }
}

export = ListenerProxyImpl;

