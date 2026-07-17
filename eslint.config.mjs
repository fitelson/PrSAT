// @ts-check

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: [
      'src/**/*.ts',
      'tests/**/*.ts',
      '*.config.ts',
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
);
