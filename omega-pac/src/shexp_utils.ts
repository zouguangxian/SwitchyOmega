interface RegExpMetaChars {
  [key: number]: boolean;
}

interface ShExpOptions {
  trimAsterisk?: boolean;
}

export const regExpMetaChars: RegExpMetaChars = (() => {
  const chars = '\\[\\^$.|?*+(){}';
  const set: RegExpMetaChars = {};
  for (let i = 0; i < chars.length; i++) {
    set[chars.charCodeAt(i)] = true;
  }
  return set;
})();

export function escapeSlash(pattern: string): string {
  const charCodeSlash = 47; // /
  const charCodeBackSlash = 92; // \
  let escaped = false;
  let start = 0;
  let result = '';
  
  for (let i = 0; i < pattern.length; i++) {
    const code = pattern.charCodeAt(i);
    if (code === charCodeSlash && !escaped) {
      result += pattern.substring(start, i);
      result += '\\';
      start = i;
    }
    escaped = (code === charCodeBackSlash && !escaped);
  }
  result += pattern.substr(start);
  return result;
}

export function shExp2RegExp(pattern: string, options?: ShExpOptions): string {
  const trimAsterisk = options?.trimAsterisk ?? false;
  let start = 0;
  let end = pattern.length;
  const charCodeAsterisk = 42; // '*'
  const charCodeQuestion = 63; // '?'

  if (trimAsterisk) {
    while (start < end && pattern.charCodeAt(start) === charCodeAsterisk) {
      start++;
    }
    while (start < end && pattern.charCodeAt(end - 1) === charCodeAsterisk) {
      end--;
    }
    if (end - start === 1 && pattern.charCodeAt(start) === charCodeAsterisk) {
      return '';
    }
  }

  let regex = '';
  if (start === 0) {
    regex += '^';
  }

  for (let i = start; i < end; i++) {
    const code = pattern.charCodeAt(i);
    switch (code) {
      case charCodeAsterisk:
        regex += '.*';
        break;
      case charCodeQuestion:
        regex += '.';
        break;
      default:
        if (regExpMetaChars[code]) {
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