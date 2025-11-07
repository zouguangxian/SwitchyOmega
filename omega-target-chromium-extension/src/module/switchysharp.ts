/** @module omega-target-chromium-extension/switchysharp */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;
const Promise = OmegaTarget.Promise;
import ChromePort = require('./chrome_port');

class SwitchySharp {
  static extId: string = 'dpplabbmogkhghncfbfdeeokoefdjegm';
  
  port: ChromePort | null = null;
  private _getOptions: Promise<any> | null = null;
  private _getOptionsResolver: ((options: any) => void) | null = null;
  private _monitorTimerId: NodeJS.Timeout | null = null;

  monitor(action?: string): void {
    if (location.href.substr(0, 4) === 'moz-') return;
    
    if (!this.port && !this._monitorTimerId) {
      this._monitorTimerId = setInterval(this._connect.bind(this), 5000);
      if (action !== 'reconnect') {
        this._connect();
      }
    }
  }

  getOptions(): Promise<any> {
    if (!this._getOptions) {
      this._getOptions = new Promise((resolve) => {
        this._getOptionsResolver = resolve;
        this.monitor();
      });
    }
    return this._getOptions;
  }

  private _onMessage(msg: any): void {
    if (this._monitorTimerId) {
      clearInterval(this._monitorTimerId);
      this._monitorTimerId = null;
    }
    
    switch (msg?.action) {
      case 'state':
        // State changed.
        OmegaTarget.Log.log(msg);
        if (this._getOptionsResolver && this.port) {
          this.port.postMessage({ action: 'getOptions' });
        }
        break;
      
      case 'options':
        if (this._getOptionsResolver) {
          this._getOptionsResolver(msg.options);
        }
        this._getOptionsResolver = null;
        break;
    }
  }

  private _onDisconnect(msg: any): void {
    this.port = null;
    this._getOptions = null;
    this._getOptionsResolver = null;
    this.monitor('reconnect');
  }

  private _connect(): boolean {
    if (!this.port) {
      this.port = new ChromePort(chrome.runtime.connect(SwitchySharp.extId));
      this.port.onDisconnect.addListener(this._onDisconnect.bind(this));
      this.port.onMessage.addListener(this._onMessage.bind(this));
    }
    
    try {
      this.port.postMessage({ action: 'disable' });
    } catch (e) {
      this.port = null;
    }
    
    return this.port != null;
  }
}

export = SwitchySharp;

