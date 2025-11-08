/** @module omega-target-chromium-extension/inspect */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;

type OnInspectCallback = (url: string, tab: chrome.tabs.Tab) => void;

class Inspect {
  private _enabled: boolean = false;
  private onInspect: OnInspectCallback;

  constructor(onInspect: OnInspectCallback) {
    this.onInspect = onInspect;
  }

  enable(): void {
    if (!chrome.contextMenus) return;
    // We don't need this API. However its presence indicates that Chrome >= 35,
    // which provides the menuItemId we need in contextMenu callback.
    // https://developer.chrome.com/extensions/contextMenus
    if (!(chrome.i18n as any).getUILanguage) return;

    if (this._enabled) return;

    const webResource = [
      "http://*/*",
      "https://*/*",
      "ftp://*/*"
    ];

    /* Not so useful...
    chrome.contextMenus.create({
      id: 'inspectPage',
      title: chrome.i18n.getMessage('contextMenu_inspectPage'),
      contexts: ['page'],
      onclick: this.inspect.bind(this),
      documentUrlPatterns: webResource
    });
    */

    chrome.contextMenus.create({
      id: 'inspectFrame',
      title: chrome.i18n.getMessage('contextMenu_inspectFrame') || 'Inspect Frame',
      contexts: ['frame'],
      onclick: this.inspect.bind(this) as any,
      documentUrlPatterns: webResource
    });

    chrome.contextMenus.create({
      id: 'inspectLink',
      title: chrome.i18n.getMessage('contextMenu_inspectLink') || 'Inspect Link',
      contexts: ['link'],
      onclick: this.inspect.bind(this) as any,
      targetUrlPatterns: webResource
    });

    chrome.contextMenus.create({
      id: 'inspectElement',
      title: chrome.i18n.getMessage('contextMenu_inspectElement') || 'Inspect Element',
      contexts: ['image', 'video', 'audio'],
      onclick: this.inspect.bind(this) as any,
      targetUrlPatterns: webResource
    });

    this._enabled = true;
  }

  disable(): void {
    if (!this._enabled) return;
    
    for (const menuId in this.propForMenuItem) {
      if (this.propForMenuItem.hasOwnProperty(menuId)) {
        try {
          chrome.contextMenus.remove(menuId);
        } catch (e) {
          // Ignore errors
        }
      }
    }
    this._enabled = false;
  }

  propForMenuItem: Record<string, string> = {
    'inspectPage': 'pageUrl',
    'inspectFrame': 'frameUrl',
    'inspectLink': 'linkUrl',
    'inspectElement': 'srcUrl'
  };

  inspect(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): void {
    if (!info.menuItemId) return;
    
    const menuItemId = info.menuItemId as string;
    let url = (info as any)[this.propForMenuItem[menuItemId]];
    
    if (!url && menuItemId === 'inspectPage' && tab) {
      url = tab.url;
    }
    if (!url || !tab) return;

    this.onInspect(url, tab);
  }
}

export default Inspect;

