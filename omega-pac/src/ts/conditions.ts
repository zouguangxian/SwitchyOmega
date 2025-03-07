import * as U2 from 'uglify-js';
import * as IP from 'ip-address';
import * as Url from 'url';
import { shExp2RegExp, escapeSlash } from '../shexp_utils';
import { AttachedCache } from '../utils';

interface Request {
  url: string;
  host: string;
  scheme: string;
}

interface Condition {
  conditionType: string;
  pattern?: string;
  days?: string;
  startDay?: number;
  endDay?: number;
  [key: string]: any;
}

interface ConditionHandler {
  abbrs: string[];
  analyze: (condition: Condition) => any;
  match: (condition: Condition, request: Request, cache: any) => boolean;
  compile: (condition: Condition, cache?: any) => U2.AST_Node;
  str?: (condition: Condition) => string;
  fromStr?: (str: string, condition: Condition) => Condition | null;
  tag?: (condition: Condition) => string;
}

interface ConditionTypes {
  [key: string]: ConditionHandler;
}

interface AnalyzeCache {
  analyzed: any;
  compiled?: U2.AST_Node;
}

interface AST_Node extends U2.AST_Node {
  start?: {
    _comments_dumped?: boolean;
    comments_before?: Array<{ type: string; value: string }>;
  };
}

const colonCharCode = ':'.charCodeAt(0);
const localHosts = ["127.0.0.1", "[::1]", "localhost"];
const ipv6Max = new IP.v6.Address('::/0').endAddress().canonicalForm();

let _abbrs: { [key: string]: string } | null = null;

const _condCache = new AttachedCache<Condition, string>((condition: Condition) => {
  const tag = _handler(condition.conditionType).tag;
  const result = tag ? tag.apply(exports, [condition]) : str(condition);
  return condition.conditionType + '$' + result;
});

function _setProp(obj: any, prop: string, value: any): void {
  if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
    Object.defineProperty(obj, prop, { writable: true });
  }
  obj[prop] = value;
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

function requestFromUrl(url: string | URL): Request {
  if (typeof url === 'string') {
    url = new URL(url);
  }
  return {
    url: url.toString(),
    host: url.hostname,
    scheme: url.protocol.replace(':', '')
  };
}

function urlWildcard2HostWildcard(pattern: string): string | undefined {
  const result = pattern.match(/^\*:\/\/((?:\w|[?*._\-])+)\/\*$/);
  return result?.[1];
}

function tag(condition: Condition): string {
  return _condCache.tag(condition);
}

function analyze(condition: Condition): AnalyzeCache {
  return _condCache.get<AnalyzeCache>(condition, () => ({
    analyzed: _handler(condition.conditionType).analyze.call(exports, condition)
  }));
}

function match(condition: Condition, request: Request): boolean {
  const cache = analyze(condition);
  return _handler(condition.conditionType).match.call(exports, condition, request, cache);
}

function compile(condition: Condition): U2.AST_Node {
  const cache = analyze(condition);
  if (cache.compiled) return cache.compiled;
  const handler = _handler(condition.conditionType);
  cache.compiled = handler.compile.call(exports, condition, cache);
  return cache.compiled;
}

function str(condition: Condition, options: { abbr?: number } = { abbr: -1 }): string {
  const handler = _handler(condition.conditionType);
  if (handler.abbrs[0].length === 0 && condition.pattern) {
    const endCode = condition.pattern.charCodeAt(condition.pattern.length - 1);
    if (endCode !== colonCharCode && condition.pattern.indexOf(' ') < 0) {
      return condition.pattern;
    }
  }
  const str = handler.str;
  const typeStr = typeof options.abbr === 'number'
    ? handler.abbrs[(handler.abbrs.length + options.abbr) % handler.abbrs.length]
    : condition.conditionType;
  let result = typeStr + ':';
  const part = str ? str.call(exports, condition) : condition.pattern || '';
  if (part) result += ' ' + part;
  return result;
}

function fromStr(str: string): Condition | null {
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
  const condition: Condition = { conditionType };
  const fromStr = _handler(condition.conditionType).fromStr;
  if (fromStr) {
    return fromStr.call(exports, str, condition);
  } else {
    condition.pattern = str;
    return condition;
  }
}

function typeFromAbbr(abbr: string): string | undefined {
  if (!_abbrs) {
    _abbrs = {};
    for (const [type, { abbrs }] of Object.entries(_conditionTypes)) {
      _abbrs[type.toUpperCase()] = type;
      for (const ab of abbrs) {
        _abbrs[ab.toUpperCase()] = type;
      }
    }
  }
  return _abbrs[abbr.toUpperCase()];
}

function comment(comment: string | undefined, node: AST_Node): AST_Node {
  if (!comment) return node;
  node.start = node.start || {};
  Object.defineProperty(node.start, '_comments_dumped', {
    get: () => false,
    set: () => false
  });
  node.start.comments_before = node.start.comments_before || [];
  node.start.comments_before.push({ type: 'comment2', value: comment });
  return node;
}

function safeRegex(expr: string): RegExp {
  try {
    return new RegExp(expr);
  } catch (_) {
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

function between(val: U2.AST_Node | number, min: number | U2.AST_Node, max: number | U2.AST_Node, comment?: string): U2.AST_Node {
  const valNode = typeof val === 'number' ? new U2.AST_Number({ value: val }) : val;
  
  if (min === max) {
    if (typeof min === 'number') {
      min = new U2.AST_Number({ value: min });
    }
    return exports.comment(comment, new U2.AST_Binary({
      left: valNode,
      operator: '===',
      right: min
    }));
  }

  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    return exports.comment(comment, new U2.AST_False());
  }

  if (typeof min === 'number' && typeof max === 'number' && isInt(min) && isInt(max) && max - min < 32) {
    comment = comment || `${min} <= value && value <= ${max}`;
    const tmpl = "0123456789abcdefghijklmnopqrstuvwxyz";
    const str = max < tmpl.length ? tmpl.substr(min, max - min + 1) : tmpl.substr(0, max - min + 1);
    const pos = min === 0 ? valNode : new U2.AST_Binary({
      left: valNode,
      operator: '-',
      right: new U2.AST_Number({ value: min })
    });
    return exports.comment(comment, new U2.AST_Binary({
      left: new U2.AST_Call({
        expression: new U2.AST_Dot({
          expression: new U2.AST_String({ value: str }),
          property: 'charCodeAt'
        }),
        args: [pos]
      }),
      operator: '>',
      right: new U2.AST_Number({ value: 0 })
    }));
  }

  const minNode = typeof min === 'number' ? new U2.AST_Number({ value: min }) : min;
  const maxNode = typeof max === 'number' ? new U2.AST_Number({ value: max }) : max;

  return exports.comment(comment, new U2.AST_Call({
    args: [valNode, minNode, maxNode],
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
  }));
}

function parseIp(ip: string): IP.v4.Address | IP.v6.Address | null {
  if (ip.charCodeAt(0) === '['.charCodeAt(0)) {
    ip = ip.substr(1, ip.length - 2);
  }
  let addr = new IP.v4.Address(ip);
  if (!addr.isValid()) {
    addr = new IP.v6.Address(ip);
    if (!addr.isValid()) {
      return null;
    }
  }
  return addr;
}

function normalizeIp(addr: IP.v4.Address | IP.v6.Address): string {
  return (addr.correctForm || addr.canonicalForm).call(addr);
}

function getWeekdayList(condition: Condition): boolean[] {
  if (condition.days) {
    return Array.from({ length: 7 }, (_, i) => condition.days!.charCodeAt(i) > 64);
  } else {
    return Array.from({ length: 7 }, (_, i) => condition.startDay! <= i && i <= condition.endDay!);
  }
}

const _conditionTypes: ConditionTypes = {
  'TrueCondition': {
    abbrs: ['True'],
    analyze: (condition: Condition) => null,
    match: () => true,
    compile: (condition: Condition) => new U2.AST_True(),
    str: (condition: Condition) => '',
    fromStr: (str: string, condition: Condition) => condition
  },

  'FalseCondition': {
    abbrs: ['False', 'Disabled'],
    analyze: (condition: Condition) => null,
    match: () => false,
    compile: (condition: Condition) => new U2.AST_False(),
    fromStr: (str: string, condition: Condition) => {
      if (str.length > 0) {
        condition.pattern = str;
      }
      return condition;
    }
  },

  'UrlRegexCondition': {
    abbrs: ['UR', 'URegex', 'UrlR', 'UrlRegex'],
    analyze: (condition: Condition) => safeRegex(escapeSlash(condition.pattern || '')),
    match: (condition: Condition, request: Request, cache: any) => {
      return cache.analyzed.test(request.url);
    },
    compile: (condition: Condition, cache: any) => {
      return regTest('url', cache.analyzed);
    }
  },

  'UrlWildcardCondition': {
    abbrs: ['UW', 'UrlW', 'UrlWildcard'],
    analyze: (condition: Condition) => shExp2RegExp(condition.pattern || ''),
    match: (condition: Condition, request: Request, cache: any) => {
      return cache.analyzed.test(request.url);
    },
    compile: (condition: Condition, cache: any) => {
      return regTest('url', cache.analyzed);
    }
  },

  'HostWildcardCondition': {
    abbrs: ['HW', 'HostW', 'HostWildcard'],
    analyze: (condition: Condition) => shExp2RegExp(condition.pattern || ''),
    match: (condition: Condition, request: Request, cache: any) => {
      return cache.analyzed.test(request.host);
    },
    compile: (condition: Condition, cache: any) => {
      return regTest('host', cache.analyzed);
    }
  },

  'KeywordCondition': {
    abbrs: ['KW', 'Keyword'],
    analyze: (condition: Condition) => {
      const pattern = condition.pattern || '';
      return new RegExp(escapeSlash(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    },
    match: (condition: Condition, request: Request, cache: any) => {
      return cache.analyzed.test(request.url);
    },
    compile: (condition: Condition, cache: any) => {
      return regTest('url', cache.analyzed);
    }
  },

  'IpCondition': {
    abbrs: ['IP'],
    analyze: (condition: Condition) => {
      const pattern = condition.pattern || '';
      const parts = pattern.split('/');
      const addr = parseIp(parts[0]);
      if (!addr) return null;
      const ip = normalizeIp(addr);
      const ipv6 = addr instanceof IP.v6.Address;
      const range = parts[1] ? parseInt(parts[1], 10) : (ipv6 ? 128 : 32);
      if (isNaN(range)) return null;
      return { ip, range, ipv6 };
    },
    match: (condition: Condition, request: Request, cache: any) => {
      if (!cache.analyzed) return false;
      const addr = parseIp(request.host);
      if (!addr) return false;
      if ((addr instanceof IP.v6.Address) !== cache.analyzed.ipv6) return false;
      const ip = normalizeIp(addr);
      return ip === cache.analyzed.ip;
    },
    compile: (condition: Condition, cache: any) => {
      if (!cache.analyzed) return new U2.AST_False();
      const { ip, range, ipv6 } = cache.analyzed;
      const comment = `${ip}/${range}`;
      return exports.comment(comment, new U2.AST_Call({
        expression: new U2.AST_Function({
          argnames: [
            new U2.AST_SymbolFunarg({ name: 'host' })
          ],
          body: [
            new U2.AST_Return({
              value: new U2.AST_Binary({
                left: new U2.AST_SymbolRef({ name: 'host' }),
                operator: '===',
                right: new U2.AST_String({ value: ip })
              })
            })
          ]
        }),
        args: [new U2.AST_SymbolRef({ name: 'host' })]
      }));
    },
    str: (condition: Condition) => condition.pattern || ''
  },

  'WeekdayCondition': {
    abbrs: ['W', 'Weekday'],
    analyze: (condition: Condition) => getWeekdayList(condition),
    match: (condition: Condition, request: Request, cache: any) => {
      const now = new Date();
      return cache.analyzed[now.getDay()];
    },
    compile: (condition: Condition, cache: any) => {
      const days = cache.analyzed;
      const comment = days.map((on: boolean, i: number) => 
        on ? 'SMTWTFS'[i] : '.').join('');
      return exports.comment(comment, new U2.AST_Call({
        expression: new U2.AST_Function({
          argnames: [],
          body: [
            new U2.AST_Return({
              value: new U2.AST_Binary({
                left: new U2.AST_Call({
                  expression: new U2.AST_Dot({
                    expression: new U2.AST_String({ value: days.map(Number).join('') }),
                    property: 'charCodeAt'
                  }),
                  args: [
                    new U2.AST_Call({
                      expression: new U2.AST_Dot({
                        expression: new U2.AST_New({
                          args: [],
                          expression: new U2.AST_SymbolRef({ name: 'Date' })
                        }),
                        property: 'getDay'
                      }),
                      args: []
                    })
                  ]
                }),
                operator: '===',
                right: new U2.AST_Number({ value: '1'.charCodeAt(0) })
              })
            })
          ]
        }),
        args: []
      }));
    },
    str: (condition: Condition) => {
      if (condition.days) return condition.days;
      return `${condition.startDay}-${condition.endDay}`;
    },
    fromStr: (str: string, condition: Condition) => {
      if (str.indexOf('-') >= 0) {
        const parts = str.split('-');
        condition.startDay = parseInt(parts[0], 10);
        condition.endDay = parseInt(parts[1], 10);
        if (isNaN(condition.startDay) || isNaN(condition.endDay)) return null;
      } else {
        condition.days = str;
      }
      return condition;
    }
  }
};

export {
  Request,
  Condition,
  ConditionHandler,
  requestFromUrl,
  urlWildcard2HostWildcard,
  tag,
  analyze,
  match,
  compile,
  str,
  fromStr,
  typeFromAbbr,
  comment,
  safeRegex,
  regTest,
  isInt,
  between,
  parseIp,
  normalizeIp,
  getWeekdayList,
  _conditionTypes,
  colonCharCode,
  localHosts,
  ipv6Max
}; 