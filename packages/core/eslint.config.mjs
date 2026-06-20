import base from '@dicoshot/eslint-config/base';

export default [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
