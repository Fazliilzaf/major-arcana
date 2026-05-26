'use strict';

/**
 * ESLint flat config (v9+) — pragmatisk, ej blockerande.
 *
 * Mål: fånga riktiga buggar, undvik bikeshedding. Format hanteras av Prettier.
 *
 * Scope: src/, server.js, scripts/, public/major-arcana-preview/runtime-*.js
 * Ignorerar: node_modules, data/, public/cco-next-release/, dist/, byggda/genererade filer.
 */

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'public/cco-next-release/**',
      'public/cco-next/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'reports/**',
      '**/*.min.js',
      '**/*.bundle.js',
      'public/major-arcana-preview/app.js',
      'public/major-arcana-preview/runtime-v5-layout-guard.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['eslint.config.js', 'commitlint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'error',
    },
  },
  {
    files: ['src/**/*.js', 'server.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'no-undef': 'error',
      'no-prototype-builtins': 'off',
      'no-inner-declarations': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'off',
      'no-async-promise-executor': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['public/major-arcana-preview/runtime-*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        MajorArcanaPreviewI18n: 'readonly',
        MajorArcanaPreviewA11y: 'readonly',
        MajorArcanaPreviewAnimations: 'readonly',
        MajorArcanaPreviewToast: 'readonly',
        state: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-undef': 'warn',
      'no-redeclare': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },
  {
    files: ['public/major-arcana-preview/cco-mobile-*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-undef': 'warn',
      'no-redeclare': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },
  {
    files: ['public/major-arcana-preview/app/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        MajorArcanaPreviewI18n: 'readonly',
        MajorArcanaPreviewA11y: 'readonly',
        MajorArcanaPreviewAnimations: 'readonly',
        MajorArcanaPreviewToast: 'readonly',
        state: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-undef': 'warn',
      'no-redeclare': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },
  {
    files: [
      'public/major-arcana-preview/app/components/arcana-thread-card.js',
      'public/major-arcana-preview/app/components/lit-switchover.js',
      'public/major-arcana-preview/app/components/thread-store-bridge.js',
      'public/major-arcana-preview/app/components/thread-to-card-props.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        MajorArcanaPreviewI18n: 'readonly',
        MajorArcanaPreviewA11y: 'readonly',
        MajorArcanaPreviewAnimations: 'readonly',
        MajorArcanaPreviewToast: 'readonly',
        state: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-undef': 'warn',
      'no-redeclare': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },
  {
    files: ['public/admin/**/*.js', 'public/admin.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-undef': 'warn',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },
  {
    files: ['bin/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'no-undef': 'error',
    },
  },
  {
    files: ['tools/coverage/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-console': 'off',
      'no-undef': 'warn',
      'no-redeclare': 'off',
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
