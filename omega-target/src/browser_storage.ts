/** @module omega-target/browser_storage */

import Storage = require('./storage');
import Promise = require('bluebird');

type StorageKeys = string | string[] | Record<string, any> | null;

class BrowserStorage extends Storage {
  storage: Storage;
  prefix: string;
  proto: any;

  constructor(storage: Storage, prefix: string = '') {
    super();
    this.storage = storage;
    this.prefix = prefix;
    this.proto = Object.getPrototypeOf(this.storage);
  }

  get(keys: StorageKeys): Promise<Record<string, any>> {
    let map: Record<string, any> = {};
    
    if (typeof keys === 'string') {
      map[keys] = undefined;
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        map[key] = undefined;
      }
    } else if (typeof keys === 'object' && keys !== null) {
      map = keys;
    }
    
    for (const key in map) {
      if (map.hasOwnProperty(key)) {
        try {
          const value = JSON.parse(
            this.proto.getItem.call(this.storage, this.prefix + key)
          );
          if (value != null) {
            map[key] = value;
          }
          if (typeof map[key] === 'undefined') {
            delete map[key];
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    
    return Promise.resolve(map);
  }

  set(items: Record<string, any>): Promise<Record<string, any>> {
    for (const key in items) {
      if (items.hasOwnProperty(key)) {
        const value = JSON.stringify(items[key]);
        this.proto.setItem.call(this.storage, this.prefix + key, value);
      }
    }
    return Promise.resolve(items);
  }

  remove(keys?: string | string[] | null): Promise<void> {
    if (keys == null) {
      if (!this.prefix) {
        this.proto.clear.call(this.storage);
      } else {
        let index = 0;
        while (true) {
          const key = this.proto.key.call(this.storage, index);
          if (key === null) break;
          
          if (key.substr(0, this.prefix.length) === this.prefix) {
            this.proto.removeItem.call(this.storage, key);
          } else {
            index++;
          }
        }
      }
    } else if (typeof keys === 'string') {
      this.proto.removeItem.call(this.storage, this.prefix + keys);
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        this.proto.removeItem.call(this.storage, this.prefix + key);
      }
    }
    
    return Promise.resolve();
  }
}

export = BrowserStorage;

