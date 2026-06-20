// @ts-check
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * dicoshot 패키지 공용 ESLint flat config 프리셋.
 * 소비 패키지는 이 프리셋을 확장하고 parserOptions.tsconfigRootDir만 자기 디렉터리로 지정한다.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/eslint.config.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          // 프레임워크 → 워크스페이스 패키지 → 외부/내장 → 상대경로 순으로 정렬
          groups: [['^@nestjs'], ['^dicoshot-core'], ['^node:', '^@?\\w'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
    },
  },
);
