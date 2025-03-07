import { Storage, StorageItems } from './storage';
import { Promise } from './utils';

interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length: number;
}

export class BrowserStorage extends Storage {
  private storage: WebStorage;
  private prefix: string;
  private proto: WebStorage;

  constructor(storage: WebStorage, prefix: string = '') {
    super();
    this.storage = storage;
    this.prefix = prefix;
    this.proto = Object.getPrototypeOf(this.storage);
  }

  get(keys: string | string[] | null | StorageItems): Promise<StorageItems> {
    const map: StorageItems = {};
    if (typeof keys === 'string') {
      map[keys] = undefined;
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        map[key] = undefined;
      }
    } else if (typeof keys === 'object' && keys !== null) {
      Object.assign(map, keys);
    }

    for (const key of Object.keys(map)) {
      try {
        const value = JSON.parse(this.proto.getItem.call(this.storage, this.prefix + key) ?? 'null');
        if (value !== null) {
          map[key] = value;
        }
      } catch {
        // Ignore JSON parse errors
      }
      if (typeof map[key] === 'undefined') {
        delete map[key];
      }
    }
    return Promise.resolve(map);
  }

  set(items: StorageItems): Promise<StorageItems> {
    for (const [key, value] of Object.entries(items)) {
      const serialized = JSON.stringify(value);
      this.proto.setItem.call(this.storage, this.prefix + key, serialized);
    }
    return Promise.resolve(items);
  }

  remove(keys?: string | string[] | null): Promise<void> {
    if (!keys) {
      if (!this.prefix) {
        this.proto.clear.call(this.storage);
      } else {
        let index = 0;
        while (true) {
          const key = this.proto.key.call(this.storage, index);
          if (key === null) break;
          if (key.startsWith(this.prefix)) {
            this.proto.removeItem.call(this.storage, key);
          } else {
            index++;
          }
        }
      }
    } else if (typeof keys === 'string') {
      this.proto.removeItem.call(this.storage, this.prefix + keys);
    } else {
      for (const key of keys) {
        this.proto.removeItem.call(this.storage, this.prefix + key);
      }
    }

    return Promise.resolve();
  }
} 