const Conditions = require('./src/conditions');
const PacGenerator = require('./src/pac_generator');
const Profiles = require('./src/profiles');
const RuleList = require('./src/rule_list');
const ShexpUtils = require('./src/shexp_utils');
const utils = require('./src/utils');

// Export with explicit typing
export {
  Conditions,
  PacGenerator,
  Profiles,
  RuleList,
  ShexpUtils
};

// Re-export utils
export const Revision = utils.Revision;
export const AttachedCache = utils.AttachedCache;
export const parseUrl = utils.parseUrl;

