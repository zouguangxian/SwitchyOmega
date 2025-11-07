/** @module omega-target/options_sync */

import Promise from 'bluebird';
import Storage from './storage';
import Log from './log';
import { Revision } from 'omega-pac';
import * as jsondiffpatch from 'jsondiffpatch';
import { TokenBucket } from 'limiter';

class OptionsSync {
  static TokenBucket = TokenBucket;

  private _timeout: NodeJS.Timeout | null = null;
  private _bucket: TokenBucket;
  private _waiting: boolean = false;
  private _pending: Record<string, any> = {};

  /**
   * The debounce timeout (ms) for requestPush scheduling. See requestPush.
   */
  debounce: number = 1000;

  /**
   * The throttling timeout (ms) for watchAndPull. See watchAndPull.
   */
  pullThrottle: number = 1000;

  /**
   * The remote storage of syncing.
   */
  storage: Storage;

  /**
   * Whether syncing is enabled or not. See requestPush for the effect.
   */
  enabled: boolean = true;

  constructor(storage: Storage, bucket?: TokenBucket) {
    this.storage = storage;
    this._bucket = bucket || new TokenBucket(10, 10, 'minute', null);
    
    // Add clear method if it doesn't exist
    if (!this._bucket.clear) {
      this._bucket.clear = () => {
        this._bucket.tryRemoveTokens(this._bucket.content);
      };
    }
  }

  /**
   * Transform storage values for syncing. The default implementation applies no
   * transformation, but the behavior can be altered by assigning to this field.
   * Note: Transformation is applied before merging.
   * @param value The value to transform
   * @param key The key of the item
   * @returns The transformed value
   */
  transformValue(value: any, key?: string): any {
    return value;
  }

  /**
   * Merge newVal and oldVal of a given key. The default implementation choose
   * between newVal and oldVal based on the following rules:
   * 1. Choose oldVal if syncOptions is 'disabled' in either oldVal or newVal.
   * 2. Choose oldVal if it has a revision newer than or equal to that of newVal.
   * 3. Choose oldVal if it deeply equals newVal.
   * 4. Otherwise, choose newVal.
   *
   * @param key The key of the item
   * @param newVal The new value
   * @param oldVal The old value
   * @returns The merged result
   */
  merge: (key: string, newVal: any, oldVal: any) => any = (() => {
    const diff = jsondiffpatch.create({
      objectHash: (obj: any) => JSON.stringify(obj),
      textDiff: { minLength: 1 / 0 }
    });
    
    return (key: string, newVal: any, oldVal: any): any => {
      if (newVal === oldVal) return oldVal;
      
      if (oldVal?.syncOptions === 'disabled' || newVal?.syncOptions === 'disabled') {
        return oldVal;
      }
      
      if (oldVal?.revision != null && newVal?.revision != null) {
        const result = Revision.compare(oldVal.revision, newVal.revision);
        if (result >= 0) return oldVal;
      }
      
      if (diff.diff(oldVal, newVal) == null) return oldVal;
      
      return newVal;
    };
  })();

  /**
   * Request pushing the changes to remote storage. The changes are cached first,
   * and then the actual write operations are scheduled if enabled is true.
   * The actual operation is delayed and debounced, combining continuous writes
   * in a short period into a single write operation.
   * @param changes A map from keys to values.
   */
  requestPush(changes: Record<string, any>): void {
    if (this._timeout != null) {
      clearTimeout(this._timeout);
    }
    
    for (const key in changes) {
      if (changes.hasOwnProperty(key)) {
        let value = changes[key];
        if (typeof value !== 'undefined') {
          value = this.transformValue(value, key);
          if (typeof value === 'undefined') continue;
        }
        this._pending[key] = value;
      }
    }
    
    if (!this.enabled) return;
    
    this._timeout = setTimeout(this._doPush.bind(this), this.debounce);
  }

  /**
   * Returning the pending changes not written to the remote storage.
   * @returns The pending changes.
   */
  pendingChanges(): Record<string, any> {
    return this._pending;
  }

  private _doPush(): void {
    this._timeout = null;
    if (this._waiting) return;
    
    this._waiting = true;
    this._bucket.removeTokens(1, () => {
      this.storage.get(null)
        .then((base) => {
          const changes = this._pending;
          this._pending = {};
          this._waiting = false;
          return Storage.operationsForChanges(changes, { base, merge: this.merge });
        })
        .then(({ set, remove }) => {
          const doSet = 
            Object.keys(set).length === 0
              ? Promise.resolve(0)
              : (() => {
                  Log.log('OptionsSync::set', set);
                  return this.storage.set(set).return(1);
                })();
          
          return doSet.then((cost) => {
            if (remove.length > 0) {
              if (this._bucket.tryRemoveTokens(cost)) {
                Log.log('OptionsSync::remove', remove);
                return this.storage.remove(remove);
              } else {
                return Promise.reject('bucket');
              }
            }
          }).catch((e) => {
            // Re-submit the changes for syncing, but with lower priority.
            for (const key in set) {
              if (set.hasOwnProperty(key) && !(key in this._pending)) {
                this._pending[key] = set[key];
              }
            }
            for (const key of remove) {
              if (!(key in this._pending)) {
                this._pending[key] = undefined;
              }
            }

            if (e === 'bucket') {
              this._doPush();
            } else if (e instanceof Storage.RateLimitExceededError) {
              Log.log('OptionsSync::rateLimitExceeded');
              // Try to clear the _bucket to wait more time before retrying.
              this._bucket.clear();
              this.requestPush({});
              return;
            } else if (e instanceof Storage.QuotaExceededError) {
              // For now, we just disable syncing for all changed profiles.
              // TODO(catus): Remove the largest profile each time and retry.
              let valuesAffected = 0;
              for (const key in set) {
                if (set.hasOwnProperty(key)) {
                  const value = set[key];
                  if (key[0] === '+' && value.syncOptions !== 'disabled') {
                    value.syncOptions = 'disabled';
                    value.syncError = { reason: 'quotaPerItem' };
                    valuesAffected++;
                  }
                }
              }
              if (valuesAffected > 0) {
                this.requestPush({});
              } else {
                this._pending = {};
              }
              return;
            } else {
              return Promise.reject(e);
            }
          });
        });
    });
  }

  private _logOperations(text: string, operations: Storage.WriteOperations): void {
    if (Object.keys(operations.set).length) {
      Log.log(text + '::set', operations.set);
    }
    if (operations.remove.length) {
      Log.log(text + '::remove', operations.remove);
    }
  }

  /**
   * Pull the remote storage for changes, and write them to local.
   * @param local The local storage to be written to
   * @returns A promise
   */
  copyTo(local: Storage): Promise<void> {
    return Promise.join(
      local.get(null),
      this.storage.get(null),
      (base, changes) => {
        for (const key in base) {
          if (base.hasOwnProperty(key) && !(key in changes)) {
            if (key[0] === '+' && base[key]?.syncOptions !== 'disabled') {
              changes[key] = undefined;
            }
          }
        }
        return local.apply({
          changes,
          base,
          merge: this.merge
        }).then((operations) => {
          this._logOperations('OptionsSync::copyTo', operations);
        });
      }
    );
  }

  /**
   * Watch the remote storage for changes, and write them to local.
   * The actual writing is throttled by pullThrottle with initial delay.
   * @param local The local storage to be written to
   * @returns Calling the returned function will stop watching.
   */
  watchAndPull(local: Storage): () => void {
    let pullScheduled: NodeJS.Timeout | null = null;
    let pull: Record<string, any> = {};
    
    const doPull = () => {
      local.get(null)
        .then((base) => {
          const changes = pull;
          pull = {};
          pullScheduled = null;
          return Storage.operationsForChanges(changes, { base, merge: this.merge });
        })
        .then((operations) => {
          this._logOperations('OptionsSync::pull', operations);
          return local.apply(operations);
        });
    };

    return this.storage.watch(null, (changes) => {
      for (const key in changes) {
        if (changes.hasOwnProperty(key)) {
          pull[key] = changes[key];
        }
      }
      if (pullScheduled != null) return;
      pullScheduled = setTimeout(doPull, this.pullThrottle);
    });
  }
}

export default OptionsSync;

