// ESLint flat config.
// Why the restricted globals: the engine, bots, rating and SPRT packages must be
// deterministic (same seed + same moves = same game, everywhere). Any wall-clock or
// non-seeded randomness inside them would make CI results unreproducible.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const DETERMINISTIC_PACKAGES = [
  'packages/engine/src/**/*.ts',
  'packages/bots/src/**/*.ts',
  'packages/rating/src/**/*.ts',
  'packages/sprt/src/**/*.ts',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '.sprt/**',
      'docs/spec/ci-templates/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    files: DETERMINISTIC_PACKAGES,
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG from @hasik/engine.' },
        { object: 'Date', property: 'now', message: 'Inject a clock via limits.now instead.' },
        { object: 'performance', property: 'now', message: 'Inject a clock via limits.now.' },
        { object: 'crypto', property: 'getRandomValues', message: 'Use the seeded PRNG.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Engine code must not read the wall clock.' },
        { name: 'crypto', message: 'Use the seeded PRNG.' },
      ],
    },
  },
  prettier,
);
