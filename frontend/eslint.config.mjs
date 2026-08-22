import eslint from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';

const sourceFiles = ['src/**/*.{ts,tsx}'];

export default [
  {
    ignores: ['build/**', 'coverage/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    ...eslint.configs.recommended,
    files: sourceFiles,
  },
  ...tsPlugin.configs['flat/recommended-type-checked'].map((config) => ({
    ...config,
    files: sourceFiles,
  })),
  {
    files: sourceFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      ...react.configs.flat.recommended.plugins,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      ...jsxA11y.configs.recommended.rules,
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      // Disabled until typescript-eslint handles TypeScript's newer function token shape.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true,
        },
      ],
      eqeqeq: ['error', 'always'],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-else-return': 'error',
      'no-implicit-coercion': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use literal unions or const objects instead of TypeScript enums.',
        },
      ],
      'no-return-await': 'error',
      'no-shadow': 'off',
      'prefer-const': 'error',
      'react/jsx-no-useless-fragment': 'error',
    },
  },
  {
    ...testingLibrary.configs['flat/react'],
    files: ['src/**/*.test.{ts,tsx}', 'src/setupTests.ts'],
  },
];
