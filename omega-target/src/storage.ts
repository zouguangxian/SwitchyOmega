/** @module omega-target/storage */
import { Promise } from './utils';
import { Log } from './log';

export interface StorageItems {
  [key: string]: any;
}

export interface WriteOperations {
  set: StorageItems;
  remove: string[];
}

export interface MergeArgs {
  base?: StorageItems;
  merge?: (key: string, newVal: any, oldVal: any) => any;
}

export interface ApplyOperations extends Partial<WriteOperations> {
  changes?: StorageItems;
  base?: StorageItems;
  merge?: (key: string, newVal: any, oldVal: any) => any;
}

export class RateLimitExceededError extends Error {
  constructor() {
    super();
    this.name = 'RateLimitExceededError';
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super();
    this.name = 'QuotaExceededError';
  }
}

export class StorageUnavailableError extends Error {
  constructor() {
    super();
    this.name = 'StorageUnavailableError';
  }
}

export class Storage {
  protected _items?: StorageItems;

  static RateLimitExceededError = RateLimitExceededError;
  static QuotaExceededError = QuotaExceededError;
  static StorageUnavailableError = StorageUnavailableError;

  /**
   * Calculate the actual operations against storage that should be performed to
   * replay the changes on a storage.
   * @param changes The changes to apply
   * @param args Extra arguments
   * @returns The operations that should be performed.
   */
  static operationsForChanges(changes: StorageItems, { base, merge }: MergeArgs = {}): WriteOperations {
    const set: StorageItems = {};
    const remove: string[] = [];
    for (const [key, newVal] of Object.entries(changes)) {
      const oldVal = base ? base[key] : newVal;
      let finalVal = newVal;
      if (merge) {
        finalVal = merge(key, newVal, oldVal);
      }
      if (base && finalVal === oldVal) continue;
      if (typeof finalVal === 'undefined') {
        if (typeof oldVal !== 'undefined' || !base) {
          remove.push(key);
        }
      } else {
        set[key] = finalVal;
      }
    }
    return { set, remove };
  }

  /**
   * Get the requested values by keys from the storage.
   * @param keys The keys to retrieve, or null for all.
   * @returns A map from keys to values
   */
  get(keys: string | string[] | null | StorageItems): Promise<StorageItems> {
    Log.method('Storage#get', this, arguments);
    if (!this._items) return Promise.resolve({});

    const map: StorageItems = {};
    if (!keys) {
      return Promise.resolve({ ...this._items });
    } else if (typeof keys === 'string') {
      map[keys] = this._items[keys];
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        map[key] = this._items[key];
      }
    } else if (typeof keys === 'object') {
      for (const [key, value] of Object.entries(keys)) {
        map[key] = key in this._items ? this._items[key] : value;
      }
    }
    return Promise.resolve(map);
  }

  /**
   * Set multiple values by keys in the storage.
   * @param items A map from key to value to set.
   * @returns A map of key-value pairs just set.
   */
  set(items: StorageItems): Promise<StorageItems> {
    Log.method('Storage#set', this, arguments);
    if (!this._items) this._items = {};
    Object.assign(this._items, items);
    return Promise.resolve(items);
  }

  /**
   * Remove items by keys from the storage.
   * @param keys The keys to remove, or null for all.
   * @returns A promise that fulfills on successful removal.
   */
  remove(keys?: string | string[] | null): Promise<void> {
    Log.method('Storage#remove', this, arguments);
    if (this._items) {
      if (!keys) {
        this._items = {};
      } else if (Array.isArray(keys)) {
        for (const key of keys) {
          delete this._items[key];
        }
      } else {
        delete this._items[keys];
      }
    }
    return Promise.resolve();
  }

  /**
   * Watch for any changes to the storage.
   * @param keys The keys to watch, or null for all.
   * @param callback Called everytime something changes.
   * @returns Calling the returned function will stop watching.
   */
  watch(keys: string | string[] | null, callback: (changes: StorageItems) => void): () => void {
    Log.method('Storage#watch', this, arguments);
    return () => null;
  }

  /**
   * Apply WriteOperations to the storage.
   * @param operations The operations to apply, or the changes to be applied.
   * @returns A promise that fulfills on operation success.
   */
  apply(operations: ApplyOperations): Promise<WriteOperations> {
    if ('changes' in operations && operations.changes) {
      const { changes, base, merge } = operations;
      operations = Storage.operationsForChanges(changes, { base, merge });
    }
    return this.set(operations.set ?? {})
      .then(() => this.remove(operations.remove ?? []))
      .then(() => operations as WriteOperations);
  }
} 