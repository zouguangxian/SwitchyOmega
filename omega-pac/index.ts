const Conditions = require('./src/conditions');
const PacGenerator = require('./src/pac_generator');
const Profiles = require('./src/profiles');
const RuleList = require('./src/rule_list');
const ShexpUtils = require('./src/shexp_utils');
const utils = require('./src/utils');
const url = require('url');

// Export with explicit typing
export { Conditions, PacGenerator, Profiles, RuleList, ShexpUtils };

// Re-export utils
export const Revision = utils.Revision;
export const AttachedCache = utils.AttachedCache;
export const getBaseDomain = utils.getBaseDomain;
export const getSubdomain = utils.getSubdomain;
export const wildcardForDomain = utils.wildcardForDomain;
export const wildcardForUrl = utils.wildcardForUrl;
export const Url = {
  parse: url.parse,
  format: url.format,
  resolve: url.resolve,
};
