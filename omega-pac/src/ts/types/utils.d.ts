declare module './utils' {
  export class AttachedCache<T, V> {
    constructor(tagFn: (item: T) => V);
    public tag(item: T): V;
    public get<R>(item: T, fn: () => R): R;
  }
}

declare module './utils.js' {
  export * from './utils';
}

declare module '../utils' {
  export * from './utils';
}

declare module '../utils.js' {
  export * from './utils';
} 