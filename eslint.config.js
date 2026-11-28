'use strict';

const js = require('@eslint/js');
const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  { ignores: ['node_modules/', 'coverage/', '.vercel/'] },
  js.configs.recommended,
  {
    // Shared rules for all first-party code.
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'no-console': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'object-shorthand': 'error',
      'prefer-template': 'error',
    },
  },
  {
    // Server, serverless entry, tests and tooling: CommonJS on Node.
    files: ['**/*.js'],
    ignores: ['public/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { strict: ['error', 'global'] },
  },
  {
    // Deliberate operator log on startup.
    files: ['server.js'],
    rules: { 'no-console': 'off' },
  },
  {
    // Browser frontend: native ES modules.
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
];
