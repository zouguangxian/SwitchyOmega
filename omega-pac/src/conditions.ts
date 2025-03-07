import * as U2 from 'uglify-js';
import { v4, v6 } from 'ip-address';
import { URL } from 'url';
import { shExp2RegExp, escapeSlash } from './shexp_utils.js';
import { AttachedCache } from './utils.js';

export interface Condition {
  conditionType: string;
  pattern: string;
  days?: string;
  startDay?: number;
  endDay?: number;
  [key: string]: any;
}

export interface Request {
  url: string;
  host: string;
  scheme: string;
}

export interface ConditionHandler {
  abbrs: string[];
  analyze?: (condition: Condition) => RegExp | null;
  match?: (condition: Condition, request: Request, cache: ConditionCache) => boolean;
  compile?: (condition: Condition, cache: ConditionCache) => U2.AST_Node;
  str?: (condition: Condition) => string;
  fromStr?: (str: string, condition: Condition) => Condition;
}

interface ConditionTypes {
  [key: string]: ConditionHandler;
}

interface ConditionCache {
  analyzed: RegExp | null;
  compiled?: U2.AST_Node;
}

const colonCharCode = ':'.charCodeAt(0);
const _condCache = new AttachedCache<Condition, ConditionCache>(
  (condition) => {
    const handler = _handler(condition.conditionType);
    const result = handler.str?.(condition) ?? '';
    return condition.conditionType + '$' + result;
  }
);

let _abbrs: { [key: string]: string } | null = null;

export function requestFromUrl(url: string | URL): Request {
  if (typeof url === 'string') {
    url = new URL(url);
  }
  return {
    url: url.toString(),
    host: url.hostname,
    scheme: url.protocol.replace(':', '')
  };
}

export function urlWildcard2HostWildcard(pattern: string): string | undefined {
  const result = pattern.match(/^\*:\/\/((?:\w|[?*._\-])+)\/\*$/);
  return result?.[1];
}

export function tag(condition: Condition): string {
  return _condCache.getTag(condition);
}

export function analyze(condition: Condition): ConditionCache {
  return _condCache.get(condition, () => ({
    analyzed: _handler(condition.conditionType).analyze?.(condition) ?? null
  }));
}

export function match(condition: Condition, request: Request): boolean {
  const cache = analyze(condition);
  return _handler(condition.conditionType).match?.(condition, request, cache) ?? false;
}

export function compile(condition: Condition): U2.AST_Node {
  const handler = _handler(condition.conditionType);
  if (handler.compile) {
    const cache = analyze(condition);
    return handler.compile(condition, cache);
  }
  const source = handler.str?.(condition) ?? '';
  return new U2.AST_RegExp({ value: { source: escapeSlash(source), flags: '' } });
}

export function str(condition: Condition, options: { abbr?: number } = { abbr: -1 }): string {
  const handler = _handler(condition.conditionType);
  if (handler.abbrs[0].length === 0) {
    const endCode = condition.pattern.charCodeAt(condition.pattern.length - 1);
    if (endCode !== colonCharCode && condition.pattern.indexOf(' ') < 0) {
      return condition.pattern;
    }
  }

  const typeStr = typeof options.abbr === 'number'
    ? handler.abbrs[(handler.abbrs.length + options.abbr) % handler.abbrs.length]
    : condition.conditionType;

  let result = typeStr + ':';
  const part = handler.str?.(condition) ?? condition.pattern;
  if (part) {
    result += ' ' + part;
  }
  return result;
}

export function fromStr(str: string): Condition | null {
  str = str.trim();
  let i = str.indexOf(' ');
  if (i < 0) i = str.length;

  let conditionType = '';
  if (str.charCodeAt(i - 1) === colonCharCode) {
    conditionType = str.substr(0, i - 1);
    str = str.substr(i + 1).trim();
  }

  conditionType = typeFromAbbr(conditionType);
  if (!conditionType) return null;

  const condition: Condition = { conditionType, pattern: '' };
  const handler = _handler(conditionType);
  
  if (handler.fromStr) {
    return handler.fromStr(str, condition);
  } else {
    condition.pattern = str;
    return condition;
  }
}

function typeFromAbbr(abbr: string): string | undefined {
  if (!_abbrs) {
    _abbrs = {};
    for (const [type, handler] of Object.entries(_conditionTypes)) {
      _abbrs[type.toUpperCase()] = type;
      for (const ab of handler.abbrs) {
        _abbrs[ab.toUpperCase()] = type;
      }
    }
  }
  return _abbrs[abbr.toUpperCase()];
}

interface ExtendedASTNode extends U2.AST_Node {
  start?: {
    _comments_dumped?: boolean;
    comments_before?: Array<{ type: string; value: string }>;
  };
}

function comment(comment: string | undefined, node: ExtendedASTNode): ExtendedASTNode {
  if (!comment) return node;

  if (!node.start) {
    node.start = {};
  }

  // This hack is needed to allow dumping comments in repeated print call.
  Object.defineProperty(node.start, '_comments_dumped', {
    get: () => false,
    set: () => false
  });

  if (!node.start.comments_before) {
    node.start.comments_before = [];
  }

  node.start.comments_before.push({ type: 'comment2', value: comment });
  return node;
}

function safeRegex(expr: string): RegExp {
  try {
    return new RegExp(expr);
  } catch {
    // Invalid regexp! Fall back to a regexp that does not match anything.
    return /(?!)/;
  }
}

function regTest(expr: string | U2.AST_Node, regexp: string | RegExp): U2.AST_Call {
  if (typeof regexp === 'string') {
    // Escape (unescaped) forward slash for use in regex literals.
    regexp = escapeSlash(regexp);
  }
  if (typeof expr === 'string') {
    expr = new U2.AST_SymbolRef({ name: expr });
  }
  return new U2.AST_Call({
    args: [expr],
    expression: new U2.AST_Dot({
      property: 'test',
      expression: new U2.AST_RegExp({ value: regexp.toString() })
    })
  });
}

function isInt(num: number): boolean {
  return typeof num === 'number' && !isNaN(num) && parseFloat(num.toString()) === parseInt(num.toString(), 10);
}

function between(val: U2.AST_Node, min: number | U2.AST_Node, max: number | U2.AST_Node, comment?: string): U2.AST_Node {
  if (min === max) {
    if (typeof min === 'number') {
      min = new U2.AST_Number({ value: min });
    }
    return comment ? comment(comment, new U2.AST_Binary({
      left: val,
      operator: '===',
      right: min
    })) : new U2.AST_Binary({
      left: val,
      operator: '===',
      right: min
    });
  }

  if (min > max) {
    return comment ? comment(comment, new U2.AST_False()) : new U2.AST_False();
  }

  if (typeof min === 'number' && typeof max === 'number' && isInt(min) && isInt(max) && max - min < 32) {
    const commentStr = comment || `${min} <= value && value <= ${max}`;
    const tmpl = "0123456789abcdefghijklmnopqrstuvwxyz";
    const str = max < tmpl.length ? tmpl.substr(min, max - min + 1) : tmpl.substr(0, max - min + 1);
    
    const pos = min === 0 ? val : new U2.AST_Binary({
      left: val,
      operator: '-',
      right: new U2.AST_Number({ value: min })
    });

    return comment ? comment(commentStr, new U2.AST_Binary({
      left: new U2.AST_Call({
        expression: new U2.AST_Dot({
          expression: new U2.AST_String({ value: str }),
          property: 'charCodeAt'
        }),
        args: [pos]
      }),
      operator: '>',
      right: new U2.AST_Number({ value: 0 })
    })) : new U2.AST_Binary({
      left: new U2.AST_Call({
        expression: new U2.AST_Dot({
          expression: new U2.AST_String({ value: str }),
          property: 'charCodeAt'
        }),
        args: [pos]
      }),
      operator: '>',
      right: new U2.AST_Number({ value: 0 })
    });
  }

  if (typeof min === 'number') {
    min = new U2.AST_Number({ value: min });
  }
  if (typeof max === 'number') {
    max = new U2.AST_Number({ value: max });
  }

  return comment ? comment(comment, new U2.AST_Call({
    args: [val, min, max],
    expression: new U2.AST_Function({
      argnames: [
        new U2.AST_SymbolFunarg({ name: 'value' }),
        new U2.AST_SymbolFunarg({ name: 'min' }),
        new U2.AST_SymbolFunarg({ name: 'max' })
      ],
      body: [
        new U2.AST_Return({
          value: new U2.AST_Binary({
            left: new U2.AST_Binary({
              left: new U2.AST_SymbolRef({ name: 'min' }),
              operator: '<=',
              right: new U2.AST_SymbolRef({ name: 'value' })
            }),
            operator: '&&',
            right: new U2.AST_Binary({
              left: new U2.AST_SymbolRef({ name: 'value' }),
              operator: '<=',
              right: new U2.AST_SymbolRef({ name: 'max' })
            })
          })
        })
      ]
    })
  })) : new U2.AST_Call({
    args: [val, min, max],
    expression: new U2.AST_Function({
      argnames: [
        new U2.AST_SymbolFunarg({ name: 'value' }),
        new U2.AST_SymbolFunarg({ name: 'min' }),
        new U2.AST_SymbolFunarg({ name: 'max' })
      ],
      body: [
        new U2.AST_Return({
          value: new U2.AST_Binary({
            left: new U2.AST_Binary({
              left: new U2.AST_SymbolRef({ name: 'min' }),
              operator: '<=',
              right: new U2.AST_SymbolRef({ name: 'value' })
            }),
            operator: '&&',
            right: new U2.AST_Binary({
              left: new U2.AST_SymbolRef({ name: 'value' }),
              operator: '<=',
              right: new U2.AST_SymbolRef({ name: 'max' })
            })
          })
        })
      ]
    })
  });
}

function parseIp(ip: string): v4.Address | v6.Address | null {
  if (ip.charCodeAt(0) === '['.charCodeAt(0)) {
    ip = ip.substr(1, ip.length - 2);
  }
  let addr = new v4.Address(ip);
  if (!addr.isValid()) {
    addr = new v6.Address(ip);
    if (!addr.isValid()) {
      return null;
    }
  }
  return addr;
}

function normalizeIp(addr: v4.Address | v6.Address): string {
  return (addr.correctForm || addr.canonicalForm).call(addr);
}

const ipv6Max = new v6.Address('::/0').endAddress().canonicalForm();
const localHosts = ["127.0.0.1", "[::1]", "localhost"];

function getWeekdayList(condition: Condition): boolean[] {
  if (condition.days) {
    return Array.from({ length: 7 }, (_, i) => condition.days!.charCodeAt(i) > 64);
  } else {
    return Array.from({ length: 7 }, (_, i) => condition.startDay! <= i && i <= condition.endDay!);
  }
}

function _handler(conditionType: string | Condition): ConditionHandler {
  if (typeof conditionType !== 'string') {
    conditionType = conditionType.conditionType;
  }
  const handler = _conditionTypes[conditionType];

  if (!handler) {
    throw new Error(`Unknown condition type: ${conditionType}`);
  }
  return handler;
}

const _conditionTypes: ConditionTypes = {
  'TrueCondition': {
    abbrs: ['True'],
    analyze: () => null,
    match: () => true,
    compile: () => new U2.AST_True(),
    str: () => '',
    fromStr: (_, condition) => condition
  },

  'FalseCondition': {
    abbrs: ['False', 'Disabled'],
    analyze: () => null,
    match: () => false,
    compile: () => new U2.AST_False({ value: false }),
    str: () => 'false',
    fromStr: (str: string, condition: Condition) => {
      if (str.length > 0) {
        condition.pattern = str;
      }
      return condition;
    }
  },

  'UrlRegexCondition': {
    abbrs: ['UR', 'URegex', 'UrlR', 'UrlRegex'],
    analyze: (condition) => safeRegex(escapeSlash(condition.pattern)),
    match: (condition: Condition, request: Request, cache: ConditionCache) => {
      return cache.analyzed?.test(request.url) ?? false;
    },
    compile: (condition: Condition, cache: ConditionCache) => {
      if (!cache.analyzed) {
        throw new Error('Invalid regex pattern');
      }
      return regTest('url', cache.analyzed);
    }
  }
}; 