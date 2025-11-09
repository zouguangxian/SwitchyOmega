import { parse as parseUrl } from 'url';
import * as tld from 'tldjs';

export const Revision = {
  fromTime(time?: string | number | Date | null): string {
    const date = time ? new Date(time) : new Date();
    return date.getTime().toString(16);
  },

  compare(a?: string | null, b?: string | null): number {
    if (!a && !b) {
      return 0;
    }
    if (!a) {
      return -1;
    }
    if (!b) {
      return 1;
    }
    if (a.length > b.length) {
      return 1;
    }
    if (a.length < b.length) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    if (a < b) {
      return -1;
    }
    return 0;
  }
};

type CacheEntry<TValue> = {
  tag: unknown;
  value: TValue;
};

type TagFunction<TObject> = (obj: TObject) => unknown;

export class AttachedCache<
  TValue = unknown,
  TObject extends Record<string, unknown> = Record<string, unknown>
> {
  private readonly prop: string;
  private readonly tagFn: TagFunction<TObject>;

  constructor(propOrTag: string | TagFunction<TObject>, tag?: TagFunction<TObject>) {
    if (typeof tag === 'undefined') {
      this.tagFn = propOrTag as TagFunction<TObject>;
      this.prop = '_cache';
    } else {
      this.prop = propOrTag as string;
      this.tagFn = tag;
    }
  }

  tag(obj: TObject): unknown {
    return this.tagFn(obj);
  }

  get(obj: TObject, otherwise: TValue | (() => TValue)): TValue {
    const tag = this.tagFn(obj);
    const cache = this.getCache(obj);
    if (cache && cache.tag === tag) {
      return cache.value;
    }
    const value = typeof otherwise === 'function' ? (otherwise as () => TValue)() : otherwise;
    this.setCache(obj, { tag, value });
    return value;
  }

  drop(obj: TObject): void {
    const target = obj as Record<string, unknown>;
    if (target[this.prop] !== undefined) {
      target[this.prop] = undefined;
    }
  }

  private getCache(obj: TObject): CacheEntry<TValue> | undefined {
    const target = obj as Record<string, unknown>;
    return target[this.prop] as CacheEntry<TValue> | undefined;
  }

  private setCache(obj: TObject, value: CacheEntry<TValue>): void {
    const target = obj as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(target, this.prop)) {
      Object.defineProperty(target, this.prop, { writable: true });
    }
    target[this.prop] = value;
  }
}

export function isIp(domain: string): boolean {
  if (domain.indexOf(':') > 0) {
    return true;
  }
  const lastCharCode = domain.charCodeAt(domain.length - 1);
  return lastCharCode >= 48 && lastCharCode <= 57;
}

export function getBaseDomain(domain: string): string {
  if (isIp(domain)) {
    return domain;
  }
  return tld.getDomain(domain) ?? domain;
}

export function wildcardForDomain(domain: string): string {
  if (isIp(domain)) {
    return domain;
  }
  return `*.${getBaseDomain(domain)}`;
}

export function wildcardForUrl(url: string): string {
  const parsed = parseUrl(url);
  const hostname = typeof parsed === 'string' ? undefined : parsed?.hostname ?? undefined;
  if (!hostname) {
    throw new Error(`Unable to determine hostname from url: ${url}`);
  }
  return wildcardForDomain(hostname);
}

export function getSubdomain(url: string): string | null {
  return tld.getSubdomain(url) ?? null;
}

