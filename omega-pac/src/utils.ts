import * as tld from 'tldjs';
import { URL } from 'url';

interface Revision {
  fromTime(time?: string | number | Date): string;
  compare(a: string, b: string): number;
}

export const Revision: Revision = {
  fromTime(time?: string | number | Date): string {
    const date = time ? new Date(time) : new Date();
    return date.getTime().toString(16);
  },
  compare(a: string, b: string): number {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    if (a.length > b.length) return 1;
    if (a.length < b.length) return -1;
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  }
};

export class AttachedCache<T, V> {
  private prop: string;
  private tag: (obj: T) => string;

  constructor(optProp: string | ((obj: T) => string), tag?: (obj: T) => string) {
    if (typeof tag === 'undefined') {
      this.tag = optProp as (obj: T) => string;
      this.prop = '_cache';
    } else {
      this.prop = optProp as string;
      this.tag = tag;
    }
  }

  getTag(obj: T): string {
    return this.tag(obj);
  }

  get(obj: T, otherwise: V | (() => V)): V {
    const tagValue = this.tag(obj);
    const cache = this._getCache(obj);
    if (cache?.tag === tagValue) {
      return cache.value;
    }
    const value = typeof otherwise === 'function' 
      ? (otherwise as () => V)() 
      : otherwise;
    this._setCache(obj, { tag: tagValue, value });
    return value;
  }

  drop(obj: T): void {
    if (obj[this.prop as keyof T] !== undefined) {
      delete obj[this.prop as keyof T];
    }
  }

  private _getCache(obj: T): { tag: string; value: V } | undefined {
    return obj[this.prop as keyof T] as { tag: string; value: V } | undefined;
  }

  private _setCache(obj: T, value: { tag: string; value: V }): void {
    if (!Object.prototype.hasOwnProperty.call(obj, this.prop)) {
      Object.defineProperty(obj, this.prop, { writable: true });
    }
    (obj as any)[this.prop] = value;
  }
}

export function isIp(domain: string): boolean {
  if (domain.indexOf(':') > 0) return true; // IPv6
  const lastCharCode = domain.charCodeAt(domain.length - 1);
  return lastCharCode >= 48 && lastCharCode <= 57; // IP address ending with number
}

export function getBaseDomain(domain: string): string {
  if (isIp(domain)) return domain;
  return tld.getDomain(domain) ?? domain;
}

export function wildcardForDomain(domain: string): string {
  if (isIp(domain)) return domain;
  return '*.' + getBaseDomain(domain);
}

export function wildcardForUrl(url: string): string {
  const domain = new URL(url).hostname;
  return wildcardForDomain(domain);
} 