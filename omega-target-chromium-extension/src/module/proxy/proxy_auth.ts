/** @module omega-target-chromium-extension/proxy/proxy_auth */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;
const Promise = OmegaTarget.Promise;

interface ProxyConfig {
  host: string;
  port: number;
  scheme?: string;
}

interface AuthCredentials {
  username: string;
  password: string;
}

interface ProxyWithAuth {
  config: ProxyConfig;
  auth: AuthCredentials;
  name: string;
}

interface FallbackAuth {
  auth: AuthCredentials;
  name: string;
}

interface RequestAuthInfo {
  authTries: number;
}

class ProxyAuth {
  log: typeof OmegaTarget.Log;
  listening: boolean = false;
  private _requests: Record<string, RequestAuthInfo> = {};
  private _proxies: Record<string, ProxyWithAuth[]> = {};
  private _fallbacks: FallbackAuth[] = [];

  constructor(log: typeof OmegaTarget.Log) {
    this._requests = {};
    this.log = log;
  }

  listen(): void {
    if (this.listening) return;
    
    if (!chrome.webRequest) {
      this.log.error('Proxy auth disabled! No webRequest permission.');
      return;
    }
    
    if (!chrome.webRequest.onAuthRequired) {
      this.log.error('Proxy auth disabled! onAuthRequired not available.');
      return;
    }
    
    chrome.webRequest.onAuthRequired.addListener(
      this.authHandler.bind(this),
      { urls: ['<all_urls>'] },
      ['blocking']
    );
    
    chrome.webRequest.onCompleted.addListener(
      this._requestDone.bind(this),
      { urls: ['<all_urls>'] }
    );
    
    chrome.webRequest.onErrorOccurred.addListener(
      this._requestDone.bind(this),
      { urls: ['<all_urls>'] }
    );
    
    this.listening = true;
  }

  private _keyForProxy(proxy: ProxyConfig): string {
    return `${proxy.host.toLowerCase()}:${proxy.port}`;
  }

  setProxies(profiles: any[]): void {
    this._proxies = {};
    this._fallbacks = [];
    
    for (const profile of profiles) {
      if (!profile.auth) continue;
      
      for (const scheme of OmegaPac.Profiles.schemes) {
        if (!profile[scheme.prop]) continue;
        
        const auth = profile.auth?.[scheme.prop];
        if (!auth) continue;
        
        const proxy = profile[scheme.prop];
        const key = this._keyForProxy(proxy);
        let list = this._proxies[key];
        
        if (!list) {
          list = this._proxies[key] = [];
        }
        
        list.push({
          config: proxy,
          auth,
          name: profile.name + '.' + scheme.prop
        });
      }

      const fallback = profile.auth?.['all'];
      if (fallback != null) {
        this._fallbacks.push({
          auth: fallback,
          name: profile.name + '.' + 'all'
        });
      }
    }
  }

  authHandler(details: chrome.webRequest.WebAuthenticationChallengeDetails): chrome.webRequest.BlockingResponse {
    if (!details.isProxy) return {};
    
    let req = this._requests[details.requestId];
    if (!req) {
      this._requests[details.requestId] = req = { authTries: 0 };
    }

    const key = this._keyForProxy({
      host: details.challenger.host,
      port: details.challenger.port
    });

    const list = this._proxies[key];
    const listLen = list ? list.length : 0;
    
    let proxy: ProxyWithAuth | FallbackAuth | undefined;
    if (req.authTries < listLen) {
      proxy = list[req.authTries];
    } else {
      proxy = this._fallbacks[req.authTries - listLen];
    }
    
    this.log.log('ProxyAuth', key, req.authTries, proxy?.name);

    if (!proxy) return {};
    
    req.authTries++;
    return { authCredentials: proxy.auth };
  }

  private _requestDone(details: chrome.webRequest.WebResponseDetails | chrome.webRequest.WebResponseErrorDetails): void {
    delete this._requests[details.requestId];
  }
}

export default ProxyAuth;

