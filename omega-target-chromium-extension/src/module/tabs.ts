/** @module omega-target-chromium-extension/tabs */

interface TabAction {
  title: string;
  shortTitle: string;
  icon: any;
  resultColor?: string;
  profileColor?: string;
}

interface TabBadge {
  text: string;
  color: string;
}

class ChromeTabs {
  actionForUrl: (url: string) => Promise<TabAction | null>;
  private _defaultAction: TabAction | null = null;
  private _badgeTab: Record<number, boolean> | null = null;
  private _dirtyTabs: Record<number, number> = {};

  constructor(actionForUrl: (url: string) => Promise<TabAction | null>) {
    this.actionForUrl = actionForUrl;
  }

  ignoreError(): void {
    // Access chrome.runtime.lastError to acknowledge it
    chrome.runtime.lastError;
  }

  watch(): void {
    chrome.tabs.onUpdated.addListener(this.onUpdated.bind(this));
    chrome.tabs.onActivated.addListener((info) => {
      chrome.tabs.get(info.tabId, (tab) => {
        if (chrome.runtime.lastError) return;
        if (this._dirtyTabs.hasOwnProperty(info.tabId)) {
          this.onUpdated(tab.id!, {}, tab);
        }
      });
    });
  }

  resetAll(action: TabAction): void {
    this._defaultAction = action;
    chrome.tabs.query({}, (tabs) => {
      this._dirtyTabs = {};
      tabs.forEach((tab) => {
        if (tab.id != null) {
          this._dirtyTabs[tab.id] = tab.id;
          if (tab.active) {
            this.onUpdated(tab.id, {}, tab);
          }
        }
      });
    });
    
    if (chrome.action.setPopup) {
      chrome.action.setTitle({ title: action.title });
    } else {
      chrome.action.setTitle({ title: action.shortTitle });
    }
    this.setIcon(action.icon);
  }

  onUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
    if (this._dirtyTabs.hasOwnProperty(tab.id!)) {
      delete this._dirtyTabs[tab.id!];
    } else if (changeInfo.url == null) {
      if (changeInfo.status != null && changeInfo.status !== 'loading') {
        return;
      }
    }
    this.processTab(tab, changeInfo);
  }

  processTab(tab: chrome.tabs.Tab, changeInfo?: chrome.tabs.TabChangeInfo): void {
    if (this._badgeTab) {
      for (const id in this._badgeTab) {
        if (this._badgeTab.hasOwnProperty(id)) {
          try {
            chrome.action.setBadgeText?.({ text: '', tabId: parseInt(id) });
          } catch (e) {
            // Ignore errors
          }
        }
      }
      this._badgeTab = null;
    }

    if (!tab.url || tab.url.indexOf("chrome") === 0) {
      if (this._defaultAction && tab.id != null) {
        chrome.action.setTitle({
          title: this._defaultAction.title,
          tabId: tab.id
        });
        this.clearIcon(tab.id);
      }
      return;
    }
    
    this.actionForUrl(tab.url).then((action) => {
      if (!action) {
        if (tab.id != null) {
          this.clearIcon(tab.id);
        }
        return;
      }
      if (tab.id != null) {
        this.setIcon(action.icon, tab.id);
        if (chrome.action.setPopup) {
          chrome.action.setTitle({ title: action.title, tabId: tab.id });
        } else {
          chrome.action.setTitle({ title: action.shortTitle, tabId: tab.id });
        }
      }
    });
  }

  setTabBadge(tab: chrome.tabs.Tab, badge: TabBadge): void {
    if (!this._badgeTab) {
      this._badgeTab = {};
    }
    if (tab.id != null) {
      this._badgeTab[tab.id] = true;
      chrome.action.setBadgeText?.({ text: badge.text, tabId: tab.id });
      chrome.action.setBadgeBackgroundColor?.({
        color: badge.color,
        tabId: tab.id
      });
    }
  }

  setIcon(icon: any, tabId?: number): void {
    if (icon == null) return;
    
    const params: any = {
      imageData: icon
    };
    if (tabId != null) {
      params.tabId = tabId;
    }
    this._chromeSetIcon(params);
  }

  private _chromeSetIcon(params: any): void {
    try {
      chrome.action.setIcon?.(params, this.ignoreError);
    } catch (e) {
      // Some legacy Chrome versions will panic if there are other icon sizes.
      params.imageData = { 19: params.imageData[19], 38: params.imageData[38] };
      chrome.action.setIcon?.(params, this.ignoreError);
    }
  }

  clearIcon(tabId: number): void {
    if (!this._defaultAction?.icon) return;
    this._chromeSetIcon({
      imageData: this._defaultAction.icon,
      tabId: tabId
    });
  }
}

export default ChromeTabs;

