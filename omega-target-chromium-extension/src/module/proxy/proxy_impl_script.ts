/** @module omega-target-chromium-extension/proxy/proxy_impl_script */

import * as OmegaTarget from 'omega-target';
const Promise = OmegaTarget.Promise;
import ProxyImpl = require('./proxy_impl');

class ScriptProxyImpl extends ProxyImpl {
  features = ['socks5Auth'];
  
  private _proxyScriptUrl: string = 'js/omega_webext_proxy_script.min.js';
  private _proxyScriptDisabled: boolean = false;
  private _proxyScriptInitialized: boolean = false;
  private _proxyScriptState: any = {};
  private _options: any;

  static isSupported(): boolean {
    return !!(browser as any)?.proxy?.register || !!(browser as any)?.proxy?.registerProxyScript;
  }

  watchProxyChange(callback: (details: any) => void): null {
    return null;
  }

  applyProfile(profile: any, state: any, options: any): Promise<void> {
    this.log.error(
      'Your browser is outdated! Full-URL based matching, etc. unsupported! ' +
      "Please update your browser ASAP!"
    );
    
    state = state || {};
    this._options = options;
    state.currentProfileName = profile.name;
    
    if (profile.name === '') {
      state.tempProfile = profile;
    }
    
    if (profile.profileType === 'SystemProfile') {
      // MOZ: SystemProfile cannot be done now due to lack of "PASS" support.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1319634
      // In the mean time, let's just unregister the script.
      if ((browser as any).proxy.unregister) {
        (browser as any).proxy.unregister();
      } else {
        // Some older browsers may not ship with .unregister API.
        // In that case, let's just set an invalid script to unregister it.
        (browser as any).proxy.registerProxyScript('js/omega_invalid_proxy_script.js');
      }
      this._proxyScriptDisabled = true;
    } else {
      this._proxyScriptState = state;
      Promise.all([
        (browser as any).runtime.getBrowserInfo(),
        this._initWebextProxyScript(),
      ]).then(([info]) => {
        if (info.vendor === 'Mozilla' && info.buildID < '20170918220054') {
          // MOZ: Legacy proxy support expects PAC-like string return type.
          // TODO(catus): Remove support for string return type.
          this.log.error(
            'Your browser is outdated! SOCKS5 DNS/Auth unsupported! ' +
            `Please update your browser ASAP! (Current Build ${info.buildID})`
          );
          this._proxyScriptState.useLegacyStringReturn = true;
        }
        this._proxyScriptStateChanged();
      });
    }
    
    return this.setProxyAuth(profile, options);
  }

  private _initWebextProxyScript(): Promise<void> {
    if (!this._proxyScriptInitialized) {
      (browser as any).proxy.onProxyError.addListener((err: any) => {
        if (err?.message) {
          if (err.message.indexOf('Invalid Proxy Rule: DIRECT') >= 0) {
            // DIRECT cannot be parsed in Mozilla earlier due to a bug. Even
            // though it throws, it actually falls back to direct connection
            // so it works.
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1355198
            return;
          }
          if (err.message.indexOf('Return type must be a string') >= 0) {
            // MOZ: Legacy proxy support expects PAC-like string return type.
            // TODO(catus): Remove support for string return type.
            this.log.error(
              'Your browser is outdated! SOCKS5 DNS/Auth unsupported! ' +
              'Please update your browser ASAP!'
            );
            this._proxyScriptState.useLegacyStringReturn = true;
            this._proxyScriptStateChanged();
            return;
          }
        }
        this.log.error(err);
      });
      
      (browser as any).runtime.onMessage.addListener((message: any) => {
        if (message.event !== 'proxyScriptLog') return;
        
        if (message.level === 'error') {
          this.log.error(message);
        } else if (message.level === 'warn') {
          this.log.error(message);
        } else {
          this.log.log(message);
        }
      });
    }

    let promise: Promise<void>;
    
    if (!this._proxyScriptInitialized || this._proxyScriptDisabled) {
      promise = new Promise<void>((resolve) => {
        const onMessage = (message: any) => {
          if (message.event !== 'proxyScriptLoaded') return;
          resolve();
          (browser as any).runtime.onMessage.removeListener(onMessage);
        };
        (browser as any).runtime.onMessage.addListener(onMessage);
      });
      
      // The API has been renamed to .register but for some old browsers' sake:
      if ((browser as any).proxy.register) {
        (browser as any).proxy.register(this._proxyScriptUrl);
      } else {
        (browser as any).proxy.registerProxyScript(this._proxyScriptUrl);
      }
      this._proxyScriptDisabled = false;
    } else {
      promise = Promise.resolve();
    }
    
    this._proxyScriptInitialized = true;
    return promise;
  }

  private _proxyScriptStateChanged(): void {
    (browser as any).runtime.sendMessage({
      event: 'proxyScriptStateChanged',
      state: this._proxyScriptState,
      options: this._options
    }, {
      toProxyScript: true
    });
  }
}

export = ScriptProxyImpl;

