/** @module omega-target/storage */

import Promise = require('bluebird');
import Log = require('./log');

/**
 * A set of operations to be performed on a Storage.
 */
export interface WriteOperations {
  /** A map from keys to new values of the items to set */
  set: Record<string, any>;
  /** An array of keys to remove */
  remove: string[];
}

export interface OperationsArgs {
  /** The original items in the storage */
  base?: Record<string, any>;
  /** A function that merges the newVal and oldVal */
  merge?: (key: string, newVal: any, oldVal: any) => any;
}

type StorageKeys = string | string[] | null | Record<string, any>;

/**
 * Abstract base class for storage implementations
 */
class Storage {
  _items?: Record<string, any>;

  /**
   * Any operation that fails due to rate limiting should reject with an instance
   * of RateLimitExceededError, when implemented in derived classes of Storage.
   */
  static RateLimitExceededError = class RateLimitExceededError extends Error {
    constructor() {
      super();
    }
  };

  /**
   * Any operation that fails due to storage quota should reject with an instance
   * of QuotaExceededError, when implemented in derived classes of Storage.
   */
  static QuotaExceededError = class QuotaExceededError extends Error {
    constructor() {
      super();
    }
  };

  /**
   * If this storage is not available for some reason, all operations should
   * reject with an instance of StorageUnavailableError, when implemented in
   * derived classes of Storage.
   * This error is considered fatal and unrecoverable in the current environment.
   * Further access to this storage should be avoided until restart.
   */
  static StorageUnavailableError = class StorageUnavailableError extends Error {
    constructor() {
      super();
    }
  };

  /**
   * Calculate the actual operations against storage that should be performed to
   * replay the changes on a storage.
   * @param changes The changes to apply
   * @param args Extra arguments
   * @returns The operations that should be performed.
   */
  static operationsForChanges(
    changes: Record<string, any>,
    args: OperationsArgs = {}
  ): WriteOperations {
    const { base, merge } = args;
    const set: Record<string, any> = {};
    const remove: string[] = [];

    for (const key in changes) {
      if (!changes.hasOwnProperty(key)) continue;
      
      let newVal = changes[key];
      const oldVal = base != null ? base[key] : newVal;
      
      if (merge) {
        newVal = merge(key, newVal, oldVal);
      }
      
      if (base != null && newVal === oldVal) continue;
      
      if (typeof newVal === 'undefined') {
        if (typeof oldVal !== 'undefined' || base == null) {
          remove.push(key);
        }
      } else {
        set[key] = newVal;
      }
    }
    
    return { set, remove };
  }

  /**
   * Get the requested values by keys from the storage.
   * @param keys The keys to retrieve, or null for all.
   * @returns A map from keys to values
   */
  get(keys: StorageKeys): Promise<Record<string, any>> {
    Log.method('Storage#get', this, arguments);
    
    if (!this._items) {
      return Promise.resolve({});
    }
    
    const map: Record<string, any> = {};
    
    if (keys == null) {
      Object.assign(map, this._items);
    } else if (typeof keys === 'string') {
      map[keys] = this._items[keys];
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        map[key] = this._items[key];
      }
    } else if (typeof keys === 'object') {
      for (const key in keys) {
        if (keys.hasOwnProperty(key)) {
          map[key] = this._items[key] != null ? this._items[key] : keys[key];
        }
      }
    }
    
    return Promise.resolve(map);
  }

  /**
   * Set multiple values by keys in the storage.
   * @param items A map from key to value to set.
   * @returns A map of key-value pairs just set.
   */
  set(items: Record<string, any>): Promise<Record<string, any>> {
    Log.method('Storage#set', this, arguments);
    
    if (!this._items) {
      this._items = {};
    }
    
    for (const key in items) {
      if (items.hasOwnProperty(key)) {
        this._items[key] = items[key];
      }
    }
    
    return Promise.resolve(items);
  }

  /**
   * Remove items by keys from the storage.
   * @param keys The keys to remove, or null for all.
   * @returns A promise that fulfills on successful removal.
   */
  remove(keys?: string | string[] | null): Promise<void> {
    Log.method('Storage#remove', this, arguments);
    
    if (this._items != null) {
      if (keys == null) {
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
  watch(
    keys: StorageKeys,
    callback: (changes: Record<string, any>) => void
  ): () => void {
    Log.method('Storage#watch', this, arguments);
    return () => {};
  }

  /**
   * Apply WriteOperations to the storage.
   * @param operations The operations to apply, or the changes to be applied.
   * @returns A promise that fulfills on operation success.
   */
  apply(
    operations: WriteOperations | (OperationsArgs & { changes: Record<string, any> })
  ): Promise<WriteOperations> {
    if ('changes' in operations) {
      const ops = Storage.operationsForChanges(operations.changes, operations);
      return this.set(ops.set)
        .then(() => this.remove(ops.remove))
        .return(ops);
    }
    
    return this.set(operations.set)
      .then(() => this.remove(operations.remove))
      .return(operations);
  }
}

export = Storage;

