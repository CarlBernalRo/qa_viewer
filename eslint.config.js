import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'data/**',
      'design/**',
      'docs/**',
      'desktop/src-tauri/target/**',
      'desktop/src-tauri/gen/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['backend/**/*.ts', 'packages/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // La capa de dominio no puede depender de infraestructura ni de interfaces.
    files: ['backend/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/infrastructure/**', '**/interfaces/**', '**/application/**', 'fastify', 'playwright'] },
      ],
    },
  },
  {
    files: ['backend/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/infrastructure/**', '**/interfaces/**', 'fastify', 'playwright'] },
      ],
    },
  },
);
