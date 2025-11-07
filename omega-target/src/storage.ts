/** @module omega-target/storage */

import Promise from 'bluebird';
import Log from './log';

/**
 * A set of operations to be performed on a Storage.
 */
export interface WriteOperations<T = unknown> {
  /** A map from keys to new values of the items to set */
  readonly set: Readonly<Record<string, T>>;
  /** An array of keys to remove */
  readonly remove: readonly string[];
}

export interface OperationsArgs<T = unknown> {
  /** The original items in the storage */
  readonly base?: Readonly<Record<string, T>>;
  /** A function that merges the newVal and oldVal */
  readonly merge?: (key: string, newVal: T, oldVal: T | undefined) => T;
}

/**
 * Storage key types - supporting various query patterns
 */
export type StorageKeys = 
  | string 
  | readonly string[] 
  | null 
  | Readonly<Record<string, unknown>>;

/**
 * Storage change detail
 */
export interface StorageChange<T = unknown> {
  readonly oldValue?: T;
  readonly newValue?: T;
}

export type StorageChanges<T = unknown> = Readonly<Record<string, StorageChange<T>>>;
export type StorageChangeCallback<T = unknown> = (changes: StorageChanges<T>) => void;

/**
 * Abstract base class for storage implementations
 * Use generics for type-safe storage operations
 */
class Storage<T = unknown> {
  protected _items?: Record<string, T>;

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
  static operationsForChanges<T = unknown>(
    changes: Readonly<Record<string, T | undefined>>,
    args: OperationsArgs<T> = {}
  ): WriteOperations<T> {
    const { base, merge } = args;
    const set: Record<string, T> = {};
    const remove: string[] = [];

    for (const key in changes) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
      
      let newVal = changes[key];
      const oldVal = base?.[key];
      
      // Always call merge if provided, even for deletions (undefined values)
      // The merge function decides whether to accept the deletion or keep the value
      if (merge && newVal !== undefined) {
        newVal = merge(key, newVal, oldVal);
      }
      
      if (base != null && newVal === oldVal) continue;
      
      if (newVal === undefined) {
        if (oldVal !== undefined || base == null) {
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
  get(keys: StorageKeys): Promise<Readonly<Record<string, T | undefined>>> {
    Log.method('Storage#get', this, arguments);
    
    if (!this._items) {
      return Promise.resolve({});
    }
    
    const map: Record<string, T | undefined> = {};
    
    if (keys == null) {
      Object.assign(map, this._items);
    } else if (typeof keys === 'string') {
      map[keys] = this._items[keys];
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        map[key] = this._items[key];
      }
    } else if (typeof keys === 'object' && !Array.isArray(keys)) {
      const keysObj = keys as Readonly<Record<string, unknown>>;
      for (const key in keysObj) {
        if (Object.prototype.hasOwnProperty.call(keysObj, key)) {
          const defaultValue = keysObj[key] as T | undefined;
          map[key] = this._items[key] ?? defaultValue;
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
  set(items: Readonly<Record<string, T>>): Promise<Readonly<Record<string, T>>> {
    Log.method('Storage#set', this, arguments);
    
    if (!this._items) {
      this._items = {};
    }
    
    for (const key in items) {
      if (Object.prototype.hasOwnProperty.call(items, key)) {
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
  remove(keys?: string | readonly string[] | null): Promise<void> {
    Log.method('Storage#remove', this, arguments);
    
    if (this._items != null) {
      if (keys == null) {
        this._items = {};
      } else if (Array.isArray(keys)) {
        for (const key of keys) {
          delete this._items[key];
        }
      } else if (typeof keys === 'string') {
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
    callback: StorageChangeCallback<T>
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
    operations: WriteOperations<T> | (OperationsArgs<T> & { changes: Readonly<Record<string, T | undefined>> })
  ): Promise<WriteOperations<T>> {
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

export default Storage;

