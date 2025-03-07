import { Buffer } from 'buffer';
import * as Conditions from './conditions';

interface Rule {
  condition: {
    conditionType: string;
    pattern: string;
  };
  profileName: string;
  source?: string;
  note?: string;
}

interface ComposeOptions {
  withResult?: boolean;
  useExclusive?: boolean;
}

interface ParseOmegaArgs {
  strict?: boolean;
  source?: boolean;
}

interface ErrorFields {
  message: string;
  reason: string;
  source: string;
  sourceLineNo: number;
}

function strStartsWith(str: string, prefix: string): boolean {
  return str.substr(0, prefix.length) === prefix;
}

const RuleList = {
  'AutoProxy': {
    magicPrefix: 'W0F1dG9Qcm94', // Detect base-64 encoded "[AutoProxy".
    detect(text: string): boolean | undefined {
      if (strStartsWith(text, RuleList['AutoProxy'].magicPrefix)) {
        return true;
      } else if (strStartsWith(text, '[AutoProxy')) {
        return true;
      }
      return undefined;
    },
    preprocess(text: string): string {
      if (strStartsWith(text, RuleList['AutoProxy'].magicPrefix)) {
        text = Buffer.from(text, 'base64').toString('utf8');
      }
      return text;
    },
    parse(text: string, matchProfileName: string, defaultProfileName: string): Rule[] {
      const normal_rules: Rule[] = [];
      const exclusive_rules: Rule[] = [];
      for (const line of text.split(/\n|\r/)) {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0 || trimmedLine[0] === '!' || trimmedLine[0] === '[') {
          continue;
        }
        const source = trimmedLine;
        let profile = matchProfileName;
        let list = normal_rules;
        let processedLine = trimmedLine;
        if (trimmedLine[0] === '@' && trimmedLine[1] === '@') {
          profile = defaultProfileName;
          list = exclusive_rules;
          processedLine = trimmedLine.substring(2);
        }
        let cond;
        if (processedLine[0] === '/') {
          cond = {
            conditionType: 'UrlRegexCondition',
            pattern: processedLine.substring(1, processedLine.length - 1)
          };
        } else if (processedLine[0] === '|') {
          if (processedLine[1] === '|') {
            cond = {
              conditionType: 'HostWildcardCondition',
              pattern: "*." + processedLine.substring(2)
            };
          } else {
            cond = {
              conditionType: 'UrlWildcardCondition',
              pattern: processedLine.substring(1) + "*"
            };
          }
        } else if (processedLine.indexOf('*') < 0) {
          cond = {
            conditionType: 'KeywordCondition',
            pattern: processedLine
          };
        } else {
          cond = {
            conditionType: 'UrlWildcardCondition',
            pattern: 'http://*' + processedLine + '*'
          };
        }
        list.push({ condition: cond, profileName: profile, source });
      }
      // Exclusive rules have higher priority, so they come first.
      return exclusive_rules.concat(normal_rules);
    }
  },

  'Switchy': {
    omegaPrefix: '[SwitchyOmega Conditions',
    specialLineStart: "[;#@!",

    detect(text: string): boolean | undefined {
      if (strStartsWith(text, RuleList['Switchy'].omegaPrefix)) {
        return true;
      }
      return undefined;
    },

    parse(text: string, matchProfileName: string, defaultProfileName: string): Rule[] {
      const switchy = RuleList['Switchy'];
      const parser = switchy.getParser(text);
      return switchy[parser](text, matchProfileName, defaultProfileName);
    },

    directReferenceSet({ ruleList, matchProfileName, defaultProfileName }: { 
      ruleList: string;
      matchProfileName: string;
      defaultProfileName: string;
    }): { [key: string]: string } | undefined {
      const text = ruleList.trim();
      const switchy = RuleList['Switchy'];
      const parser = switchy.getParser(text);
      if (parser !== 'parseOmega') return undefined;
      if (!/(^|\n)@with\s+results?(\r|\n|$)/i.test(text)) return undefined;
      
      const refs: { [key: string]: string } = {};
      for (const line of text.split(/\n|\r/)) {
        const trimmedLine = line.trim();
        if (switchy.specialLineStart.indexOf(trimmedLine[0]) < 0) {
          const iSpace = trimmedLine.lastIndexOf(' +');
          const profile = iSpace < 0 ? 
            defaultProfileName || 'direct' : 
            trimmedLine.substr(iSpace + 2).trim();
          refs['+' + profile] = profile;
        }
      }
      return refs;
    },

    compose({ rules, defaultProfileName }: { rules: Rule[]; defaultProfileName: string }, 
           { withResult, useExclusive }: ComposeOptions = {}): string {
      const eol = '\r\n';
      let ruleList = '[SwitchyOmega Conditions]' + eol;
      useExclusive = useExclusive ?? !withResult;
      
      if (withResult) {
        ruleList += '@with result' + eol + eol;
      } else {
        ruleList += eol;
      }
      
      const specialLineStart = RuleList['Switchy'].specialLineStart + '+';
      for (const rule of rules) {
        if (rule.note) {
          ruleList += '@note ' + rule.note + eol;
        }
        let line = Conditions.str(rule.condition);
        if (useExclusive && rule.profileName === defaultProfileName) {
          line = '!' + line;
        } else {
          if (specialLineStart.indexOf(line[0]) >= 0) {
            line = ': ' + line;
          }
          if (withResult) {
            line += ' +' + rule.profileName;
          }
        }
        ruleList += line + eol;
      }
      
      if (withResult) {
        ruleList += eol + '* +' + defaultProfileName + eol;
      }
      return ruleList;
    },

    getParser(text: string): 'parseOmega' | 'parseLegacy' {
      const switchy = RuleList['Switchy'];
      let parser: 'parseOmega' | 'parseLegacy' = 'parseOmega';
      if (!strStartsWith(text, switchy.omegaPrefix)) {
        if (text[0] === '#' || text.indexOf('\n#') >= 0) {
          parser = 'parseLegacy';
        }
      }
      return parser;
    },

    conditionFromLegacyWildcard(pattern: string): { conditionType: string; pattern: string } {
      if (pattern[0] === '@') {
        pattern = pattern.substring(1);
      } else {
        if (pattern.indexOf('://') <= 0 && pattern[0] !== '*') {
          pattern = '*' + pattern;
        }
        if (pattern[pattern.length - 1] !== '*') {
          pattern += '*';
        }
      }

      const host = Conditions.urlWildcard2HostWildcard(pattern);
      if (host) {
        return {
          conditionType: 'HostWildcardCondition',
          pattern: host
        };
      } else {
        return {
          conditionType: 'UrlWildcardCondition',
          pattern
        };
      }
    },

    parseLegacy(text: string, matchProfileName: string, defaultProfileName: string): Rule[] {
      const normal_rules: Rule[] = [];
      const exclusive_rules: Rule[] = [];
      let begin = false;
      let section = 'WILDCARD';
      
      for (const line of text.split(/\n|\r/)) {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0 || trimmedLine[0] === ';') continue;
        
        if (!begin) {
          if (trimmedLine.toUpperCase() === '#BEGIN') {
            begin = true;
          }
          continue;
        }
        
        if (trimmedLine.toUpperCase() === '#END') break;
        
        if (trimmedLine[0] === '[' && trimmedLine[trimmedLine.length - 1] === ']') {
          section = trimmedLine.substring(1, trimmedLine.length - 1).toUpperCase();
          continue;
        }
        
        const source = trimmedLine;
        let profile = matchProfileName;
        let list = normal_rules;
        let processedLine = trimmedLine;
        
        if (trimmedLine[0] === '!') {
          profile = defaultProfileName;
          list = exclusive_rules;
          processedLine = trimmedLine.substring(1);
        }
        
        let cond = null;
        switch (section) {
          case 'WILDCARD':
            cond = RuleList['Switchy'].conditionFromLegacyWildcard(processedLine);
            break;
          case 'REGEXP':
            cond = {
              conditionType: 'UrlRegexCondition',
              pattern: processedLine
            };
            break;
        }
        
        if (cond) {
          list.push({ condition: cond, profileName: profile, source });
        }
      }
      
      // Exclusive rules have higher priority, so they come first.
      return exclusive_rules.concat(normal_rules);
    },

    parseOmega(text: string, matchProfileName: string, defaultProfileName: string, 
               args: ParseOmegaArgs = {}): Rule[] {
      const { strict } = args;
      const error = strict ? (fields: ErrorFields) => {
        const err = new Error(fields.message);
        Object.assign(err, fields);
        throw err;
      } : undefined;
      
      const includeSource = args.source ?? true;
      const rules: Rule[] = [];
      const rulesWithDefaultProfile: Rule[] = [];
      let withResult = false;
      let exclusiveProfile: string | null = null;
      let noteForNextRule: string | null = null;
      let lno = 0;
      
      for (const line of text.split(/\n|\r/)) {
        lno++;
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) continue;
        
        switch (trimmedLine[0]) {
          case '[': // Header line: Ignore.
            continue;
          case ';': // Comment line: Ignore.
            continue;
          case '@': // Directive line:
            const iSpace = trimmedLine.indexOf(' ');
            const directive = trimmedLine.substr(1, iSpace < 0 ? trimmedLine.length - 1 : iSpace - 1);
            const directiveValue = iSpace < 0 ? '' : trimmedLine.substr(iSpace + 1).trim();
            
            switch (directive.toUpperCase()) {
              case 'WITH':
                const feature = directiveValue.toUpperCase();
                if (feature === 'RESULT' || feature === 'RESULTS') {
                  withResult = true;
                }
                break;
              case 'NOTE':
                noteForNextRule = directiveValue;
                break;
            }
            continue;
        }

        let source: string | null = null;
        if (strict) exclusiveProfile = null;
        
        let profile: string | null;
        let processedLine = trimmedLine;
        
        if (trimmedLine[0] === '!') {
          profile = withResult ? null : defaultProfileName;
          source = trimmedLine;
          processedLine = trimmedLine.substr(1);
        } else if (withResult) {
          const iSpace = trimmedLine.lastIndexOf(' +');
          if (iSpace < 0) {
            error?.({
              message: "Missing result profile name: " + trimmedLine,
              reason: 'missingResultProfile',
              source: trimmedLine,
              sourceLineNo: lno
            });
            continue;
          }
          profile = trimmedLine.substr(iSpace + 2).trim();
          processedLine = trimmedLine.substr(0, iSpace).trim();
          if (processedLine === '*') {
            exclusiveProfile = profile;
          }
        } else {
          profile = matchProfileName;
        }

        const cond = Conditions.fromStr(processedLine);
        if (!cond) {
          error?.({
            message: "Invalid rule: " + processedLine,
            reason: 'invalidRule',
            source: source ?? processedLine,
            sourceLineNo: lno
          });
          continue;
        }

        const rule: Rule = {
          condition: cond,
          profileName: profile!,
          ...(includeSource && { source: source ?? trimmedLine }),
          ...(noteForNextRule && { note: noteForNextRule })
        };
        
        rules.push(rule);
        if (!profile) {
          rulesWithDefaultProfile.push(rule);
        }
      }

      if (withResult) {
        if (!exclusiveProfile) {
          if (strict) {
            error?.({
              message: "Missing default rule with catch-all '*' condition",
              reason: 'noDefaultRule',
              source: '',
              sourceLineNo: lno
            });
          }
          exclusiveProfile = defaultProfileName || 'direct';
        }
        for (const rule of rulesWithDefaultProfile) {
          rule.profileName = exclusiveProfile;
        }
      }
      return rules;
    }
  }
};

export = RuleList; 