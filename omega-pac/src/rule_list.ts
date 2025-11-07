import { Buffer } from 'buffer';

const Conditions = require('./conditions');

const strStartsWith = (str: string, prefix: string): boolean => str.substr(0, prefix.length) === prefix;

type ParsedRule = {
  condition: any;
  profileName: string | null;
  source?: string | null;
  note?: string | null;
};

type Parser = (text: string, matchProfileName: string, defaultProfileName: string | undefined, args?: Record<string, any>) => ParsedRule[];

const RuleList: Record<string, any> = {
  AutoProxy: {
    magicPrefix: 'W0F1dG9Qcm94',
    detect(text: string): boolean | undefined {
      if (strStartsWith(text, RuleList.AutoProxy.magicPrefix)) {
        return true;
      }
      if (strStartsWith(text, '[AutoProxy')) {
        return true;
      }
      return undefined;
    },
    preprocess(text: string): string {
      let result = text;
      if (strStartsWith(result, RuleList.AutoProxy.magicPrefix)) {
        result = Buffer.from(result, 'base64').toString('utf8');
      }
      return result;
    },
    parse(text: string, matchProfileName: string, defaultProfileName: string): ParsedRule[] {
      const normalRules: ParsedRule[] = [];
      const exclusiveRules: ParsedRule[] = [];
      text.split(/\n|\r/).forEach((lineRaw) => {
        let line = lineRaw.trim();
        if (line.length === 0 || line[0] === '!' || line[0] === '[') {
          return;
        }
        const source = line;
        let profile = matchProfileName;
        let list = normalRules;
        if (line[0] === '@' && line[1] === '@') {
          profile = defaultProfileName;
          list = exclusiveRules;
          line = line.substring(2);
        }
        let condition: any;
        if (line[0] === '/') {
          condition = {
            conditionType: 'UrlRegexCondition',
            pattern: line.substring(1, line.length - 1)
          };
        } else if (line[0] === '|') {
          if (line[1] === '|') {
            condition = {
              conditionType: 'HostWildcardCondition',
              pattern: `*.${line.substring(2)}`
            };
          } else {
            condition = {
              conditionType: 'UrlWildcardCondition',
              pattern: `${line.substring(1)}*`
            };
          }
        } else if (line.indexOf('*') < 0) {
          condition = {
            conditionType: 'KeywordCondition',
            pattern: line
          };
        } else {
          condition = {
            conditionType: 'UrlWildcardCondition',
            pattern: `http://*${line}*`
          };
        }
        list.push({ condition, profileName: profile, source });
      });
      return exclusiveRules.concat(normalRules);
    }
  },

  Switchy: {
    omegaPrefix: '[SwitchyOmega Conditions',
    specialLineStart: "[;#@!",

    detect(text: string): boolean | undefined {
      if (strStartsWith(text, RuleList.Switchy.omegaPrefix)) {
        return true;
      }
      return undefined;
    },

    parse(text: string, matchProfileName: string, defaultProfileName: string): ParsedRule[] {
      const switchy = RuleList.Switchy;
      const parser = switchy.getParser(text);
      if (parser === 'parseOmega') {
        return switchy.parseOmega(text, matchProfileName, defaultProfileName);
      }
      return switchy.parseLegacy(text, matchProfileName, defaultProfileName);
    },

    directReferenceSet({ ruleList, matchProfileName, defaultProfileName }: { ruleList: string; matchProfileName?: string; defaultProfileName?: string }): Record<string, string> | undefined {
      const text = ruleList.trim();
      const switchy = RuleList.Switchy;
      const parser = switchy.getParser(text);
      if (parser !== 'parseOmega') {
        return undefined;
      }
      if (!/(^|\n)@with\s+results?(\r|\n|$)/i.test(text)) {
        return undefined;
      }
      const refs: Record<string, string> = {};
      text.split(/\n|\r/).forEach((lineRaw) => {
        const line = lineRaw.trim();
        if (switchy.specialLineStart.indexOf(line[0]) >= 0) {
          return;
        }
        const iSpace = line.lastIndexOf(' +');
        let profile: string;
        if (iSpace < 0) {
          profile = defaultProfileName || 'direct';
        } else {
          profile = line.substr(iSpace + 2).trim();
        }
        refs[`+${profile}`] = profile;
      });
      return refs;
    },

    compose({ rules, defaultProfileName }: { rules: ParsedRule[]; defaultProfileName: string }, options: { withResult?: boolean; useExclusive?: boolean } = {}): string {
      const eol = '\r\n';
      let ruleList = `[SwitchyOmega Conditions]${eol}`;
      const opts = { ...options };
      if (opts.withResult) {
        ruleList += `@with result${eol}${eol}`;
      } else {
        ruleList += eol;
      }
      const specialLineStart = `${RuleList.Switchy.specialLineStart}+`;
      const useExclusive = opts.useExclusive ?? !opts.withResult;
      rules.forEach((rule) => {
        if (rule.note) {
          ruleList += `@note ${rule.note}${eol}`;
        }
        let line = Conditions.str(rule.condition);
        if (useExclusive && rule.profileName === defaultProfileName) {
          line = `!${line}`;
        } else {
          if (specialLineStart.indexOf(line[0]) >= 0) {
            line = `: ${line}`;
          }
          if (opts.withResult) {
            line += ` +${rule.profileName}`;
          }
        }
        ruleList += `${line}${eol}`;
      });
      if (opts.withResult) {
        ruleList += `${eol}* +${defaultProfileName}${eol}`;
      }
      return ruleList;
    },

    getParser(text: string): 'parseOmega' | 'parseLegacy' {
      const switchy = RuleList.Switchy;
      let parser: 'parseOmega' | 'parseLegacy' = 'parseOmega';
      if (!strStartsWith(text, switchy.omegaPrefix)) {
        if (text[0] === '#' || text.indexOf('\n#') >= 0) {
          parser = 'parseLegacy';
        }
      }
      return parser;
    },

    conditionFromLegacyWildcard(pattern: string): any {
      let result = pattern;
      if (result[0] === '@') {
        result = result.substring(1);
      } else {
        if (result.indexOf('://') <= 0 && result[0] !== '*') {
          result = `*${result}`;
        }
        if (result[result.length - 1] !== '*') {
          result += '*';
        }
      }
      const host = Conditions.urlWildcard2HostWildcard(result);
      if (host) {
        return {
          conditionType: 'HostWildcardCondition',
          pattern: host
        };
      }
      return {
        conditionType: 'UrlWildcardCondition',
        pattern: result
      };
    },

    parseLegacy(text: string, matchProfileName: string, defaultProfileName: string): ParsedRule[] {
      const normalRules: ParsedRule[] = [];
      const exclusiveRules: ParsedRule[] = [];
      let begin = false;
      let section = 'WILDCARD';
      const lines = text.split(/\n|\r/);
      for (const lineRaw of lines) {
        let line = lineRaw.trim();
        if (line.length === 0 || line[0] === ';') {
          continue;
        }
        if (!begin) {
          if (line.toUpperCase() === '#BEGIN') {
            begin = true;
          }
          continue;
        }
        if (line.toUpperCase() === '#END') {
          break;
        }
        if (line[0] === '[' && line[line.length - 1] === ']') {
          section = line.substring(1, line.length - 1).toUpperCase();
          continue;
        }
        const source = line;
        let profile = matchProfileName;
        let list = normalRules;
        if (line[0] === '!') {
          profile = defaultProfileName;
          list = exclusiveRules;
          line = line.substring(1);
        }
        let condition: any;
        if (section === 'WILDCARD') {
          condition = RuleList.Switchy.conditionFromLegacyWildcard(line);
        } else if (section === 'REGEXP') {
          condition = {
            conditionType: 'UrlRegexCondition',
            pattern: line
          };
        } else {
          condition = null;
        }
        if (condition) {
          list.push({ condition, profileName: profile, source });
        }
      }
      return exclusiveRules.concat(normalRules);
    },

    parseOmega(text: string, matchProfileName: string, defaultProfileName: string, args: Record<string, any> = {}): ParsedRule[] {
      const { strict } = args;
      let error: ((fields: any) => void) | undefined;
      if (strict) {
        error = (fields: any) => {
          const err = new Error(fields.message);
          Object.keys(fields).forEach((key) => {
            (err as any)[key] = fields[key];
          });
          throw err;
        };
      }
      const includeSource = args.source ?? true;
      const rules: ParsedRule[] = [];
      const rulesWithDefaultProfile: ParsedRule[] = [];
      let withResult = false;
      let exclusiveProfile: string | null = null;
      let noteForNextRule: string | null = null;
      let lineNumber = 0;
      text.split(/\n|\r/).forEach((lineRaw) => {
        lineNumber += 1;
        let line = lineRaw.trim();
        if (line.length === 0) {
          return;
        }
        switch (line[0]) {
          case '[':
            return;
          case ';':
            return;
          case '@': {
            let iSpace = line.indexOf(' ');
            if (iSpace < 0) {
              iSpace = line.length;
            }
            const directive = line.substr(1, iSpace - 1);
            line = line.substr(iSpace + 1).trim();
            switch (directive.toUpperCase()) {
              case 'WITH': {
                const feature = line.toUpperCase();
                if (feature === 'RESULT' || feature === 'RESULTS') {
                  withResult = true;
                }
                break;
              }
              case 'NOTE':
                noteForNextRule = line;
                break;
              default:
                break;
            }
            return;
          }
          default:
            break;
        }

        let source: string | null = null;
        if (strict) {
          exclusiveProfile = null;
        }
        let profile: string | null;
        if (line[0] === '!') {
          profile = withResult ? null : defaultProfileName;
          source = line;
          line = line.substr(1);
        } else if (withResult) {
          const iSpace = line.lastIndexOf(' +');
          if (iSpace < 0) {
            error?.({
              message: `Missing result profile name: ${line}`,
              reason: 'missingResultProfile',
              source: line,
              sourceLineNo: lineNumber
            });
            return;
          }
          profile = line.substr(iSpace + 2).trim();
          line = line.substr(0, iSpace).trim();
          if (line === '*') {
            exclusiveProfile = profile;
          }
        } else {
          profile = matchProfileName;
        }

        const cond = Conditions.fromStr(line);
        if (!cond) {
          error?.({
            message: `Invalid rule: ${line}`,
            reason: 'invalidRule',
            source: source ?? line,
            sourceLineNo: lineNumber
          });
          return;
        }

        const rule: ParsedRule = {
          condition: cond,
          profileName: profile,
          source: includeSource ? source ?? line : undefined
        };
        if (noteForNextRule) {
          rule.note = noteForNextRule;
          noteForNextRule = null;
        }
        rules.push(rule);
        if (!profile) {
          rulesWithDefaultProfile.push(rule);
        }
      });

      if (withResult) {
        if (!exclusiveProfile) {
          if (strict) {
            error?.({
              message: "Missing default rule with catch-all '*' condition",
              reason: 'noDefaultRule'
            });
          }
          exclusiveProfile = defaultProfileName || 'direct';
        }
        rulesWithDefaultProfile.forEach((rule) => {
          rule.profileName = exclusiveProfile;
        });
      }
      return rules;
    }
  }
};

export = RuleList;

