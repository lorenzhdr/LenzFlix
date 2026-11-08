import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', '.tmp/', 'reference/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['build/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
