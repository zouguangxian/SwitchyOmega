/** @module omega-target-chromium-extension/external_api */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;
const Promise = OmegaTarget.Promise;
import ChromePort from './chrome_port';

class ExternalApi {
  options: any;
  knownExts: Record<string, number> = {
    'padekgcemlokbadohgkifijomclgjgif': 32
  };
  disabled: boolean = false;
  private _previousProfileName: string | null = null;

  constructor(options: any) {
    this.options = options;
  }

  listen(): void {
    if (!chrome.runtime.onConnectExternal) return;
    
    chrome.runtime.onConnectExternal.addListener((rawPort) => {
      const port = new ChromePort(rawPort);
      port.onMessage.addListener((msg: any) => this.onMessage(msg, port));
      port.onDisconnect.addListener(this.reenable.bind(this));
    });
  }

  reenable(): void {
    if (!this.disabled) return;

    this.options.setProxyNotControllable(null);
    chrome.browserAction.setPopup?.({ popup: 'popup/index.html' });
    this.options.reloadQuickSwitch();
    this.disabled = false;
    this.options.clearBadge();
    this.options.applyProfile(this._previousProfileName);
  }

  checkPerm(port: chrome.runtime.Port, level: number): boolean {
    const perm = this.knownExts[port.sender!.id!] || 0;
    if (perm < level) {
      (port as any).postMessage({ action: 'error', error: 'permission' });
      return false;
    } else {
      return true;
    }
  }

  onMessage(msg: any, port: chrome.runtime.Port): void {
    this.options.log.log(`${port.sender!.id} -> ${msg.action}`, msg);
    
    switch (msg.action) {
      case 'disable':
        if (!this.checkPerm(port, 16)) return;
        if (this.disabled) return;
        
        this.disabled = true;
        this._previousProfileName = this.options.currentProfile()?.name || 'system';
        this.options.applyProfile('system').then(() => {
          let reason = 'disabled';
          if (this.knownExts[port.sender!.id!] >= 32) {
            reason = 'upgrade';
          }
          this.options.setProxyNotControllable(reason, { text: 'X', color: '#5ab432' });
        });
        chrome.browserAction.setPopup?.({ popup: 'popup/index.html' });
        (port as any).postMessage({ action: 'state', state: 'disabled' });
        break;
      
      case 'enable':
        this.reenable();
        (port as any).postMessage({ action: 'state', state: 'enabled' });
        break;
      
      case 'getOptions':
        if (!this.checkPerm(port, 8)) return;
        (port as any).postMessage({ action: 'options', options: this.options.getAll() });
        break;
      
      default:
        (port as any).postMessage({
          action: 'error',
          error: 'noSuchAction',
          action_name: msg.action
        });
    }
  }
}

export default ExternalApi;

