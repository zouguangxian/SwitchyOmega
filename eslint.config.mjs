import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/bower_components/**',
      '**/build/**',
      '**/dist/**',
      '**/*.min.js',
      '**/*.map',
      '**/release.zip',
      'ZeroOmega/**',
      // legacy/generated JS we don't want to lint yet
      'omega-pac/src-js/**',
      'omega-pac/uglifyjs*.js',
      'omega-pac/uglifyjs-shim.js',
      'omega-web/src/popup/**',
      'omega-web/img/icons/**',
      'omega-target-chromium-extension/src/js/**',
      'omega-target-chromium-extension/omega_target_shim.js',
      'omega-target/omega_pac_shim.js',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        chrome: 'readonly',
        browser: 'readonly',
        globalThis: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Keep it low-friction initially; we can tighten later.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Disable rules that conflict with Prettier formatting
  prettier,
];
