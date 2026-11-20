import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'test-results/**/*', 'playwright-report/**/*', 'data/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
