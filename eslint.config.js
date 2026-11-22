import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', '.tmp/', 'reference/', 'charts-worker/node_modules/', 'charts-worker/.wrangler/', 'charts-worker/.tmp-dry/'] },
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
  {
    // Statische Seiten des Workers: klassisches Script für alte TV-Browser (Chromium 53).
    files: ['charts-worker/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2016,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-restricted-syntax': [
        'error',
        { selector: 'ChainExpression', message: 'Optional Chaining (?.) ist in Chromium 53 nicht verfügbar.' },
        { selector: "LogicalExpression[operator='??']", message: 'Nullish Coalescing (??) ist in Chromium 53 nicht verfügbar.' },
        { selector: 'AwaitExpression', message: 'await ist nicht erlaubt (Promises nutzen).' },
        { selector: 'FunctionDeclaration[async=true], FunctionExpression[async=true], ArrowFunctionExpression[async=true]', message: 'async-Funktionen sind nicht erlaubt (Promises nutzen).' },
        { selector: 'ImportDeclaration, ExportNamedDeclaration, ExportDefaultDeclaration', message: 'Klassisches Script: keine Module.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Object', property: 'entries', message: 'Object.entries fehlt in Chromium 53.' },
        { object: 'Object', property: 'values', message: 'Object.values fehlt in Chromium 53.' },
        { object: 'Object', property: 'fromEntries', message: 'Object.fromEntries fehlt in Chromium 53.' },
        { property: 'padStart', message: 'padStart fehlt in Chromium 53.' },
        { property: 'padEnd', message: 'padEnd fehlt in Chromium 53.' },
        { property: 'flat', message: 'Array.flat fehlt in Chromium 53.' },
        { property: 'flatMap', message: 'Array.flatMap fehlt in Chromium 53.' },
        { property: 'finally', message: 'Promise.finally fehlt in Chromium 53.' },
        { property: 'trimStart', message: 'trimStart fehlt in Chromium 53.' },
        { property: 'trimEnd', message: 'trimEnd fehlt in Chromium 53.' },
      ],
    },
  },
];
