module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  rules: {
    'no-unused-vars': 'off',
    'no-empty-pattern': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'no-undef': 'warn',
    'no-console': 'off'
  },
  overrides: [
    {
      files: ['**/*.js', '**/*.jsx'],
      rules: {
        'no-unused-vars': 'off',
        'no-empty-pattern': 'off',
        'react-hooks/exhaustive-deps': 'warn',
        'no-undef': 'warn'
      }
    }
  ]
};
