/** @module omega-target-chromium-extension/web_request_monitor */

import Heap from 'heap';
import * as Url from 'url';

type RequestEventStatus = 'start' | 'ongoing' | 'timeout' | 'error' | 'timeoutAbort' | 'done';
type RequestEventCategory = 'ongoing' | 'error' | 'done';

interface ExtendedWebRequest extends chrome.webRequest.WebRequestDetails {
  _startTime?: number;
  timeoutCalled?: boolean;
  noTimeout?: boolean;
}

interface TabInfo {
  requests: Record<string, ExtendedWebRequest>;
  requestCount: number;
  requestStatus: Record<string, RequestEventStatus>;
  ongoingCount: number;
  errorCount: number;
  doneCount: number;
  summary: Record<string, SummaryItem>;
  badgeSet?: boolean;
}

interface SummaryItem {
  errorCount: number;
}

type RequestCallback = (status: RequestEventStatus, req: ExtendedWebRequest) => void;
type TabCallback = (tabId: number, info: TabInfo, req: ExtendedWebRequest | null, status: RequestEventStatus | 'updated') => void;
type GetSummaryIdFn = (req: ExtendedWebRequest) => string | undefined;

class WebRequestMonitor {
  getSummaryId: GetSummaryIdFn | undefined;
  private _requests: Record<string, ExtendedWebRequest> = {};
  private _recentRequests: any; // Heap instance
  private _callbacks: RequestCallback[] = [];
  private _tabCallbacks: TabCallback[] = [];
  tabInfo: Record<number, TabInfo> = {};
  
  watching: boolean = false;
  tabsWatching: boolean = false;
  timer: NodeJS.Timeout | null = null;

  eventCategory: Record<RequestEventStatus, RequestEventCategory> = {
    start: 'ongoing',
    ongoing: 'ongoing',
    timeout: 'error',
    error: 'error',
    timeoutAbort: 'error',
    done: 'done'
  };

  constructor(getSummaryId?: GetSummaryIdFn) {
    this.getSummaryId = getSummaryId;
    this._recentRequests = new Heap((a: ExtendedWebRequest, b: ExtendedWebRequest) => 
      (a._startTime || 0) - (b._startTime || 0)
    );
  }

  watch(callback: RequestCallback): void {
    this._callbacks.push(callback);
    if (this.watching) return;
    
    if (!chrome.webRequest) {
      console.log('Request monitor disabled! No webRequest permission.');
      return;
    }
    
    chrome.webRequest.onBeforeRequest.addListener(
      this._requestStart.bind(this),
      { urls: ['<all_urls>'] }
    );
    
    chrome.webRequest.onHeadersReceived.addListener(
      this._requestHeadersReceived.bind(this),
      { urls: ['<all_urls>'] }
    );
    
    chrome.webRequest.onBeforeRedirect.addListener(
      this._requestRedirected.bind(this),
      { urls: ['<all_urls>'] }
    );
    
    chrome.webRequest.onCompleted.addListener(
      this._requestDone.bind(this),
      { urls: ['<all_urls>'] }
    );
    
    chrome.webRequest.onErrorOccurred.addListener(
      this._requestError.bind(this),
      { urls: ['<all_urls>'] }
    );
    
    this.watching = true;
  }

  private _requestStart(req: ExtendedWebRequest): void {
    if (req.tabId < 0) return;
    
    req._startTime = Date.now();
    this._requests[req.requestId] = req;
    this._recentRequests.push(req);
    
    if (!this.timer) {
      this.timer = setInterval(this._tick.bind(this), 1000);
    }
    
    for (const callback of this._callbacks) {
      callback('start', req);
    }
  }

  private _tick(): void {
    const now = Date.now();
    
    while (true) {
      const req = this._recentRequests.peek();
      if (!req) break;
      
      const reqInfo = this._requests[req.requestId];
      if (reqInfo && !reqInfo.noTimeout) {
        if (now - (req._startTime || 0) < 5000) {
          break;
        } else {
          reqInfo.timeoutCalled = true;
          for (const callback of this._callbacks) {
            callback('timeout', reqInfo);
          }
        }
      }
      this._recentRequests.pop();
    }
  }

  private _requestHeadersReceived(req: ExtendedWebRequest): void {
    const reqInfo = this._requests[req.requestId];
    if (!reqInfo) return;
    
    reqInfo.noTimeout = true;
    if (reqInfo.timeoutCalled) {
      for (const callback of this._callbacks) {
        callback('ongoing', req);
      }
    }
  }

  private _requestRedirected(req: chrome.webRequest.WebRedirectionResponseDetails): void {
    const url = req.redirectUrl;
    if (!url) return;
    
    if (url.indexOf('data:') === 0 || url.indexOf('about:') === 0) {
      this._requestDone(req as ExtendedWebRequest);
    }
  }

  private _requestError(req: chrome.webRequest.WebResponseErrorDetails): void {
    const reqInfo = this._requests[req.requestId];
    delete this._requests[req.requestId];

    if (req.tabId < 0) return;
    if (req.error === 'net::ERR_INCOMPLETE_CHUNKED_ENCODING') return;
    if (req.error.indexOf('BLOCKED') >= 0) return;
    if (req.error.indexOf('net::ERR_FILE_') === 0) return;
    // Blocked by other extensions in Firefox.
    if (req.error.indexOf('NS_ERROR_ABORT') === 0) return;
    if (req.url.indexOf('file:') === 0) return;
    if (req.url.indexOf('chrome') === 0) return;
    if (req.url.indexOf('about:') === 0) return;
    if (req.url.indexOf('moz-') === 0) return;
    // Some ad-blocking extensions may redirect requests to 127.0.0.1.
    if (req.url.indexOf('://127.0.0.1') > 0) return;
    if (!reqInfo) return;
    
    if (req.error === 'net::ERR_ABORTED') {
      if (reqInfo.timeoutCalled && !reqInfo.noTimeout) {
        for (const callback of this._callbacks) {
          callback('timeoutAbort', req as ExtendedWebRequest);
        }
      }
      return;
    }
    
    for (const callback of this._callbacks) {
      callback('error', req as ExtendedWebRequest);
    }
  }

  private _requestDone(req: ExtendedWebRequest): void {
    for (const callback of this._callbacks) {
      callback('done', req);
    }
    delete this._requests[req.requestId];
  }

  watchTabs(callback: TabCallback): void {
    this._tabCallbacks.push(callback);
    if (this.tabsWatching) return;
    
    this.watch(this.setTabRequestInfo.bind(this));
    this.tabsWatching = true;
    
    chrome.tabs.onCreated.addListener((tab) => {
      if (!tab.id) return;
      this.tabInfo[tab.id] = this._newTabInfo();
    });
    
    chrome.tabs.onRemoved.addListener((tabId) => {
      delete this.tabInfo[tabId];
    });
    
    chrome.tabs.onReplaced?.addListener((addedTabId, removedTabId) => {
      if (!this.tabInfo[addedTabId]) {
        this.tabInfo[addedTabId] = this._newTabInfo();
      }
      delete this.tabInfo[removedTabId];
    });
    
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!tab.id) return;
      let info = this.tabInfo[tab.id];
      if (!info) {
        info = this.tabInfo[tab.id] = this._newTabInfo();
      }
      
      for (const cb of this._tabCallbacks) {
        cb(tab.id, info, null, 'updated');
      }
    });
    
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id && !this.tabInfo[tab.id]) {
          this.tabInfo[tab.id] = this._newTabInfo();
        }
      }
    });
  }

  private _newTabInfo(): TabInfo {
    return {
      requests: {},
      requestCount: 0,
      requestStatus: {},
      ongoingCount: 0,
      errorCount: 0,
      doneCount: 0,
      summary: {}
    };
  }

  setTabRequestInfo(status: RequestEventStatus, req: ExtendedWebRequest): void {
    const info = this.tabInfo[req.tabId];
    if (!info) return;
    
    if (status === 'start' && req.type === 'main_frame') {
      if (req.url.indexOf('chrome://errorpage/') !== 0) {
        const newInfo = this._newTabInfo();
        for (const key in newInfo) {
          if (newInfo.hasOwnProperty(key)) {
            (info as any)[key] = (newInfo as any)[key];
          }
        }
      }
    }
    
    if (info.requestCount > 1000) return;
    
    info.requests[req.requestId] = req;
    const oldStatus = info.requestStatus[req.requestId];
    
    if (oldStatus) {
      const categoryKey = this.eventCategory[oldStatus] + 'Count' as keyof TabInfo;
      (info[categoryKey] as number)--;
    } else {
      if (status === 'timeoutAbort') return;
      info.requestCount++;
    }
    
    info.requestStatus[req.requestId] = status;
    const newCategoryKey = this.eventCategory[status] + 'Count' as keyof TabInfo;
    (info[newCategoryKey] as number)++;
    
    const id = this.getSummaryId?.(req);
    if (id != null) {
      if (this.eventCategory[status] === 'error') {
        if (this.eventCategory[oldStatus] !== 'error') {
          let summaryItem = info.summary[id];
          if (!summaryItem) {
            summaryItem = info.summary[id] = { errorCount: 0 };
          }
          summaryItem.errorCount++;
        }
      } else if (oldStatus && this.eventCategory[oldStatus] === 'error') {
        const summaryItem = info.summary[id];
        if (summaryItem) {
          summaryItem.errorCount--;
        }
      }
    }
    
    for (const callback of this._tabCallbacks) {
      callback(req.tabId, info, req, status);
    }
  }
}

export default WebRequestMonitor;

