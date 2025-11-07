/** @module omega-target/browser_storage */

import Storage, { StorageKeys } from './storage';
import Promise from 'bluebird';

/**
 * Browser storage interface (localStorage/sessionStorage)
 */
interface BrowserStorageAPI {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
}

/**
 * Storage implementation using browser's localStorage/sessionStorage
 * with optional key prefix support
 */
class BrowserStorage<T = unknown> extends Storage<T> {
  private readonly storageAPI: BrowserStorageAPI;
  private readonly prefix: string;

  constructor(storage: BrowserStorageAPI, prefix: string = '') {
    super();
    this.storageAPI = storage;
    this.prefix = prefix;
  }

  get(keys: StorageKeys): Promise<Readonly<Record<string, T | undefined>>> {
    let map: Record<string, T | undefined> = {};
    
    if (typeof keys === 'string') {
      map[keys] = undefined;
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        map[key] = undefined;
      }
    } else if (typeof keys === 'object' && keys !== null) {
      // Clone the defaults object
      const keysRecord = keys as Readonly<Record<string, unknown>>;
      for (const key in keysRecord) {
        if (Object.prototype.hasOwnProperty.call(keysRecord, key)) {
          map[key] = keysRecord[key] as T | undefined;
        }
      }
    }
    
    for (const key in map) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      
      try {
        const rawValue = this.storageAPI.getItem(this.prefix + key);
        if (rawValue !== null) {
          const parsedValue = JSON.parse(rawValue) as T;
          if (parsedValue != null) {
            map[key] = parsedValue;
          }
        }
        // Remove undefined values from result
        if (map[key] === undefined) {
          delete map[key];
        }
      } catch (e) {
        // Ignore JSON parse errors - keep default value
      }
    }
    
    return Promise.resolve(map);
  }

  set(items: Readonly<Record<string, T>>): Promise<Readonly<Record<string, T>>> {
    for (const key in items) {
      if (!Object.prototype.hasOwnProperty.call(items, key)) continue;
      
      const value = JSON.stringify(items[key]);
      this.storageAPI.setItem(this.prefix + key, value);
    }
    return Promise.resolve(items);
  }

  remove(keys?: string | readonly string[] | null): Promise<void> {
    if (keys == null) {
      // Remove all items with this prefix
      if (!this.prefix) {
        this.storageAPI.clear();
      } else {
        let index = 0;
        while (true) {
          const key = this.storageAPI.key(index);
          if (key === null) break;
          
          if (key.startsWith(this.prefix)) {
            this.storageAPI.removeItem(key);
          } else {
            index++;
          }
        }
      }
    } else if (typeof keys === 'string') {
      this.storageAPI.removeItem(this.prefix + keys);
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        this.storageAPI.removeItem(this.prefix + key);
      }
    }
    
    return Promise.resolve();
  }
}

export default BrowserStorage;

