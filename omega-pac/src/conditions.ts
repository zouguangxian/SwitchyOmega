import type { UrlWithStringQuery } from 'url';
import { parse as parseUrl, format as formatUrl } from 'url';

import * as U2 from 'uglify-js';
import * as IP from 'ip-address';

import { shExp2RegExp, escapeSlash } from './shexp_utils';
import { AttachedCache } from './utils';

type Condition = {
  conditionType: string;
  pattern?: string;
  [key: string]: any;
};

type RequestInfo = {
  url: string;
  host: string;
  scheme: string;
};

type ConditionCache = {
  analyzed: any;
  compiled?: any;
};

type ConditionHandler = {
  abbrs: string[];
  tag?: (this: any, condition: Condition) => string | undefined;
  analyze: (this: any, condition: Condition) => any;
  match: (this: any, condition: Condition, request: RequestInfo, cache: ConditionCache) => boolean;
  compile: (this: any, condition: Condition, cache: ConditionCache) => any;
  str?: (this: any, condition: Condition) => string;
  fromStr?: (this: any, input: string, condition: Condition) => Condition | null;
};

const colonCharCode = ':'.charCodeAt(0);

const ensureUrlObject = (url: string | UrlWithStringQuery): UrlWithStringQuery => {
  return typeof url === 'string' ? (parseUrl(url) as UrlWithStringQuery) : url;
};

const ensureRegExp = (api: any, value: string | RegExp): RegExp => {
  if (value instanceof RegExp) {
    return value;
  }
  return api.safeRegex(escapeSlash(value));
};

const Conditions: any = {
  requestFromUrl(url: string | UrlWithStringQuery): RequestInfo {
    const parsed = ensureUrlObject(url);
    const formatted = formatUrl(parsed);
    return {
      url: formatted,
      host: parsed.hostname ?? '',
      scheme: (parsed.protocol ?? '').replace(':', '')
    };
  },

  urlWildcard2HostWildcard(pattern: string): string | undefined {
    const result = pattern.match(/^\*:\/\/((?:\w|[?*._\-])+)\/\*$/);
    return result ? result[1] : undefined;
  },

  tag(condition: Condition): unknown {
    return Conditions._condCache.tag(condition);
  },

  analyze(condition: Condition): ConditionCache {
    return Conditions._condCache.get(condition, () => ({
      analyzed: Conditions._handler(condition.conditionType).analyze.call(Conditions, condition)
    }));
  },

  match(condition: Condition, request: RequestInfo): boolean {
    const cache = Conditions.analyze(condition);
    return Conditions._handler(condition.conditionType).match.call(Conditions, condition, request, cache);
  },

  compile(condition: Condition): any {
    const cache = Conditions.analyze(condition);
    if (cache.compiled) {
      return cache.compiled;
    }
    const handler = Conditions._handler(condition.conditionType);
    cache.compiled = handler.compile.call(Conditions, condition, cache);
    return cache.compiled;
  },

  str(condition: Condition, options: { abbr?: number | string } = { abbr: -1 }): string {
    const handler = Conditions._handler(condition.conditionType);
    const { abbr = -1 } = options;
    if (handler.abbrs[0]?.length === 0 && typeof condition.pattern === 'string') {
      const endCode = condition.pattern.charCodeAt(condition.pattern.length - 1);
      if (endCode !== Conditions.colonCharCode && condition.pattern.indexOf(' ') < 0) {
        return condition.pattern;
      }
    }
    const strFn = handler.str;
    const typeStr = typeof abbr === 'number'
      ? handler.abbrs[(handler.abbrs.length + abbr) % handler.abbrs.length]
      : condition.conditionType;
    let result = `${typeStr}:`;
    const part = strFn ? strFn.call(Conditions, condition) : condition.pattern;
    if (part) {
      result += ` ${part}`;
    }
    return result;
  },

  colonCharCode,

  fromStr(str: string): Condition | null {
    let value = str.trim();
    let i = value.indexOf(' ');
    if (i < 0) {
      i = value.length;
    }
    let conditionType: string;
    if (value.charCodeAt(i - 1) === Conditions.colonCharCode) {
      conditionType = value.substr(0, i - 1);
      value = value.substr(i + 1).trim();
    } else {
      conditionType = '';
    }
    conditionType = Conditions.typeFromAbbr(conditionType) ?? '';
    if (!conditionType) {
      return null;
    }
    const condition: Condition = { conditionType };
    const fromStrFn = Conditions._handler(condition.conditionType).fromStr;
    if (fromStrFn) {
      return fromStrFn.call(Conditions, value, condition);
    }
    condition.pattern = value;
    return condition;
  },

  _abbrs: null as Record<string, string> | null,

  typeFromAbbr(abbr: string): string | undefined {
    if (!Conditions._abbrs) {
      Conditions._abbrs = {};
      const ref = Conditions._conditionTypes as Record<string, ConditionHandler>;
      Object.keys(ref).forEach((type) => {
        const handler = ref[type];
        Conditions._abbrs![type.toUpperCase()] = type;
        handler.abbrs.forEach((ab) => {
          Conditions._abbrs![ab.toUpperCase()] = type;
        });
      });
    }
    return Conditions._abbrs![abbr.toUpperCase()];
  },

  comment<T>(comment: string | undefined, node: T): T {
    if (!comment) {
      return node;
    }
    const anyNode: any = node;
    if (!anyNode.start) {
      anyNode.start = {};
    }
    Object.defineProperty(anyNode.start, '_comments_dumped', {
      get() {
        return false;
      },
      set() {
        return false;
      }
    });
    if (!anyNode.start.comments_before) {
      anyNode.start.comments_before = [];
    }
    anyNode.start.comments_before.push({ type: 'comment2', value: comment });
    return node;
  },

  safeRegex(expr: string | RegExp): RegExp {
    if (expr instanceof RegExp) {
      return expr;
    }
    try {
      return new RegExp(expr);
    } catch (error) {
      return /(?!)/;
    }
  },

  regTest(expr: string | any, regexp: string | RegExp): any {
    let actualRegexp = ensureRegExp(Conditions, regexp);
    let symbolExpr = expr;
    if (typeof expr === 'string') {
      symbolExpr = new U2.AST_SymbolRef({ name: expr });
    }
    return new U2.AST_Call({
      args: [symbolExpr],
      expression: new U2.AST_Dot({
        property: 'test',
        expression: new U2.AST_RegExp({
          value: actualRegexp
        })
      })
    });
  },

  isInt(num: unknown): boolean {
    return typeof num === 'number' && !Number.isNaN(num) && Math.floor(num) === num;
  },

  between(val: any, min: number, max: number, comment?: string): any {
    if (min === max) {
      let minNode: any = min;
      if (typeof min === 'number') {
        minNode = new U2.AST_Number({ value: min });
      }
      return Conditions.comment(comment, new U2.AST_Binary({
        left: val,
        operator: '===',
        right: minNode
      }));
    }
    if (min > max) {
      return Conditions.comment(comment, new U2.AST_False());
    }
    if (Conditions.isInt(min) && Conditions.isInt(max) && max - min < 32) {
      const actualComment = comment ?? `${min} <= value && value <= ${max}`;
      const tmpl = '0123456789abcdefghijklmnopqrstuvwxyz';
      const str = max < tmpl.length ? tmpl.substr(min, max - min + 1) : tmpl.substr(0, max - min + 1);
      const pos = min === 0
        ? val
        : new U2.AST_Binary({
          left: val,
          operator: '-',
          right: new U2.AST_Number({ value: min })
        });
      return Conditions.comment(actualComment, new U2.AST_Binary({
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
    return Conditions.comment(comment, new U2.AST_Call({
      args: [val, minNode, maxNode],
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
  },

  parseIp(ip: string): any {
    let value = ip;
    if (value.charCodeAt(0) === '['.charCodeAt(0)) {
      value = value.substr(1, value.length - 2);
    }
    let addr = new IP.v4.Address(value);
    if (!addr.isValid()) {
      addr = new IP.v6.Address(value);
      if (!addr.isValid()) {
        return null;
      }
    }
    return addr;
  },

  normalizeIp(addr: any): string {
    const fn = addr.correctForm ?? addr.canonicalForm;
    return fn.call(addr);
  },

  ipv6Max: new IP.v6.Address('::/0').endAddress().canonicalForm(),

  localHosts: ['127.0.0.1', '[::1]', 'localhost'],

  getWeekdayList(condition: Condition): boolean[] {
    const result: boolean[] = [];
    if (condition.days) {
      for (let i = 0; i < 7; i += 1) {
        result.push(condition.days.charCodeAt(i) > 64);
      }
    } else {
      for (let i = 0; i < 7; i += 1) {
        result.push(condition.startDay <= i && i <= condition.endDay);
      }
    }
    return result;
  },

  _condCache: new AttachedCache<ConditionCache, Condition>(function tag(condition: Condition) {
    const handler = Conditions._handler(condition.conditionType);
    const tagValue = handler.tag ? handler.tag.call(Conditions, condition) : Conditions.str(condition);
    return `${condition.conditionType}$${tagValue}`;
  }),

  _setProp(obj: Record<string, any>, prop: string, value: unknown): void {
    if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
      Object.defineProperty(obj, prop, { writable: true });
    }
    obj[prop] = value;
  },

  _handler(conditionType: Condition | string): ConditionHandler {
    const type = typeof conditionType === 'string' ? conditionType : conditionType.conditionType;
    const handler = Conditions._conditionTypes[type];
    if (!handler) {
      throw new Error(`Unknown condition type: ${type}`);
    }
    return handler;
  },

  _conditionTypes: {
    TrueCondition: {
      abbrs: ['True'],
      analyze() {
        return null;
      },
      match() {
        return true;
      },
      compile() {
        return new U2.AST_True();
      },
      str() {
        return '';
      },
      fromStr(_: string, condition: Condition) {
        return condition;
      }
    },

    FalseCondition: {
      abbrs: ['False', 'Disabled'],
      analyze() {
        return null;
      },
      match() {
        return false;
      },
      compile() {
        return new U2.AST_False();
      },
      fromStr(str: string, condition: Condition) {
        if (str.length > 0) {
          condition.pattern = str;
        }
        return condition;
      }
    },

    UrlRegexCondition: {
      abbrs: ['UR', 'URegex', 'UrlR', 'UrlRegex'],
      analyze(condition: Condition) {
        return this.safeRegex(escapeSlash(condition.pattern ?? ''));
      },
      match(_: Condition, request: RequestInfo, cache: ConditionCache) {
        return cache.analyzed.test(request.url);
      },
      compile(_: Condition, cache: ConditionCache) {
        return this.regTest('url', cache.analyzed);
      }
    },

    UrlWildcardCondition: {
      abbrs: ['U', 'UW', 'Url', 'UrlW', 'UWild', 'UWildcard', 'UrlWild', 'UrlWildcard'],
      analyze(condition: Condition) {
        const parts = (condition.pattern ?? '').split('|')
          .filter((pattern: string) => pattern)
          .map((pattern: string) => shExp2RegExp(pattern, { trimAsterisk: true }));
        return this.safeRegex(parts.join('|'));
      },
      match(_: Condition, request: RequestInfo, cache: ConditionCache) {
        return cache.analyzed.test(request.url);
      },
      compile(_: Condition, cache: ConditionCache) {
        return this.regTest('url', cache.analyzed);
      }
    },

    HostRegexCondition: {
      abbrs: ['R', 'HR', 'Regex', 'HostR', 'HRegex', 'HostRegex'],
      analyze(condition: Condition) {
        return this.safeRegex(escapeSlash(condition.pattern ?? ''));
      },
      match(_: Condition, request: RequestInfo, cache: ConditionCache) {
        return cache.analyzed.test(request.host);
      },
      compile(_: Condition, cache: ConditionCache) {
        return this.regTest('host', cache.analyzed);
      }
    },

    HostWildcardCondition: {
      abbrs: ['', 'H', 'W', 'HW', 'Wild', 'Wildcard', 'Host', 'HostW', 'HWild', 'HWildcard', 'HostWild', 'HostWildcard'],
      analyze(condition: Condition) {
        const parts = (condition.pattern ?? '').split('|')
          .filter((pattern: string) => Boolean(pattern))
          .map((pattern: string) => {
            let current = pattern;
            if (current.charCodeAt(0) === '.'.charCodeAt(0)) {
              current = `*${current}`;
            }
            if (current.indexOf('**.') === 0) {
              return shExp2RegExp(current.substring(1), { trimAsterisk: true });
            }
            if (current.indexOf('*.') === 0) {
              return shExp2RegExp(current.substring(2), { trimAsterisk: false })
                .replace(/./, '(?:^|\.)')
                .replace(/\.\*\$$/, '');
            }
            return shExp2RegExp(current, { trimAsterisk: true });
          });
        return this.safeRegex(parts.join('|'));
      },
      match(_: Condition, request: RequestInfo, cache: ConditionCache) {
        return cache.analyzed.test(request.host);
      },
      compile(_: Condition, cache: ConditionCache) {
        return this.regTest('host', cache.analyzed);
      }
    },

    BypassCondition: {
      abbrs: ['B', 'Bypass'],
      analyze(condition: Condition) {
        const cache: any = {
          host: null,
          ip: null,
          scheme: null,
          url: null,
          normalizedPattern: ''
        };
        let server = condition.pattern ?? '';
        if (server === '<local>') {
          cache.host = server;
          return cache;
        }
        let parts = server.split('://');
        if (parts.length > 1) {
          cache.scheme = parts[0];
          cache.normalizedPattern = `${cache.scheme}://`;
          server = parts[1];
        }
        parts = server.split('/');
        if (parts.length > 1) {
          const addr = this.parseIp(parts[0]);
          const prefixLen = parseInt(parts[1], 10);
          if (addr && !Number.isNaN(prefixLen)) {
            cache.ip = {
              conditionType: 'IpCondition',
              ip: this.normalizeIp(addr),
              prefixLength: prefixLen
            };
            cache.normalizedPattern += `${cache.ip.ip}/${cache.ip.prefixLength}`;
            return cache;
          }
        }
        let matchPort: string | undefined;
        let serverIp = this.parseIp(server);
        if (!serverIp) {
          const pos = server.lastIndexOf(':');
          if (pos >= 0) {
            matchPort = server.substring(pos + 1);
            server = server.substring(0, pos);
          }
          serverIp = this.parseIp(server);
        }
        if (serverIp) {
          const normalized = this.normalizeIp(serverIp);
          if (serverIp.v4) {
            cache.normalizedPattern += normalized;
          } else {
            cache.normalizedPattern += `[${normalized}]`;
          }
          server = normalized;
        } else {
          if (server.charCodeAt(0) === '.'.charCodeAt(0)) {
            server = `*${server}`;
          }
          cache.normalizedPattern = server;
        }
        if (matchPort) {
          cache.port = matchPort;
          cache.normalizedPattern += `:${cache.port}`;
          if (serverIp && !serverIp.v4) {
            server = `[${server}]`;
          }
          let serverRegex = shExp2RegExp(server);
          serverRegex = serverRegex.substring(1, serverRegex.length - 1);
          const scheme = cache.scheme ?? '[^:]+';
          cache.url = this.safeRegex(`^${scheme}:\/\/${serverRegex}:${matchPort}\/`);
        } else if (server !== '*') {
          const serverRegex = shExp2RegExp(server, { trimAsterisk: true });
          cache.host = this.safeRegex(serverRegex);
        }
        return cache;
      },
      match(condition: Condition, request: RequestInfo, cache: ConditionCache) {
        const analyzed = cache.analyzed;
        if (analyzed.scheme && analyzed.scheme !== request.scheme) {
          return false;
        }
        if (analyzed.ip && !this.match(analyzed.ip, request)) {
          return false;
        }
        if (analyzed.host) {
          if (analyzed.host === '<local>') {
            return request.host === '127.0.0.1' || request.host === '::1' || request.host.indexOf('.') < 0;
          }
          if (!analyzed.host.test(request.host)) {
            return false;
          }
        }
        if (analyzed.url && !analyzed.url.test(request.url)) {
          return false;
        }
        return true;
      },
      str(condition: Condition) {
        const analyzeFn = this._handler(condition).analyze;
        const cache = analyzeFn.call(Conditions, condition);
        if (cache.normalizedPattern) {
          return cache.normalizedPattern;
        }
        return condition.pattern ?? '';
      },
      compile(condition: Condition, cache: ConditionCache) {
        const analyzed = cache.analyzed;
        if (analyzed.url) {
          return this.regTest('url', analyzed.url);
        }
        const conditions: any[] = [];
        if (analyzed.host === '<local>') {
          const hostEquals = (host: string) => new U2.AST_Binary({
            left: new U2.AST_SymbolRef({ name: 'host' }),
            operator: '===',
            right: new U2.AST_String({ value: host })
          });
          return new U2.AST_Binary({
            left: new U2.AST_Binary({
              left: hostEquals('127.0.0.1'),
              operator: '||',
              right: hostEquals('::1')
            }),
            operator: '||',
            right: new U2.AST_Binary({
              left: new U2.AST_Call({
                expression: new U2.AST_Dot({
                  expression: new U2.AST_SymbolRef({ name: 'host' }),
                  property: 'indexOf'
                }),
                args: [new U2.AST_String({ value: '.' })]
              }),
              operator: '<',
              right: new U2.AST_Number({ value: 0 })
            })
          });
        }
        if (analyzed.scheme) {
          conditions.push(new U2.AST_Binary({
            left: new U2.AST_SymbolRef({ name: 'scheme' }),
            operator: '===',
            right: new U2.AST_String({ value: analyzed.scheme })
          }));
        }
        if (analyzed.host) {
          conditions.push(this.regTest('host', analyzed.host));
        } else if (analyzed.ip) {
          conditions.push(this.compile(analyzed.ip));
        }
        if (conditions.length === 0) {
          return new U2.AST_True();
        }
        if (conditions.length === 1) {
          return conditions[0];
        }
        return new U2.AST_Binary({
          left: conditions[0],
          operator: '&&',
          right: conditions[1]
        });
      }
    },

    KeywordCondition: {
      abbrs: ['K', 'KW', 'Keyword'],
      analyze() {
        return null;
      },
      match(condition: Condition, request: RequestInfo) {
        return request.scheme === 'http' && request.url.indexOf(condition.pattern ?? '') >= 0;
      },
      compile(condition: Condition) {
        return new U2.AST_Binary({
          left: new U2.AST_Binary({
            left: new U2.AST_SymbolRef({ name: 'scheme' }),
            operator: '===',
            right: new U2.AST_String({ value: 'http' })
          }),
          operator: '&&',
          right: new U2.AST_Binary({
            left: new U2.AST_Call({
              expression: new U2.AST_Dot({
                expression: new U2.AST_SymbolRef({ name: 'url' }),
                property: 'indexOf'
              }),
              args: [new U2.AST_String({ value: condition.pattern ?? '' })]
            }),
            operator: '>=',
            right: new U2.AST_Number({ value: 0 })
          })
        });
      }
    },

    IpCondition: {
      abbrs: ['Ip'],
      analyze(condition: Condition) {
        const cache: any = { addr: null, normalized: null };
        let ip = condition.ip ?? '';
        if (ip.charCodeAt(0) === '['.charCodeAt(0)) {
          ip = ip.substr(1, ip.length - 2);
        }
        const addrStr = `${ip}/${condition.prefixLength}`;
        cache.addr = this.parseIp(addrStr);
        if (!cache.addr) {
          throw new Error(`Invalid IP address ${addrStr}`);
        }
        cache.normalized = this.normalizeIp(cache.addr);
        const mask = cache.addr.v4
          ? new IP.v4.Address(`255.255.255.255/${cache.addr.subnetMask}`)
          : new IP.v6.Address(`${this.ipv6Max}/${cache.addr.subnetMask}`);
        cache.mask = this.normalizeIp(mask.startAddress());
        return cache;
      },
      match(_: Condition, request: RequestInfo, cache: ConditionCache) {
        const addr = this.parseIp(request.host);
        if (!addr) {
          return false;
        }
        const analyzed = cache.analyzed;
        if (addr.v4 !== analyzed.addr.v4) {
          return false;
        }
        return addr.isInSubnet(analyzed.addr);
      },
      compile(_: Condition, cache: ConditionCache) {
        const analyzed = cache.analyzed;
        const hostLooksLikeIp = analyzed.addr.v4
          ? new U2.AST_Binary({
            left: new U2.AST_Sub({
              expression: new U2.AST_SymbolRef({ name: 'host' }),
              property: new U2.AST_Binary({
                left: new U2.AST_Dot({
                  expression: new U2.AST_SymbolRef({ name: 'host' }),
                  property: 'length'
                }),
                operator: '-',
                right: new U2.AST_Number({ value: 1 })
              })
            }),
            operator: '>=',
            right: new U2.AST_Number({ value: 0 })
          })
          : new U2.AST_Binary({
            left: new U2.AST_Call({
              expression: new U2.AST_Dot({
                expression: new U2.AST_SymbolRef({ name: 'host' }),
                property: 'indexOf'
              }),
              args: [new U2.AST_String({ value: ':' })]
            }),
            operator: '>=',
            right: new U2.AST_Number({ value: 0 })
          });
        if (analyzed.addr.subnetMask === 0) {
          return hostLooksLikeIp;
        }
        const hostIsInNet = new U2.AST_Call({
          expression: new U2.AST_SymbolRef({ name: 'isInNet' }),
          args: [
            new U2.AST_SymbolRef({ name: 'host' }),
            new U2.AST_String({ value: analyzed.normalized }),
            new U2.AST_String({ value: analyzed.mask })
          ]
        });
        if (!analyzed.addr.v4) {
          const hostIsInNetEx = new U2.AST_Call({
            expression: new U2.AST_SymbolRef({ name: 'isInNetEx' }),
            args: [
              new U2.AST_SymbolRef({ name: 'host' }),
              new U2.AST_String({ value: `${analyzed.normalized}${analyzed.addr.subnet}` })
            ]
          });
          return new U2.AST_Binary({
            left: hostLooksLikeIp,
            operator: '&&',
            right: new U2.AST_Conditional({
              condition: new U2.AST_Binary({
                left: new U2.AST_UnaryPrefix({
                  operator: 'typeof',
                  expression: new U2.AST_SymbolRef({ name: 'isInNetEx' })
                }),
                operator: '===',
                right: new U2.AST_String({ value: 'function' })
              }),
              consequent: hostIsInNetEx,
              alternative: hostIsInNet
            })
          });
        }
        return new U2.AST_Binary({
          left: hostLooksLikeIp,
          operator: '&&',
          right: hostIsInNet
        });
      },
      str(condition: Condition) {
        return `${condition.ip}/${condition.prefixLength}`;
      },
      fromStr(str: string, condition: Condition) {
        const addr = this.parseIp(str);
        if (addr) {
          condition.ip = addr.addressMinusSuffix;
          condition.prefixLength = addr.subnetMask;
        } else {
          condition.ip = '0.0.0.0';
          condition.prefixLength = 0;
        }
        return condition;
      }
    },

    HostLevelsCondition: {
      abbrs: ['Lv', 'Level', 'Levels', 'HL', 'HLv', 'HLevel', 'HLevels', 'HostL', 'HostLv', 'HostLevel', 'HostLevels'],
      analyze() {
        return '.'.charCodeAt(0);
      },
      match(condition: Condition, request: RequestInfo, cache: ConditionCache) {
        const dotCharCode = cache.analyzed;
        let dotCount = 0;
        for (let i = 0; i < request.host.length; i += 1) {
          if (request.host.charCodeAt(i) === dotCharCode) {
            dotCount += 1;
            if (dotCount > condition.maxValue) {
              return false;
            }
          }
        }
        return dotCount >= condition.minValue;
      },
      compile(condition: Condition) {
        const val = new U2.AST_Dot({
          property: 'length',
          expression: new U2.AST_Call({
            args: [new U2.AST_String({ value: '.' })],
            expression: new U2.AST_Dot({
              expression: new U2.AST_SymbolRef({ name: 'host' }),
              property: 'split'
            })
          })
        });
        return this.between(
          val,
          (condition.minValue ?? 0) + 1,
          (condition.maxValue ?? 0) + 1,
          `${condition.minValue} <= hostLevels <= ${condition.maxValue}`
        );
      },
      str(condition: Condition) {
        return `${condition.minValue}~${condition.maxValue}`;
      },
      fromStr(str: string, condition: Condition) {
        const [minValueStr, maxValueStr] = str.split('~');
        condition.minValue = parseInt(minValueStr, 10);
        condition.maxValue = parseInt(maxValueStr, 10);
        if (!(condition.minValue > 0)) {
          condition.minValue = 1;
        }
        if (!(condition.maxValue > 0)) {
          condition.maxValue = 1;
        }
        return condition;
      }
    },

    WeekdayCondition: {
      abbrs: ['WD', 'Week', 'Day', 'Weekday'],
      analyze() {
        return null;
      },
      match(condition: Condition) {
        const day = new Date().getDay();
        if (condition.days) {
          return condition.days.charCodeAt(day) > 64;
        }
        return condition.startDay <= day && day <= condition.endDay;
      },
      compile(condition: Condition) {
        const getDay = new U2.AST_Call({
          args: [],
          expression: new U2.AST_Dot({
            property: 'getDay',
            expression: new U2.AST_New({
              args: [],
              expression: new U2.AST_SymbolRef({ name: 'Date' })
            })
          })
        });
        if (condition.days) {
          return new U2.AST_Binary({
            left: new U2.AST_Call({
              expression: new U2.AST_Dot({
                expression: new U2.AST_String({ value: condition.days }),
                property: 'charCodeAt'
              }),
              args: [getDay]
            }),
            operator: '>',
            right: new U2.AST_Number({ value: 64 })
          });
        }
        return this.between(getDay, condition.startDay, condition.endDay);
      },
      str(condition: Condition) {
        if (condition.days) {
          return condition.days;
        }
        return `${condition.startDay}~${condition.endDay}`;
      },
      fromStr(str: string, condition: Condition) {
        if (str.indexOf('~') < 0 && str.length === 7) {
          condition.days = str;
        } else {
          const [startDayStr, endDayStr] = str.split('~');
          const parsedStart = parseInt(startDayStr, 10);
          const parsedEnd = parseInt(endDayStr, 10);
          condition.startDay = Number.isNaN(parsedStart) ? 0 : parsedStart;
          condition.endDay = Number.isNaN(parsedEnd) ? 0 : parsedEnd;
          if (condition.startDay < 0 || condition.startDay > 6) {
            condition.startDay = 0;
          }
          if (condition.endDay < 0 || condition.endDay > 6) {
            condition.endDay = 0;
          }
        }
        return condition;
      }
    },

    TimeCondition: {
      abbrs: ['T', 'Time', 'Hour'],
      analyze() {
        return null;
      },
      match(condition: Condition) {
        const hour = new Date().getHours();
        return condition.startHour <= hour && hour <= condition.endHour;
      },
      compile(condition: Condition) {
        const val = new U2.AST_Call({
          args: [],
          expression: new U2.AST_Dot({
            property: 'getHours',
            expression: new U2.AST_New({
              args: [],
              expression: new U2.AST_SymbolRef({ name: 'Date' })
            })
          })
        });
        return this.between(val, condition.startHour, condition.endHour);
      },
      str(condition: Condition) {
        return `${condition.startHour}~${condition.endHour}`;
      },
      fromStr(str: string, condition: Condition) {
        const [startHourStr, endHourStr] = str.split('~');
        const parsedStart = parseInt(startHourStr, 10);
        const parsedEnd = parseInt(endHourStr, 10);
        condition.startHour = Number.isNaN(parsedStart) ? 0 : parsedStart;
        condition.endHour = Number.isNaN(parsedEnd) ? 0 : parsedEnd;
        if (condition.startHour < 0 || condition.startHour >= 24) {
          condition.startHour = 0;
        }
        if (condition.endHour < 0 || condition.endHour >= 24) {
          condition.endHour = 0;
        }
        return condition;
      }
    }
  } as Record<string, ConditionHandler>
};

export = Conditions;

