const metaCharCodes: Set<number> = (() => {
  const chars = '\\\[^$.|?*+(){}/';
  const set = new Set<number>();
  for (let i = 0; i < chars.length; i += 1) {
    set.add(chars.charCodeAt(i));
  }
  return set;
})();

export function escapeSlash(pattern: string): string {
  const charCodeSlash = 47;
  const charCodeBackSlash = 92;
  let escaped = false;
  let start = 0;
  let result = '';

  for (let i = 0; i < pattern.length; i += 1) {
    const code = pattern.charCodeAt(i);
    if (code === charCodeSlash && !escaped) {
      result += pattern.substring(start, i);
      result += '\\';
      start = i;
    }
    escaped = code === charCodeBackSlash && !escaped;
  }

  result += pattern.substring(start);
  return result;
}

interface ShExpOptions {
  trimAsterisk?: boolean;
}

export function shExp2RegExp(pattern: string, options?: ShExpOptions): string {
  const trimAsterisk = options?.trimAsterisk ?? false;
  let start = 0;
  let end = pattern.length;
  const charCodeAsterisk = 42;
  const charCodeQuestion = 63;

  if (trimAsterisk) {
    while (start < end && pattern.charCodeAt(start) === charCodeAsterisk) {
      start += 1;
    }
    while (start < end && pattern.charCodeAt(end - 1) === charCodeAsterisk) {
      end -= 1;
    }
    if (end - start === 1 && pattern.charCodeAt(start) === charCodeAsterisk) {
      return '';
    }
  }

  let regex = '';
  if (start === 0) {
    regex += '^';
  }

  for (let i = start; i < end; i += 1) {
    const code = pattern.charCodeAt(i);
    switch (code) {
      case charCodeAsterisk:
        regex += '.*';
        break;
      case charCodeQuestion:
        regex += '.';
        break;
      default:
        if (metaCharCodes.has(code)) {
          regex += '\\';
        }
        regex += pattern[i];
    }
  }

  if (end === pattern.length) {
    regex += '$';
  }

  return regex;
}

export const regExpMetaChars = metaCharCodes;

