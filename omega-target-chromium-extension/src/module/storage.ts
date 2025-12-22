/** @module omega-target-chromium-extension/storage */

import { chromeApiPromisify } from './chrome_api';
import * as OmegaTarget from 'omega-target';

type StorageKeys = string | string[] | Record<string, any> | null;

interface ChromeStorageAPI {
  get: (keys: StorageKeys) => Promise<Record<string, any>>;
  set: (items: Record<string, any>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
}

class ChromeStorage extends OmegaTarget.Storage {
  storage: ChromeStorageAPI;
  areaName: string;

  static onChangedListenerInstalled: boolean = false;
  static watchers: Record<
    string,
    Record<
      string,
      {
        keys: StorageKeys | Record<string, boolean>;
        callback: (changes: Record<string, any>) => void;
      }
    >
  > = {};

  static parseStorageErrors(err: any): Promise<never> {
    if (err?.message) {
      const sustainedPerMinute = 'MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE';

      if (err.message.indexOf('QUOTA_BYTES_PER_ITEM') >= 0) {
        const quotaErr: any = new OmegaTarget.Storage.QuotaExceededError();
        quotaErr.perItem = true;
        err = quotaErr;
      } else if (err.message.indexOf('QUOTA_BYTES') >= 0) {
        err = new OmegaTarget.Storage.QuotaExceededError();
      } else if (err.message.indexOf('MAX_ITEMS') >= 0) {
        const quotaErr: any = new OmegaTarget.Storage.QuotaExceededError();
        quotaErr.maxItems = true;
        err = quotaErr;
      } else if (err.message.indexOf('MAX_WRITE_OPERATIONS_') >= 0) {
        const rateErr: any = new OmegaTarget.Storage.RateLimitExceededError();
        if (err.message.indexOf('MAX_WRITE_OPERATIONS_PER_HOUR') >= 0) {
          rateErr.perHour = true;
        } else if (err.message.indexOf('MAX_WRITE_OPERATIONS_PER_MINUTE') >= 0) {
          rateErr.perMinute = true;
        }
        err = rateErr;
      } else if (err.message.indexOf(sustainedPerMinute) >= 0) {
        const rateErr: any = new OmegaTarget.Storage.RateLimitExceededError();
        rateErr.perMinute = true;
        rateErr.sustained = 10;
        err = rateErr;
      } else if (err.message.indexOf('is not available') >= 0) {
        // This could happen if the storage area is not available. For example,
        // some Chromium-based browsers disable access to the sync storage.
        err = new OmegaTarget.Storage.StorageUnavailableError();
      } else if (
        err.message.indexOf('Please set webextensions.storage.sync.enabled to true') >= 0
      ) {
        // This happens when sync storage is disabled in flags.
        err = new OmegaTarget.Storage.StorageUnavailableError();
      }
    }

    return Promise.reject(err);
  }

  constructor(areaName: string) {
    super();
    this.areaName = areaName;

    if ((browser as any)?.storage?.[areaName]) {
      this.storage = (browser as any).storage[areaName] as ChromeStorageAPI;
    } else {
      this.storage = {
        get: chromeApiPromisify((chrome.storage as any)[areaName], 'get'),
        set: chromeApiPromisify((chrome.storage as any)[areaName], 'set'),
        remove: chromeApiPromisify((chrome.storage as any)[areaName], 'remove'),
        clear: chromeApiPromisify((chrome.storage as any)[areaName], 'clear'),
      };
    }
  }

  get(keys?: StorageKeys): Promise<Record<string, any>> {
    if (keys === undefined) {
      keys = null;
    }
    return Promise.resolve(this.storage.get(keys)).catch(ChromeStorage.parseStorageErrors);
  }

  set(items: Record<string, any>): Promise<Record<string, any>> {
    if (Object.keys(items).length === 0) {
      return Promise.resolve({});
    }
    return Promise.resolve(this.storage.set(items))
      .then(() => items)
      .catch(ChromeStorage.parseStorageErrors);
  }

  remove(keys?: string | string[] | null): Promise<void> {
    if (keys == null) {
      return Promise.resolve(this.storage.clear());
    }
    if (Array.isArray(keys) && keys.length === 0) {
      return Promise.resolve();
    }
    return Promise.resolve(this.storage.remove(keys as string | string[])).catch(
      ChromeStorage.parseStorageErrors,
    );
  }

  watch(keys: StorageKeys, callback: (changes: Record<string, any>) => void): () => void {
    if (!ChromeStorage.watchers[this.areaName]) {
      ChromeStorage.watchers[this.areaName] = {};
    }

    const area = ChromeStorage.watchers[this.areaName];
    let id = Date.now().toString();
    while (area[id]) {
      id = Date.now().toString();
    }

    let processedKeys: StorageKeys | Record<string, boolean> = keys;
    if (Array.isArray(keys)) {
      const keyMap: Record<string, boolean> = {};
      for (const key of keys) {
        keyMap[key] = true;
      }
      processedKeys = keyMap;
    }

    area[id] = { keys: processedKeys, callback };

    if (!ChromeStorage.onChangedListenerInstalled) {
      chrome.storage.onChanged.addListener(ChromeStorage.onChangedListener);
      ChromeStorage.onChangedListenerInstalled = true;
    }

    return () => {
      delete area[id];
    };
  }

  static onChangedListener(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void {
    const watchers = ChromeStorage.watchers[areaName];
    if (!watchers) return;

    let map: Record<string, any> | null = null;

    for (const watcherId in watchers) {
      if (!watchers.hasOwnProperty(watcherId)) continue;

      const watcher = watchers[watcherId];
      let match = watcher.keys === null;

      if (!match) {
        for (const key in changes) {
          if (changes.hasOwnProperty(key)) {
            if ((watcher.keys as Record<string, boolean>)[key]) {
              match = true;
              break;
            }
          }
        }
      }

      if (match) {
        if (map == null) {
          map = {};
          for (const key in changes) {
            if (changes.hasOwnProperty(key)) {
              map[key] = changes[key].newValue;
            }
          }
        }
        watcher.callback(map);
      }
    }
  }
}

export default ChromeStorage;
