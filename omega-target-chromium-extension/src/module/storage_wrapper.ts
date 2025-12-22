/** @module omega-target-chromium-extension/storage_wrapper */

/**
 * Storage wrapper that provides localStorage-like API using chrome.storage.local
 * This is needed because service workers don't have access to localStorage
 */
class StorageWrapper {
  private cache: Record<string, string> = {};
  private _initialized: Promise<void>;

  constructor() {
    this._initialized = this.init();
  }

  /**
   * Public accessor for initialization promise
   */
  get ready(): Promise<void> {
    return this._initialized;
  }

  private async init(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(null);
      this.cache = result as Record<string, string>;
    } catch (error) {
      console.error('Failed to initialize storage wrapper:', error);
    }
  }

  async getItem(key: string): Promise<string | null> {
    await this._initialized;
    return this.cache[key] ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await this._initialized;
    this.cache[key] = value;
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error('Failed to set item:', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    await this._initialized;
    delete this.cache[key];
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error('Failed to remove item:', error);
    }
  }

  async clear(): Promise<void> {
    await this._initialized;
    this.cache = {};
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  // Synchronous getters/setters for backward compatibility (uses cached values)
  get(key: string): string | null {
    return this.cache[key] || null;
  }

  set(key: string, value: string): void {
    this.cache[key] = value;
    // Fire and forget
    chrome.storage.local.set({ [key]: value }).catch(console.error);
  }

  /**
   * Get all keys in the cache
   */
  keys(): string[] {
    return Object.keys(this.cache);
  }
}

export const storageWrapper = new StorageWrapper();

/**
 * localStorage-compatible interface for BrowserStorage
 * Uses the storageWrapper's in-memory cache for synchronous access
 */
export const localStorageCompat = {
  getItem(key: string): string | null {
    return storageWrapper.get(key);
  },

  setItem(key: string, value: string): void {
    storageWrapper.set(key, value);
  },

  removeItem(key: string): void {
    storageWrapper.removeItem(key);
  },

  clear(): void {
    storageWrapper.clear();
  },

  // BrowserStorage enumeration support
  get length(): number {
    return storageWrapper.keys().length;
  },

  key(index: number): string | null {
    const keys = storageWrapper.keys();
    return keys[index] || null;
  },
};
