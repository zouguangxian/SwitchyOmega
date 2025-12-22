export default {
  '*.{js,cjs,mjs,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,yml,yaml,toml,md,css,scss,html}': ['prettier --write'],
};
