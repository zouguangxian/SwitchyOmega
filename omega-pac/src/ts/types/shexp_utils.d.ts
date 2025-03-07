declare module './shexp_utils' {
  export function shExp2RegExp(pattern: string): RegExp;
  export function escapeSlash(pattern: string): string;
}

declare module './shexp_utils.js' {
  export * from './shexp_utils';
}

declare module '../shexp_utils' {
  export * from './shexp_utils';
}

declare module '../shexp_utils.js' {
  export * from './shexp_utils';
} 