import * as tld from 'tldjs';
import * as Url from 'url';

interface Cache<T> {
  tag: string;
  value: T;
}

interface CacheableObject {
  [key: string]: any;
  _cache?: Cache<any>;
}

export const Revision = {
  fromTime: (time?: string | number | Date): string => {
    const date = time ? new Date(time) : new Date();
    return date.getTime().toString(16);
  },
  compare: (a: string | undefined, b: string | undefined): number => {
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

export class AttachedCache<T extends CacheableObject, V> {
  private prop: string;
  private tagFn: (obj: T) => V;

  constructor(optProp: string | ((obj: T) => V), tagFn?: (obj: T) => V) {
    if (typeof tagFn === 'undefined') {
      this.tagFn = optProp as (obj: T) => V;
      this.prop = '_cache';
    } else {
      this.prop = optProp as string;
      this.tagFn = tagFn;
    }
  }

  public tag(obj: T): V {
    return this.tagFn(obj);
  }

  public get<R>(obj: T, otherwise: R | (() => R)): R {
    const tag = this.tagFn(obj);
    const cache = this._getCache(obj);
    if (cache && cache.tag === tag) {
      return cache.value as R;
    }
    const value = typeof otherwise === 'function' ? (otherwise as () => R)() : otherwise;
    this._setCache(obj, { tag: String(tag), value });
    return value;
  }

  public drop(obj: T): void {
    if (this.prop in obj) {
      delete obj[this.prop];
    }
  }

  private _getCache(obj: T): Cache<any> | undefined {
    return obj[this.prop] as Cache<any> | undefined;
  }

  private _setCache(obj: T, value: Cache<any>): void {
    if (!Object.prototype.hasOwnProperty.call(obj, this.prop)) {
      Object.defineProperty(obj, this.prop, { writable: true, configurable: true });
    }
    obj[this.prop] = value;
  }
}

export function isIp(domain: string): boolean {
  if (domain.indexOf(':') > 0) return true; // IPv6
  const lastCharCode = domain.charCodeAt(domain.length - 1);
  return lastCharCode >= 48 && lastCharCode <= 57; // IP address ending with number.
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