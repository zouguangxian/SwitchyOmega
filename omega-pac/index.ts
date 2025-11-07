const Conditions = require('./src/conditions');
const PacGenerator = require('./src/pac_generator');
const Profiles = require('./src/profiles');
const RuleList = require('./src/rule_list');
const ShexpUtils = require('./src/shexp_utils');
const utils = require('./src/utils');

const api: Record<string, unknown> = {
  Conditions,
  PacGenerator,
  Profiles,
  RuleList,
  ShexpUtils
};

Object.assign(api, utils);

export = api;

